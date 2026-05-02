import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { helmetMiddleware, corsMiddleware, generalRateLimit } from "./middlewares/security.js";
import { logger } from "./lib/logger.js";
import router from "./routes/index.js";

const app: Express = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(generalRateLimit);

// ── Logging ─────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status = err.status ?? err.statusCode ?? 500;
  const message = process.env.NODE_ENV === "production" ? "Internal server error" : (err.message ?? "Internal server error");
  res.status(status).json({ error: message });
});

export default app;
