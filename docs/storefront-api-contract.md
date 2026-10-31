# DripRack Storefront API Contract & Client Integration Guide

**Specification Version:** 1.1.0  
**Target Systems:** DripRack Customer Storefront (`client_frontend`), DripRack Backend (`backend`), DripRack Admin Portal (`admin_frontend`)  
**Status:** Canonical, Verified against Backend Validators, Controllers & Models  

---

## 1. Overview & Architectural Principles

The DripRack Storefront API delivers high-performance streetwear e-commerce capabilities designed around zero client-side token exposure, atomic inventory reservations, integer-cents financial precision, and strict session isolation from the administrative backoffice.

### Core Architectural Guarantees

1. **Dual-Cookie Session Isolation:**
   - The Storefront interacts using the `customerRefreshToken` HttpOnly cookie, completely isolated from administrative sessions (`adminRefreshToken`).
   - The Storefront must transmit the header `X-App-Client: customer` on all requests.
   - Non-customer accounts (such as administrators) attempting to authenticate in the customer context are rejected with `403 Forbidden` (`FORBIDDEN_ROLE`) **before** any session is created in the database.
2. **In-Memory JWT Token Architecture:**
   - Short-lived Access Tokens (15 minutes) are held strictly in browser JavaScript runtime memory.
   - **Never store access tokens, refresh tokens, or credentials in `localStorage` or `sessionStorage`**.
   - Silent background refresh uses the `HttpOnly`, `Path=/api/v1/auth` refresh cookie.
3. **Integer Cents Monetary Precision:**
   - All prices, discounts, taxes, shipping fees, and totals are represented as non-negative integer cents ($19.99 is encoded as `1999`). Decimal currency values are never transmitted across the API boundary.
   - Field naming across models, requests, and responses follows the `*Cents` convention: `priceCents`, `compareAtPriceCents`, `unitPriceCents`, `lineTotalCents`, `subtotalCents`, `shippingCents`, `taxCents`, `totalCents`, `estimatedSubtotalCents`.
4. **V1 SKU & Variant Model:**
   - Every sellable size and color variant operates as an autonomous `Product` document with its own unique `sku` (e.g. `DRIP-HOOD-BLK-M`), unique `slug` (e.g. `oversized-drip-hoodie-black-m`), dedicated stock ledger (`stock: { physical, reserved, available }`), individual `priceCents`, images, category, and variant attributes:
     ```json
     "attributes": {
       "size": "M",
       "color": "Vintage Black"
     }
     ```
   - On the public storefront, products sharing a styling concept are discovered via catalog search and category filtering, and customers select their preferred size/color by referencing that specific variant's `sku` or `_id`.
5. **ACID Stock Reservations & Anti-Oversell Protection:**
   - Stock reservations are backed by MongoDB multi-document ACID transactions. Placing an order immediately transfers stock from `stock.available` to `stock.reserved` while `stock.physical` remains unchanged until shipment fulfillment.

---

## 2. Ports, Base URLs & Development Environment

| Service | Local Host / Port | Environment Base URL | Client Type Header |
| :--- | :--- | :--- | :--- |
| **Backend REST API** | `http://localhost:5000` | `http://localhost:5000/api/v1` | `X-App-Client: customer` |
| **Admin Portal** | `http://localhost:5173` | `http://localhost:5173` | `X-App-Client: admin` |
| **Customer Storefront** | `http://localhost:5174` | `http://localhost:5174` | `X-App-Client: customer` |

### Environment Variables for Storefront (`client_frontend/.env`)
```bash
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_CLIENT_TYPE=customer
```

### CORS & Fetch Requirements
- **Credentials:** Every `fetch` or Axios request must configure `credentials: 'include'` to allow the browser to transmit and receive the `customerRefreshToken` cookie.
- **Allowed Headers:** `Content-Type`, `Authorization`, `Idempotency-Key`, `X-App-Client`, `X-Client-Type`.

---

## 3. Public Store Configuration

The storefront fetches store policies, shipping thresholds, and payment method availability on boot.

