# API Contract & Endpoint Inventory (Phase 0)

## 1. REST API Conventions

- **Base URL Prefix:** `/api/v1`
- **Content-Type:** `application/json` (except multipart file upload endpoints or raw webhook handlers)
- **Authentication:** Bearer JWT in `Authorization: Bearer <token>` header for access tokens; HttpOnly `refreshToken` cookie for session refresh.
- **Idempotency:** State-changing requests like order creation accept an `Idempotency-Key: <UUIDv4>` header.

---

## 2. Standard Response Envelopes

### 2.1 Success Response Envelope
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource retrieved successfully",
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```
*(The `meta` object is included whenever paginated data is returned).*

### 2.2 Error Response Envelope
```json
{
  "success": false,
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body failed validation constraints.",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address"
      }
    ]
  }
}
```

---

## 3. HTTP Status Code Conventions

| Status Code | Meaning & Usage |
| :--- | :--- |
| **200 OK** | Successful read, update, or synchronous business operation. |
| **201 Created** | Successful resource creation (e.g., registration, product creation, order placed). |
| **204 No Content** | Successful operation with intentionally empty response body (e.g. resource deletion). |
| **400 Bad Request** | Syntactically malformed JSON, query parameter type errors, or unparseable input. |
| **401 Unauthorized**| Missing, expired, invalid, or revoked authentication credentials. |
| **403 Forbidden** | Valid identity, but lacks required role or ownership permission (e.g., customer accessing admin route, or accessing another customer's cart). |
| **404 Not Found** | Target resource does not exist (or concealed for privacy). |
| **409 Conflict** | Business rule conflict, e.g., duplicate email/SKU, insufficient available stock, or conflicting order state transition. |
| **422 Unprocessable**| Syntactically valid JSON that fails semantic/domain validation rules (Zod validation failure). |
| **429 Too Many Req**| Rate limit exceeded. Accompanied by standard `Retry-After` header. |
| **500 Server Error**| Unexpected server failure. Internal stack traces are sanitized and never leaked. |

---

## 4. Complete Endpoint Inventory (V1)

### 4.1 System & Health (`/health`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health/live` | Public | Any | Liveness probe (server process alive) |
| `GET` | `/health/ready`| Public | Any | Readiness probe (MongoDB connection alive) |

### 4.2 Authentication (`/api/v1/auth`)
| Method | Endpoint | Auth | Role | Rate Limit | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Any | Strict (10/hr) | Register customer account (always `customer`) |
| `POST` | `/api/v1/auth/login` | Public | Any | Strict (5/15m) | Login; sets HttpOnly refresh cookie, returns access token |
| `POST` | `/api/v1/auth/refresh` | Cookie | Any | Moderate | Rotates refresh token, issues new access token |
| `POST` | `/api/v1/auth/logout` | Token | Any | Default | Revokes current refresh session |
| `GET` | `/api/v1/auth/me` | Bearer | Any | Default | Returns current authenticated user profile |
| `POST` | `/api/v1/auth/forgot-password`| Public | Any | Strict (5/hr) | Sends single-use password reset token |
| `POST` | `/api/v1/auth/reset-password` | Public | Any | Strict (5/hr) | Resets password with valid token |

### 4.3 Categories (`/api/v1/categories`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/categories` | Public | Any | List all active categories |
| `POST` | `/api/v1/categories` | Bearer | `admin` | Create new category |
| `PATCH`| `/api/v1/categories/:id` | Bearer | `admin` | Update category details |
| `DELETE`| `/api/v1/categories/:id`| Bearer | `admin` | Deactivate/delete category |

### 4.4 Products (`/api/v1/products`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | Public | Any | Paginated published products (filter by category, search, stock) |
| `GET` | `/api/v1/products/:idOrSlug` | Public | Any | Get published product details |
| `POST` | `/api/v1/products` | Bearer | `admin` | Create product (cannot set initial stock directly) |
| `PATCH`| `/api/v1/products/:id` | Bearer | `admin` | Update product catalog fields (disallows stock field tampering) |
| `PATCH`| `/api/v1/products/:id/status`| Bearer | `admin` | Publish, unpublish, or archive product |

