const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose").default;

const userScehma = new Schema({
    email: {
        type: String,
        required: true,
    },
    isHost: {
        type: Boolean,
        default: false,
    },
    wishlist: [
        {
            type: Schema.Types.ObjectId,
            ref: "Listing",
        },
    ],
});

userScehma.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userScehma);
