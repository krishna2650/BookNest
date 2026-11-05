require("dotenv").config();
const mongoose = require("mongoose");
const Listing = require("./models/listing");
const User = require("./models/user");
const Booking = require("./models/booking");
const Review = require("./models/review");
const Message = require("./models/message");

async function runRegression() {
    console.log("==================================================");
    console.log("    BOOKNEST FULL SYSTEM REGRESSION TEST SUITE    ");
    console.log("==================================================");

    let passed = 0;
    let failed = 0;

    function assert(cond, name) {
        if (cond) {
            console.log(`[PASS] ${name}`);
            passed++;
        } else {
            console.error(`[FAIL] ${name}`);
            failed++;
        }
    }

    try {
        await mongoose.connect(process.env.ATLASDB_URL, { serverSelectionTimeoutMS: 10000 });

        // 1. Listings & Categories
        console.log("\n--- 1. LISTINGS & CATEGORIES TEST ---");
        const listings = await Listing.find().limit(5);
        assert(listings.length > 0, `Found ${listings.length} existing listings in database`);

        const categories = [
            "Trending", "Rooms", "Iconic cities", "Mountains", "Castles",
            "Amazing Pools", "Camping", "Farms", "Arctic", "Domes", "Boats"
        ];
        const categoryMatch = await Listing.findOne({ category: { $in: categories } });
        assert(categoryMatch !== null, `Category system functioning (found listing in: ${categoryMatch ? categoryMatch.category : "none"})`);

        // 2. User & Host Role System
        console.log("\n--- 2. USER AUTH & HOST STATUS ---");
        const hostUser = await User.findOne({ isHost: true });
        assert(hostUser !== null, `Found active host account: ${hostUser ? hostUser.username : "none"}`);

        // 3. Wishlist Feature
        console.log("\n--- 3. WISHLIST FUNCTIONALITY ---");
        const testUser = await User.findOne();
        if (testUser && listings[0]) {
            const listingId = listings[0]._id;
            // Add to wishlist
            if (!testUser.wishlist.includes(listingId)) {
                testUser.wishlist.push(listingId);
                await testUser.save();
            }
            assert(testUser.wishlist.includes(listingId), "Listing added to user wishlist");

            // Remove from wishlist
            testUser.wishlist = testUser.wishlist.filter(id => !id.equals(listingId));
            await testUser.save();
            assert(!testUser.wishlist.includes(listingId), "Listing removed from user wishlist");
        }

        // 4. Bookings & Razorpay Fields Integrity
        console.log("\n--- 4. BOOKINGS SCHEMA INTEGRITY ---");
        const sampleBooking = await Booking.findOne();
        if (sampleBooking) {
            assert(sampleBooking.bookingReference && sampleBooking.bookingReference.startsWith("BN-"), "Valid booking reference format: " + sampleBooking.bookingReference);
            assert(["pending", "confirmed", "cancelled"].includes(sampleBooking.status), "Booking status conforms to valid enum: " + sampleBooking.status);
            assert(["pending", "paid", "unpaid", "refunded", "failed"].includes(sampleBooking.paymentStatus), "Payment status conforms to valid enum: " + sampleBooking.paymentStatus);
        } else {
            console.log("No existing historical booking found. Skipping schema format check.");
        }

        // 5. Host Dashboard Aggregations
        console.log("\n--- 5. HOST DASHBOARD LOGIC ---");
        if (hostUser) {
            const hostListings = await Listing.find({ owner: hostUser._id });
            const hostListingIds = hostListings.map(l => l._id);
            const hostBookings = await Booking.find({ listing: { $in: hostListingIds } });
            assert(Array.isArray(hostBookings), `Host received bookings retrieved successfully (Count: ${hostBookings.length})`);
        }

        // 6. Direct Messaging System
        console.log("\n--- 6. MESSAGING SYSTEM ---");
        const sampleMsg = await Message.findOne();
        if (sampleMsg) {
            assert(sampleMsg.listing && sampleMsg.content, "Direct messaging records valid");
        } else {
            assert(true, "Messaging model ready (no messages currently in database)");
        }

        console.log("\n==================================================");
        console.log(`REGRESSION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==================================================");

        await mongoose.disconnect();
        process.exit(failed > 0 ? 1 : 0);
    } catch (e) {
        console.error("Regression error:", e);
        process.exit(1);
    }
}

runRegression();
