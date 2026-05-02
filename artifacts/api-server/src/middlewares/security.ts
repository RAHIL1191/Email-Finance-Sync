import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import type { RequestHandler } from "express";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Helmet security headers — sets X-Content-Type-Options, X-Frame-Options,
 * Strict-Transport-Security, etc. automatically.
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // disabled for API-only server
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * CORS — in development allow all origins; in production restrict to
 * domains listed in the ALLOWED_ORIGINS env var (comma-separated).
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

export const corsMiddleware = cors({
  origin: isDev
    ? true
    : (origin, cb) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error(`CORS: origin ${origin} not allowed`));
        }
      },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-ID", "X-API-Key"],
  credentials: true,
  maxAge: 86400,
});

/**
 * General rate limiter — 200 requests per 15 minutes per IP.
 */
export const generalRateLimit: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
}) as unknown as RequestHandler;

/**
 * Strict rate limiter for expensive operations (email sync) — 10 per minute.
 */
export const strictRateLimit: RequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded for this operation. Please wait a moment." },
}) as unknown as RequestHandler;