### 4.5 Inventory (`/api/v1/inventory`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/inventory/stock` | Bearer | `admin` | Query stock levels across products (physical, reserved, available) |
| `GET` | `/api/v1/inventory/low-stock` | Bearer | `admin` | Query products where available $\le$ lowStockThreshold |
| `POST` | `/api/v1/inventory/adjust` | Bearer | `admin` | Manually adjust stock with delta & required reason |
| `GET` | `/api/v1/inventory/movements` | Bearer | `admin` | Audit log of all inventory movements (paginated) |

### 4.6 Shopping Cart (`/api/v1/cart`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | Bearer | `customer` | Get current customer's cart with live revalidated pricing |
| `POST` | `/api/v1/cart/items` | Bearer | `customer` | Add item or increment quantity in cart |
| `PATCH`| `/api/v1/cart/items/:productId` | Bearer | `customer` | Set specific item quantity (1-99) |
| `DELETE`| `/api/v1/cart/items/:productId`| Bearer | `customer` | Remove item from cart |
| `DELETE`| `/api/v1/cart` | Bearer | `customer` | Clear all items from cart |

### 4.7 Delivery Addresses (`/api/v1/addresses`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/addresses` | Bearer | `customer` | List authenticated customer's saved addresses |
| `POST` | `/api/v1/addresses` | Bearer | `customer` | Add new address to address book |
| `PATCH`| `/api/v1/addresses/:id` | Bearer | `customer` | Update customer address |
| `DELETE`| `/api/v1/addresses/:id` | Bearer | `customer` | Delete customer address |
| `PATCH`| `/api/v1/addresses/:id/default`| Bearer | `customer` | Mark address as customer default |

### 4.8 Checkout & Orders (`/api/v1/orders`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/orders/quote` | Bearer | `customer` | Generate server-authoritative checkout quote (subtotal, tax, shipping) |
| `POST` | `/api/v1/orders` | Bearer | `customer` | Place order idempotently; reserves/deducts stock and clears cart |
| `GET` | `/api/v1/orders/my-orders` | Bearer | `customer` | View customer's own order history (paginated) |
| `GET` | `/api/v1/orders/my-orders/:reference` | Bearer | `customer` | View customer order details by order reference |
| `POST` | `/api/v1/orders/my-orders/:reference/cancel` | Bearer | `customer` | Cancel own order (if in eligible status) and release stock |

### 4.9 Payment & Webhooks (`/api/v1/payments`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-intent` | Bearer | `customer` | Create gateway intent/order for online payment |
| `POST` | `/api/v1/payments/webhook` | Raw | Public | Signature-verified webhook handler for external payment events |

### 4.10 Admin Operations & Dashboard (`/api/v1/admin`)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard/summary` | Bearer | `admin` | Aggregated analytics: total sales, orders by status, low stock count |
| `GET` | `/api/v1/admin/orders` | Bearer | `admin` | Query all store orders with status and date filters |
| `GET` | `/api/v1/admin/orders/:reference` | Bearer | `admin` | Get complete order details with customer snapshot and audit history |
| `PATCH`| `/api/v1/admin/orders/:reference/status` | Bearer | `admin` | Execute controlled state transition (confirmed -> processing -> shipped) |
| `POST` | `/api/v1/admin/orders/:reference/cancel` | Bearer | `admin` | Admin cancellation with restock guarantee |
| `GET` | `/api/v1/admin/audit-logs` | Bearer | `admin` | Query immutable administrative audit trail |

---

## 5. Phase 2 Implemented Endpoint Details

### 5.1 POST `/api/v1/auth/register`
- **Access:** Public
- **Rate Limit:** 5 requests per 15 minutes per IP
- **Request Body:**
  ```json
  {
    "email": "customer@driprack.com",
    "password": "CustomerPassword123!",
    "firstName": "Jane",
    "lastName": "Doe"
  }
  ```