### `GET /config`
- **Authentication:** Public (No token required)
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Storefront public configuration retrieved successfully",
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

---

## 4. Customer Authentication & Session Management

### Cookie Specifications
- **Cookie Name:** `customerRefreshToken`
- **Flags:** `HttpOnly`, `Path=/api/v1/auth`, `SameSite=Lax` (development) / `SameSite=None; Secure` (cross-domain HTTPS).
- **Expiration:** 7 days rolling.

---

### `POST /auth/register`
Registers a new customer. Mass assignment protection guarantees the created account always has `role: "customer"`.

- **Request Body:**
```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123!",
  "firstName": "Alex",
  "lastName": "Vance"
}
```
- **Password Constraints:** Minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character (`!@#$%^&*`).
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Account registered successfully. You may now log in.",
  "data": {
    "user": {
      "_id": "6724218a5f36e4a2a11b8991",
      "email": "customer@example.com",
      "firstName": "Alex",
      "lastName": "Vance",
      "role": "customer",
      "status": "active",
      "createdAt": "2026-11-01T00:00:00.000Z"
    }
  }
}
```

---

### `POST /auth/login` (or `POST /auth/customer/login`)
Authenticates customer credentials, issues an in-memory access token, and sets the `customerRefreshToken` cookie.

- **Request Headers:**
  - `Content-Type: application/json`
  - `X-App-Client: customer`
- **Request Body:**
```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123!"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Authentication successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "6724218a5f36e4a2a11b8991",
      "email": "customer@example.com",
      "firstName": "Alex",
      "lastName": "Vance",
      "role": "customer",
      "status": "active"
    }
  }
}
```
- **Set-Cookie Header:** `customerRefreshToken=<token>; Path=/api/v1/auth; HttpOnly; SameSite=Lax`

---

### `POST /auth/refresh` (or `POST /auth/customer/refresh`)
Performs silent token rotation using the `customerRefreshToken` cookie.

- **Request Headers:**
  - `X-App-Client: customer`
  - `Cookie: customerRefreshToken=<token>`
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "6724218a5f36e4a2a11b8991",
      "email": "customer@example.com",
      "firstName": "Alex",
      "lastName": "Vance",
      "role": "customer",
      "status": "active"
    }
  }
}
```

---

### `POST /auth/logout` (or `POST /auth/customer/logout`)
Revokes the customer session in the database and clears the `customerRefreshToken` cookie without touching administrative sessions.

- **Request Headers:**
  - `X-App-Client: customer`
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```
- **Set-Cookie Header:** `customerRefreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT`

---

### `GET /auth/me`
Retrieves current authenticated profile.

- **Request Headers:**
  - `Authorization: Bearer <accessToken>`
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "6724218a5f36e4a2a11b8991",
      "email": "customer@example.com",
      "firstName": "Alex",
      "lastName": "Vance",
      "role": "customer",
      "status": "active"
    }
  }
}
```

---

## 5. Public Product Catalog & Categories

### Product Model Fields (Backend Definition)
- `_id`: 24-hex MongoDB ObjectId
- `sku`: String (e.g. `HWT-HD-VBLK-M`)
- `name`: String (e.g. `Heavyweight Boxy Hoodie - Vintage Black (M)`)
- `slug`: String (e.g. `heavyweight-boxy-hoodie-vintage-black-m`)
- `description`: String
- `category`: populated object `{ _id, name, slug }`
- `priceCents`: Integer cents (e.g. `8500` = $85.00)
- `compareAtPriceCents`: Integer cents or `null` (e.g. `11000` = $110.00)
- `images`: Array of HTTPS URL strings (`["https://..."]`)
- `status`: String enum (`"published"`, `"draft"`, `"archived"`). Public storefront queries return only `"published"`.
- `stock`: `{ "available": Number }` (Physical and reserved counts are internal to admin).
- `attributes`: `{ "size": "M", "color": "Vintage Black" }`
- `lowStockThreshold`: Integer

---

