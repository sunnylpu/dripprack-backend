# Architecture & Design Document (Phase 0)

## 1. Executive Summary & V1 Scope

**Project Name:** DripRack Backend API (V1)  
**System Type:** Modular Monolith RESTful API  
**Target Client:** Standalone React Frontend (Single-Store E-Commerce)  
**Protocol Prefix:** `/api/v1`  
**Data Storage:** MongoDB Atlas (Mongoose ODM) with Transaction Support  

### Core Scope:
1. **Customer Capabilities:**
   - Account registration with role enforcement (`customer` only).
   - Secure login, logout, refresh session rotation, current profile query, and password reset via token.
   - Public product and category exploration (pagination, filtering by category and stock status, search, strict sort allowlisting).
   - Server-authoritative cart management (rejecting negative/invalid quantities, calculating totals dynamically).
   - Customer-owned delivery address management with primary address selection.
   - Checkout quote calculation and idempotent order placement.
   - Cash on Delivery (COD) payment flow with provider-agnostic online gateway architecture for future activation.
   - Customer order history tracking and self-service cancellation of eligible orders.

2. **Administrator Capabilities:**
   - Initialized via a protected, idempotent CLI bootstrap script (`scripts/createAdmin.js`).
   - Catalog management: Create, update, publish/unpublish, and archive products and categories.
   - Inventory control: Real-time physical vs. reserved vs. available stock calculation, atomic adjustments with mandatory reason logging and immutable audit trail.
   - Order fulfillment: State transition management (`confirmed` -> `processing` -> `shipped` -> `delivered`), tracking detail recording, cancellation handling, and restocking.
   - Operational dashboard: Bounded summary analytics (total revenue, order counts by status, low-stock warnings, recent order feed).

---

## 2. Use-Case List by Role

### Guest / Public User
- `UC-G01`: View published product listing with pagination and search.
- `UC-G02`: View published product details by slug or ID.
- `UC-G03`: View active categories.
- `UC-G04`: Register new customer account (always assigned `customer` role).
- `UC-G05`: Authenticate (login) and receive short-lived access token + HttpOnly refresh token cookie.
- `UC-G06`: Request password reset token via email.
- `UC-G07`: Reset password using single-use valid reset token.
- `UC-G08`: Perform health check (`/health/live`, `/health/ready`).

### Customer
- `UC-C01`: Rotate refresh token to receive a fresh access token.
- `UC-C02`: Terminate session (logout) revoking refresh session.
- `UC-C03`: Fetch authenticated user profile (`/api/v1/auth/me`).
- `UC-C04`: Manage shopping cart (read, add item, update quantity, remove item, clear).
- `UC-C05`: Manage shipping addresses (create, list, update, delete, set default).
- `UC-C06`: Request checkout quote (server-side recalculated pricing, tax, shipping).
- `UC-C07`: Place order idempotently using `Idempotency-Key` header.
- `UC-C08`: View own order history and order details.
- `UC-C09`: Cancel own order if in an eligible status (`awaiting_payment`, `confirmed`).

### Administrator
- `UC-A01`: Secure login with admin credentials.
- `UC-A02`: Create, edit, publish/unpublish, and archive categories.
- `UC-A03`: Create, edit, publish/unpublish, and archive products.
- `UC-A04`: Inspect inventory levels (physical, reserved, available).
- `UC-A05`: Perform manual inventory adjustments (specifying quantity change and mandatory audit reason).
- `UC-A06`: View inventory movement history logs.
- `UC-A07`: View all store orders with multi-status filters and pagination.
- `UC-A08`: Update order fulfillment status with tracking data.
- `UC-A09`: Cancel order and execute automated inventory restock.
- `UC-A10`: View admin dashboard metrics (sales totals, status breakdown, low stock alert).

---

## 3. High-Level Modular Monolith Architecture

The system is organized into decoupled feature modules under `src/modules/` with centralized cross-cutting concerns under `src/middleware/`, `src/utils/`, and `src/config/`.

