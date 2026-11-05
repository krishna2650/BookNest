const Booking = require("../models/booking");
const Listing = require("../models/listing");
const ReservedNight = require("../models/reservedNight");
const { withListingLock } = require("../utils/listingLock");
const {
    createRazorpayOrder,
    verifyPaymentSignature,
    verifyWebhookSignature,
    getKeyId,
} = require("../utils/razorpay");

function getNightDateStrings(checkInDate, checkOutDate) {
    const dates = [];
    const curr = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
    const end = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());

    while (curr < end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, "0");
        const d = String(curr.getDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${d}`);
        curr.setDate(curr.getDate() + 1);
    }
    return dates;
}

/**
 * Validates dates, calculates price independently on server,
 * checks calendar availability under mutex lock,
 * creates a Razorpay Order and saves a pending Booking document.
 */
module.exports.createBooking = async (req, res) => {
    const { id } = req.params;
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json")) || (req.body && req.body.isAjax);

    const listing = await Listing.findById(id);
    if (!listing) {
        if (isAjax) return res.status(404).json({ success: false, message: "Listing not found." });
        req.flash("error", "The listing you are trying to book does not exist.");
        return res.redirect("/listings");
    }

    if (!req.body.booking) {
        if (isAjax) return res.status(400).json({ success: false, message: "Invalid booking submission." });
        req.flash("error", "Invalid booking submission.");
        return res.redirect(`/listings/${id}`);
    }

    const { checkIn: rawCheckIn, checkOut: rawCheckOut, guests: rawGuests } = req.body.booking;

    if (!rawCheckIn || !rawCheckOut) {
        if (isAjax) return res.status(400).json({ success: false, message: "Please provide both check-in and check-out dates." });
        req.flash("error", "Please provide both check-in and check-out dates.");
        return res.redirect(`/listings/${id}`);
    }

    const checkIn = new Date(rawCheckIn);
    const checkOut = new Date(rawCheckOut);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
        if (isAjax) return res.status(400).json({ success: false, message: "Invalid date format provided." });
        req.flash("error", "Invalid date format provided.");
        return res.redirect(`/listings/${id}`);
    }

    // Check-in cannot be in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkInDateOnly = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
    if (checkInDateOnly < today) {
        if (isAjax) return res.status(400).json({ success: false, message: "Check-in date cannot be in the past." });
        req.flash("error", "Check-in date cannot be in the past.");
        return res.redirect(`/listings/${id}`);
    }

    // Check-out must be strictly after check-in
    const checkOutDateOnly = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
    if (checkOutDateOnly <= checkInDateOnly) {
        if (isAjax) return res.status(400).json({ success: false, message: "Check-out date must be after check-in date." });
        req.flash("error", "Check-out date must be after check-in date.");
        return res.redirect(`/listings/${id}`);
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const nights = Math.round((checkOutDateOnly - checkInDateOnly) / msPerDay);
    if (nights < 1) {
        if (isAjax) return res.status(400).json({ success: false, message: "Reservations must be for at least 1 night." });
        req.flash("error", "Reservations must be for at least 1 night.");
        return res.redirect(`/listings/${id}`);
    }

    const guests = Math.max(1, parseInt(rawGuests, 10) || 1);
    const nightDateStrings = getNightDateStrings(checkInDateOnly, checkOutDateOnly);

    // Verify calendar availability
    const conflict = await ReservedNight.findOne({
        listing: id,
        date: { $in: nightDateStrings },
    });

    if (conflict) {
        if (isAjax) {
            return res.status(409).json({
                success: false,
                message: "The selected dates are no longer available. Please choose different dates.",
            });
        }
        req.flash("error", "The selected dates are no longer available. Please choose different dates.");
        return res.redirect(`/listings/${id}`);
    }

    // Server-side price calculation (never trusting client values)
    const nightlyPrice = Number(listing.price) || 0;
    const basePrice = nightlyPrice * nights;
    const tax = Math.round(basePrice * 0.18); // 18% GST consistent with BookNest display
    const totalPrice = basePrice + tax;

    // Unique booking reference
    const bookingReference =
        "BN-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        Math.random().toString(36).substring(2, 6).toUpperCase();

    // Create Razorpay Order from Backend
    let razorpayOrder;
    try {
        razorpayOrder = await createRazorpayOrder(totalPrice * 100, bookingReference, {
            listingId: listing._id.toString(),
            userId: req.user._id.toString(),
            bookingReference,
        });
    } catch (orderErr) {
        console.error("Razorpay Order Creation Failed:", orderErr);
        if (isAjax) {
            return res.status(500).json({
                success: false,
                message: "Unable to initialize Razorpay payment. Please try again.",
            });
        }
        req.flash("error", "Unable to initialize payment gateway. Please try again.");
        return res.redirect(`/listings/${id}`);
    }

    // Create pending booking document (Dates reserved ONLY after payment verification)
    const booking = new Booking({
        listing: listing._id,
        user: req.user._id,
        checkIn: checkInDateOnly,
        checkOut: checkOutDateOnly,
        guests,
        nightlyPrice,
        nights,
        basePrice,
        tax,
        totalPrice,
        bookingReference,
        status: "pending",
        paymentStatus: "pending",
        razorpayOrderId: razorpayOrder.id,
    });

    await booking.save();

    if (isAjax) {
        return res.json({
            success: true,
            bookingId: booking._id,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            keyId: getKeyId(),
            bookingReference,
            propertyTitle: listing.title,
            totalPrice,
            guestName: req.user.username || "",
            guestEmail: req.user.email || "",
        });
    }

    // Fallback: redirect to checkout page
    res.redirect(`/bookings/${booking._id}/checkout`);
};

/**
 * Dedicated checkout page for reviewing booking details and launching Razorpay.
 */
module.exports.renderCheckout = async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate("listing").populate("user");

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/bookings");
    }

    if (!booking.user._id.equals(req.user._id)) {
        req.flash("error", "You do not have permission to view this checkout.");
        return res.redirect("/bookings");
    }

    if (booking.paymentStatus === "paid" && booking.status === "confirmed") {
        return res.redirect(`/bookings/${booking._id}`);
    }

    // Ensure active Razorpay order exists for pending booking
    if (!booking.razorpayOrderId) {
        try {
            const order = await createRazorpayOrder(booking.totalPrice * 100, booking.bookingReference, {
                listingId: booking.listing._id.toString(),
                userId: req.user._id.toString(),
                bookingReference: booking.bookingReference,
            });
            booking.razorpayOrderId = order.id;
            await booking.save();
        } catch (err) {
            console.error("Order refresh error:", err);
        }
    }

    res.render("bookings/checkout.ejs", {
        booking,
        keyId: getKeyId(),
    });
};

/**
 * Server-side verification of Razorpay payment signature.
 * ONLY confirms booking and reserves calendar dates after cryptographically valid signature.
 */
module.exports.verifyPayment = async (req, res) => {
    const { id } = req.params;
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json")) || (req.body && req.body.isAjax);

    const booking = await Booking.findById(id);
    if (!booking) {
        if (isAjax) return res.status(404).json({ success: false, message: "Booking record not found." });
        req.flash("error", "Booking not found.");
        return res.redirect("/bookings");
    }

    // Authorization check
    if (!booking.user.equals(req.user._id)) {
        if (isAjax) return res.status(403).json({ success: false, message: "Unauthorized payment attempt." });
        req.flash("error", "You do not have permission to pay for this booking.");
        return res.redirect("/bookings");
    }

    // Idempotency: If already paid, do not re-process
    if (booking.paymentStatus === "paid" && booking.status === "confirmed") {
        if (isAjax) return res.json({ success: true, redirectUrl: `/bookings/${booking._id}`, alreadyPaid: true });
        return res.redirect(`/bookings/${booking._id}`);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        if (isAjax) return res.status(400).json({ success: false, message: "Missing Razorpay payment verification fields." });
        req.flash("error", "Incomplete payment credentials received.");
        return res.redirect(`/bookings/${id}/checkout`);
    }

    // Cryptographic signature check (HMAC SHA-256)
    const isValidSignature = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValidSignature) {
        booking.paymentStatus = "failed";
        await booking.save();

        if (isAjax) {
            return res.status(400).json({
                success: false,
                message: "Payment signature verification failed. Untrusted payment payload.",
            });
        }
        req.flash("error", "Payment verification failed. Your card was not charged.");
        return res.redirect(`/bookings/${id}/checkout`);
    }

    // Payment is valid! Now acquire mutex lock and atomically reserve the nights
    const nightDateStrings = getNightDateStrings(booking.checkIn, booking.checkOut);

    let reservationSuccess = false;
    let conflictOccurred = false;

    await withListingLock(booking.listing, async () => {
        // Double check date availability right before reserving
        const conflict = await ReservedNight.findOne({
            listing: booking.listing,
            date: { $in: nightDateStrings },
        });

        if (conflict) {
            conflictOccurred = true;
            return;
        }

        try {
            const reservedDocs = nightDateStrings.map((dateStr) => ({
                listing: booking.listing,
                date: dateStr,
                booking: booking._id,
            }));
            await ReservedNight.insertMany(reservedDocs, { ordered: true });

            booking.status = "confirmed";
            booking.paymentStatus = "paid";
            booking.razorpayOrderId = razorpay_order_id;
            booking.razorpayPaymentId = razorpay_payment_id;
            booking.razorpaySignature = razorpay_signature;
            booking.paidAt = new Date();
            await booking.save();

            reservationSuccess = true;
        } catch (dbErr) {
            conflictOccurred = true;
        }
    });

    if (conflictOccurred || !reservationSuccess) {
        booking.status = "cancelled";
        booking.paymentStatus = "refunded";
        await booking.save();

        const msg = "Payment received, but these dates were booked right before confirmation. A full refund has been scheduled.";
        if (isAjax) return res.status(409).json({ success: false, message: msg });
        req.flash("error", msg);
        return res.redirect("/bookings");
    }

    if (isAjax) {
        return res.json({
            success: true,
            redirectUrl: `/bookings/${booking._id}`,
            bookingReference: booking.bookingReference,
        });
    }

    req.flash("success", `Payment successful! Booking confirmed: ${booking.bookingReference}`);
    res.redirect(`/bookings/${booking._id}`);
};

/**
 * Razorpay Webhook for asynchronous payment reconciliation.
 */
module.exports.paymentWebhook = async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
        return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = req.body.event;
    if (event === "payment.captured" || event === "order.paid") {
        const orderId = req.body.payload?.payment?.entity?.order_id || req.body.payload?.order?.entity?.id;
        const paymentId = req.body.payload?.payment?.entity?.id;

        if (orderId) {
            const booking = await Booking.findOne({ razorpayOrderId: orderId });
            if (booking && booking.paymentStatus !== "paid") {
                const nightDateStrings = getNightDateStrings(booking.checkIn, booking.checkOut);
                await withListingLock(booking.listing, async () => {
                    const conflict = await ReservedNight.findOne({
                        listing: booking.listing,
                        date: { $in: nightDateStrings },
                    });
                    if (!conflict) {
                        const reservedDocs = nightDateStrings.map((d) => ({
                            listing: booking.listing,
                            date: d,
                            booking: booking._id,
                        }));
                        await ReservedNight.insertMany(reservedDocs, { ordered: true });
                        booking.status = "confirmed";
                        booking.paymentStatus = "paid";
                        booking.razorpayPaymentId = paymentId;
                        booking.paidAt = new Date();
                        await booking.save();
                    }
                });
            }
        }
    }

    res.json({ status: "ok" });
};

module.exports.index = async (req, res) => {
    const allBookings = await Booking.find({ user: req.user._id })
        .populate("listing")
        .sort({ createdAt: -1 });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcomingBookings = [];
    const pastBookings = [];
    const cancelledBookings = [];

    for (const b of allBookings) {
        if (b.status === "cancelled") {
            cancelledBookings.push(b);
        } else if (new Date(b.checkOut) >= now) {
            upcomingBookings.push(b);
        } else {
            pastBookings.push(b);
        }
    }

    // Also fetch bookings received on properties owned by this user (Hosting view)
    const myListings = await Listing.find({ owner: req.user._id }).select("_id");
    const myListingIds = myListings.map((l) => l._id);

    const hostBookings = await Booking.find({ listing: { $in: myListingIds } })
        .populate("listing")
        .populate("user")
        .sort({ createdAt: -1 });

    res.render("bookings/index.ejs", {
        upcomingBookings,
        pastBookings,
        cancelledBookings,
        hostBookings,
        isHost: myListings.length > 0,
    });
};

module.exports.showBooking = async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate("listing").populate("user");

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/bookings");
    }

    // Ownership check
    if (!booking.user._id.equals(req.user._id)) {
        req.flash("error", "You do not have permission to view this booking.");
        return res.redirect("/bookings");
    }

    res.render("bookings/show.ejs", {
        booking,
        keyId: getKeyId(),
    });
};

module.exports.cancelBooking = async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/bookings");
    }

    // Ownership check
    if (!booking.user.equals(req.user._id)) {
        req.flash("error", "You do not have permission to cancel this booking.");
        return res.redirect("/bookings");
    }

    if (booking.status === "cancelled") {
        req.flash("error", "This booking is already cancelled.");
        return res.redirect(`/bookings/${id}`);
    }

    // Cancellation Policy: Free cancellation before check-in date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkInDate = new Date(booking.checkIn);
    checkInDate.setHours(0, 0, 0, 0);

    if (checkInDate <= today) {
        req.flash("error", "Bookings can only be cancelled prior to the check-in date.");
        return res.redirect(`/bookings/${id}`);
    }

    booking.status = "cancelled";
    if (booking.paymentStatus === "paid") {
        booking.paymentStatus = "refunded";
    }
    await booking.save();

    // Release reserved dates immediately
    await ReservedNight.deleteMany({ booking: booking._id });

    req.flash("success", `Booking ${booking.bookingReference} has been cancelled successfully.${booking.paymentStatus === "refunded" ? " Refund will be processed back to original payment method." : ""}`);
    res.redirect("/bookings");
};

module.exports.getAvailability = async (req, res) => {
    const { id } = req.params;
    const reserved = await ReservedNight.find({ listing: id }).select("date");
    res.json({ reservedDates: reserved.map((r) => r.date) });
};
