const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema(
    {
        booking: {
            type: Schema.Types.ObjectId,
            ref: "Booking",
        },
        listing: {
            type: Schema.Types.ObjectId,
            ref: "Listing",
            required: true,
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        receiver: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: {
            type: String,
            required: [true, "Message content cannot be empty"],
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

messageSchema.index({ booking: 1, createdAt: 1 });
messageSchema.index({ sender: 1, receiver: 1 });

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;