```
                    +------------------------------------+
                    |        Client (React SPA)          |
                    +-----------------+------------------+
                                      |
                      HTTPS / REST (/api/v1)
                                      |
                    +-----------------v------------------+
                    |    Security & Infrastructure Layer |
                    | - Helmet (HTTP Headers)            |
                    | - CORS Allowlist                   |
                    | - Request ID Middleware            |
                    | - Rate Limiters (Global & Strict)  |
                    | - Body Parser (JSON limit 100kb)   |
                    | - Cookie Parser (HttpOnly refresh) |
                    | - Pino Structured HTTP Logger      |
                    +-----------------+------------------+
                                      |
                    +-----------------v------------------+
                    |           Router Engine            |
                    |           /api/v1 routes           |
                    +-----------------+------------------+
                                      |
      +-------------------------------+-------------------------------+
      |                               |                               |
+-----v---------------+     +---------v---------+           +---------v---------+
|    Auth & Users     |     | Catalog & Stock   |           | Orders & Checkout |
| - Registration      |     | - Products        |           | - Cart Engine     |
| - Sessions (JWT)    |     | - Categories      |           | - Address Book    |
| - Password (Argon2) |     | - Inventory Move  |           | - Quote Engine    |
| - RBAC Guard        |     | - Atomic Stock    |           | - Order Lifecycle |
+---------------------+     +-------------------+           +-------------------+
                                      |                               |
                                      +---------------+---------------+
                                                      |
                                            +---------v---------+
                                            | Payment Service   |
                                            | - COD Strategy    |
                                            | - Gateway Adapter |
                                            +---------+---------+
                                                      |
                                            +---------v---------+
                                            | Mongoose ODM /    |
                                            | MongoDB ReplicaSet|
                                            | (ACID Transaction)|
                                            +-------------------+
```

---

## 4. State Transition Machines

### 4.1 Order Lifecycle State Machine

Valid order states:
- `awaiting_payment`
- `confirmed`
- `processing`
- `shipped`
- `delivered`
- `cancelled`

```mermaid
stateDiagram-v2
    [*] --> awaiting_payment : Online Payment Initiated
    [*] --> confirmed : COD Order Placed
    awaiting_payment --> confirmed : Payment Verified (Webhook)
    awaiting_payment --> cancelled : Payment Failed / Timeout
    confirmed --> processing : Admin Starts Fulfillment
    confirmed --> cancelled : Customer/Admin Cancelled
    processing --> shipped : Order Dispatched (Tracking Added)
    processing --> cancelled : Admin Cancelled (Exception)
    shipped --> delivered : Delivery Confirmed
    delivered --> [*]
    cancelled --> [*]
```

#### Order State Transition Rules:
1. **Creation:** COD orders directly enter `confirmed`. Online payments enter `awaiting_payment`.
2. **Cancellation:** Orders in `awaiting_payment` or `confirmed` can be cancelled by the customer. Orders in `processing` can only be cancelled by an administrator. Orders in `shipped` or `delivered` cannot be cancelled (must follow return/refund policy in future versions).
3. **Restocking Guarantee:** Transitioning to `cancelled` triggers an idempotent stock release or restock movement. A database flag `isStockRestocked: true` guarantees restocking happens exactly once.

### 4.2 Payment State Machine

Valid payment states:
- `pending`: Payment transaction initialized.
- `paid`: Payment captured and verified via webhook signature.
- `failed`: Payment declined or expired.
- `cod_due`: Cash on delivery due upon receipt.
- `refunded`: Authoritative refund confirmed.

```mermaid
stateDiagram-v2
    [*] --> pending : Online Payment Checkout
    [*] --> cod_due : COD Checkout
    pending --> paid : Webhook Verified (200 OK)
    pending --> failed : Webhook Payment Failure / Timeout
    cod_due --> paid : Admin Marks Payment Received on Delivery
    paid --> refunded : Authorized Refund Processed
```

---

---

## 5. Stock Consistency, Concurrency & Inventory Architecture (Phase 4)

E-commerce inventory requires zero overselling under race conditions, integer-only stock counts, and append-only audit tracking.

### 5.1 Stock Invariant
The Product model remains the single source of truth for real-time stock levels:
$$\text{Available Stock} = \text{Physical Quantity} - \text{Reserved Quantity}$$

