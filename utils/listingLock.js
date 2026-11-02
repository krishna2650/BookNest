const listingLocks = new Map();

/**
 * Ensures serial execution for concurrent operations on the same listing ID.
 * Works seamlessly with database-level uniqueness for bulletproof concurrency control.
 */
module.exports.withListingLock = async function (listingId, fn) {
    const key = listingId.toString();
    const prevPromise = listingLocks.get(key) || Promise.resolve();
    let release;
    const nextPromise = new Promise((resolve) => {
        release = resolve;
    });

    listingLocks.set(
        key,
        prevPromise.then(() => nextPromise)
    );

    try {
        await prevPromise;
        return await fn();
    } finally {
        release();
        if (listingLocks.get(key) === nextPromise) {
            listingLocks.delete(key);
        }
    }
};

