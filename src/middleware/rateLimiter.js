import {rateLimit} from 'express-rate-limit';

export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const mediumLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many requests. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests. Please slow down and try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});