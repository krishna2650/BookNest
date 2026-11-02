const Booking = require("../models/booking");
const Listing = require("../models/listing");
const ReservedNight = require("../models/reservedNight");
const { withListingLock } = require("../utils/listingLock");

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

module.exports.createBooking = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "The listing you are trying to book does not exist.");
        return res.redirect("/listings");
    }

    if (!req.body.booking) {
        req.flash("error", "Invalid booking submission.");
        return res.redirect(`/listings/${id}`);
    }

    const { checkIn: rawCheckIn, checkOut: rawCheckOut, guests: rawGuests } = req.body.booking;

    if (!rawCheckIn || !rawCheckOut) {
        req.flash("error", "Please provide both check-in and check-out dates.");
        return res.redirect(`/listings/${id}`);
    }

    const checkIn = new Date(rawCheckIn);
    const checkOut = new Date(rawCheckOut);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
        req.flash("error", "Invalid date format provided.");
        return res.redirect(`/listings/${id}`);
    }

    // Check-in cannot be in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkInDateOnly = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
    if (checkInDateOnly < today) {
        req.flash("error", "Check-in date cannot be in the past.");
        return res.redirect(`/listings/${id}`);
    }

    // Check-out must be strictly after check-in
    const checkOutDateOnly = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
    if (checkOutDateOnly <= checkInDateOnly) {
        req.flash("error", "Check-out date must be after check-in date.");
        return res.redirect(`/listings/${id}`);
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const nights = Math.round((checkOutDateOnly - checkInDateOnly) / msPerDay);
    if (nights < 1) {
        req.flash("error", "Reservations must be for at least 1 night.");
        return res.redirect(`/listings/${id}`);
    }

    const guests = Math.max(1, parseInt(rawGuests, 10) || 1);
    const nightDateStrings = getNightDateStrings(checkInDateOnly, checkOutDateOnly);

    // Prevent concurrent conflicting bookings with per-listing lock and database unique constraint
    await withListingLock(id, async () => {
        // Double-check availability on server
        const conflict = await Booking.findOne({
            listing: id,
            status: "confirmed",
            checkIn: { $lt: checkOutDateOnly },
            checkOut: { $gt: checkInDateOnly },
        });

        if (conflict) {
            req.flash("error", "The selected dates are no longer available. Please choose different dates.");
            return res.redirect(`/listings/${id}`);
        }

        // Server-calculated pricing
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
            status: "confirmed",
            paymentStatus: "pending",
        });

        await booking.save();

        // Atomically reserve night records
        try {
            const reservedDocs = nightDateStrings.map((dateStr) => ({
                listing: listing._id,
                date: dateStr,
                booking: booking._id,
            }));
            await ReservedNight.insertMany(reservedDocs, { ordered: true });
        } catch (dbErr) {
            // Collision caught by unique index
            await Booking.findByIdAndDelete(booking._id);
            req.flash("error", "The selected dates were just reserved by another guest. Please choose different dates.");
            return res.redirect(`/listings/${id}`);
        }

        req.flash("success", `Reservation confirmed! Booking Reference: ${bookingReference}`);
        res.redirect(`/bookings/${booking._id}`);
    });
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

    res.render("bookings/show.ejs", { booking });
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
    booking.paymentStatus = "refunded";
    await booking.save();

    // Release reserved dates immediately
    await ReservedNight.deleteMany({ booking: booking._id });

    req.flash("success", `Booking ${booking.bookingReference} has been cancelled successfully.`);
    res.redirect("/bookings");
};

module.exports.getAvailability = async (req, res) => {
    const { id } = req.params;
    const reserved = await ReservedNight.find({ listing: id }).select("date");
    res.json({ reservedDates: reserved.map((r) => r.date) });
};

