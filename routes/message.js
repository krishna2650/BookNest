const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const messageController = require("../controllers/message.js");

router.get("/", isLoggedIn, wrapAsync(messageController.index));
router.get("/:bookingId", isLoggedIn, wrapAsync(messageController.showThread));
router.post("/:bookingId", isLoggedIn, wrapAsync(messageController.sendMessage));

module.exports = router;