### `GET /products`
Queries published products belonging to active categories.

- **Query Parameters:**
  - `page` *(number, default: 1)*
  - `limit` *(number, default: 20, max: 100)*
  - `q` *(string, keyword search against product name or description)*
  - `category` *(string, category ObjectId or category slug)*
  - `inStock` *(enum: `'true'`, `'false'`)*
  - `sortBy` *(enum: `'createdAt:desc'`, `'createdAt:asc'`, `'priceCents:asc'`, `'priceCents:desc'`, `'name:asc'`, `'name:desc'`, default: `'createdAt:desc'`)*
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Published products retrieved successfully",
  "data": {
    "products": [
      {
        "_id": "672422015f36e4a2a11b8999",
        "sku": "HWT-HD-VBLK-M",
        "name": "Heavyweight Boxy Hoodie - Vintage Black (M)",
        "slug": "heavyweight-boxy-hoodie-vintage-black-m",
        "description": "500 GSM custom cotton fleece with drop-shoulder silhouette.",
        "category": {
          "_id": "672420015f36e4a2a11b8801",
          "name": "Hoodies",
          "slug": "hoodies"
        },
        "priceCents": 8500,
        "compareAtPriceCents": 11000,
        "images": [
          "https://cdn.driprack.internal/products/hoodie-black-front.jpg",
          "https://cdn.driprack.internal/products/hoodie-black-back.jpg"
        ],
        "attributes": {
          "size": "M",
          "color": "Vintage Black"
        },
        "status": "published",
        "stock": {
          "available": 14
        },
        "createdAt": "2026-11-01T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

### `GET /products/:idOrSlug`
Retrieves product details by 24-hex ObjectId or lowercase kebab-case slug.

- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Product retrieved successfully",
  "data": {
    "product": {
      "_id": "672422015f36e4a2a11b8999",
      "sku": "HWT-HD-VBLK-M",
      "name": "Heavyweight Boxy Hoodie - Vintage Black (M)",
      "slug": "heavyweight-boxy-hoodie-vintage-black-m",
      "description": "500 GSM custom cotton fleece with drop-shoulder silhouette.",
      "category": {
        "_id": "672420015f36e4a2a11b8801",
        "name": "Hoodies",
        "slug": "hoodies"
      },
      "priceCents": 8500,
      "compareAtPriceCents": 11000,
      "images": [
        "https://cdn.driprack.internal/products/hoodie-black-front.jpg"
      ],
      "attributes": {
        "size": "M",
        "color": "Vintage Black"
      },
      "status": "published",
      "stock": {
        "available": 14
      }
    }
  }
}
```

---

### `GET /categories`
Lists all public active categories.

- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Categories retrieved successfully",
  "data": {
    "categories": [
      {
        "_id": "672420015f36e4a2a11b8801",
        "name": "Hoodies",
        "slug": "hoodies",
        "description": "Premium streetwear hoodies and pullovers",
        "parent": null,
        "isActive": true
      }
    ]
  }
}
```

---

## 6. Customer Shopping Cart (Persistent & Dynamic)

Shopping cart operations require an authenticated customer account (`Authorization: Bearer <accessToken>`). Cart items dynamically validate against live catalog status, active category state, and available inventory.

### `GET /cart`
Retrieves the customer's cart.

- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Cart retrieved successfully",
  "data": {
    "cart": {
      "_id": "672430005f36e4a2a11b9110",
      "user": "6724218a5f36e4a2a11b8991",
      "items": [
        {
          "_id": "672430005f36e4a2a11b9111",
          "product": {
            "_id": "672422015f36e4a2a11b8999",
            "sku": "HWT-HD-VBLK-M",
            "name": "Heavyweight Boxy Hoodie - Vintage Black (M)",
            "slug": "heavyweight-boxy-hoodie-vintage-black-m",
            "images": [
              "https://cdn.driprack.internal/products/hoodie-black-front.jpg"
            ],
            "priceCents": 8500,
            "compareAtPriceCents": 11000,
            "status": "published",
            "category": {
              "_id": "672420015f36e4a2a11b8801",
              "name": "Hoodies",
              "slug": "hoodies",
              "isActive": true
            },
            "stock": {
              "available": 14
            },
            "attributes": {
              "size": "M",
              "color": "Vintage Black"
            }
          },
          "quantity": 2,
          "unitPriceCents": 8500,
          "lineTotalCents": 17000,
          "isAvailableForPurchase": true,
          "unavailableReason": null,
          "addedAt": "2026-11-01T01:00:00.000Z"
        }
      ],
      "itemCount": 2,
      "estimatedSubtotalCents": 17000,
      "currency": "USD",
      "isAuthoritative": false,
      "updatedAt": "2026-11-01T01:00:00.000Z"
    }
  }
}
```

---

### `POST /cart/items`
Adds an item or increments quantity if already in cart.

- **Request Body:**
```json
{
  "productId": "672422015f36e4a2a11b8999",
  "quantity": 1
}
```
- **Validation Rules:** `quantity` must be an integer between 1 and 99. Cannot exceed product `stock.available`.
- **Response `200 OK`:** Returns full formatted cart object under `data.cart`.

---

### `PATCH /cart/items/:productId`
Updates quantity of an existing item in the cart.

- **Request Body:**
```json
{
  "quantity": 3
}
```
- **Response `200 OK`:** Returns full formatted cart object under `data.cart`.

---

### `DELETE /cart/items/:productId`
Removes an item from the customer's cart.

- **Response `200 OK`:** Returns full formatted cart object under `data.cart`.

---

### `DELETE /cart`
Empties the customer's cart.

- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Cart cleared successfully"
}
```

---

## 7. Customer Address Book (Anti-BOLA Protected)

Manages shipping and delivery destinations. All endpoints enforce strict user ownership filtering (Anti-BOLA).

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)

