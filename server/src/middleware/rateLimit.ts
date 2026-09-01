import rateLimit from 'express-rate-limit';

/** Tight limit for credential endpoints (login, register, password reset). */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many attempts. Try again later.' },
});

/** Broad limit applied to the whole API surface. */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Try again later.' },
});
