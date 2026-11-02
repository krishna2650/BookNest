const User = require("../models/user");
const Listing = require("../models/listing");

module.exports.toggleWishlist = async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Please log in to save properties to your wishlist." });
    }

    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        return res.status(404).json({ error: "Property not found." });
    }

    const user = await User.findById(req.user._id);
    const existingIndex = user.wishlist.findIndex((item) => item.equals(id));

    let inWishlist = false;
    if (existingIndex > -1) {
        user.wishlist.splice(existingIndex, 1);
        inWishlist = false;
    } else {
        user.wishlist.push(id);
        inWishlist = true;
    }

    await user.save();
    res.json({ success: true, inWishlist, count: user.wishlist.length });
};

module.exports.index = async (req, res) => {
    const user = await User.findById(req.user._id).populate("wishlist");
    res.render("wishlist/index.ejs", { listings: user.wishlist || [] });
};

