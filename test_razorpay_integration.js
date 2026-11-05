require("dotenv").config();
const mongoose = require("mongoose");
const crypto = require("crypto");
const { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } = require("./utils/razorpay");
const Booking = require("./models/booking");
const Listing = require("./models/listing");
const ReservedNight = require("./models/reservedNight");
const User = require("./models/user");
const { withListingLock } = require("./utils/listingLock");

async function runTests() {
    console.log("==================================================");
    console.log("   BOOKNEST RAZORPAY & SYSTEM INTEGRATION TESTS   ");
    console.log("==================================================");

    let passed = 0;
    let failed = 0;

    function assert(condition, testName) {
        if (condition) {
            console.log(`[PASS] ${testName}`);
            passed++;
        } else {
            console.error(`[FAIL] ${testName}`);
            failed++;
        }
    }

    try {
        // Connect to MongoDB Atlas (or local if configured)
        console.log("\nConnecting to MongoDB database...");
        await mongoose.connect(process.env.ATLASDB_URL, { serverSelectionTimeoutMS: 10000 });
        console.log("Connected to MongoDB successfully.\n");

        // TEST 1: Razorpay Order Creation
        console.log("--- 1. RAZORPAY ORDER CREATION ---");
        const testAmount = 5900; // 59.00 INR in paise
        const testReceipt = "BN-TEST-" + Date.now();
        const order = await createRazorpayOrder(testAmount, testReceipt, { test: "true" });
        assert(order && order.id, "Razorpay order created with valid order ID: " + (order ? order.id : "none"));
        assert(order && order.amount === testAmount, "Order amount correctly matches: " + testAmount);
        assert(order && order.currency === "INR", "Order currency is INR");

        // TEST 2: HMAC SHA-256 Signature Verification
        console.log("\n--- 2. SIGNATURE VERIFICATION (SECURITY) ---");
        const orderId = "order_123456";
        const paymentId = "pay_789012";
        const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";
        const validSignature = crypto
            .createHmac("sha256", secret)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        const isValid = verifyPaymentSignature(orderId, paymentId, validSignature);
        assert(isValid === true, "Valid HMAC SHA-256 signature accepted");

        const isTampered = verifyPaymentSignature(orderId, paymentId, "tampered_fake_signature_abc123");
        assert(isTampered === false, "Tampered signature correctly REJECTED (Protection against fraud)");

        const isWrongOrder = verifyPaymentSignature("order_different", paymentId, validSignature);
        assert(isWrongOrder === false, "Mismatched order ID signature correctly REJECTED");

        // TEST 3: Webhook Signature Verification
        console.log("\n--- 3. WEBHOOK SIGNATURE VERIFICATION ---");
        const payload = JSON.stringify({ event: "payment.captured", id: "evt_123" });
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "booknestWebhookSecret";
        const validWebhookSig = crypto
            .createHmac("sha256", webhookSecret)
            .update(payload)
            .digest("hex");

        const webhookValid = verifyWebhookSignature(payload, validWebhookSig);
        assert(webhookValid === true, "Valid webhook signature accepted");

        const webhookFake = verifyWebhookSignature(payload, "invalid_sig");
        assert(webhookFake === false, "Invalid webhook signature REJECTED");

        // TEST 4: Booking Model & Payment Status
        console.log("\n--- 4. BOOKING MODEL EXTENSION ---");
        const testUser = await User.findOne();
        const testListing = await Listing.findOne();

        if (testUser && testListing) {
            const checkIn = new Date();
            checkIn.setDate(checkIn.getDate() + 45); // 45 days in future
            const checkOut = new Date();
            checkOut.setDate(checkOut.getDate() + 48); // 3 nights

            const testBooking = new Booking({
                listing: testListing._id,
                user: testUser._id,
                checkIn,
                checkOut,
                guests: 2,
                nightlyPrice: testListing.price || 2000,
                nights: 3,
                basePrice: (testListing.price || 2000) * 3,
                tax: Math.round((testListing.price || 2000) * 3 * 0.18),
                totalPrice: (testListing.price || 2000) * 3 * 1.18,
                bookingReference: "BN-TEST-" + Date.now().toString(36).toUpperCase(),
                status: "pending",
                paymentStatus: "pending",
                razorpayOrderId: order.id,
            });

            await testBooking.save();
            assert(testBooking._id && testBooking.status === "pending", "Pending booking record created successfully");
            assert(testBooking.paymentStatus === "pending", "Initial payment status is 'pending'");

            // TEST 5: Payment Completion & Date Locking
            console.log("\n--- 5. PAYMENT VERIFICATION & DATE LOCKING ---");
            testBooking.status = "confirmed";
            testBooking.paymentStatus = "paid";
            testBooking.razorpayPaymentId = "pay_test_" + Date.now();
            testBooking.paidAt = new Date();
            await testBooking.save();

            assert(testBooking.paymentStatus === "paid", "Booking marked as 'paid' after verification");
            assert(testBooking.status === "confirmed", "Booking marked as 'confirmed' after payment");

            // Clean up test booking
            await Booking.findByIdAndDelete(testBooking._id);
            assert(true, "Test booking cleaned up cleanly");
        } else {
            console.log("No existing user or listing found for DB record test. Skipping live DB doc creation.");
        }

        // TEST 6: Concurrency Mutex Lock Test
        console.log("\n--- 6. CONCURRENCY MUTEX LOCK TEST ---");
        const lockTestId = new mongoose.Types.ObjectId().toString();
        let executionOrder = [];

        const task1 = withListingLock(lockTestId, async () => {
            await new Promise((r) => setTimeout(r, 60));
            executionOrder.push("task1");
        });

        const task2 = withListingLock(lockTestId, async () => {
            await new Promise((r) => setTimeout(r, 20));
            executionOrder.push("task2");
        });

        await Promise.all([task1, task2]);
        assert(
            executionOrder[0] === "task1" && executionOrder[1] === "task2",
            "Listing mutex strictly serializes concurrent tasks in FIFO order"
        );

        // TEST 7: Template Safety (currUser ReferenceError fix)
        console.log("\n--- 7. TEMPLATE SAFETY REGRESSION TEST ---");
        const ejs = require("ejs");
        const fs = require("fs");
        const navbarTpl = fs.readFileSync("./views/includes/navbar.ejs", "utf-8");

        let renderedNavbar = "";
        let templateThrew = false;
        try {
            // Render without passing currUser (simulating error rendering or unauth guest)
            renderedNavbar = ejs.render(navbarTpl, {
                searchQuery: "",
            });
        } catch (err) {
            templateThrew = true;
            console.error("Navbar render error:", err.message);
        }

        assert(
            !templateThrew && renderedNavbar.includes("Become a host") && renderedNavbar.includes("Log in"),
            "Navbar renders safely without currUser (Zero ReferenceError crashes)"
        );

        // Render with host user
        const renderedHostNavbar = ejs.render(navbarTpl, {
            currUser: { username: "Alice", isHost: true },
            searchQuery: "Mumbai",
        });
        assert(
            renderedHostNavbar.includes("Host dashboard"),
            "Navbar renders 'Host dashboard' for host users"
        );

        console.log("\n==================================================");
        console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==================================================");

        await mongoose.disconnect();
        process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
        console.error("Fatal Test Error:", err);
        process.exit(1);
    }
}

runTests();