### Required System Invariants:
1. All stock quantities are non-negative integers ($\text{physical} \ge 0, \text{reserved} \ge 0, \text{available} \ge 0$).
2. Reserved stock cannot exceed physical stock ($\text{reserved} \le \text{physical}$).
3. Available stock must strictly equal physical minus reserved ($\text{available} = \text{physical} - \text{reserved}$).
4. New products start with zero stock (`{ physical: 0, reserved: 0, available: 0 }`).
5. The Inventory Service is the **only** application service authorized to mutate stock. General catalog create/update/status endpoints reject or strip all stock modifications.

### 5.2 Atomic Stock Adjustments & Transaction Safety
Every stock adjustment executes inside a MongoDB multi-document ACID transaction:
```javascript
// Negative stock adjustment atomically enforcing available stock condition
const updatedProduct = await Product.findOneAndUpdate(
  {
    _id: productId,
    "stock.available": { $gte: Math.abs(quantityDelta) } // Enforces non-negativity and reservation buffer atomically
  },
  { 
    $inc: { 
      "stock.physical": quantityDelta,
      "stock.available": quantityDelta
    } 
  },
  { session, new: true }
);

if (!updatedProduct) {
  throw ApiError.conflict('Stock update conflict or insufficient available stock', 'STOCK_UPDATE_CONFLICT');
}

// Append-only audit record created in the same transaction
await InventoryMovement.create(
  [
    {
      product: updatedProduct._id,
      sku: product.sku, // Immutable SKU snapshot
      movementType: 'adjustment',
      quantityDelta,
      previousPhysical: product.stock.physical,
      newPhysical: updatedProduct.stock.physical,
      previousAvailable: product.stock.available,
      newAvailable: updatedProduct.stock.available,
      actor: actorId,
      actorRole: 'admin',
      reason: reason.trim(),
      idempotencyKey: idempotencyKey || null,
      idempotencyPayloadHash: idempotencyKey ? payloadHash : null
    }
  ],
  { session }
);
```

### 5.3 Idempotency Strategy
- **Header:** `Idempotency-Key` (up to 128 chars).
- **Index:** Enforced at database level via `{ idempotencyKey: 1 }` with `partialFilterExpression: { idempotencyKey: { $type: "string" } }` on `inventory_movements`.
- **Payload Hash:** SHA-256 hash of `{ productId, quantityDelta, reason }`.
- **Replay Behavior:**
  - Matching key + matching hash: Safely returns existing movement and current product (200 OK) without double adjustment.
  - Matching key + mismatched hash: Rejected immediately with `409 Conflict` (`IDEMPOTENCY_CONFLICT`).
  - Concurrent requests with identical key: Database unique constraint halts duplicate execution, and the service transparently resolves the replay.

### 5.4 Audit Trail Immutability
`InventoryMovement` documents are strictly append-only. No edit, update, or delete routes are exposed anywhere in the API. Snapshot SKUs preserve historical fidelity even if an administrator renames a product SKU in future catalog updates.

---

## 6. Shopping Cart & Delivery Address Architecture (Phase 5)

### 6.1 Customer Shopping Cart Architecture
The shopping cart module (`src/modules/carts/`) implements a customer-owned, server-authoritative holding buffer for items intended for purchase:

1. **One Cart Per Customer:** Enforced at database level via `{ user: 1 }` unique index on `carts`.
2. **Non-Authoritative Pricing:** Prices are **never** stored in cart item documents. Only product references, requested quantities ($1 \le q \le 99$), and addition timestamps are saved.
3. **Dynamic Read-Time Pricing & Availability:** On cart read (`GET /api/v1/cart`), the service populates product records and dynamically computes:
   - Current unit prices and line totals from active catalog data.
   - Informational estimated subtotals (clearly marked `isAuthoritative: false`).
   - Storefront purchase eligibility: verifying product publication status, category active status, and real-time available stock.
4. **Resilience to Catalog Changes:** If an item in the cart is unpublished, archived, out of stock, or moved to an inactive category, the cart line is preserved rather than silently dropped. It is flagged with `isAvailableForPurchase: false` and a clear `unavailableReason`, and excluded from estimated subtotals.
5. **No Inventory Modification:** Cart operations strictly **do not** reserve, hold, or alter inventory. Physical, reserved, and available stock remain completely unaffected. Checkout (Phase 6) performs independent inventory reservation.
6. **Concurrency Protection:**
   - Increments on existing items execute atomically via `$inc: { "items.$.quantity": delta }`.
   - New items are added with duplicate protection via query `{ user: userId, "items.product": { $ne: productId } }` and `$push`. Concurrent requests fall back to `$inc`, ensuring zero duplicate lines and zero lost increments.

