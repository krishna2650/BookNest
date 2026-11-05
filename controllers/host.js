const User = require("../models/user");
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const ReservedNight = require("../models/reservedNight");

module.exports.renderBecomeHost = (req, res) => {
    if (req.user && req.user.isHost) {
        req.flash("success", "You are already a host! Welcome to your dashboard.");
        return res.redirect("/host/dashboard");
    }
    res.render("host/become.ejs");
};

module.exports.becomeHost = async (req, res) => {
    if (!req.user) {
        req.flash("error", "You must be logged in to become a host.");
        return res.redirect("/login");
    }

    if (req.user.isHost) {
        return res.redirect("/host/dashboard");
    }

    await User.findByIdAndUpdate(req.user._id, { isHost: true });
    req.user.isHost = true;

    req.flash("success", "Congratulations! You are now a host on BookNest. Start by adding your first listing!");
    res.redirect("/host/dashboard");
};

module.exports.dashboard = async (req, res) => {
    const listings = await Listing.find({ owner: req.user._id }).populate("reviews");
    const listingIds = listings.map((l) => l._id);

    const allBookings = await Booking.find({ listing: { $in: listingIds } })
        .populate("listing")
        .populate("user")
        .sort({ checkIn: 1 });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcomingBookings = [];
    const currentStays = [];
    const completedBookings = [];
    const cancelledBookings = [];
    let totalEarnings = 0;

    for (const b of allBookings) {
        const checkIn = new Date(b.checkIn);
        const checkOut = new Date(b.checkOut);

        if (b.status === "cancelled") {
            cancelledBookings.push(b);
        } else if (b.status === "pending") {
            // Awaiting payment verification, not yet confirmed
        } else if (checkIn <= now && checkOut >= now) {
            currentStays.push(b);
            upcomingBookings.push(b);
            totalEarnings += b.totalPrice || 0;
        } else if (checkIn > now) {
            upcomingBookings.push(b);
            totalEarnings += b.totalPrice || 0;
        } else {
            completedBookings.push(b);
            totalEarnings += b.totalPrice || 0;
        }
    }

    const stats = {
        totalProperties: listings.length,
        upcomingCount: upcomingBookings.length,
        currentCount: currentStays.length,
        completedCount: completedBookings.length,
        cancelledCount: cancelledBookings.length,
        totalEarnings,
    };

    res.render("host/dashboard.ejs", {
        listings,
        allBookings,
        upcomingBookings,
        currentStays,
        completedBookings,
        cancelledBookings,
        stats,
    });
};

module.exports.cancelHostBooking = async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate("listing");

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/host/dashboard");
    }

    // Verify listing ownership
    if (!booking.listing || !booking.listing.owner.equals(req.user._id)) {
        req.flash("error", "You do not have permission to manage this booking.");
        return res.redirect("/host/dashboard");
    }

    if (booking.status === "cancelled") {
        req.flash("error", "This booking is already cancelled.");
        return res.redirect("/host/dashboard");
    }

    booking.status = "cancelled";
    booking.paymentStatus = "refunded";
    await booking.save();

    // Release reserved dates immediately
    await ReservedNight.deleteMany({ booking: booking._id });

    req.flash("success", `Reservation ${booking.bookingReference} has been cancelled and dates reopened.`);
    res.redirect("/host/dashboard");
};

