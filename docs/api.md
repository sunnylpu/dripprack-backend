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

