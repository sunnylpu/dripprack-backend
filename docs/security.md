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
