const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const Listing = require("../models/listing.js");
const { isLoggedIn, isOwner, validateListing, isHost } = require("../middleware.js");
const listingController = require("../controllers/listing.js");
const bookingController = require("../controllers/booking.js");
const multer = require('multer');
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });

// Autocomplete suggestions route (must be before /:id)
router.get("/search-suggestions", wrapAsync(listingController.searchSuggestions));

// Index Route
router
    .route("/")
    .get(wrapAsync(listingController.index))
    .post(
        isLoggedIn,
        isHost,
        upload.single("listing[image]"),
        validateListing,
        wrapAsync(listingController.createListing)
    );

// New Route
router.get(
    "/new",
    isLoggedIn,
    isHost,
    listingController.renderNewForm
);

// Show, Update and Delete Route
router
    .route("/:id")
    .get(wrapAsync(listingController.showListing))
    .put(
        isLoggedIn,
        isOwner,
        upload.single("listing[image]"),
        validateListing,
        wrapAsync(listingController.updateListing)
    )
    .delete(
        isLoggedIn,
        isOwner,
        wrapAsync(listingController.destroyListing)
    );

// Edit Route
router.get(
    "/:id/edit",
    isLoggedIn,
    isOwner,
    wrapAsync(listingController.renderEditForm)
);

// Booking Routes under listing
router.post("/:id/bookings", isLoggedIn, wrapAsync(bookingController.createBooking));
router.get("/:id/availability", wrapAsync(bookingController.getAvailability));

module.exports = router;