### 6.2 Delivery Address Book Architecture
The address module (`src/modules/addresses/`) implements customer-owned shipping address management:

1. **Strict Ownership Scoping:** All operations enforce ownership filtering equivalent to `{ _id: addressId, user: req.user._id }`. Client-supplied user IDs are stripped and rejected.
2. **Single Default Address Invariant:**
   - Enforced at the database engine level via `{ user: 1 }` with `unique: true, partialFilterExpression: { isDefault: true }`.
   - Guarantees that no customer can ever have more than one default address even under concurrent race conditions.
3. **First-Address Default Policy:** The customer's first created address automatically receives `isDefault: true`.
4. **Default Promotion on Deletion:** Deleting the current default address automatically promotes the customer's most recently created remaining address to default inside a MongoDB transaction. If no addresses remain, the collection cleanly reflects zero addresses without errors.
5. **Deterministic Ordering:** Listing endpoints return addresses with the default address first (`isDefault: -1`), followed by newest created addresses (`createdAt: -1`).

---

## 7. Checkout, Order Management & Payment Foundation Architecture (Phase 6)

### 7.1 Server-Authoritative Checkout Quotes (`POST /api/v1/orders/quote`)
1. **Informational Non-Reservation Quote:** Quotes allow customers to preview exact landed costs without locking inventory prematurely.
2. **Dynamic Live Catalog Pricing:** Cart prices are never trusted. The service queries live Product and Category records, verifying:
   - Product status is strictly `published`.
   - Category is strictly active (`category.isActive === true`).
   - Available stock satisfies requested quantity (`stock.available >= quantity`).
3. **Integer Minor Unit Currency Arithmetic:**
   - $\text{subtotalCents} = \sum (\text{unitPriceCents} \times \text{quantity})$
   - $\text{shippingCents} = \begin{cases} 0 & \text{if } \text{subtotalCents} \ge \text{FREE\_SHIPPING\_THRESHOLD\_CENTS} \\ \text{SHIPPING\_FLAT\_FEE\_CENTS} & \text{otherwise} \end{cases}$
   - $\text{taxCents} = \operatorname{round}\left(\frac{\text{subtotalCents} \times \text{TAX\_RATE\_PERCENT}}{100}\right)$
   - $\text{totalCents} = \text{subtotalCents} + \text{shippingCents} + \text{taxCents}$
4. **Address Ownership Verification:** Rejects address IDs belonging to other customers with `404 Not Found`.

### 7.2 ACID Transactional Order Placement (`POST /api/v1/orders`)
Order placement coordinates all critical business state changes inside a MongoDB multi-document transaction (`session.withTransaction`):
1. **Cart & Address Reload:** Verifies ownership and non-empty cart within the transaction session.
2. **Atomic Conditional Stock Reservation:**
   ```javascript
   const updatedProduct = await Product.findOneAndUpdate(
     {
       _id: item.product,
       status: 'published',
       'stock.available': { $gte: item.quantity } // Prevents overselling at the engine level
     },
     {
       $inc: {
         'stock.reserved': item.quantity,
         'stock.available': -item.quantity
       }
     },
     { new: true, session }
   );
   ```
   If any product fails the condition, the transaction automatically aborts with `409 Conflict` (`INSUFFICIENT_STOCK`).
3. **Immutable Snapshot Creation:**
   - Order line items record immutable snapshots of `sku`, `name`, `unitPriceCents`, `quantity`, and `lineTotalCents`. Subsequent catalog renames or price changes do not affect historical orders.
   - Delivery address fields (`recipientName`, `phone`, `streetAddress1`, `streetAddress2`, `city`, `state`, `postalCode`, `country`) are deeply copied into the Order document.