- **Validation Rules:**
  - `email`: Valid email format, lowercase, trimmed, max 255 chars.
  - `password`: Min 8 chars, max 100 chars; must contain $\ge 1$ uppercase, $\ge 1$ lowercase, $\ge 1$ digit, $\ge 1$ special character.
  - `firstName` & `lastName`: Min 2, max 50 chars.
  - Unrecognized fields are strictly stripped (preventing mass assignment). Role is hardcoded to `customer`.
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "Account registered successfully. You may now log in.",
    "data": {
      "user": {
        "_id": "6adfba6f94ba7187790e84f6",
        "email": "customer@driprack.com",
        "firstName": "Jane",
        "lastName": "Doe",
        "role": "customer",
        "status": "active",
        "createdAt": "2026-10-26T20:39:11.920Z",
        "updatedAt": "2026-10-26T20:39:11.920Z"
      }
    }
  }
  ```
- **Error Codes:** `409 CONFLICT` (Duplicate email), `422 VALIDATION_ERROR` (Invalid format or weak password).

---

### 5.2 POST `/api/v1/auth/login`
- **Access:** Public
- **Rate Limit:** 5 requests per 15 minutes per IP
- **Request Body:**
  ```json
  {
    "email": "customer@driprack.com",
    "password": "CustomerPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Authentication successful",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "_id": "6adfba6f94ba7187790e84f6",
        "email": "customer@driprack.com",
        "firstName": "Jane",
        "lastName": "Doe",
        "role": "customer",
        "status": "active"
      }
    }
  }
  ```
- **Cookie Set:**
  `Set-Cookie: refreshToken=<random_hex>; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=604800`
- **Error Codes:** `401 INVALID_CREDENTIALS` (Generic error for wrong email/password), `403 ACCOUNT_SUSPENDED`, `403 ACCOUNT_DEACTIVATED`.

---

### 5.3 POST `/api/v1/auth/refresh`
- **Access:** Authenticated via HttpOnly `refreshToken` cookie
- **Protection:** CSRF Origin Verification + Token Rotation + Reuse Detection
- **Cookie Required:** `refreshToken`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Token refreshed successfully",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "_id": "6adfba6f94ba7187790e84f6",
        "email": "customer@driprack.com",
        "firstName": "Jane",
        "lastName": "Doe",
        "role": "customer",
        "status": "active"
      }
    }
  }
  ```
- **Cookie Set:** Rotated fresh `refreshToken` with refreshed 7-day TTL.
- **Error Codes:** `401 MISSING_REFRESH_TOKEN`, `401 SESSION_EXPIRED`, `401 REVOKED_SESSION_REUSE` (Replay attack triggers revocation of all user sessions), `403 CSRF_FORBIDDEN`.

---

### 5.4 POST `/api/v1/auth/logout`
- **Access:** Public or Authenticated (reads `refreshToken` cookie if present)
- **Protection:** CSRF Origin Verification
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Logged out successfully"
  }
  ```
- **Cookie Cleared:** `Set-Cookie: refreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`

---

### 5.5 GET `/api/v1/auth/me`
- **Access:** Protected by `authenticate` middleware
- **Header:** `Authorization: Bearer <accessToken>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "User profile retrieved successfully",
    "data": {
      "user": {
        "_id": "6adfba6f94ba7187790e84f6",
        "email": "customer@driprack.com",
        "firstName": "Jane",
        "lastName": "Doe",
        "role": "customer",
        "status": "active"
      }
    }
  }
  ```
- **Error Codes:** `401 UNAUTHORIZED`, `401 TOKEN_EXPIRED`, `401 TOKEN_INVALID`, `401 INVALID_TOKEN_TYPE`, `403 ACCOUNT_SUSPENDED`.

---

## 6. Phase 3 Implemented Endpoint Details (Catalog & Categories)

### 6.1 Categories

#### `GET /api/v1/categories`
- **Access:** Public
- **Description:** Retrieve all active categories, alphabetically sorted by name.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Active categories retrieved successfully",
    "data": {
      "categories": [
        {
          "_id": "6adfbe0961482ddd425c96f4",
          "name": "Streetwear Outerwear",
          "slug": "streetwear-outerwear",
          "description": "Heavyweight jackets and coats",
          "isActive": true,
          "createdAt": "2026-10-26T20:54:33.090Z",
          "updatedAt": "2026-10-26T20:54:33.090Z"
        }
      ]
    }
  }
  ```

