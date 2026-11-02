const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const wishlistController = require("../controllers/wishlist.js");

router.get("/", isLoggedIn, wrapAsync(wishlistController.index));
router.post("/:id/toggle", wrapAsync(wishlistController.toggleWishlist));

module.exports = router;