4. **Payment Record Creation:** Persists a `Payment` document linked to the order reference with `amountCents` matching `order.totalCents`.
5. **Inventory Movement Audit Records:** Persists append-only `InventoryMovement` entries of type `'reservation'` recording before/after physical, available, and reserved stock snapshots.
6. **Cart Evacuation:** Clears the customer's cart (`$set: { items: [] }`) within the transaction.
7. **Rollback Guarantee:** If any step fails, order, payments, inventory reservations, audit movements, and cart changes roll back together.

### 7.3 Idempotency Strategy
- **Header:** `Idempotency-Key` (required for order creation).
- **Database Safeguard:** Unique index on `idempotencyKey` with `partialFilterExpression: { idempotencyKey: { $type: "string" } }` on `orders`.
- **Payload Hash Verification:** SHA-256 hash of `{ addressId, paymentMethod }`.
- **Replay Behavior:**
  - Matching key + identical payload: Returns original order with `200 OK` without re-running reservation, payment, or cart clearing.
  - Matching key + modified payload: Returns `409 Conflict` (`IDEMPOTENCY_CONFLICT`).
  - Concurrent duplicate requests: Database unique constraint halts duplicate creation; the service catches code 11000 and returns the canonical order.

### 7.4 Payment Gateway Abstraction & Webhook Architecture
1. **Provider-Neutral Gateway Boundary:** Decoupled `PaymentGateway` interface supporting Cash on Delivery (COD) and future online providers (Stripe, PayPal).
2. **Test Isolation via Mock Gateway:** `MockPaymentGateway` generates synthetic intents and validates HMAC signatures during test runs without network calls.
3. **Safe Production Defaults:** Online payments remain disabled by default (`ENABLE_ONLINE_PAYMENTS = false`). When disabled, attempts to create online orders or payment intents return `400 Bad Request` (`ONLINE_PAYMENTS_DISABLED`) with zero inventory mutations.
4. **Raw Body Webhook Verification:** Express middleware preserves raw request bytes in `req.rawBody` prior to JSON parsing. Webhook handlers verify cryptographic HMAC-SHA256 signatures before trusting payload data.
5. **Webhook Idempotency:** Persists processed event IDs in `payment.processedEvents`. Duplicate webhook deliveries return `200 OK` without repeating status transitions.
6. **Compensating Stock Release on Payment Failure:** When a `payment_intent.payment_failed` event is received for an unpaid order (`awaiting_payment`), a transaction atomically cancels the order, sets `isStockRestocked: true`, and releases reserved inventory back to available stock with `'release'` audit movements.

### 7.5 Customer Order Management & Exactly-Once Cancellation
1. **Ownership-Scoped Access:** `GET /my-orders` and `GET /my-orders/:reference` query strictly by `{ customer: req.user._id }`. Foreign orders return `404 Not Found`.
2. **Eligible Cancellation States:** Customer cancellation is restricted to `awaiting_payment` and `confirmed`. Orders in `processing`, `shipped`, or `delivered` return `400 Bad Request` (`ORDER_NOT_CANCELLABLE`).
3. **Paid Orders Refund Barrier:** Paid orders cannot be cancelled without an active refund provider (returns `409 Conflict` `REFUND_NOT_SUPPORTED`).
4. **Atomic Restocking Protection:** Cancellation conditions on `{ isStockRestocked: false }`. Concurrent or repeated cancellations succeed or fail atomically, guaranteeing that inventory is never released twice.

---

## 8. Admin Order Fulfillment, Dashboard & Append-Only Audit Logging (Phase 7)

### 8.1 Fulfillment State Machine
Orders follow a strict deterministic lifecycle:
```mermaid
stateDiagram-v2
    [*] --> awaiting_payment : Online Checkout Placed
    [*] --> confirmed : COD Checkout Placed
    awaiting_payment --> confirmed : Webhook Payment Succeeded
    awaiting_payment --> cancelled : Customer / Admin Cancel / Gateway Failed
    confirmed --> processing : Admin Fulfillment Started
    confirmed --> cancelled : Customer / Admin Cancel (Pre-dispatch)
    processing --> shipped : Admin Dispatch (HTTPS Tracking Recorded)
    processing --> cancelled : Admin Cancel (Pre-dispatch Restock)
    shipped --> delivered : Delivery Confirmed (COD Payment Collected)
    delivered --> [*]
    cancelled --> [*]
```

