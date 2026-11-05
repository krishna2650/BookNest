const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const bookingController = require("../controllers/booking.js");

// Webhook endpoint for Razorpay asynchronous reconciliation (must be before /:id)
router.post("/payment-webhook", wrapAsync(bookingController.paymentWebhook));

// My Bookings
router.get("/", isLoggedIn, wrapAsync(bookingController.index));

// Dedicated Checkout Page for a pending booking
router.get("/:id/checkout", isLoggedIn, wrapAsync(bookingController.renderCheckout));

// Verify Razorpay Payment Signature
router.post("/:id/verify-payment", isLoggedIn, wrapAsync(bookingController.verifyPayment));

// Show Booking Details / Confirmation
router.get("/:id", isLoggedIn, wrapAsync(bookingController.showBooking));

// Cancel Booking
router.post("/:id/cancel", isLoggedIn, wrapAsync(bookingController.cancelBooking));

module.exports = router;
