import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { globalLimiter } from './middleware/rateLimiters.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './modules/health/health.routes.js';
import v1Router from './routes/index.js';

const app = express();

// Trust reverse proxy (nginx, cloud load balancers, etc.)
app.set('trust proxy', 1);

// HTTP Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false
  })
);

// Explicit CORS Allowlisting
const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, postman) in non-production
      if (!origin || allowedOrigins.includes(origin) || env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy violation: origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key']
  })
);

// Request Tracing Header
app.use(requestIdMiddleware);

// Structured HTTP Request Logging with Pino (skipped or quiet in test mode)
if (env.NODE_ENV !== 'test') {
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      }
    })
  );
}

// Body Parsing with Strict Payload Limits (DoS protection)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Cookie Parsing for HttpOnly Refresh Tokens
app.use(cookieParser(env.COOKIE_SECRET));

// Global Rate Limiting
app.use(globalLimiter);

// Liveness & Readiness Probes (Root level for Kubernetes / Orchestrators)
app.use('/health', healthRoutes);

// Main REST API Prefix Router
app.use(env.API_PREFIX, v1Router);

// 404 Route Catch-all
app.use(notFoundHandler);

// Centralized Error Handling
app.use(errorHandler);

export default app;
