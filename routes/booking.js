const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const bookingController = require("../controllers/booking.js");

// My Bookings
router.get("/", isLoggedIn, wrapAsync(bookingController.index));

// Show Booking Details / Confirmation
router.get("/:id", isLoggedIn, wrapAsync(bookingController.showBooking));

// Cancel Booking
router.post("/:id/cancel", isLoggedIn, wrapAsync(bookingController.cancelBooking));

module.exports = router;

