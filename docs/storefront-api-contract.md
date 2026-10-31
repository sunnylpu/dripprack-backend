# DripRack Storefront API Contract & Client Integration Guide

**Specification Version:** 1.0.0  
**Target Systems:** DripRack Customer Storefront (`client_frontend`), DripRack Backend (`backend`), DripRack Admin Portal (`admin_frontend`)  
**Status:** Canonical & Storefront-Ready  

---

## 1. Overview & Architectural Principles

The DripRack Storefront API delivers high-performance e-commerce capabilities designed around zero client-side token exposure, atomic inventory reservations, integer-cents financial precision, and complete session isolation from the administrative backoffice.

### Core Architectural Guarantees

1. **Dual-Cookie Session Isolation:**
   - The Storefront interacts using the `customerRefreshToken` cookie, completely isolated from administrative sessions (`adminRefreshToken`).
   - The Storefront must transmit the header `X-App-Client: customer` on all requests.
2. **In-Memory JWT Token Architecture:**
   - Short-lived Access Tokens (15 minutes) are held strictly in browser JavaScript runtime memory.
   - **Never store access tokens or sensitive credentials in `localStorage` or `sessionStorage`**.
   - Silent background refresh uses the `HttpOnly`, `SameSite=Lax` (or `None` over HTTPS), `Path=/` refresh cookie.
3. **Integer Cents Monetary Precision:**
   - All prices, discounts, taxes, shipping fees, and totals are represented as non-negative integer cents ($19.99 is encoded as `1999`). Decimal currency values are never transmitted across the API boundary.
4. **V1 SKU & Product Model:**
   - Every sellable size and color variant operates as an autonomous `Product` record with its own unique `sku`, dedicated stock ledger (`physicalStock`, `reservedStock`, `availableStock`), individual price, slug, and category association.
5. **ACID Stock Reservations:**
   - Checkout is backed by MongoDB multi-document ACID transactions. Placing an order reserves inventory immediately (`physicalStock` unchanged, `reservedStock` incremented, `availableStock` decremented) to prevent overselling.

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

### CORS & Cookie Requirements
- **Credentials:** Every `fetch` or Axios request must configure `credentials: 'include'` to allow the browser to manage `customerRefreshToken`.
- **Allowed Headers:** `Content-Type`, `Authorization`, `Idempotency-Key`, `X-App-Client`, `X-Client-Type`.

---

## 3. Public Store Configuration

The storefront must fetch store-wide business rules and payment toggles on initial application boot.

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
- **Flags:** `HttpOnly`, `Path=/`, `SameSite=Lax` (development) / `SameSite=None; Secure` (production cross-origin).
- **Expiration:** 7 days rolling.

---

### `POST /auth/register`
Creates a new customer profile. Mass-assignment protection guarantees only `customer` role accounts are created.

- **Request Body:**
```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123!",
  "firstName": "Alex",
  "lastName": "Vance"
}
```
- **Password Rules:** Minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character (`!@#$%^&*`).
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Customer registered successfully",
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
  "message": "Login successful",
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
- **Set-Cookie Header:** `customerRefreshToken=<token>; Path=/; HttpOnly; SameSite=Lax`

---

### `POST /auth/refresh` (or `POST /auth/customer/refresh`)
Performs silent token rotation using the HttpOnly cookie.

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
      "role": "customer"
    }
  }
}
```

---

### `POST /auth/logout` (or `POST /auth/customer/logout`)
Revokes the refresh token family in the database and clears the `customerRefreshToken` cookie without touching `adminRefreshToken`.

- **Request Headers:**
  - `X-App-Client: customer`
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```
- **Set-Cookie Header:** `customerRefreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`

---

### `GET /auth/me`
Retrieves authenticated customer profile.

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

### Product SKU & Variant Model Specification (V1)
In V1, each sellable SKU is an individual product document in MongoDB with:
- Unique `sku` (e.g. `DRIP-HOOD-BLK-M`, `DRIP-TEE-WHT-L`)
- Unique `slug` (e.g. `oversized-drip-hoodie-black-m`)
- Explicit variant metadata: `attributes: { size: "M", color: "Black" }`
- Real-time stock availability: `availableStock = physicalStock - reservedStock`
- Status filter: Public catalog queries return only `status: "active"`. Draft and archived products are automatically filtered out.

---

### `GET /products`
Queries active products with filtering, search, sorting, and pagination.

- **Query Parameters:**
  - `page` *(number, default: 1)*
  - `limit` *(number, default: 20, max: 100)*
  - `categoryId` *(string ObjectId, optional)*
  - `search` *(string, optional, matches title and description)*
  - `minPrice` *(integer cents, optional)*
  - `maxPrice` *(integer cents, optional)*
  - `sort` *(enum: `newest`, `price_asc`, `price_desc`, `title_asc`, `title_desc`, default: `newest`)*
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "_id": "672422015f36e4a2a11b8999",
        "title": "Heavyweight Boxy Hoodie - Vintage Black (M)",
        "slug": "heavyweight-boxy-hoodie-vintage-black-m",
        "description": "500 GSM custom fleece with drop-shoulder silhouette.",
        "sku": "HWT-HD-VBLK-M",
        "price": 8500,
        "compareAtPrice": 11000,
        "currency": "USD",
        "category": {
          "_id": "672420015f36e4a2a11b8801",
          "name": "Hoodies",
          "slug": "hoodies"
        },
        "images": [
          {
            "url": "https://cdn.driprack.internal/products/hoodie-black-front.jpg",
            "alt": "Front view of heavyweight boxy hoodie in vintage black",
            "isPrimary": true
          }
        ],
        "availableStock": 14,
        "isLowStock": false,
        "status": "active"
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