### Address Fields (Backend Definition)
- `recipientName`: String (max 100 chars)
- `phone`: String (max 25 chars)
- `streetAddress1`: String (line 1, max 150 chars)
- `streetAddress2`: String (line 2 / apartment / suite, optional, max 150 chars)
- `city`: String (max 100 chars)
- `state`: String (max 100 chars)
- `postalCode`: String (max 20 chars)
- `country`: String (2-letter uppercase ISO code, e.g. `"US"`)
- `isDefault`: Boolean (only one address per customer is default)

---

### `GET /addresses`
Lists all addresses belonging to the authenticated customer.

- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Addresses retrieved successfully",
  "data": {
    "addresses": [
      {
        "_id": "672440015f36e4a2a11ba001",
        "recipientName": "Alex Vance",
        "phone": "+15551234567",
        "streetAddress1": "742 Evergreen Terrace",
        "streetAddress2": "Apt 4B",
        "city": "Springfield",
        "state": "OR",
        "postalCode": "97477",
        "country": "US",
        "isDefault": true,
        "createdAt": "2026-11-01T01:10:00.000Z"
      }
    ]
  }
}
```

---

### `POST /addresses`
Creates a new address. If `isDefault: true` is passed, other addresses belonging to this customer are atomically updated to `false`.

- **Request Body:**
```json
{
  "recipientName": "Alex Vance",
  "phone": "+15551234567",
  "streetAddress1": "742 Evergreen Terrace",
  "streetAddress2": "Apt 4B",
  "city": "Springfield",
  "state": "OR",
  "postalCode": "97477",
  "country": "US",
  "isDefault": true
}
```
- **Response `201 Created`:** Returns created address under `data.address`.

---

### `PATCH /addresses/:id`
Updates address fields.

- **Response `200 OK`:** Returns updated address under `data.address`.

---

### `PATCH /addresses/:id/default`
Promotes the specified address to default delivery address.

- **Response `200 OK`:** Returns updated address with `isDefault: true`.

---

### `DELETE /addresses/:id`
Deletes an owned address. Returns `404 Not Found` if the address does not exist or belongs to another user.

---

## 8. Checkout Calculations & Order Placement

### `POST /orders/quote`
Calculates authoritative order totals based on the customer's active cart and selected delivery address, without placing an order or reserving stock.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Request Body (Strict Schema — unexpected fields rejected):**
```json
{
  "addressId": "672440015f36e4a2a11ba001"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Checkout quote calculated successfully",
  "data": {
    "shippingAddress": {
      "recipientName": "Alex Vance",
      "phone": "+15551234567",
      "streetAddress1": "742 Evergreen Terrace",
      "streetAddress2": "Apt 4B",
      "city": "Springfield",
      "state": "OR",
      "postalCode": "97477",
      "country": "US"
    },
    "items": [
      {
        "product": "672422015f36e4a2a11b8999",
        "sku": "HWT-HD-VBLK-M",
        "name": "Heavyweight Boxy Hoodie - Vintage Black (M)",
        "quantity": 2,
        "unitPriceCents": 8500,
        "lineTotalCents": 17000
      }
    ],
    "subtotalCents": 17000,
    "shippingCents": 0,
    "taxCents": 0,
    "totalCents": 17000,
    "currency": "USD",
    "isAuthoritative": false,
    "quotedAt": "2026-11-01T01:30:00.000Z"
  }
}
```

---

### `POST /orders` (Order Creation)
Places an order, executes a MongoDB multi-document ACID transaction to reserve stock, empties the customer's cart, and records idempotency hashes.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Required Header:** `Idempotency-Key: <UUIDv4>`
- **Request Body (Strict Schema — unexpected fields rejected):**
```json
{
  "addressId": "672440015f36e4a2a11ba001",
  "paymentMethod": "cod"
}
```
*(Payment method enum: `"cod"` or `"online"`).*
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "_id": "672450015f36e4a2a11bc001",
    "orderReference": "ORD-20261101-A1B2C3",
    "customer": "6724218a5f36e4a2a11b8991",
    "items": [
      {
        "_id": "672450015f36e4a2a11bc002",
        "product": "672422015f36e4a2a11b8999",
        "sku": "HWT-HD-VBLK-M",
        "name": "Heavyweight Boxy Hoodie - Vintage Black (M)",
        "unitPriceCents": 8500,
        "quantity": 2,
        "lineTotalCents": 17000
      }
    ],
    "subtotalCents": 17000,
    "shippingCents": 0,
    "taxCents": 0,
    "totalCents": 17000,
    "currency": "USD",
    "shippingAddress": {
      "recipientName": "Alex Vance",
      "phone": "+15551234567",
      "streetAddress1": "742 Evergreen Terrace",
      "streetAddress2": "Apt 4B",
      "city": "Springfield",
      "state": "OR",
      "postalCode": "97477",
      "country": "US"
    },
    "orderStatus": "confirmed",
    "paymentStatus": "cod_due",
    "paymentMethod": "cod",
    "createdAt": "2026-11-01T01:30:00.000Z"
  }
}
```

