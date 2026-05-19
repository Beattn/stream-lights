import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";

/** General limiter: 120 requests per IP per minute */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => !isProduction,
  message: { error: "Too many requests, please slow down." },
});

/** Strict limiter for mutating operations: 30 writes per IP per minute */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => !isProduction,
  message: { error: "Too many write requests, please slow down." },
});