### `GET /products/:id` (or `GET /products/slug/:slug`)
Retrieves product details for a single product.

- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "product": {
      "_id": "672422015f36e4a2a11b8999",
      "title": "Heavyweight Boxy Hoodie - Vintage Black (M)",
      "slug": "heavyweight-boxy-hoodie-vintage-black-m",
      "description": "500 GSM custom fleece with drop-shoulder silhouette.",
      "sku": "HWT-HD-VBLK-M",
      "price": 8500,
      "compareAtPrice": 11000,
      "category": {
        "_id": "672420015f36e4a2a11b8801",
        "name": "Hoodies",
        "slug": "hoodies"
      },
      "images": [
        {
          "url": "https://cdn.driprack.internal/products/hoodie-black-front.jpg",
          "alt": "Front view",
          "isPrimary": true
        }
      ],
      "availableStock": 14,
      "status": "active"
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

## 6. Shopping Cart Management (Customer Scoped)

The shopping cart is persisted in MongoDB, linked to the authenticated customer's account. Cart items are dynamically re-validated on fetch against current catalog prices and available stock.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)

### `GET /cart`
Retrieves customer's current cart with calculated item subtotals and stock alert warnings.

- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "cart": {
      "_id": "672430005f36e4a2a11b9110",
      "user": "6724218a5f36e4a2a11b8991",
      "items": [
        {
          "product": {
            "_id": "672422015f36e4a2a11b8999",
            "title": "Heavyweight Boxy Hoodie - Vintage Black (M)",
            "sku": "HWT-HD-VBLK-M",
            "price": 8500,
            "images": [
              {
                "url": "https://cdn.driprack.internal/products/hoodie-black-front.jpg",
                "isPrimary": true
              }
            ],
            "availableStock": 14,
            "status": "active"
          },
          "quantity": 2,
          "priceSnapshot": 8500,
          "subtotalCents": 17000
        }
      ],
      "totalItemCount": 2,
      "subtotalCents": 17000
    }
  }
}
```

---

### `POST /cart/items`
Adds an item to the customer's cart or increments quantity if already present.

- **Request Body:**
```json
{
  "productId": "672422015f36e4a2a11b8999",
  "quantity": 1
}
```
- **Validation Rules:** Quantity must be an integer between 1 and 99. Cannot exceed product's `availableStock`.
- **Response `200 OK`:** Returns full updated cart.

---

### `PATCH /cart/items/:productId`
Updates quantity of an existing item in the cart.

- **Request Body:**
```json
{
  "quantity": 3
}
```
- **Response `200 OK`:** Returns full updated cart.

---

### `DELETE /cart/items/:productId`
Removes a specific product from the customer's cart.

- **Response `200 OK`:** Returns updated cart.

---

### `DELETE /cart`
Clears all items from the customer's cart.

- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Cart cleared successfully"
}
```

---

## 7. Customer Address Book (Anti-BOLA Protected)

Manages customer shipping and billing addresses. All endpoints enforce strict user ownership filtering (Anti-BOLA) so customers cannot access or manipulate other users' addresses.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)

### `GET /addresses`
Lists all addresses belonging to the authenticated customer.

- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "_id": "672440015f36e4a2a11ba001",
        "recipientName": "Alex Vance",
        "phone": "+15551234567",
        "streetAddress": "742 Evergreen Terrace",
        "apartment": "Apt 4B",
        "city": "Springfield",
        "state": "OR",
        "postalCode": "97477",
        "country": "US",
        "isDefaultShipping": true,
        "isDefaultBilling": true
      }
    ]
  }
}
```

---

### `POST /addresses`
Creates a new address. If `isDefaultShipping: true` is passed, other customer addresses are atomically updated to `false`.

- **Request Body:**
```json
{
  "recipientName": "Alex Vance",
  "phone": "+15551234567",
  "streetAddress": "742 Evergreen Terrace",
  "apartment": "Apt 4B",
  "city": "Springfield",
  "state": "OR",
  "postalCode": "97477",
  "country": "US",
  "isDefaultShipping": true,
  "isDefaultBilling": true
}
```
- **Response `201 Created`:** Returns created address.

---

### `PATCH /addresses/:id`
Updates an owned address.

- **Response `200 OK`:** Returns updated address.

---

### `DELETE /addresses/:id`
Deletes an owned address. Returns `404 Not Found` if address does not exist or belongs to another user.

---

## 8. Checkout Calculations & Order Placement

### `POST /orders/quote`
Calculates a preview of the checkout total without reserving inventory or creating database records.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Request Body:**
```json
{
  "shippingAddressId": "672440015f36e4a2a11ba001",
  "items": [
    {
      "productId": "672422015f36e4a2a11b8999",
      "quantity": 2
    }
  ]
}
```
*(Note: If `items` is omitted, the quote automatically calculates against customer's active cart).*
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "quote": {
      "items": [
        {
          "productId": "672422015f36e4a2a11b8999",
          "title": "Heavyweight Boxy Hoodie - Vintage Black (M)",
          "unitPriceCents": 8500,
          "quantity": 2,
          "subtotalCents": 17000
        }
      ],
      "subtotalCents": 17000,
      "shippingFeeCents": 0,
      "isFreeShipping": true,
      "taxCents": 0,
      "totalCents": 17000,
      "currency": "USD"
    }
  }
}
```