---

## 9. Customer Order History & Cancellation

### `GET /orders/my-orders`
Retrieves paginated orders belonging strictly to the authenticated customer.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Query Parameters:**
  - `page` *(number, default: 1)*
  - `limit` *(number, default: 20)*
  - `orderStatus` *(enum: `'awaiting_payment'`, `'confirmed'`, `'processing'`, `'shipped'`, `'delivered'`, `'cancelled'`)*
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Customer order history retrieved successfully",
  "data": [
    {
      "_id": "672450015f36e4a2a11bc001",
      "orderReference": "ORD-20261101-A1B2C3",
      "totalCents": 17000,
      "orderStatus": "confirmed",
      "paymentStatus": "cod_due",
      "paymentMethod": "cod",
      "items": [
        {
          "sku": "HWT-HD-VBLK-M",
          "name": "Heavyweight Boxy Hoodie - Vintage Black (M)",
          "quantity": 2,
          "unitPriceCents": 8500,
          "lineTotalCents": 17000
        }
      ],
      "createdAt": "2026-11-01T01:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

### `GET /orders/my-orders/:reference`
Retrieves order details and payment records by order reference (e.g. `ORD-20261101-A1B2C3`).

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Order details retrieved successfully",
  "data": {
    "order": {
      "_id": "672450015f36e4a2a11bc001",
      "orderReference": "ORD-20261101-A1B2C3",
      "orderStatus": "confirmed",
      "paymentStatus": "cod_due",
      "paymentMethod": "cod",
      "subtotalCents": 17000,
      "shippingCents": 0,
      "taxCents": 0,
      "totalCents": 17000,
      "currency": "USD",
      "items": [
        {
          "product": "672422015f36e4a2a11b8999",
          "sku": "HWT-HD-VBLK-M",
          "name": "Heavyweight Boxy Hoodie - Vintage Black (M)",
          "unitPriceCents": 8500,
          "quantity": 2,
          "lineTotalCents": 17000
        }
      ],
      "shippingAddress": {
        "recipientName": "Alex Vance",
        "phone": "+15551234567",
        "streetAddress1": "742 Evergreen Terrace",
        "streetAddress2": "Apt 4B",
        "city": "Springfield",
        "state": "OR",
        "postalCode": "97477",
        "country": "US"
      },
      "tracking": {
        "carrier": null,
        "trackingNumber": null,
        "trackingUrl": null,
        "dispatchedAt": null
      },
      "createdAt": "2026-11-01T01:30:00.000Z"
    },
    "payment": null
  }
}
```
*(Returns `404 Not Found` if order belongs to another customer).*

---

### `POST /orders/my-orders/:reference/cancel`
Allows a customer to cancel an unfulfilled order (`confirmed` or `awaiting_payment`). Automatically restocks reserved inventory through an ACID transaction.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Request Body (Optional):**
```json
{
  "reason": "Ordered wrong size"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Order cancelled successfully and reserved inventory released"
}
```

---

## 10. Error Envelope Standard & Error Codes

All errors returned by the backend conform strictly to the standardized error envelope:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for \"Heavyweight Boxy Hoodie - Vintage Black (M)\". Available: 1, requested: 2",
    "details": [],
    "timestamp": "2026-11-01T01:30:00.000Z"
  }
}
```

### Standard Error Codes

| HTTP Status | Error Code | Scenario |
| :--- | :--- | :--- |
| **400** | `VALIDATION_ERROR` | Schema validation failed (malformed email, unexpected body keys, missing required fields). |
| **400** | `CART_EMPTY` | Checkout quote or order placement attempted on an empty shopping cart. |
| **401** | `UNAUTHORIZED` | Missing or expired in-memory JWT access token. |
| **401** | `INVALID_CREDENTIALS` | Invalid email or password during login. |
| **401** | `SESSION_EXPIRED` | Refresh token expired. Storefront must prompt user to re-authenticate. |
| **401** | `REVOKED_SESSION_REUSE` | Security alert: invalidated session presented. All user sessions terminated. |
| **403** | `FORBIDDEN_ROLE` | Attempted admin login with customer credentials, or storefront login with admin account. |
| **404** | `NOT_FOUND` / `RESOURCE_NOT_FOUND` | Product slug or ID not found or inactive. |
| **404** | `ADDRESS_NOT_FOUND` | Delivery address ID does not belong to authenticated customer. |
| **404** | `ORDER_NOT_FOUND` | Order reference does not exist or belongs to another customer. |
| **409** | `CONFLICT` | Registration email already exists; or duplicate SKU/slug during product creation. |
| **409** | `INSUFFICIENT_STOCK` | Product inventory was reserved by another buyer prior to order placement. |
| **409** | `ONLINE_PAYMENTS_DISABLED` | Attempted to select `online` payment when `ENABLE_ONLINE_PAYMENTS=false`. |
| **422** | `INVALID_ORDER_STATE` | Attempted cancellation of an order already in `processing`, `shipped`, or `delivered`. |
| **429** | `RATE_LIMIT_EXCEEDED` | Request frequency exceeds client rate limit. |
