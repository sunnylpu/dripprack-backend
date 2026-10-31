# DripRack Storefront API Contract

**Contract version:** 1.1.0  
**Applies to:** Backend, Admin Frontend, and the planned Customer Frontend  
**Source of truth:** Implemented routes, Zod validators, controllers, services, and Mongoose models in this repository.

> This document describes the current implementation, not a proposed API. All paths below are relative to `/api/v1`. Do not substitute alternative field names or infer unsupported endpoints.

## 1. Local applications and request conventions

| Application | Local origin | API base URL | Application header |
|---|---|---|---|
| Backend | `http://localhost:5000` | `http://localhost:5000/api/v1` | — |
| Admin frontend | `http://localhost:5173` | Same backend API URL | `X-App-Client: admin` |
| Customer frontend | `http://localhost:5174` | Same backend API URL | `X-App-Client: customer` |

Both browser applications must send `credentials: 'include'` on requests so the browser can receive and send the HttpOnly refresh cookie. Send `Authorization: Bearer <accessToken>` on authenticated requests. Send `X-App-Client` on all customer/admin API requests; it is essential on authentication login, refresh, and logout requests to select the right refresh-cookie family.

The backend CORS allowlist is configured by `CORS_ORIGIN`. It must contain the exact deployed origins for both frontends. Credentialed requests must never use wildcard CORS origins. Allowed custom headers include `Authorization`, `Idempotency-Key`, `X-Request-Id`, `X-App-Client`, and `X-Client-Type`.

## 2. Response and error envelopes

