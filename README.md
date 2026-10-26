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

## 5. Administrator Bootstrap (Phase 2)

DripRack deliberately does **not** provide a public admin registration endpoint. Initial administrator creation is accomplished via a protected, idempotent CLI script:

```bash
# Using environment variables directly:
ADMIN_EMAIL="admin@driprack.com" ADMIN_PASSWORD="AdminPassword123!" node scripts/createAdmin.js

# Or using the npm script:
npm run seed:admin
```

### Bootstrap Safeguards:
- **No Hardcoded Passwords:** Reads credentials from environment variables or secure terminal input.
- **Argon2id Hashing:** Hashes passwords with Argon2id parameters before database insertion.
- **Idempotency:** Safe to re-run. If an administrator already exists with this email, the script reports existing status and exits cleanly with code 0.
- **Anti-Elevation Guarantee:** Refuses to silently elevate an existing customer to administrator (`role !== 'admin'`).
- **Audit-Safe:** Credentials and password hashes are never logged.

---

## 6. Authentication & Session Management (Phase 2)

### Endpoints:
- `POST /api/v1/auth/register`: Customer registration (strictly assigns `customer` role, strips unrecognized inputs).
- `POST /api/v1/auth/login`: Authenticates credentials, returns short-lived JWT access token in response body, and sets HttpOnly `refreshToken` cookie.
- `POST /api/v1/auth/refresh`: Rotates refresh token, invalidates previous session verifier, detects reuse attacks, and issues new token pair.
- `POST /api/v1/auth/logout`: Revokes session in database and clears the HttpOnly cookie.
- `GET /api/v1/auth/me`: Returns authenticated customer or admin profile. Protected by `authenticate` middleware.

### Browser & Cookie Security:
- **HttpOnly Cookies:** Refresh tokens are never accessible to client-side JavaScript, mitigating XSS token theft.
- **Strict Path Scoping:** Refresh cookie is scoped to `Path=/api/v1/auth`.
- **SameSite Policy:** `SameSite=Strict` in production (`Lax` in development).
- **CSRF Defense:** `verifyCsrfOrigin` middleware ensures state-changing cookie endpoints match the configured CORS allowlist.
- **Reuse Detection:** Replaying a revoked refresh token immediately invalidates all active sessions for that user.

---

## 7. Product Catalog & Category Management (Phase 3)

### Category Endpoints:
- `GET /api/v1/categories`: Public listing of active categories (`isActive: true`).
- `POST /api/v1/categories`: Administrator category creation with automatic or custom slug.
- `PATCH /api/v1/categories/:id`: Administrator category updates.
- `DELETE /api/v1/categories/:id`: Administrator category soft-deactivation (`isActive: false`).
- `GET /api/v1/admin/categories`: Administrator category inspection including inactive categories and pagination.

### Product Endpoints:
- `GET /api/v1/products`: Public paginated catalog with keyword search (`q`), category filtering, availability filtering (`inStock`), and allowlisted sorting.
- `GET /api/v1/products/:idOrSlug`: Public lookup by MongoDB ID or unique URL slug.
- `POST /api/v1/products`: Administrator product creation (initial status defaults to `draft`, stock defaults to 0).
- `PATCH /api/v1/products/:id`: Administrator updates to catalog fields.
- `PATCH /api/v1/products/:id/status`: Administrator status transitions (`draft`, `published`, `archived`).
- `GET /api/v1/admin/products`: Administrator product listing across all statuses.
- `GET /api/v1/admin/products/:id`: Administrator detail lookup across all statuses.

### Catalog Security & Invariants:
- **Inventory Isolation Barrier:** Product creation and update endpoints strictly reject/strip client-supplied stock parameters. Stock can never be changed via general catalog updates.
- **Storefront Visibility Rules:** Products are only visible to the public if `status === 'published'` AND their category is active (`category.isActive === true`). Draft, archived, or inactive-category products return `404 Not Found` for public clients.
- **Category Publishing Constraint:** A product cannot transition to `published` if its assigned category is inactive.

---

## 8. Inventory & Stock Management (Phase 4)

All inventory endpoints require `authenticate` and `authorize('admin')`.

### Inventory Endpoints:
- `POST /api/v1/inventory/adjust`: Atomic physical and available stock adjustment. Supports positive and negative integer deltas, mandatory audit reasons, transaction safety, and optional `Idempotency-Key` header.
- `GET /api/v1/inventory/stock`: Administrator catalog stock levels with real-time `isLowStock` flags, category/search/low-stock filtering, and allowlisted sorting.
- `GET /api/v1/inventory/low-stock`: Report listing products currently at or below their configured `lowStockThreshold` (`stock.available <= lowStockThreshold`).
- `GET /api/v1/inventory/movements`: Immutable append-only audit trail with filtering by product, actor, movement type, and date range.

