const Listing = require("../models/listing");
const Booking = require("../models/booking");
const User = require("../models/user");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAPBOX_TOKEN;
const geocodingClient = mapToken ? mbxGeocoding({ accessToken: mapToken }) : null;

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

module.exports.index = async (req, res) => {
    const rawQuery = (req.query.q || "").trim();
    const rawCategory = (req.query.category || "").trim();

    let searchConditions = [];
    if (rawQuery) {
        const cleanQ = escapeRegex(rawQuery);
        searchConditions.push(
            { location: { $regex: cleanQ, $options: "i" } },
            { country: { $regex: cleanQ, $options: "i" } },
            { title: { $regex: cleanQ, $options: "i" } }
        );

        if (geocodingClient) {
            try {
                const response = await geocodingClient
                    .forwardGeocode({
                        query: rawQuery,
                        limit: 1,
                    })
                    .send();

                if (response && response.body && response.body.features && response.body.features.length > 0) {
                    const feat = response.body.features[0];
                    const placeTypes = feat.place_type || [];

                    if (placeTypes.includes("country")) {
                        const countryName = feat.text;
                        if (countryName) {
                            searchConditions.push({ country: { $regex: escapeRegex(countryName), $options: "i" } });
                        }
                    } else {
                        const placeName = feat.text;
                        if (placeName) {
                            searchConditions.push({ location: { $regex: escapeRegex(placeName), $options: "i" } });
                        }

                        const countryCtx = (feat.context || []).find(c => c.id && c.id.startsWith("country"));
                        if (placeName && countryCtx && countryCtx.text) {
                            searchConditions.push({
                                $and: [
                                    { location: { $regex: escapeRegex(placeName), $options: "i" } },
                                    { country: { $regex: escapeRegex(countryCtx.text), $options: "i" } },
                                ],
                            });
                        }

                        if (feat.center && feat.center.length === 2) {
                            searchConditions.push({
                                "geometry.coordinates": {
                                    $geoWithin: { $centerSphere: [ feat.center, 150 / 6378.1 ] },
                                },
                            });
                        }
                    }
                }
            } catch (err) {
                console.warn("Geocoding service error/fallback:", err.message);
            }
        }
    }

    let categoryCondition = null;
    if (rawCategory) {
        categoryCondition = {
            $or: [
                { category: rawCategory },
                { title: { $regex: escapeRegex(rawCategory), $options: "i" } },
                { description: { $regex: escapeRegex(rawCategory), $options: "i" } }
            ]
        };
    }

    const rawMinPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const rawMaxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const rawGuests = req.query.guests ? Number(req.query.guests) : null;

    let andConditions = [];

    if (searchConditions.length > 0) {
        andConditions.push({ $or: searchConditions });
    }

    if (categoryCondition) {
        andConditions.push(categoryCondition);
    }

    if (rawMinPrice !== null || rawMaxPrice !== null) {
        let priceFilter = {};
        if (rawMinPrice !== null && !isNaN(rawMinPrice)) priceFilter.$gte = rawMinPrice;
        if (rawMaxPrice !== null && !isNaN(rawMaxPrice)) priceFilter.$lte = rawMaxPrice;
        if (Object.keys(priceFilter).length > 0) {
            andConditions.push({ price: priceFilter });
        }
    }

    if (rawGuests !== null && !isNaN(rawGuests) && rawGuests > 1) {
        andConditions.push({
            $or: [
                { guests: { $gte: rawGuests } },
                { guests: { $exists: false } }
            ]
        });
    }

    const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};
    const allListings = await Listing.find(finalQuery);

    let userWishlistIds = [];
    if (req.user) {
        const u = await User.findById(req.user._id).select("wishlist");
        if (u && u.wishlist) {
            userWishlistIds = u.wishlist.map(id => id.toString());
        }
    }

    res.render("listings/index.ejs", {
        allListings,
        searchQuery: rawQuery,
        selectedCategory: rawCategory,
        minPrice: rawMinPrice,
        maxPrice: rawMaxPrice,
        guests: rawGuests,
        userWishlistIds,
    });
};

