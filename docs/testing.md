# Testing Strategy & Acceptance Criteria (Phase 0)

## 1. Testing Philosophy

The DripRack testing suite ensures that all business constraints, security controls, and consistency guarantees are automatically verified before deployment.

### Test Levels:
1. **Unit Tests:** Business logic, pricing math, state transition rules, and schema validators tested in isolation.
2. **Integration Tests:** Express routes, middleware chains, database transactions, rate limiters, and error handlers tested via `Supertest` against a running MongoDB instance (or `mongodb-memory-server` in CI).
3. **End-to-End & Manual API Verification:** Postman collection and environment variables covering full role-based flows.

---

## 2. Acceptance Criteria Matrix

| ID | Test Scenario | Acceptance Criteria |
| :---: | :--- | :--- |
| **AC-01** | Guest access to protected routes | Request without `Authorization` header returns `401 Unauthorized` with `UNAUTHORIZED` error code. |
| **AC-02** | Customer access to admin routes | Customer token sent to `/api/v1/admin/*` or `/api/v1/inventory/*` returns `403 Forbidden` with `FORBIDDEN` error code. |
| **AC-03** | BOLA / Cross-user access | Customer A requesting `/api/v1/cart`, `/api/v1/addresses/:id`, or `/api/v1/orders/my-orders/:ref` belonging to Customer B returns `404 Not Found` or `403 Forbidden`. |
| **AC-04** | Role elevation prevention | Registration payload containing `{ "role": "admin" }` is stripped or rejected; assigned role is strictly `customer`. |
| **AC-05** | Mass assignment / Price tampering | Order placement payload containing `{ "priceCents": 100 }` or `{ "orderStatus": "delivered" }` is ignored; server calculates totals. |
| **AC-06** | Invalid IDs & payloads | Invalid MongoDB ObjectId, negative quantities, or invalid enums return `422 Unprocessable Entity` with field-level error messages. |
| **AC-07** | Unpublished product purchases | Attempting to add an unpublished or archived product to cart or checkout returns `400 Bad Request` / `404 Not Found`. |
| **AC-08** | Authoritative totals | Grand total equals $\text{subtotal} + \text{shipping} + \text{tax}$ calculated server-side; client totals are ignored. |
| **AC-09** | Concurrent checkout & stock protection | When 2 units of SKU remain and two customers attempt to purchase 2 units simultaneously, exactly one succeeds; the second receives `409 Conflict`. Zero overselling. |
| **AC-10** | Order Idempotency | Resending identical `Idempotency-Key` returns existing order without deducting stock a second time or creating duplicate records. |
| **AC-11** | Webhook signature rejection | Payment webhook with invalid HMAC signature or mismatched amount returns `400 Bad Request` and does not change order status. |
| **AC-12** | Duplicate webhook events | Replaying identical provider event ID returns `200 OK` (idempotent acknowledgement) without reapplying state or restocking. |
| **AC-13** | Cancellation stock release | Cancelling an order releases reserved/purchased stock back to available quantity exactly once (`isStockRestocked: true`). |
| **AC-14** | Refresh token rotation | Using a refresh token yields a new token pair and invalidates the previous refresh session. Replaying old token revokes all user sessions. |
| **AC-15** | Rate limiting & Error sanitization | Exceeding 5 login attempts within 15 minutes returns `429 Too Many Requests`. 500 errors omit stack traces in non-development modes. |
| **AC-16** | Zero secret exposure | Logs, API responses, and database queries for public profiles never contain `passwordHash`, `refreshToken`, or reset tokens. |

---

## 3. Test Execution Commands

```bash
# Run unit & integration test suites
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode during development
npm run test:watch
```
