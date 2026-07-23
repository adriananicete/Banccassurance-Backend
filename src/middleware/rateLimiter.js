import {rateLimit} from 'express-rate-limit';

const isDev = process.env.NODE_ENV === 'development';

export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 100 : 5,
    message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const mediumLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isDev ? 200 : 10,
    message: { success: false, message: 'Too many requests. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 1000 : 100,
    message: { success: false, message: 'Too many requests. Please slow down and try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});