module.exports.searchSuggestions = async (req, res) => {
    const rawQuery = (req.query.q || "").trim();
    if (!rawQuery || rawQuery.length < 2) {
        return res.json([]);
    }

    const suggestions = new Set();

    try {
        const regex = new RegExp("^" + escapeRegex(rawQuery), "i");
        const matchingListings = await Listing.find({
            $or: [{ location: regex }, { country: regex }],
        }).limit(5).select("location country");

        for (const item of matchingListings) {
            if (item.location && item.country) {
                suggestions.add(`${item.location}, ${item.country}`);
            } else if (item.location) {
                suggestions.add(item.location);
            }
        }
    } catch (e) {
        // ignore DB search errors
    }

    if (geocodingClient) {
        try {
            const resp = await geocodingClient
                .forwardGeocode({
                    query: rawQuery,
                    types: ["place", "region", "country", "locality"],
                    limit: 5,
                })
                .send();

            if (resp && resp.body && resp.body.features) {
                for (const f of resp.body.features) {
                    if (f.place_name) {
                        suggestions.add(f.place_name);
                    }
                }
            }
        } catch (err) {
            // ignore Mapbox suggestion error
        }
    }

    res.json(Array.from(suggestions).slice(0, 6));
};

module.exports.renderNewForm = (req, res) => {
    res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
    let { id } = req.params;

    const listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            populate: {
                path: "author",
            },
        })
        .populate("owner");

    if (!listing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }

    // Fetch existing confirmed bookings for date availability
    const confirmedBookings = await Booking.find({
        listing: id,
        status: "confirmed",
        checkOut: { $gte: new Date() },
    }).select("checkIn checkOut");

    // If logged-in user is the owner, fetch all guest bookings for this listing
    let ownerBookings = [];
    if (req.user && listing.owner && listing.owner._id.equals(req.user._id)) {
        ownerBookings = await Booking.find({ listing: id })
            .populate("user")
            .sort({ checkIn: -1 });
    }

    res.render("listings/show.ejs", {
        listing,
        mapToken: process.env.MAPBOX_TOKEN,
        currUser: req.user,
        confirmedBookings,
        ownerBookings,
    });
};

module.exports.createListing = async (req, res, next) => {
    let geometry = null;
    if (geocodingClient && req.body.listing && req.body.listing.location) {
        try {
            let response = await geocodingClient
                .forwardGeocode({
                    query: req.body.listing.location,
                    limit: 1,
                })
                .send();

            if (response && response.body && response.body.features && response.body.features.length > 0) {
                geometry = response.body.features[0].geometry;
            }
        } catch (err) {
            console.warn("Mapbox geocoding error on createListing:", err.message);
        }
    }

    let url = req.file ? req.file.path : "";
    let filename = req.file ? req.file.filename : "";
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    if (url) {
        newListing.image = { url, filename };
    }
    if (geometry) {
        newListing.geometry = geometry;
    }

    let savedListing = await newListing.save();
    console.log(savedListing);
    req.flash("success", "New Listing Created!");
    res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
    let { id } = req.params;

    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist!");
        return res.redirect("/listings");
    }

    let originalImageUrl = listing.image ? listing.image.url : "";
    if (originalImageUrl) {
        originalImageUrl = originalImageUrl.replace("/upload", "/upload/w_250");
    }

    res.render("listings/edit.ejs", {
        listing,
        originalImageUrl,
    });
};

module.exports.updateListing = async (req, res) => {
    let { id } = req.params;

    let listing = await Listing.findByIdAndUpdate(
        id,
        { ...req.body.listing },
        { new: true }
    );

    if (typeof req.file !== "undefined" && req.file) {
        let url = req.file.path;
        let filename = req.file.filename;

        listing.image = { url, filename };
        await listing.save();
    }

    req.flash("success", "Listing Updated!");
    res.redirect(`/listings/${id}`);
};

module.exports.destroyListing = async (req, res) => {
    let { id } = req.params;

    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);

    req.flash("success", "Listing Deleted!");
    res.redirect("/listings");
};