### 8.2 Inventory Conversion at Dispatch
1. **Reservation to Sale Transition:** When transitioning from `processing` to `shipped`:
   - `stock.physical` decrements by order quantity.
   - `stock.reserved` decrements by order quantity.
   - `stock.available` remains invariant ($\Delta\text{available} = 0$).
   - Appends `'sale'` `InventoryMovement` entries capturing before/after physical and reserved snapshots.
2. **Delivery Safeguard:** Transitioning to `delivered` strictly does NOT deduct inventory again.
3. **Atomic Rollback Guarantee:** Status changes, product stock mutations, inventory movements, tracking snapshots, and audit log generation execute within a single MongoDB multi-document transaction (`session.withTransaction`).

### 8.3 Cash on Delivery (COD) Payment Collection
- Delivery of a COD order requires explicit administrator confirmation (`codPaymentCollected: true`).
- Atomically transitions `order.paymentStatus` to `'paid'` and `Payment.status` to `'paid'`.
- Records a dedicated `COD_PAYMENT_COLLECTED` audit log entry in the same transaction.

### 8.4 Administrative Cancellation & Stock Restocking
- Admins may cancel orders in `awaiting_payment`, `confirmed`, or `processing`.
- Shipped and delivered orders are non-cancellable.
- Paid online orders cannot be cancelled without a configured refund provider.
- Atomically decrements `stock.reserved` and increments `stock.available` with `'release'` movements. Guarded by `isStockRestocked: false`.

### 8.5 Aggregated Dashboard Analytics & Revenue Recognition
- **Recognized Paid Revenue:** Strictly calculated from orders where `paymentStatus === 'paid'`. Excludes unpaid online orders, cancelled orders, and uncollected COD orders.
- **Low-Stock Detection:** Computed directly via database aggregation query comparing `$stock.available <= $lowStockThreshold` across non-archived products.
- **Order Breakdown:** Aggregate query grouping orders across all 6 statuses.

### 8.6 Append-Only Audit Logging
- Dedicated `audit_logs` collection recording actor, action, resourceType, resourceId, client IP, and sanitized change details.
- Immutability enforced: No PUT, PATCH, or DELETE endpoints exist for audit logs.
- Indexed by `{ actor: 1, createdAt: -1 }`, `{ resourceType: 1, resourceId: 1 }`, and `{ createdAt: -1 }`.

---

## 9. Unresolved Decisions & Safe Defaults

| Decision Area | Unresolved Aspect | Chosen Safe Default for V1 |
| :--- | :--- | :--- |
| **Payment Provider** | Production merchant keys unavailable initially | **Cash on Delivery (COD)** implemented end-to-end. Provider-neutral `PaymentGateway` interface with mock gateway for test suites and Stripe adapter disabled until genuine merchant credentials are provided. |
| **Tax Calculation** | Dynamic regional jurisdictions (e.g., US states, EU VAT) | Explicit, server-side configurable tax policy via `TAX_RATE_PERCENT` (default: 0% or configured integer percentage). Minor currency calculations only. |
| **Shipping Fees** | Carrier API integration (FedEx/UPS/DHL) | Server-side tiered rule: Configurable flat fee `SHIPPING_FLAT_FEE_CENTS` (e.g. 500 = $5.00), free above `FREE_SHIPPING_THRESHOLD_CENTS` (e.g. 5000 = $50.00). |
| **Currency** | Multi-currency exchange rates | Single store currency in minor integer units (e.g. `USD` in cents: $19.99 = `1999`). Zero floating-point rounding errors. |
| **Product Variants** | Multi-dimensional matrix (e.g., Color x Size) | First-class distinct SKUs: each purchasable item has a distinct SKU and independent stock tracking. Parent products group variants. |
| **Email Delivery** | Third-party SMTP / SendGrid / Resend credentials | Modular `EmailService`: In `development`/`test`, outputs formatted log with reset token and action URL. In `production`, requires validated SMTP/API credentials. |
| **Image Storage** | S3 / Cloudinary credentials | Image URLs validated against safe HTTPS patterns. Local/trusted mock asset provider in development, decoupled storage interface ready for S3. |
| **Idempotency** | Duplicate order retries | Client sends `Idempotency-Key` header (UUIDv4) stored on Order collection with unique index constraint. Repeated requests return original order safely. |

