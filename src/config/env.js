import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),

  // Security & Cookies
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters long'),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(7),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(300),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().default(5),

  // Store Business Defaults
  CURRENCY_CODE: z.string().default('USD'),
  TAX_RATE_PERCENT: z.coerce.number().min(0).max(100).default(0),
  SHIPPING_FLAT_FEE_CENTS: z.coerce.number().min(0).default(500), // $5.00
  FREE_SHIPPING_THRESHOLD_CENTS: z.coerce.number().min(0).default(5000), // $50.00

  // Payments Configuration
  ENABLE_ONLINE_PAYMENTS: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('false'),
  PAYMENT_PROVIDER: z.enum(['cod', 'stripe', 'mock']).default('cod'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // eslint-disable-next-line no-console
  console.error('❌ FATAL: Invalid environment variables configuration:');
  parsedEnv.error.issues.forEach((issue) => {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsedEnv.data;
