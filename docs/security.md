# Threat Model & Security Architecture (Phase 0)

## 1. Threat Model & OWASP API Security Defenses

| Threat / Vulnerability | Risk | Mitigation Architecture in DripRack |
| :--- | :--- | :--- |
| **API1: Broken Object Level Authorization (BOLA)** | A customer accesses another customer's cart, address, or order by guessing ID. | Centralized object-level ownership guard. Every query filtering user data explicitly includes `{ user: req.user._id }` or `{ customer: req.user._id }`. |
| **API2: Broken Authentication** | Credential stuffing, brute force, token theft, expired session usage. | Argon2id password hashing; short-lived access tokens (15m); rotating refresh tokens with SHA-256 verifier hashes stored in MongoDB; reuse detection revoking sessions; strict login rate-limiting (5 attempts per 15 minutes). |
| **API3: Broken Object Property Level Authorization (Mass Assignment)** | User submits `role: "admin"` or `stock.available: 9999` in request body. | Zod schemas strictly define allowed input fields; unknown keys are stripped (`strip()` mode); controllers explicitly map permitted fields. Public registration hardcodes `role: "customer"`. |
| **API4: Unrestricted Resource Consumption (DoS)** | Excessive payloads, unbounded search queries, rapid-fire checkout loops. | Express body parser limit set to 100KB; strict pagination limits (default 20, max 100); rate limiters applied at application and sensitive endpoint tiers. |
| **API5: Broken Function Level Authorization (BFLA)** | Customer invokes admin endpoints (`/api/v1/admin/*`, `/api/v1/inventory/*`). | `authorize('admin')` middleware applied at the router level. Rejects non-admin tokens with 403 Forbidden before reaching controller. |
| **API6: Unrestricted Access to Sensitive Business Flows** | Inventory hoarding, scalping bots, repeated payment submissions. | Atomic conditional stock checks inside MongoDB transactions; `Idempotency-Key` requirement for order checkout. |
| **API7: Server-Side Request Forgery (SSRF)** | Exploitation of webhook URLs or image fetching. | External URLs restricted to safe HTTPS protocols; webhooks are inward-only with HMAC-SHA256 signature verification. |
| **API8: Security Misconfiguration** | Information disclosure via stack traces, default passwords, missing headers. | Helmet security headers; production error sanitizer hiding stack traces; no default hardcoded credentials; protected CLI admin creation script. |
| **API9: Improper Inventory Management** | Lack of API versioning and deprecation oversight. | Explicit `/api/v1` namespace; clean separation between internal models and public DTOs. |
| **API10: Unsafe Consumption of APIs** | Blind trust in payment webhook payloads. | Raw payload signature validation (Stripe / gateway HMAC) before parsing; amount and currency matching against stored order before state update. |

---

## 2. Authentication Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Client as Customer (SPA)
    participant Auth as Auth Module
    participant DB as MongoDB
    
    Note over Client, DB: Registration Flow
    Client->>Auth: POST /api/v1/auth/register { email, password, firstName, lastName }
    Auth->>Auth: Validate with Zod; Hash password with Argon2id
    Auth->>DB: Insert User with role="customer" (forced)
    Auth-->>Client: 201 Created (Sanitized user profile without secrets)

    Note over Client, DB: Login & Session Creation Flow
    Client->>Auth: POST /api/v1/auth/login { email, password }
    Auth->>DB: Query User by normalized email
    Auth->>Auth: Verify password with Argon2id; Check account status
    Auth->>Auth: Generate short-lived Access Token (JWT, 15m)
    Auth->>Auth: Generate high-entropy Refresh Token (random 64-char string)
    Auth->>DB: Store SHA-256(refreshToken) in AuthSession with TTL
    Auth-->>Client: 200 OK + Body: { accessToken } + Set-Cookie: refreshToken (HttpOnly, Secure, SameSite=Strict)

    Note over Client, DB: Refresh Token Rotation
    Client->>Auth: POST /api/v1/auth/refresh (Cookie: refreshToken)
    Auth->>DB: Find AuthSession by SHA-256(refreshToken)
    alt Token already revoked or reused
        Auth->>DB: Revoke all active sessions for this user (Compromise detection)
        Auth-->>Client: 401 Unauthorized (Session terminated)
    else Token valid
        Auth->>DB: Invalidate current AuthSession (mark revoked or delete)
        Auth->>Auth: Generate new Access Token + new Refresh Token
        Auth->>DB: Create new AuthSession
        Auth-->>Client: 200 OK + new Access Token + new HttpOnly Cookie
    end