---

### `POST /orders` (Order Creation)
Places an order, executes atomic MongoDB transactions to reserve inventory, and empties the customer's cart.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Required Header:** `Idempotency-Key: <UUIDv4>`
- **Request Body:**
```json
{
  "shippingAddressId": "672440015f36e4a2a11ba001",
  "billingAddressId": "672440015f36e4a2a11ba001",
  "paymentMethod": "cod",
  "customerNote": "Please leave at side door."
}
```
- **Payment Method Constraints:**
  - `cod`: Always enabled by default. Order immediately transitions to status `confirmed`, `paymentStatus: "pending"`.
  - `stripe`: Allowed only if `onlineEnabled: true`. Initial status is `awaiting_payment`.
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "_id": "672450015f36e4a2a11bc001",
      "orderReference": "ORD-20261101-ABCD",
      "user": "6724218a5f36e4a2a11b8991",
      "status": "confirmed",
      "paymentStatus": "pending",
      "paymentMethod": "cod",
      "subtotalCents": 17000,
      "shippingFeeCents": 0,
      "taxCents": 0,
      "totalCents": 17000,
      "currency": "USD",
      "items": [
        {
          "productId": "672422015f36e4a2a11b8999",
          "title": "Heavyweight Boxy Hoodie - Vintage Black (M)",
          "sku": "HWT-HD-VBLK-M",
          "priceSnapshot": 8500,
          "quantity": 2,
          "subtotalCents": 17000
        }
      ],
      "shippingAddress": {
        "recipientName": "Alex Vance",
        "streetAddress": "742 Evergreen Terrace",
        "city": "Springfield",
        "state": "OR",
        "postalCode": "97477",
        "country": "US"
      },
      "createdAt": "2026-11-01T01:30:00.000Z"
    }
  }
}
```

---

## 9. Customer Order History & Cancellation

### `GET /orders`
Lists customer's orders with pagination.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Query Parameters:** `page`, `limit`, `status`
- **Response `200 OK`:** Returns paginated order list.

---

### `GET /orders/:orderReference`
Retrieves order details by reference code (e.g. `ORD-20261101-ABCD`).

- **Response `200 OK`:** Returns order with shipment tracking info (carrier, trackingNumber, trackingUrl) if shipped. Returns `404 Not Found` if order belongs to another customer.

---

### `POST /orders/:orderReference/cancel`
Allows a customer to cancel an unfulfilled order (`confirmed` or `awaiting_payment`). Automatically restocks reserved inventory through an ACID transaction.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Request Body:**
```json
{
  "reason": "Ordered wrong size by mistake"
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

## 10. Error Contract & Error Codes

All errors strictly conform to the standardized error envelope:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Requested quantity exceeds available stock for SKU HWT-HD-VBLK-M",
    "details": {
      "productId": "672422015f36e4a2a11b8999",
      "availableStock": 1,
      "requestedQuantity": 2
    },
    "timestamp": "2026-11-01T01:30:00.000Z"
  }
}
```

### Standard Storefront Error Codes

| HTTP Status | Error Code | Scenario |
| :--- | :--- | :--- |
| **400** | `VALIDATION_ERROR` | Request payload fails schema validation (e.g. malformed email or negative quantity). |
| **401** | `UNAUTHORIZED` | In-memory access token expired or missing. Trigger silent refresh. |
| **401** | `TOKEN_EXPIRED` | Refresh token expired. Redirect user to storefront login. |
| **403** | `FORBIDDEN_ROLE` | Attempted access with insufficient role permissions. |
| **404** | `RESOURCE_NOT_FOUND` | Product slug, category, or order reference does not exist or is not owned. |
| **409** | `CONFLICT` | Email already registered or Idempotency-Key collision with different payload. |
| **409** | `INSUFFICIENT_STOCK` | Stock was reserved by another buyer prior to order placement. |
| **409** | `ONLINE_PAYMENTS_DISABLED` | Attempted to select `stripe` when online payments are toggled off. |
| **422** | `INVALID_ORDER_STATE` | Attempted to cancel an order already in `processing`, `shipped`, or `delivered`. |
| **429** | `RATE_LIMIT_EXCEEDED` | Request frequency exceeds the IP rate limit. |