#### `GET /api/v1/categories/:id`
- **Access:** Public
- **Description:** Retrieve single category by ID.
- **Visibility:** Only active categories (`isActive === true`) are returned to public clients. Inactive categories return `404 NOT_FOUND`.

#### `POST /api/v1/categories`
- **Access:** Admin only (`authenticate, authorize('admin')`)
- **Request Body:**
  ```json
  {
    "name": "Heavyweight Hoodies",
    "slug": "heavyweight-hoodies",
    "description": "Premium 450gsm hoodies"
  }
  ```
- **Response (201 Created):** Returns created category document.

#### `PATCH /api/v1/categories/:id`
- **Access:** Admin only
- **Request Body:** Partial update fields (`name`, `slug`, `description`, `isActive`).

#### `DELETE /api/v1/categories/:id`
- **Access:** Admin only
- **Description:** Soft deactivates category (`isActive: false`). Associated products are preserved but automatically hidden from public storefront views.

#### `GET /api/v1/admin/categories`
- **Access:** Admin only
- **Query Parameters:** `page`, `limit`, `includeInactive` (boolean, default false).

---

### 6.2 Products

#### `GET /api/v1/products`
- **Access:** Public
- **Visibility Invariants:** Returns only `status: 'published'` products whose category `isActive === true`.
- **Query Parameters:**
  - `page`: Integer (default 1)
  - `limit`: Integer (default 20, max 100)
  - `q`: String (search keyword across product name and description, safe regex escaped)
  - `category`: Category ID or Category slug string
  - `inStock`: `true` (`stock.available > 0`) or `false` (`stock.available === 0`)
  - `sortBy`: `name:asc`, `name:desc`, `priceCents:asc`, `priceCents:desc`, `createdAt:asc`, `createdAt:desc` (default: `createdAt:desc`)

#### `GET /api/v1/products/:idOrSlug`
- **Access:** Public
- **Description:** Retrieve single product by MongoDB ObjectId or URL slug.
- **Visibility:** Must be `status: 'published'` and have an active category. If draft, archived, or in an inactive category, returns `404 NOT_FOUND`.

#### `POST /api/v1/products`
- **Access:** Admin only
- **Inventory Invariant:** Stock fields cannot be set; initialized to zero `{ physical: 0, reserved: 0, available: 0 }`.
- **Initial Status:** Defaults to `draft` unless explicitly specified.

#### `PATCH /api/v1/products/:id`
- **Access:** Admin only
- **Inventory Invariant:** General product updates cannot mutate stock fields. Client-supplied `stock` fields are strictly ignored/stripped.

#### `PATCH /api/v1/products/:id/status`
- **Access:** Admin only
- **Request Body:** `{ "status": "published" | "draft" | "archived" }`
- **Transition Rule:** Publishing a product requires its category to be active; otherwise returns `409 CONFLICT`.

#### `GET /api/v1/admin/products`
- **Access:** Admin only
- **Description:** Complete product catalog inspection across all statuses (`draft`, `published`, `archived`) and inactive categories with search, category filtering, inStock filtering, and pagination.

#### `GET /api/v1/admin/products/:id`
- **Access:** Admin only
- **Description:** Complete product details lookup by ID, including drafts, archived items, and products in inactive categories.

---

## 7. Phase 4 Implemented Endpoint Details (Inventory & Stock Management)

All inventory endpoints require `authenticate` and `authorize('admin')`. Guests receive `401 Unauthorized`; customers receive `403 Forbidden`.

### 7.1 POST `/api/v1/inventory/adjust`
- **Access:** Admin only
- **Description:** Atomically adjust product physical and available stock with transaction safety, automatic invariant preservation, and immutable movement audit logging.
- **Headers:**
  - `Authorization: Bearer <adminAccessToken>` (Required)
  - `Idempotency-Key: <unique-string>` (Optional, max 128 characters)
- **Request Body:**
  ```json
  {
    "productId": "6adfbe1661482ddd425c970c",
    "quantityDelta": 15,
    "reason": "New supplier batch received"
  }
  ```
  *(To deduct damaged inventory: set `"quantityDelta": -3`)*