Successful responses use this envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": {}
}
```

Paginated endpoints put pagination metadata next to `data`, not inside each record:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "data": { "products": [] },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

Errors use:

```json
{
  "success": false,
  "statusCode": 422,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "Invalid email address format" }]
  }
}
```

The exact error code and message depend on the validation/business rule. Clients should handle HTTP status and error code, and should not assume every error has a non-empty `details` array.

## 3. Authentication and independent sessions

### Refresh-cookie rules

The backend issues two different HttpOnly cookies:

| Application | Cookie name | Path |
|---|---|---|
| Admin | `adminRefreshToken` | `/api/v1/auth` |
| Customer | `customerRefreshToken` | `/api/v1/auth` |

Cookies are HttpOnly and are never returned as JSON values. The default local SameSite policy is Lax. The default production SameSite policy is Strict. `COOKIE_SAME_SITE`, `COOKIE_SECURE`, and optional `COOKIE_DOMAIN` configure deployments. For a genuinely cross-site frontend/API deployment, use `COOKIE_SAME_SITE=none` together with Secure cookies over HTTPS. Do not use SameSite=None over plain HTTP.

Access JWTs are short-lived and must be held only in application memory. Do not store access tokens or refresh tokens in localStorage or sessionStorage.

### Customer registration

**POST `/auth/register`**  
Authentication: public. Creates a customer account; the submitted role/status cannot elevate privileges.

Request body:

```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123!",
  "firstName": "Alex",
  "lastName": "Vance"
}
```

Password constraints: 8–100 characters and must include lowercase, uppercase, a digit, and a special character.

Success: HTTP 201, `data.user` contains the sanitized user profile. Registration does not automatically log the customer in and does not set a refresh cookie.

### Login

**Customer:** POST `/auth/customer/login`  
Alternatively: POST `/auth/login` with `X-App-Client: customer`.

**Admin:** POST `/auth/admin/login`  
Alternatively: POST `/auth/login` with `X-App-Client: admin`.

Request body for either:

```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123!"
}
```

Success: HTTP 200 with `data.accessToken` and `data.user`. The appropriate application-specific cookie is set. A customer-context login rejects an admin account; an admin-context login rejects a customer account. Registration remains customer-only.

### Refresh

**Customer:** POST `/auth/customer/refresh` or POST `/auth/refresh` with `X-App-Client: customer`.  
**Admin:** POST `/auth/admin/refresh` or POST `/auth/refresh` with `X-App-Client: admin`.

Body: none. Send the appropriate cookie automatically with credentials enabled. Success: HTTP 200 with a new `data.accessToken` and `data.user`; refresh cookie rotation occurs in the response.

### Logout

**Customer:** POST `/auth/customer/logout` or POST `/auth/logout` with `X-App-Client: customer`.  
**Admin:** POST `/auth/admin/logout` or POST `/auth/logout` with `X-App-Client: admin`.

Body: none. The backend revokes the selected refresh session and clears only the corresponding application cookie. Refresh/logout endpoints enforce the configured CSRF origin check.

### Current profile

**GET `/auth/me`**  
Authentication: Bearer access token. Returns `data.user`. Customer UI must verify `role === "customer"`; admin UI must verify `role === "admin"` and active account status. Backend RBAC remains authoritative.

## 4. Public store configuration

**GET `/config`**  
Authentication: public. No query or body.

Current response:

```json
{
  "success": true,
  "data": {
    "currency": "USD",
    "shipping": {
      "flatFeeCents": 500,
      "freeShippingThresholdCents": 5000
    },
    "taxRatePercent": 0,
    "payments": {
      "codEnabled": true,
      "onlineEnabled": false,
      "provider": "cod"
    }
  }
}
```

Values come from backend environment configuration. The example shows current defaults; the live response is authoritative. Do not hardcode currency, shipping charges, tax, or online-payment availability in the client application. No secret keys are returned.

## 5. Public categories and products

### Categories

**GET `/categories`**  
Authentication: public. Returns `data.categories`, containing active categories only. Public category listing is not paginated.

**GET `/categories/:id`**  
Authentication: public. Requires a MongoDB category ObjectId, not a slug. Returns `data.category`; inactive or missing categories return 404.

Category records use fields such as `_id`, `name`, `slug`, `description`, and `isActive`.

### Product listing

**GET `/products`**  
Authentication: public.

Supported query parameters:

| Parameter | Meaning |
|---|---|
| `page` | 1-based page number; default 1 |
| `limit` | Page size; default 20, maximum 100 |
| `q` | Search product name or description |
| `category` | Active category ObjectId or category slug |
| `inStock` | `true` for available stock above zero; `false` for zero available stock |
| `sortBy` | `name:asc`, `name:desc`, `priceCents:asc`, `priceCents:desc`, `createdAt:asc`, or `createdAt:desc`; default `createdAt:desc` |

Response: `data.products` plus top-level `meta`. Public products are filtered to `status: "published"` and active categories. Each product uses the actual model field names, including `name`, `slug`, `sku`, `description`, `priceCents`, `compareAtPriceCents`, `images`, `attributes`, `status`, and the public available-stock value.

Example product record (abbreviated):

```json
{
  "_id": "672422015f36e4a2a11b8999",
  "sku": "DRIP-HOODIE-BLK-M",
  "slug": "heavyweight-boxy-hoodie-black-m",
  "name": "Heavyweight Boxy Hoodie",
  "description": "Heavyweight fleece hoodie.",
  "category": {
    "_id": "672420015f36e4a2a11b8801",
    "name": "Hoodies",
    "slug": "hoodies"
  },
  "priceCents": 8500,
  "compareAtPriceCents": 11000,
  "images": ["https://cdn.example.com/hoodie-front.jpg"],
  "attributes": { "size": "M", "color": "Black" },
  "status": "published",
  "stock": { "available": 14 }
}
```

The public projection does not return physical or reserved warehouse counts, nor the low-stock threshold.

### Product detail

**GET `/products/:idOrSlug`**  
Authentication: public. The same path accepts either a MongoDB ObjectId or the product slug. It is not a separate `/products/slug/:slug` route. Returns `data.product`. Draft, archived, missing, or inactive-category products return 404.

### V1 size/colour/SKU decision

V1 uses an **autonomous product record per sellable SKU**. Each size/colour combination must be created as its own product with its own unique SKU, slug, price, and inventory ledger. Optional `attributes` stores descriptive variant values:

```json
{
  "attributes": {
    "size": "M",
    "color": "Vintage Black"
  }
}
```

This is not a parent-product/child-variant system. There is no endpoint that groups variant records or returns a complete set of sizes/colours for a parent. The storefront should treat each record as a sellable SKU; do not assume that shared attributes automatically create a selectable variant group.

Product image storage is currently an array of HTTPS URL strings. There is no built-in binary image upload endpoint in this API.

## 6. Customer cart

All cart routes require an authenticated customer. Admin accounts are not authorized for customer cart operations.

| Method | Path | Purpose |
|---|---|---|
| GET | `/cart` | Get current customer's cart |
| POST | `/cart/items` | Add a product or increment its quantity |
| PATCH | `/cart/items/:productId` | Set quantity of a cart item |
| DELETE | `/cart/items/:productId` | Remove one product |
| DELETE | `/cart` | Clear the cart |

Add-item request:

```json
{
  "productId": "672422015f36e4a2a11b8999",
  "quantity": 1
}
```

Quantity is an integer from 1 to 99. If omitted on add, quantity defaults to 1. Update-item body is `{ "quantity": 2 }`. Delete operations have no request body.

Successful cart mutations return `data.cart`. Cart response uses the current model's names: `items`, `itemCount`, `estimatedSubtotalCents`, `currency`, and `isAuthoritative: false`. Each item includes `quantity`, `unitPriceCents`, `lineTotalCents`, `isAvailableForPurchase`, and `unavailableReason`; its populated `product` includes `name`, `sku`, `slug`, `images`, `priceCents`, `compareAtPriceCents`, `attributes`, and `availableStock`.

Cart prices are informational, resolved from live products, and are not authoritative checkout totals. The cart does not reserve or mutate inventory. Product/stock/category changes may make an existing cart item unavailable; display that state and let the customer remove or adjust it.

## 7. Customer addresses

All address routes require an authenticated customer and operate only on that customer's own address records.

| Method | Path | Purpose |
|---|---|---|
| GET | `/addresses` | List addresses; default first, then newest |
| POST | `/addresses` | Create address |
| PATCH | `/addresses/:id` | Update an owned address |
| PATCH | `/addresses/:id/default` | Set an owned address as default |
| DELETE | `/addresses/:id` | Delete an owned address |

Create request fields:

```json
{
  "recipientName": "Alex Vance",
  "phone": "+1 555-123-4567",
  "streetAddress1": "742 Evergreen Terrace",
  "streetAddress2": "Apt 4B",
  "city": "Springfield",
  "state": "OR",
  "postalCode": "97477",
  "country": "US",
  "isDefault": true
}
```

Required fields: `recipientName`, `phone`, `streetAddress1`, `city`, `state`, `postalCode`, and two-letter ISO `country`. `streetAddress2` and `isDefault` are optional. The first address is automatically default. Setting `isDefault: true` or calling the default route switches the customer's default address. Updating uses the same address field names; an update must include at least one allowed field. Delete response contains `deletedAddressId` and `promotedDefaultAddress` when another address is promoted.

Responses use `data.addresses` for listing and `data.address` for create/update/default operations. Cross-customer access returns 404.

## 8. Checkout, orders, and payment

### Checkout quote

**POST `/orders/quote`**  
Authentication: customer Bearer token.

Request body:

```json
{
  "addressId": "672440015f36e4a2a11ba001"
}
```

The quote uses the customer's current cart; clients cannot submit arbitrary line items or prices. Response data contains `shippingAddress`, `items`, `subtotalCents`, `shippingCents`, `taxCents`, `totalCents`, `currency`, `isAuthoritative: false`, and `quotedAt`. Quote does not reserve stock; order placement recalculates everything.

### Place order

**POST `/orders`**  
Authentication: customer Bearer token. Required header: `Idempotency-Key` (1–128 characters).

Request body:

```json
{
  "addressId": "672440015f36e4a2a11ba001",
  "paymentMethod": "cod"
}
```

Only `addressId` and `paymentMethod` are accepted. Supported payment method enum: `cod` or `online`. Extra body fields are rejected. Order contents are sourced from the customer's cart; submitted client prices, totals, stock, and arbitrary items are not accepted.

The backend revalidates live products, active categories, stock, and address ownership; calculates monetary totals in integer minor units; reserves stock transactionally; snapshots order lines and the shipping address; creates the payment record; and clears the cart.

For the current default configuration, COD is enabled and online payments are disabled. COD orders are created with `orderStatus: "confirmed"` and `paymentStatus: "cod_due"`. Online orders begin in `awaiting_payment` only when the backend is configured to permit them. Successful creation returns HTTP 201 with `data` as the order record; an identical idempotent replay returns HTTP 200 with the existing order. A reused key with a different payload returns 409.

Order monetary fields are `subtotalCents`, `shippingCents`, `taxCents`, `totalCents`, and `currency`. Order lines use `product`, `sku`, `name`, `attributes` (size/colour snapshot), `unitPriceCents`, `quantity`, and `lineTotalCents`. Checkout quote items and cart product data also carry the structured size/colour attributes. Shipping snapshot fields use `recipientName`, `phone`, `streetAddress1`, `streetAddress2`, `city`, `state`, `postalCode`, and `country`.

### Customer order history

**GET `/orders/my-orders`**  
Authentication: customer. Query: `page` (default 1), `limit` (default 20, max 100), and optional `orderStatus` from `awaiting_payment`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`.