```

---

## 3. Role-Based Access Control (RBAC) Matrix

| Route Group | Resource | Public | Customer | Admin | Enforcement Mechanism |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `/api/v1/auth/register` | User | Yes | - | - | Public endpoint; role locked to `customer` |
| `/api/v1/auth/login` | User | Yes | - | - | Rate-limited (5/15min) |
| `/api/v1/auth/me` | Profile | No | Yes | Yes | `authenticate` |
| `/api/v1/categories` (GET) | Catalog | Yes | Yes | Yes | Public read |
| `/api/v1/categories` (CUD) | Catalog | No | No | Yes | `authenticate, authorize('admin')` |
| `/api/v1/products` (GET) | Catalog | Yes | Yes | Yes | Filters `status: 'published'` for public |
| `/api/v1/products` (CUD) | Catalog | No | No | Yes | `authenticate, authorize('admin')` |
| `/api/v1/inventory/*` | Stock | No | No | Yes | `authenticate, authorize('admin')` |
| `/api/v1/cart/*` | Cart | No | Yes | No | `authenticate, authorize('customer')`, scoped to `req.user._id` |
| `/api/v1/addresses/*` | Addresses | No | Yes | No | `authenticate, authorize('customer')`, scoped to `req.user._id` |
| `/api/v1/orders/quote` | Quote | No | Yes | No | Server-side recalculated pricing |
| `/api/v1/orders` (POST) | Orders | No | Yes | No | `Idempotency-Key` checked, scoped to `req.user._id` |
| `/api/v1/orders/my-orders/*`| Orders | No | Yes | No | Scoped to `{ customer: req.user._id }` |
| `/api/v1/admin/*` | Management | No | No | Yes | `authenticate, authorize('admin')` |

---

## 4. Rate Limiting Policy

1. **Global Rate Limiter:**
   - 300 requests per 15-minute window per IP.
   - Prevents general scanning and server degradation.
2. **Auth Strict Rate Limiter:**
   - 5 requests per 15-minute window for `/api/v1/auth/login`.
   - 10 requests per 1-hour window for `/api/v1/auth/register`.
   - 5 requests per 1-hour window for password reset endpoints.
3. **Checkout Rate Limiter:**
   - 20 requests per 15-minute window for `/api/v1/orders` to prevent automated inventory lockouts.

---

## 5. Structured Logging & Secret Sanitization

Pino structured logger is configured with strict field redaction:
```javascript
redact: {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'body.password',
    'body.confirmPassword',
    'body.token',
    'body.refreshToken',
    'body.creditCard',
    'body.cvv',
    '*.password',
    '*.passwordHash',
    '*.tokenHash'
  ],
  censor: '[REDACTED]'
}
```
Every incoming HTTP request generates or propagates an `X-Request-Id` UUID header, which is tagged on all logs for end-to-end traceability.

---

## 6. Inventory & Stock Security Controls (Phase 4)

1. **Strict Admin-Only Authorization:**
   - Every route mounted under `/api/v1/inventory` requires both `authenticate` and `authorize('admin')` middleware.
   - Unauthenticated requests return `401 Unauthorized`.
   - Customer-role users or tampered tokens return `403 Forbidden` (`FORBIDDEN`).

2. **Trusted Actor Derivation (Anti-Spoofing):**
   - The actor ID and actor role recorded on each `InventoryMovement` are derived strictly from the server-validated session (`req.user._id`, `req.user.role`).
   - Any client-supplied actor fields are stripped by schema validation and rejected.

3. **Mass-Assignment & Tampering Prevention:**
   - Product stock fields (`physical`, `reserved`, `available`) cannot be modified via general catalog create (`POST /products`) or update (`PATCH /products/:id`) endpoints.
   - Initial stock on product creation is strictly hardcoded to zero (`{ physical: 0, reserved: 0, available: 0 }`).
   - The adjustment schema (`adjustStockSchema`) uses `.strict()`, rejecting payloads that attempt to inject direct stock counts or bypass business rules.

4. **Race-Condition & Overselling Protection:**
   - Negative adjustments enforce stock availability at the atomic database engine level (`{ 'stock.available': { $gte: Math.abs(quantityDelta) } }`) rather than relying on stale application-level reads.
   - Multi-document transactions (`session.withTransaction`) ensure that stock updates and audit movements succeed or fail atomically.

5. **Idempotency Protection Against Replay Attacks:**
   - Stock adjustments support the `Idempotency-Key` header with database-enforced uniqueness via `partialFilterExpression: { idempotencyKey: { $type: "string" } }`.
   - Replays with identical payload hashes return the existing movement safely without mutating stock a second time.
   - Key collisions with modified payloads are rejected with `409 Conflict` (`IDEMPOTENCY_CONFLICT`).

6. **Audit Trail Immutability:**
   - `inventory_movements` collection is strictly append-only through the API.
   - No `PATCH`, `PUT`, or `DELETE` endpoints exist for movement logs.
   - Snapshot SKUs preserve original SKU values across subsequent catalog updates.

---

## 7. Shopping Cart & Delivery Address Security Controls (Phase 5)

1. **Strict Customer-Only Authorization:**
   - Every route under `/api/v1/cart` and `/api/v1/addresses` requires both `authenticate` and `authorize('customer')` middleware.
   - Unauthenticated requests return `401 Unauthorized` (`UNAUTHORIZED`).
   - Admin users or tokens with mismatched roles return `403 Forbidden` (`FORBIDDEN`).

2. **Strict Ownership Scoping (Anti-IDOR / Anti-BOLA):**
   - Resource ownership is derived exclusively from the authenticated session context (`req.user._id`).
   - Client-supplied `user`, `userId`, `owner`, or `customerId` fields in query params or request bodies are strictly rejected or stripped by `.strict()` Zod schemas.
   - All address mutations and queries scope by user: `{ _id: addressId, user: req.user._id }`.
   - Attempting to inspect, modify, set as default, or delete another user's address returns `404 Not Found` (`ADDRESS_NOT_FOUND`) without leaking resource existence or metadata.
   - Cart documents are uniquely keyed to the authenticated customer (`{ user: 1 }`), preventing cross-customer access.

3. **Client Price Tampering & Non-Authoritative Price Isolation:**
   - The Cart document schema deliberately omits price, discount, or subtotal fields. It stores only `product` ObjectId references, `quantity` (1–99), and timestamps.
   - No client payload can inject prices, discounts, or inventory counts into a cart.
   - Cart read operations dynamically resolve unit prices from active Product records and flag calculated subtotals with `isAuthoritative: false`.
   - Checkout (Phase 6) operates as the sole authority on order pricing and promotions.

4. **Input Validation, Type Safety & Mass Assignment Defense:**
   - All cart and address request schemas enforce `.strict()`, rejecting unexpected keys and preventing MongoDB operator injection (`$gt`, `$ne`, etc.).
   - Product and address IDs are validated against strict 24-character hexadecimal MongoDB ObjectId patterns.
   - Quantities are strictly enforced as integers in the range `[1, 99]`. Non-integers, negative numbers, zero, and out-of-range quantities return `400 Bad Request` (`VALIDATION_ERROR`).
   - Address fields are length-limited (recipient name, street, city, state: 100–150 chars). Country is enforced as a 2-letter uppercase ISO code (`/^[A-Z]{2}$/`). Postal codes and phone numbers are validated against flexible international formats without exposing ReDoS vulnerabilities.

5. **PII Protection & Sensitive Data Hygiene:**
   - Customer recipient names, physical delivery addresses, and phone numbers are classified as Personally Identifiable Information (PII).
   - Application logger configuration redacts sensitive headers, cookies, and tokens.
   - Address mutation logs do not serialize full street address or phone details to application log files.

6. **Database Invariant Integrity & Concurrency Safeguards:**
   - Single default address per customer is enforced at the database engine level using a partial unique index: `{ user: 1 }` with `partialFilterExpression: { isDefault: true }`.
   - Default address switches and default promotions during deletion execute inside MongoDB multi-document transactions (`session.withTransaction`), guaranteeing consistent state transitions.
   - Cart item modifications utilize atomic `$inc` updates and atomic `$push` with `{ 'items.product': { $ne: productId } }`, preventing duplicate product lines and preventing race conditions during concurrent additions.

---

## 8. Checkout, Order & Payment Security Controls (Phase 6)

1. **Strict Customer-Only Authorization & Anti-BOLA Scoping:**
   - All customer order endpoints (`/api/v1/orders/*`, `/api/v1/payments/create-intent`) enforce `authenticate` and `authorize('customer')`. Admin tokens receive `403 Forbidden` (`FORBIDDEN`); unauthenticated requests receive `401 Unauthorized` (`UNAUTHORIZED`).
   - Order history (`GET /my-orders`), detail inspection (`GET /my-orders/:reference`), and cancellation (`POST /my-orders/:reference/cancel`) scope queries strictly to `{ orderReference: reference, customer: req.user._id }`.
   - Cross-user order inspection or cancellation attempts return `404 Not Found` (`ORDER_NOT_FOUND`) without leaking order existence or customer details.

2. **Server-Authoritative Pricing & Anti-Tampering:**
   - Client requests cannot submit `subtotalCents`, `shippingCents`, `taxCents`, `totalCents`, `unitPriceCents`, `orderStatus`, `paymentStatus`, or actor identities.
   - Order creation authoritatively queries live `Product.priceCents` from MongoDB and re-validates stock, publication status, and category activity within an ACID transaction.
   - Informational quotes (`POST /orders/quote`) do not hold or reserve inventory.

3. **Atomic Stock Reservation & Zero Overselling Guarantee:**
   - Stock reservations execute atomic conditional increments: `{ 'stock.available': { $gte: quantity } }`, increasing `stock.reserved` while decreasing `stock.available` by requested quantity.
   - Product stock satisfies the invariant $\text{available} = \text{physical} - \text{reserved}$ at all times.
   - Multi-document transactions (`session.withTransaction`) ensure that order creation, payment record generation, inventory reservation movements, and customer cart evacuation succeed or roll back together.

4. **Idempotency Protection Against Network Retries & Race Conditions:**
   - The `Idempotency-Key` header (1–128 chars) is validated on order placement and indexed uniquely on `orders` via `partialFilterExpression: { idempotencyKey: { $type: "string" } }`.
   - Replaying the identical request payload returns the original order with `200 OK` without duplicating stock reservation or payment records.
   - Replaying the same idempotency key with a modified payload is rejected with `409 Conflict` (`IDEMPOTENCY_CONFLICT`).
   - Concurrent duplicate-key requests are halted by the database unique index, resolving race conditions safely.

5. **Rate Limiting Against Scalping & Inventory Locking:**
   - `checkoutLimiter` limits order creation to 20 requests per 15 minutes per IP to prevent rapid inventory exhaustion.

6. **Payment Provider Isolation & Cryptographic Webhook Verification:**
   - Cash on Delivery (COD) is the default active payment provider for V1. Online payments remain disabled by default (`ENABLE_ONLINE_PAYMENTS = false`), returning `400 Bad Request` (`ONLINE_PAYMENTS_DISABLED`) with zero state mutation if invoked without configuration.
   - Webhooks are verified against `req.rawBody` using HMAC-SHA256 signatures prior to JSON processing. Invalid or forged signatures return `400 Bad Request` (`INVALID_WEBHOOK_SIGNATURE`).
   - Webhook amounts, currencies, and order references are validated against database records before any state transition occurs.
   - Webhook idempotency is enforced via `payment.processedEvents`, acknowledging duplicate event deliveries with `200 OK` without repeating mutations.
   - Compensating failure flow: payment failure/expiration events for unpaid orders (`awaiting_payment`) cancel the order and release reserved stock exactly once.

7. **Zero Cardholder Secret Storage:**
   - The application never accepts, logs, or stores raw credit card numbers, CVVs, or gateway API secret keys.