- **Validation Constraints:**
  - `productId`: Valid 24-character hexadecimal ObjectId.
  - `quantityDelta`: Nonzero signed integer between -100,000 and 100,000.
  - `reason`: Required string, trimmed, 3 to 500 characters.
  - Strict payload validation: Unexpected fields (such as client-supplied stock counts or spoofed actor IDs) are rejected with `422 VALIDATION_ERROR`.
- **Business & Consistency Rules:**
  - Available stock invariant: $\text{available} = \text{physical} - \text{reserved}$.
  - Reserved stock is never altered during manual adjustments.
  - Negative adjustments require $\text{available} \ge |\text{quantityDelta}|$. If insufficient removable stock exists, returns `409 Conflict` (`INSUFFICIENT_STOCK`).
- **Idempotency Behavior:**
  - Repeating the request with the identical key and identical payload returns the previously recorded movement and current stock with `200 OK` (`isIdempotentReplay: true`).
  - Reusing a key with a different payload returns `409 Conflict` (`IDEMPOTENCY_CONFLICT`).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Stock adjusted successfully",
    "data": {
      "product": {
        "_id": "6adfbe1661482ddd425c970c",
        "sku": "DRIP-HOODIE-BLK-M",
        "name": "Heavyweight Boxy Hoodie",
        "stock": {
          "physical": 40,
          "reserved": 0,
          "available": 40
        },
        "lowStockThreshold": 5
      },
      "movement": {
        "_id": "6adfc8a1b94ea1f238ab9102",
        "product": "6adfbe1661482ddd425c970c",
        "sku": "DRIP-HOODIE-BLK-M",
        "movementType": "adjustment",
        "quantityDelta": 15,
        "previousPhysical": 25,
        "newPhysical": 40,
        "previousAvailable": 25,
        "newAvailable": 40,
        "actor": {
          "_id": "6adfba6f94ba7187790e84f0",
          "firstName": "Admin",
          "lastName": "User",
          "email": "admin@driprack.com",
          "role": "admin"
        },
        "actorRole": "admin",
        "reason": "New supplier batch received",
        "createdAt": "2026-10-27T02:35:10.120Z"
      }
    }
  }
  ```

---

### 7.2 GET `/api/v1/inventory/stock`
- **Access:** Admin only
- **Description:** Paginated catalog stock overview with real-time computed `isLowStock` boolean flag.
- **Query Parameters:**
  - `page`: Integer (default 1)
  - `limit`: Integer (default 20, max 100)
  - `q`: Search keyword (matched against product name or SKU)
  - `category`: Category ID or Category slug
  - `inStock`: `true` or `false`
  - `lowStockOnly`: `true` (filters products where `stock.available <= lowStockThreshold`)
  - `sortBy`: `sku:asc`, `sku:desc`, `name:asc`, `name:desc`, `physical:asc`, `physical:desc`, `available:asc`, `available:desc`, `createdAt:asc`, `createdAt:desc` (default: `createdAt:desc`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Inventory stock levels retrieved successfully",
    "data": {
      "stock": [
        {
          "_id": "6adfbe1661482ddd425c970c",
          "sku": "DRIP-HOODIE-BLK-M",
          "name": "Heavyweight Boxy Hoodie",
          "slug": "heavyweight-boxy-hoodie",
          "status": "published",
          "category": {
            "_id": "6adfbe0961482ddd425c96f4",
            "name": "Streetwear Outerwear"
          },
          "stock": {
            "physical": 4,
            "reserved": 0,
            "available": 4
          },
          "lowStockThreshold": 5,
          "isLowStock": true,
          "createdAt": "2026-10-26T20:54:33.090Z",
          "updatedAt": "2026-10-27T02:35:10.120Z"
        }
      ]
    },
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
  ```

---

### 7.3 GET `/api/v1/inventory/low-stock`
- **Access:** Admin only
- **Description:** Focused inventory report listing all products currently requiring replenishment (`stock.available <= lowStockThreshold`). Products with 0 available units qualify under this definition.
- **Query Parameters:** `page`, `limit`, `q`, `category`, `sortBy`.
- **Response (200 OK):** Returns low-stock items with `isLowStock: true` and computed `unitsBelowThreshold`.

