const mongoose = require("mongoose");
const initData = require("./data.js");
const Listing = require("../models/listing.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/BookNest";

async function main() {
    await mongoose.connect(MONGO_URL);
    console.log("Connected to DB");
}

const initDB = async () => {
    try {
        await main();

        await Listing.deleteMany({});
        initData.data = initData.data.map((obj) => 
            ({...obj, owner:"6ab53f5b10a4a31411b7a82d",}));
        await Listing.insertMany(initData.data);

        console.log("Data Was initialized");

        await mongoose.connection.close();
    } catch (err) {
        console.log(err);
    }
};

initDB();   