### Invariants & Transaction Guarantees:
- **Stock Invariant:** Real-time stock strictly satisfies $\text{available} = \text{physical} - \text{reserved}$ with integer validation and $\text{physical} \ge 0, \text{reserved} \ge 0, \text{available} \ge 0, \text{reserved} \le \text{physical}$.
- **Atomic Concurrency:** Negative adjustments conditionally enforce $\text{available} \ge |\text{quantityDelta}|$ at the database query level.
- **ACID Transactions:** Product stock updates and `InventoryMovement` insertions are bound to a MongoDB session; if movement creation fails, the stock change automatically rolls back.
- **Idempotency Deduplication:** The `Idempotency-Key` header guarantees safe network retries. Replaying the identical key with matching payload hash returns the original movement without double adjustment; collisions with different payloads return `409 Conflict`.
- **SKU Snapshotting:** Movements record an immutable SKU snapshot at adjustment time to preserve historical fidelity if products are renamed.
- **Read-Only Audit Script:** Run `node scripts/auditInventoryIntegrity.js` to inspect catalog inventory integrity against invariants without mutating production data.

---

## 9. Security Safeguards
- **Helmet Headers:** Automated protection against MIME sniffing, clickjacking, and XSS.
- **Strict CORS Origin Allowlist:** Prevents unauthorized cross-origin requests.
- **Payload Limits:** Maximum 100KB JSON payloads to mitigate Denial-of-Service (DoS).
- **Zod Schema Validation:** Strictly strips or rejects unrecognized fields to protect against Mass Assignment.
- **Sanitized Errors:** Internal database error messages and stack traces are suppressed in production.
- **Log Redaction:** Passwords, tokens, cookies, and credit cards are automatically redacted in structured logs.

---

## 10. Shopping Cart & Delivery Address Management (Phase 5)

All cart and address endpoints require both `authenticate` and `authorize('customer')`. Ownership is strictly derived from the authenticated request context (`req.user._id`), preventing Broken Object Level Authorization (BOLA/IDOR).

### Shopping Cart Endpoints:
- `GET /api/v1/cart`: Retrieve customer cart. Dynamically calculates line totals and unit prices from active Product records and evaluates storefront availability (`isAvailableForPurchase`). Flags all totals with `isAuthoritative: false`.
- `POST /api/v1/cart/items`: Add product line or atomically increment existing line. Enforces integer quantity bounds (`1` through `99`), product publication status, active category requirement, and available stock validation.
- `PATCH /api/v1/cart/items/:productId`: Update requested item quantity (`1` through `99`). Validates catalog eligibility and stock.
- `DELETE /api/v1/cart/items/:productId`: Remove line from cart (succeeds even if product was archived or unlisted).
- `DELETE /api/v1/cart`: Clear all items from the customer cart.

### Delivery Address Book Endpoints:
- `GET /api/v1/addresses`: List authenticated customer's delivery addresses, deterministically ordered with default address first, followed by newest additions.
- `POST /api/v1/addresses`: Add new delivery address. First address automatically becomes default (`isDefault: true`). Subsequent addresses default to `false` unless explicitly specified.
- `PATCH /api/v1/addresses/:id`: Update owned address fields (`recipientName`, `phone`, `streetAddress1`, `streetAddress2`, `city`, `state`, `postalCode`, `country`). Owner ID cannot be changed.
- `PATCH /api/v1/addresses/:id/default`: Set target address as customer's default address within an atomic transaction.
- `DELETE /api/v1/addresses/:id`: Delete owned address. If deleted address was the default, automatically promotes newest remaining address to default within a transaction.

### Core Business Rules & Invariants:
1. **Non-Authoritative Pricing:** Authoritative pricing is never stored in cart items. Cart calculations are informational; Phase 6 checkout independently recalculates all authoritative order lines.
2. **Catalog Drift Resilience:** Products unpublished or archived while in a cart are not silently deleted; they are preserved with `isAvailableForPurchase: false` and a descriptive reason.
3. **Zero Stock Mutation:** Cart operations strictly never alter product physical, reserved, or available stock.
4. **Single Default Address Invariant:** Database-level partial unique index on `{ user: 1 }` (`partialFilterExpression: { isDefault: true }`) guarantees that a customer can never have multiple default addresses under concurrent requests.
5. **Ownership Scoping:** Address queries always scope by `{ _id: addressId, user: req.user._id }`. Cross-user tampering yields `404 Not Found`.




