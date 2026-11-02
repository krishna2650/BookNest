const Message = require("../models/message");
const Booking = require("../models/booking");
const User = require("../models/user");
const Listing = require("../models/listing");

module.exports.index = async (req, res) => {
    // 1. Find all bookings where user is guest or host
    const myListings = await Listing.find({ owner: req.user._id }).select("_id");
    const myListingIds = myListings.map((l) => l._id);

    const bookings = await Booking.find({
        $or: [
            { user: req.user._id },
            { listing: { $in: myListingIds } },
        ],
    })
        .populate("listing")
        .populate("user")
        .sort({ updatedAt: -1 });

    // Fetch latest message for each booking
    const bookingIds = bookings.map((b) => b._id);
    const messages = await Message.find({ booking: { $in: bookingIds } })
        .populate("sender")
        .sort({ createdAt: -1 });

    const threads = bookings.map((b) => {
        const lastMsg = messages.find((m) => m.booking.equals(b._id));
        const isGuest = b.user._id.equals(req.user._id);
        return {
            booking: b,
            lastMessage: lastMsg ? lastMsg.content : "No messages yet. Click to start conversation.",
            lastMessageTime: lastMsg ? lastMsg.createdAt : b.createdAt,
            isGuest,
        };
    });

    res.render("messages/index.ejs", { threads });
};

module.exports.showThread = async (req, res) => {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId)
        .populate("listing")
        .populate("user");

    if (!booking) {
        req.flash("error", "Reservation not found.");
        return res.redirect("/messages");
    }

    const isGuest = booking.user._id.equals(req.user._id);
    const isHost = booking.listing.owner.equals(req.user._id);

    if (!isGuest && !isHost) {
        req.flash("error", "You do not have permission to view this conversation.");
        return res.redirect("/messages");
    }

    let otherUser = null;
    if (isGuest) {
        otherUser = await User.findById(booking.listing.owner);
    } else {
        otherUser = booking.user;
    }

    const messages = await Message.find({ booking: booking._id })
        .populate("sender")
        .sort({ createdAt: 1 });

    res.render("messages/show.ejs", {
        booking,
        messages,
        otherUser,
        isGuest,
    });
};

module.exports.sendMessage = async (req, res) => {
    const { bookingId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
        req.flash("error", "Message cannot be empty.");
        return res.redirect(`/messages/${bookingId}`);
    }

    const booking = await Booking.findById(bookingId).populate("listing");
    if (!booking) {
        req.flash("error", "Reservation not found.");
        return res.redirect("/messages");
    }

    const isGuest = booking.user.equals(req.user._id);
    const isHost = booking.listing.owner.equals(req.user._id);

    if (!isGuest && !isHost) {
        req.flash("error", "You do not have permission to send messages here.");
        return res.redirect("/messages");
    }

    const receiverId = isGuest ? booking.listing.owner : booking.user;

    const message = new Message({
        booking: booking._id,
        listing: booking.listing._id,
        sender: req.user._id,
        receiver: receiverId,
        content: content.trim(),
    });

    await message.save();
    res.redirect(`/messages/${bookingId}`);
};

