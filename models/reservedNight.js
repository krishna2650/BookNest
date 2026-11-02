const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const reservedNightSchema = new Schema({
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing",
        required: true,
        index: true,
    },
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true,
    },
    booking: {
        type: Schema.Types.ObjectId,
        ref: "Booking",
        required: true,
        index: true,
    },
});

// Enforce atomic database-level uniqueness per listing and date
reservedNightSchema.index({ listing: 1, date: 1 }, { unique: true });

const ReservedNight = mongoose.model("ReservedNight", reservedNightSchema);
module.exports = ReservedNight;

