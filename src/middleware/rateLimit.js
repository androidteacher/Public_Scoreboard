// Simple in-memory fixed-window rate limiter (no external dependency).
// Keyed by logged-in user so players sharing a school NAT/IP don't throttle each other.
// State resets on server restart, which is fine for brute-force protection.
function rateLimitByUser({ windowMs, max }) {
    const hits = new Map(); // key -> { count, resetAt }

    // Periodically drop expired entries so the map doesn't grow unbounded
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(key);
        }
    }, windowMs).unref();

    return (req, res, next) => {
        const key = req.session && req.session.userId ? `user:${req.session.userId}` : `ip:${req.ip}`;
        const now = Date.now();
        let entry = hits.get(key);

        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }
        entry.count++;

        if (entry.count > max) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({
                success: false,
                message: `Too many attempts. Please wait ${retryAfter} seconds and try again.`
            });
        }
        next();
    };
}

module.exports = { rateLimitByUser };
