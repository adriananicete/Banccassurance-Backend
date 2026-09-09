import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const isDev = process.env.NODE_ENV === 'development';

export const keyByIp = (req) => ipKeyGenerator(req.ip);

export const keyByUser = (req) => {
    const userCode = req.user?.UserCode;
    return typeof userCode === 'string' && userCode ? `user:${userCode}` : keyByIp(req);
};

export const keyByIdentifier = (req) => {
    const identifier = req.body?.identifier;
    return typeof identifier === 'string' && identifier.trim()
        ? `id:${identifier.trim().toLowerCase()}`
        : keyByIp(req);
};

const limits = {
    login: isDev ? 100 : 10,
    loginPerIp: isDev ? 1000 : 100,
    consent: isDev ? 200 : 30,
    consentUpload: isDev ? 200 : 20,
    register: isDev ? 200 : 30,
    checkEmail: isDev ? 500 : 60,
    message: isDev ? 2000 : 300,
    global: isDev ? 5000 : 1000,
};

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limits.login,
    keyGenerator: keyByIdentifier,
    message: { success: false, message: 'Too many attempts for this account. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const loginIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limits.loginPerIp,
    keyGenerator: keyByIp,
    message: { success: false, message: 'Too many attempts from this location. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const consentLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: limits.consent,
    keyGenerator: keyByUser,
    message: { success: false, message: 'Too many consent requests. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const consentUploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: limits.consentUpload,
    keyGenerator: keyByUser,
    message: { success: false, message: 'Too many uploads. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Sending is the only write in messaging, and 300 an hour is a person typing
// fast rather than a person being throttled. It has to exist at all because
// express-rate-limit never sees socket traffic -- if sending moved onto the
// socket it would leave the throttle entirely, which is why sends stay on HTTP.
export const messageLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: limits.message,
    keyGenerator: keyByUser,
    message: { success: false, message: 'Too many messages. Please slow down and try again shortly.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: limits.register,
    keyGenerator: keyByIp,
    message: { success: false, message: 'Too many registration attempts. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const checkEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limits.checkEmail,
    keyGenerator: keyByIp,
    message: { success: false, message: 'Too many requests. Please slow down and try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limits.global,
    keyGenerator: keyByIp,
    message: { success: false, message: 'Too many requests. Please slow down and try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