---

### 7.4 GET `/api/v1/inventory/movements`
- **Access:** Admin only
- **Description:** Append-only, immutable inventory movement audit log detailing all stock mutations across the store.
- **Immutability Guarantee:** No routes exist to edit, update, or delete movement records.
- **Query Parameters:**
  - `page`: Integer (default 1)
  - `limit`: Integer (default 20, max 100)
  - `productId`: Filter by specific Product ObjectId
  - `movementType`: `adjustment`, `reservation`, `release`, `sale`, `restock`
  - `actor`: Filter by admin user ObjectId
  - `startDate`: ISO 8601 date string
  - `endDate`: ISO 8601 date string (validated: `startDate <= endDate`)
  - `sortBy`: `createdAt:desc`, `createdAt:asc` (default: `createdAt:desc`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Inventory movements retrieved successfully",
    "data": {
      "movements": [
        {
          "_id": "6adfc8a1b94ea1f238ab9102",
          "product": {
            "_id": "6adfbe1661482ddd425c970c",
            "name": "Heavyweight Boxy Hoodie",
            "slug": "heavyweight-boxy-hoodie",
            "sku": "DRIP-HOODIE-BLK-M"
          },
          "sku": "DRIP-HOODIE-BLK-M",
          "movementType": "adjustment",
          "quantityDelta": 15,
          "previousPhysical": 25,
          "newPhysical": 40,
          "previousAvailable": 25,
          "newAvailable": 40,
          "actor": {
            "_id": "6adfba6f94ba7187790e84f0",
            "firstName": "Admin",
            "lastName": "User",
            "email": "admin@driprack.com",
            "role": "admin"
          },
          "actorRole": "admin",
          "reason": "New supplier batch received",
          "createdAt": "2026-10-27T02:35:10.120Z"
        }
      ]
    },
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
  ```

---

## 8. Phase 5 Implemented Endpoint Details (Shopping Cart)

All cart endpoints require `authenticate` and `authorize('customer')`. Guests receive `401 Unauthorized`; admins receive `403 Forbidden`.

### 8.1 GET `/api/v1/cart`
- **Access:** Customer only
- **Description:** Retrieve the authenticated customer's shopping cart populated with real-time product eligibility and dynamic pricing.
- **Informational Subtotals:** Calculates non-authoritative estimated subtotals using current catalog prices. Phase 6 checkout independently recalculates all authoritative pricing.
- **Storefront Availability:** Flagged per item with `isAvailableForPurchase` and `unavailableReason` if unpublished, archived, out of stock, or belonging to an inactive category.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Shopping cart retrieved successfully",
    "data": {
      "cart": {
        "_id": "6adfd0a187e1a0b387cf0011",
        "user": "6adfba6f94ba7187790e84f6",
        "items": [
          {
            "_id": "6adfd0a187e1a0b387cf0012",
            "product": {
              "_id": "6adfbe1661482ddd425c970c",
              "sku": "DRIP-HOODIE-BLK-M",
              "name": "Heavyweight Boxy Hoodie",
              "slug": "heavyweight-boxy-hoodie",
              "images": ["https://images.driprack.com/hoodie-black.jpg"],
              "priceCents": 8500,
              "compareAtPriceCents": 11000,
              "status": "published",
              "availableStock": 25
            },
            "quantity": 2,
            "unitPriceCents": 8500,
            "lineTotalCents": 17000,
            "isAvailableForPurchase": true,
            "unavailableReason": null,
            "addedAt": "2026-10-27T02:40:00.000Z"
          }
        ],
        "itemCount": 2,
        "estimatedSubtotalCents": 17000,
        "currency": "USD",
        "isAuthoritative": false,
        "updatedAt": "2026-10-27T02:40:00.000Z"
      }
    }
  }
  ```

---

### 8.2 POST `/api/v1/cart/items`
- **Access:** Customer only
- **Description:** Add item to cart or increment quantity if already present. Enforces maximum quantity of 99 per product.
- **Request Body:**
  ```json
  {
    "productId": "6adfbe1661482ddd425c970c",
    "quantity": 2
  }
  ```
- **Validation Constraints:**
  - `productId`: Valid 24-char ObjectId.
  - `quantity`: Positive integer ($1 \le q \le 99$, default: 1).
  - Product must be published, in an active category, and have sufficient available stock.
- **Error Codes:** `404 NOT_FOUND` (Product missing), `409 PRODUCT_UNAVAILABLE`, `409 CATEGORY_INACTIVE`, `409 OUT_OF_STOCK`, `409 INSUFFICIENT_STOCK`.

---

### 8.3 PATCH `/api/v1/cart/items/:productId`
- **Access:** Customer only
- **Description:** Explicitly set the requested quantity of an existing cart item.
- **Request Body:**
  ```json
  {
    "quantity": 5
  }
  ```
- **Validation Constraints:** `quantity` integer ($1 \le q \le 99$). Must not exceed current available stock.

---

### 8.4 DELETE `/api/v1/cart/items/:productId`
- **Access:** Customer only
- **Description:** Remove specified product from customer's cart. Works unconditionally even if product was archived, deleted, or out of stock.

---

### 8.5 DELETE `/api/v1/cart`
- **Access:** Customer only
- **Description:** Clear all items from customer's shopping cart.

---

## 9. Phase 5 Implemented Endpoint Details (Delivery Address Book)

All address endpoints require `authenticate` and `authorize('customer')`. Ownership is strictly scoped to `req.user._id`.

### 9.1 GET `/api/v1/addresses`
- **Access:** Customer only
- **Description:** Retrieve all delivery addresses owned by the authenticated customer.
- **Ordering:** Deterministic order with default address first (`isDefault: -1`), followed by newest created (`createdAt: -1`).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Delivery addresses retrieved successfully",
    "data": {
      "addresses": [
        {
          "_id": "6adfd1b287e1a0b387cf0020",
          "user": "6adfba6f94ba7187790e84f6",
          "recipientName": "Jane Doe",
          "phone": "+1 555-234-5678",
          "streetAddress1": "123 Fashion Ave",
          "streetAddress2": "Apt 4B",
          "city": "New York",
          "state": "NY",
          "postalCode": "10001",
          "country": "US",
          "isDefault": true,
          "createdAt": "2026-10-27T02:45:00.000Z",
          "updatedAt": "2026-10-27T02:45:00.000Z"
        }
      ]
    }
  }
  ```

---

### 9.2 POST `/api/v1/addresses`
- **Access:** Customer only
- **Description:** Add a new delivery address. First created address automatically becomes default (`isDefault: true`). Subsequent addresses can specify `isDefault: true`, transactionally unsetting previous default.
- **Request Body:**
  ```json
  {
    "recipientName": "Jane Doe",
    "phone": "+1 555-234-5678",
    "streetAddress1": "123 Fashion Ave",
    "streetAddress2": "Apt 4B",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "US",
    "isDefault": false
  }
  ```
- **Response (201 Created):** Returns created address document.

---

### 9.3 PATCH `/api/v1/addresses/:id`
- **Access:** Customer only
- **Description:** Update editable fields (`recipientName`, `phone`, `streetAddress1`, `streetAddress2`, `city`, `state`, `postalCode`, `country`).
- **Ownership Verification:** Scoped strictly to authenticated user (`{ _id: id, user: req.user._id }`). Inaccessible addresses return `404 NOT_FOUND`.

---

### 9.4 PATCH `/api/v1/addresses/:id/default`
- **Access:** Customer only
- **Description:** Designate this address as the default delivery address. Transactionally unsets previous default.
- **Database Safeguard:** Partial unique index `{ user: 1, isDefault: true }` guarantees at most one default address exists.

---

### 9.5 DELETE `/api/v1/addresses/:id`
- **Access:** Customer only
- **Description:** Delete an owned delivery address.
- **Promotion Rule:** If deleted address was default, the most recently created remaining address is automatically promoted to default. If no addresses remain, no default is assigned.