Response: `data.orders` and top-level pagination `meta`.

### Customer order detail

**GET `/orders/my-orders/:reference`**  
Authentication: customer. The reference must belong to the authenticated customer. Response data contains `order` and `payment`.

### Customer cancellation

**POST `/orders/my-orders/:reference/cancel`**  
Authentication: customer. Optional body: `{ "reason": "Changed my mind" }` (maximum 500 characters). Customer cancellation is allowed only while the order is `awaiting_payment` or `confirmed`, and never for paid orders. The operation releases reserved stock transactionally and only once. Processing, shipped, delivered, and already-cancelled orders cannot be cancelled through this customer endpoint.

### Order lifecycle

The implemented status values are `awaiting_payment`, `confirmed`, `processing`, `shipped`, `delivered`, and `cancelled`. Admin fulfillment advances eligible orders sequentially through `confirmed -> processing -> shipped -> delivered`. COD payment is collected/confirmed during delivery completion in the admin workflow. Stock is reserved on order placement and converted to a sale on shipment; customer/admin clients must never adjust stock directly as part of an order operation.

### Payment endpoints and V1 capability

**POST `/payments/create-intent`** requires a customer token and body `{ "orderReference": "ORD-..." }`. It is for eligible online orders only.

**POST `/payments/webhook`** is a provider callback endpoint. It requires a valid provider signature in `Stripe-Signature` or `X-Webhook-Signature`; the backend verifies the raw request body and processes event IDs idempotently.

