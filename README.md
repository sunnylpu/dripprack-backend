# DripRack Backend — Production-Grade MERN E-Commerce API (V1)

DripRack is a production-minded, secure e-commerce backend built with Node.js (ES modules), Express, and MongoDB/Mongoose. Designed specifically to pair with a decoupled React single-page frontend.

---

## 1. Technology Stack

- **Runtime & Language:** Node.js (v20+) with native ECMAScript Modules (`"type": "module"`)
- **API Framework:** Express.js 4.x
- **Database & ODM:** MongoDB Atlas / MongoDB 7.0+ with Mongoose 8.x
- **Schema Validation:** Zod
- **Password Security:** Argon2id
- **Session Management:** Short-lived access JWTs + rotating, revocable HttpOnly refresh tokens
- **Security Headers & CORS:** Helmet & strict CORS origin allowlisting
- **Rate Limiting:** express-rate-limit (Global, Strict Auth, and Checkout)
- **Logging & Tracing:** Pino structured JSON logging with secret redaction and `X-Request-Id` UUID tracing
- **Testing:** Vitest, Supertest, and MongoMemoryServer

---

## 2. Directory Structure

```
backend/
├── src/
│   ├── app.js                 # Express application assembly & global middleware
│   ├── server.js              # Server lifecycle & graceful shutdown
│   ├── config/
│   │   ├── env.js             # Zod environment variable parsing & validation
│   │   └── database.js        # Mongoose connection & connection pool management
│   ├── middleware/
│   │   ├── errorHandler.js    # Centralized error handler & response sanitizer
│   │   ├── notFound.js        # 404 handler for undefined routes
│   │   ├── rateLimiters.js    # Global, auth, and checkout rate limiters
│   │   ├── requestId.js       # X-Request-Id distributed tracing header
│   │   └── validateRequest.js # Zod body, query, and params validator
│   ├── utils/
│   │   ├── ApiError.js        # Operational error class with standard error codes
│   │   ├── ApiResponse.js     # Standard response envelope helper
│   │   ├── asyncHandler.js    # Async route wrapper for exception forwarding
│   │   ├── logger.js          # Pino structured logger with secret redaction
│   │   └── pagination.js      # Bounded pagination helper
│   ├── modules/
│   │   ├── health/            # Liveness (/health/live) & Readiness (/health/ready)
│   │   ├── auth/              # (Phase 2) Registration, Login, Refresh, Password Reset
│   │   ├── users/             # (Phase 2) User model & profile management
│   │   ├── categories/        # (Phase 3) Category management
│   │   ├── products/          # (Phase 3) Catalog management & search
│   │   ├── inventory/         # (Phase 4) Atomic stock adjustments & movement audit
│   │   ├── carts/             # (Phase 5) Customer cart engine
│   │   ├── addresses/         # (Phase 5) Delivery address book
│   │   ├── orders/            # (Phase 6) Quote engine, checkout & orders
│   │   ├── payments/          # (Phase 6) Payment gateway abstraction & webhooks
│   │   └── admin/             # (Phase 7) Admin fulfillment & reports
│   └── routes/
│       └── index.js           # Base API router for /api/v1
├── tests/                     # Automated Vitest test suite
├── docs/                      # Phase 0 System Design & Architecture
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── security.md
│   └── testing.md
├── postman/                   # Postman collection & environment template
├── .env.example               # Safe environment variable template
├── package.json
└── vitest.config.js
```

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Local MongoDB running on port 27017 or a MongoDB Atlas URI

### 1. Installation
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Adjust parameters in .env as needed
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Start Development Server
```bash
npm run dev
```

The server will start at `http://localhost:5000` with the API root mounted at `/api/v1`.

---

## 4. Health Checks & Verification

You can verify server health using `curl`:

```bash
# Liveness probe (checks process health)
curl -i http://localhost:5000/health/live

# Readiness probe (checks database connection)
curl -i http://localhost:5000/health/ready

# Base API information
curl -i http://localhost:5000/api/v1
```

Expected JSON response from `/api/v1`:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Welcome to DripRack E-Commerce REST API v1",
  "data": {
    "version": "1.0.0",
    "docs": "/api/v1/docs",
    "status": "operational",
    "timestamp": "2026-10-27T01:48:00.000Z"
  }
}
```

---

## 5. Security Safeguards in Foundation (Phase 1)
- **Helmet Headers:** Automated protection against MIME sniffing, clickjacking, and XSS.
- **Strict CORS Origin Allowlist:** Prevents unauthorized cross-origin requests.
- **Payload Limits:** Maximum 100KB JSON payloads to mitigate Denial-of-Service (DoS).
- **Zod Schema Validation:** Strictly strips unrecognized fields to protect against Mass Assignment.
- **Sanitized Errors:** Internal database error messages and stack traces are suppressed in production.
- **Log Redaction:** Passwords, tokens, cookies, and credit cards are automatically redacted in structured logs.
