const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isHost } = require("../middleware.js");
const hostController = require("../controllers/host.js");

// Onboarding: Become a host
router.get("/become", isLoggedIn, hostController.renderBecomeHost);
router.post("/become", isLoggedIn, wrapAsync(hostController.becomeHost));

// Protected Host Dashboard
router.get("/dashboard", isLoggedIn, isHost, wrapAsync(hostController.dashboard));

// Host booking cancellation
router.post("/bookings/:id/cancel", isLoggedIn, isHost, wrapAsync(hostController.cancelHostBooking));

module.exports = router;