Current V1 capability is COD only. The Stripe gateway class is a stub and cannot create a real PaymentIntent; therefore the public config endpoint always reports `onlineEnabled: false`, and order placement rejects online payments outside test mode—even if an environment toggle is mistakenly enabled. The customer frontend must show COD only. Do not simulate successful online payments.

## 9. Money, stock, and image rules

- All money crossing the API boundary is integer minor units, for example USD 19.99 = `1999` cents. Use `priceCents`, `unitPriceCents`, `lineTotalCents`, and the corresponding `*Cents` totals.
- Currency comes from `GET /config`; current default is USD.
- Checkout quote is informational. Order placement recalculates authoritative totals.
- Product stock invariant: `available = physical - reserved`. Public catalog exposes only available stock. Admin inventory endpoints remain the only way to adjust warehouse stock.
- Product images are HTTPS URL strings. No image-upload API exists in the current implementation.
- V1 size/colour attributes are descriptive fields on an individual SKU product record, not a product family with variant-selection endpoints.

## 10. Customer-facing endpoint summary

| Method | Full API path | Auth | Request |
|---|---|---|---|
| GET | `/api/v1/config` | Public | — |
| POST | `/api/v1/auth/register` | Public | email, password, firstName, lastName |
| POST | `/api/v1/auth/customer/login` | Public | email, password |
| POST | `/api/v1/auth/customer/refresh` | Customer cookie | — |
| POST | `/api/v1/auth/customer/logout` | Customer cookie | — |
| GET | `/api/v1/auth/me` | Bearer | — |
| GET | `/api/v1/categories` | Public | — |
| GET | `/api/v1/categories/:id` | Public | MongoDB ObjectId |
| GET | `/api/v1/products` | Public | page, limit, q, category, inStock, sortBy |
| GET | `/api/v1/products/:idOrSlug` | Public | MongoDB ObjectId or slug |
| GET/POST/DELETE | `/api/v1/cart` | Customer | See cart methods |
| POST/PATCH/DELETE | `/api/v1/cart/items` and `/api/v1/cart/items/:productId` | Customer | productId, quantity |
| GET/POST | `/api/v1/addresses` | Customer | See address fields |
| PATCH/DELETE | `/api/v1/addresses/:id` | Customer | See address fields |
| PATCH | `/api/v1/addresses/:id/default` | Customer | — |
| POST | `/api/v1/orders/quote` | Customer | addressId |
| POST | `/api/v1/orders` | Customer | Idempotency-Key; addressId, paymentMethod |
| GET | `/api/v1/orders/my-orders` | Customer | page, limit, orderStatus |
| GET | `/api/v1/orders/my-orders/:reference` | Customer | Order reference |
| POST | `/api/v1/orders/my-orders/:reference/cancel` | Customer | Optional reason |
| POST | `/api/v1/payments/create-intent` | Customer | orderReference; online only |
| POST | `/api/v1/payments/webhook` | Provider signature | Provider event |

## 11. Explicit V1 limitations

- No parent product / child variant grouping or variant discovery endpoint.
- No binary product image upload; admin stores HTTPS image URL strings.
- No public reviews, wishlist, coupon, promotion, or customer support endpoint is defined by the current route set.
- Online payment is not operational in this V1 build because the Stripe adapter is a stub. The public config always reports `onlineEnabled: false`; COD is the only customer checkout method.
- No guest cart or guest checkout; cart, address, and order operations require a logged-in customer.
