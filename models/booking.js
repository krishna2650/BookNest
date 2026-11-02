const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema(
    {
        listing: {
            type: Schema.Types.ObjectId,
            ref: "Listing",
            required: true,
            index: true,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        checkIn: {
            type: Date,
            required: true,
        },
        checkOut: {
            type: Date,
            required: true,
        },
        guests: {
            type: Number,
            required: true,
            min: [1, "At least 1 guest is required"],
            default: 1,
        },
        nightlyPrice: {
            type: Number,
            required: true,
            min: [0, "Nightly price cannot be negative"],
        },
        nights: {
            type: Number,
            required: true,
            min: [1, "Booking must be for at least 1 night"],
        },
        basePrice: {
            type: Number,
            required: true,
        },
        tax: {
            type: Number,
            default: 0,
        },
        totalPrice: {
            type: Number,
            required: true,
            min: [0, "Total price cannot be negative"],
        },
        bookingReference: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["confirmed", "cancelled"],
            default: "confirmed",
            index: true,
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "unpaid", "refunded"],
            default: "pending",
        },
    },
    {
        timestamps: true,
    }
);

bookingSchema.index({ listing: 1, checkIn: 1, checkOut: 1, status: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });

const Booking = mongoose.model("Booking", bookingSchema);
module.exports = Booking;

