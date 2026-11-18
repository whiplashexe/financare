# PRD Financare: API Endpoint Specification

REST API endpoint reference (Express). User flows and sequence diagrams are in [`user_flow.md`](./user_flow.md); this document contains the API contract.

## 1. Conventions

| Item           | Rule                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base URL       | `/api/v1`                                                                                                                                              |
| Format         | JSON, `Content-Type: application/json`                                                                                                                 |
| Authentication | `Authorization: Bearer <access_token>` (JWT, 15 minutes). Endpoints marked 🔓 are public, the rest are 🔒 login required                               |
| Amount         | IDR integer without decimals (`1500000`)                                                                                                               |
| Date           | ISO 8601 UTC for timestamps (`2026-11-13T01:00:00Z`); `YYYY-MM-DD` for pure dates (due date, plan date)                                                |
| ID             | String with entity prefix and sequence number, e.g. `TRANS001` (see `erd.md`)                                                                          |
| Ownership      | All data is scoped by the `user_id` from the token. Data belonging to other users returns `404`                                                        |
| Pagination     | `?cursor=<id>&limit=20` (max 100). The response includes `pagination.next_cursor` (null when exhausted)                                                |
| Idempotency    | The `Idempotency-Key` header (UUID) is supported on `POST /transactions` and `POST .../confirm`; the same key within 24 hours returns the first result |
| Rate limit     | Auth (register, login): 5 requests/minute/IP, every request counts. Login failures: 5 per 15 minutes per (email, IP). Others: 120 requests/minute/user. A rejected request returns `429 RATE_LIMITED` with a `Retry-After` header (seconds) |

**Response envelope (ServerCN format)**

All responses follow the standard ServerCN `ApiResponse` / `ApiError` shape (`success`, `message`, `statusCode`), implemented with the ServerCN `response-formatter`, `error-handler`, `global-error-handler`, and `request-validator` components.

Success:

```json
{
  "success": true,
  "message": "Transaction created",
  "statusCode": 201,
  "data": {}
}
```

List (cursor pagination):

```json
{
  "success": true,
  "message": "Transactions fetched",
  "statusCode": 200,
  "data": [],
  "pagination": { "next_cursor": "...", "limit": 20 }
}
```

Error:

```json
{
  "success": false,
  "message": "Amount must be greater than 0",
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "errors": { "amount": ["Amount must be greater than 0"] }
}
```

| Field        | Present                    | Notes                                                                                                                                                              |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `success`    | Always                     | `true` / `false`                                                                                                                                                   |
| `message`    | Always                     | Human-readable, safe to show in the app                                                                                                                            |
| `statusCode` | Always                     | Same value as the HTTP status                                                                                                                                      |
| `data`       | Success with payload       | The resource, or `{ }`. Omitted when there is nothing to return                                                                                                    |
| `errors`     | Validation errors          | Map of field name to an array of messages (Zod `flatten().fieldErrors`)                                                                                            |
| `stack`      | Development only           | Included when `NODE_ENV=development`; never in production                                                                                                          |
| `code`       | Errors (project extension) | Machine-readable code from the table below. Not part of stock ServerCN: add it to `ApiError` so the app can branch on it (e.g. `TOKEN_EXPIRED` triggers a refresh) |
| `pagination` | Lists (project extension)  | `next_cursor` is `null` when exhausted                                                                                                                             |

Notes:

- Examples elsewhere in this document and in `user_flow.md` write responses as `{ "data": ... }` for brevity. The real response always includes `success`, `message`, and `statusCode` around it.
- The stock ServerCN error handler only copies `message` (and `stack` in development) to the body. The project's `error-handler` must also pass through `statusCode`, `code`, and `errors`.
- Responses documented as `204` have no body.

| HTTP | `code`                           | Meaning                                                                                    |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| 400  | `VALIDATION_ERROR`               | Invalid input (`errors` is filled)                                                         |
| 401  | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token is missing, incorrect, or expired                                                    |
| 404  | `NOT_FOUND`                      | Not found, or belongs to another user                                                      |
| 409  | `CONFLICT`                       | Conflict (email already registered, duplicate confirmation)                                |
| 422  | `BUSINESS_RULE`                  | Violates a business rule (future date, archived account, etc.)                             |
| 422  | `CONFIRMATION_REQUIRED`          | User confirmation needed; repeat with `"confirm": true`. The preview is returned in `data` |
| 429  | `RATE_LIMITED`                   | Too many requests                                                                          |
| 500  | `INTERNAL_ERROR`                 | Server error                                                                               |

**Non-fatal warnings** are returned in `data.warnings[]` on a successful response, for example `{ "code": "NEGATIVE_BALANCE", "balance_after": -150000 }`.

---

## 2. Auth

| Method | Path                    | Access | Description                      |
| ------ | ----------------------- | ------ | -------------------------------- |
| POST   | `/auth/register`        | 🔓     | Register, logged in immediately  |
| POST   | `/auth/login`           | 🔓     | Sign in                          |
| POST   | `/auth/refresh`         | 🔓     | Exchange refresh token (rotated) |
| POST   | `/auth/logout`          | 🔓     | Revoke this device's session     |
| POST   | `/auth/logout-all`      | 🔒     | Revoke all sessions              |
| POST   | `/auth/forgot-password` | 🔓     | Send reset email                 |
| POST   | `/auth/reset-password`  | 🔓     | Set a new password with a token  |

This section describes the mobile contract. Token delivery for a future web client (cookie-based refresh token) is described in [Token delivery per client type](#token-delivery-per-client-type).

### POST `/auth/register`

Request:

```json
{
  "name": "Apri",
  "email": "apri@mail.com",
  "password": "secret123",
  "timezone": "Asia/Makassar",
  "device": { "platform": "ANDROID", "name": "Pixel 7" }
}
```

| Field      | Required | Rule                                   |
| ---------- | -------- | -------------------------------------- |
| `name`     | Yes      | 1–100 characters                       |
| `email`    | Yes      | Email format, stored lowercase, unique |
| `password` | Yes      | Min. 8 characters                      |
| `timezone` | Yes      | IANA name, default `Asia/Jakarta`      |
| `device`   | No       | `platform` (`ANDROID`/`IOS`), `name`   |

Response `201`:

```json
{
  "data": {
    "user": {
      "id": "u1",
      "name": "Apri",
      "email": "apri@mail.com",
      "timezone": "Asia/Makassar"
    },
    "access_token": "eyJ...",
    "access_expires_in": 900,
    "refresh_token": "rt_..."
  }
}
```

Errors: `400`, `409` (email already registered), `429`. Side effect: creates the default categories.

### POST `/auth/login`

Request: `{ "email", "password", "device" }`. Response `200`: same as register. Errors: `401` (generic message, identical for unknown email, deleted account, and wrong password), `429` (after 5 failed attempts for the same email and IP within 15 minutes, even if the next password is correct; the counter also covers unregistered emails so the response does not reveal whether an email exists; a successful login resets it). `Retry-After` is set on every `429`.

### POST `/auth/refresh`

Request: `{ "refresh_token": "rt_..." }`. Response `200`: `{ "access_token", "access_expires_in", "refresh_token" }` (no `user` object). The old token is revoked and the new one joins the same `family_id`; its 30-day lifetime restarts at each rotation.

Errors:

- `401 TOKEN_EXPIRED`: the token is past `expires_at` (it is not rotated or revoked).
- `401 UNAUTHORIZED`: unknown token, owner deleted, or **reuse** of an already revoked token. Reuse revokes the entire session family, including the newest token, and the client must sign in again. The body is identical for unknown and reused tokens.
- `429`: this endpoint has its own, looser limit of 30 requests/minute/IP (the 5/minute auth limit would break normal use behind shared mobile IPs).

Two simultaneous refreshes with the same token are treated as reuse: one succeeds, the other gets `401`, and the family is revoked. The client must run a single refresh at a time.

### POST `/auth/logout`

Request: `{ "refresh_token" }`. Response `204`, always: unknown, already revoked, and repeated tokens all return `204` so the endpoint reveals nothing. Revokes every token of the same `family_id` (this device's session), even if the given token was already rotated. Other devices keep their sessions. Same 30 requests/minute/IP limit as refresh.

### POST `/auth/logout-all`

Requires `Authorization: Bearer <access_token>`. Response `204`; revokes every refresh token of the user. Access tokens already issued stay valid until they expire (at most 15 minutes), except that an access token of a deleted account is rejected at once (see Authentication below). Errors: `401 UNAUTHORIZED` (header missing, malformed, bad signature, no subject) or `401 TOKEN_EXPIRED`.

### POST `/auth/forgot-password`

Request: `{ "email" }`. Response is always `202` with the same body (does not leak whether the email exists). The emailed token is valid for 30 minutes and single use. Only one unused token exists per user: a new request replaces the previous one. Nothing is created or sent for unknown or deleted accounts. After 3 requests per email within 15 minutes, further requests still answer `202` but no new email is sent. Shares the 5 requests/minute/IP auth limit.

### POST `/auth/reset-password`

Request: `{ "token", "new_password" }` (password 8 to 128 characters). Response `204`; the password changes, the token and any other unused reset tokens of the user are marked used, and all of the user's refresh tokens are revoked. Errors: `400 VALIDATION_ERROR` with `errors.token` for an unknown, expired, or already used token or a deleted account (identical body for all of them), and with `errors.new_password` for a weak password (the token is not consumed). Two simultaneous requests with the same token: only one succeeds. Shares the 5 requests/minute/IP auth limit.

### Token delivery per client type

The MVP client is the React Native app, so the contract above delivers `refresh_token` in the JSON body. A web client is planned for later (post-MVP); it must not change the core token logic (hashed storage, rotation, `family_id`, reuse detection), only how the token is handed over.

| | Mobile (MVP) | Web (post-MVP) |
| --- | --- | --- |
| `access_token` | Response body; kept in memory | Response body; kept in JS memory only (never `localStorage`) |
| `refresh_token` | Response body; kept in Keychain/Keystore (`expo-secure-store` / `react-native-keychain`; not `AsyncStorage`) | `Set-Cookie`, not present in the body |
| Sent on refresh/logout | Request body `{ "refresh_token" }` | Cookie, sent automatically by the browser |

Web rules (to implement when the web client starts):

- **Client detection:** the web client sends `X-Client: web`. Do not infer the client from the user-agent.
- **Cookie:** `refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000`. `Path` limits the cookie to the auth endpoints.
- **Sources:** `/auth/refresh` and `/auth/logout` accept the token from either the body (mobile) or the cookie (web). Read it in one function (`readRefreshToken(req)`) so adding a source touches one place.
- **CSRF:** only cookie-based endpoints (`refresh`, `logout`) need it. Use `SameSite=Strict` plus a required custom header (`X-Requested-With`), which cross-site requests cannot send without a CORS preflight. The access token travels in the `Authorization` header, so it does not need CSRF protection.
- **CORS:** replace the open `cors()` with an explicit origin allow-list and `credentials: true` **before** the web client launches. Mobile is unaffected (CORS is enforced only by browsers).
- **Domain:** host web and API on the same site (e.g. `app.<domain>` and `api.<domain>`) so `SameSite=Strict` cookies are sent. A different registrable domain would require `SameSite=None; Secure` and a heavier CSRF design.
- **Page reload:** the access token lives only in memory, so the web client calls `POST /auth/refresh` on load to obtain a new one.

---

## 3. Profile & Devices

| Method | Path                           | Access | Description                          |
| ------ | ------------------------------ | ------ | ------------------------------------ |
| GET    | `/me`                          | 🔒     | Profile + preferences                |
| PATCH  | `/me`                          | 🔒     | Update name, timezone                |
| POST   | `/me/password`                 | 🔒     | Change password                      |
| PATCH  | `/me/notification-preferences` | 🔒     | Send time, quiet hours, channels     |
| PATCH  | `/me/preferences`              | 🔒     | Display preferences (`hide_balance`) |
| DELETE | `/me`                          | 🔒     | Delete account and all data          |
| POST   | `/devices`                     | 🔒     | Register push token                  |
| DELETE | `/devices/:id`                 | 🔒     | Remove device                        |

### Authentication of 🔒 endpoints

`Authorization: Bearer <access_token>` (JWT HS256, 15 minutes). The token carries `sub` (user id) and `sid` (the session family id of the refresh token it was issued with; it stays the same across rotations). On every request the server also checks that the user still exists and is not deleted, so a deleted account is cut off immediately: `401 UNAUTHORIZED`. An expired token returns `401 TOKEN_EXPIRED`; a missing, malformed, or wrongly signed one returns `401 UNAUTHORIZED`.

### GET `/me`

```json
{
  "data": {
    "id": "u1",
    "name": "Apri",
    "email": "apri@mail.com",
    "timezone": "Asia/Makassar",
    "preferences": { "hide_balance": false },
    "notification_preferences": {
      "send_time": "08:00",
      "quiet_hours": { "start": "22:00", "end": "07:00" },
      "push": true,
      "email_fallback": false
    }
  }
}
```

### PATCH `/me`

Request: `{ "name"?, "timezone"? }` (at least one field; `name` 1 to 100 characters after trimming; `timezone` an IANA name). Any other field, such as `email`, is rejected with `400`. Response `200` with the full profile (same shape as `GET /me`). Changing `timezone` recalculates the schedule of reminders that have not yet been sent (done together with the reminder feature).

### POST `/me/password`

Request: `{ "current_password", "new_password" }` (new password 8 to 128 characters). Response `204`. Every session except the current one (identified by the `sid` of the access token) is revoked. Errors: `401 PASSWORD_INCORRECT` if the current password is wrong (a dedicated code, so a client does not mistake it for an expired token and loop on refresh); `429` after 5 wrong attempts within 15 minutes per user, with `Retry-After`.

### PATCH `/me/notification-preferences`

Request (at least one field): `{ "send_time": "08:00", "quiet_hours": { "start", "end" } | null, "push": true, "email_fallback": true }`. Times are `HH:MM`, 24 hours. `quiet_hours` start and end must differ; `null` clears both. Response `200`: the updated `notification_preferences` object (same shape as in `GET /me`).

### PATCH `/me/preferences`

Request: `{ "hide_balance": true }`. Response `200`: `{ "data": { "hide_balance": true } }`. This value affects notification content (no balance figures).

### DELETE `/me`

Request: `{ "password" }`. Response `202`. Synchronously: the account is marked deleted (`deleted_at`), every refresh token is revoked, and every device token is removed; from that moment the access token, login, and refresh no longer work. The email stays reserved (register returns `409`) until the data is purged. The permanent deletion of all rows and the Cloudinary images is done by a background job (not built yet). Errors: `401 PASSWORD_INCORRECT`, `429` (same limiter as `POST /me/password`).

### POST `/devices`

Request: `{ "platform": "ANDROID" | "IOS", "push_token": "..." }` (token 1 to 512 characters). Response `201`: `{ "data": { "id" } }`. The same token is updated (upsert): it keeps its `id`, refreshes `last_seen_at`, and moves to the calling user if another user had registered it.

### DELETE `/devices/:id`

Response `204`. A device that does not exist or belongs to another user returns the same `404`.

---

## 4. Account

| Method | Path                      | Description                             |
| ------ | ------------------------- | --------------------------------------- |
| GET    | `/accounts`               | List + total balance                    |
| POST   | `/accounts`               | Create                                  |
| GET    | `/accounts/:id`           | Detail                                  |
| PATCH  | `/accounts/:id`           | Update                                  |
| DELETE | `/accounts/:id`           | Delete (only if it has no transactions) |
| POST   | `/accounts/:id/archive`   | Archive                                 |
| POST   | `/accounts/:id/unarchive` | Reactivate                              |

**Account object**
| Field | Type | Description |
|---|---|---|
| `id` | string | |
| `name` | string | Required, 1–50 characters |
| `type` | enum | `BANK` / `EWALLET` / `CASH` |
| `institution` | string? | Empty for Cash |
| `initial_balance` | int | Default 0, may be negative |
| `current_balance` | int | Computed: `initial + income − outcome + incoming transfers − outgoing transfers` (read-only) |
| `last4` | string? | Exactly 4 digits |
| `color`, `icon` | string? | |
| `include_in_total` | bool | Default `true` |
| `status` | enum | `ACTIVE` / `ARCHIVED` |

All endpoints require authentication. Another user's account returns the same `404` as an unknown id.

### GET `/accounts`

Query: `status` (`ACTIVE` default, `ARCHIVED`, `ALL`; other values and unknown parameters return `400`). Accounts are ordered by creation time. Each item is the full account object. Response:

```json
{
  "data": {
    "total_balance": 3800000,
    "accounts": [
      {
        "id": "a1",
        "name": "BCA Salary",
        "type": "BANK",
        "current_balance": 3000000,
        "include_in_total": true,
        "status": "ACTIVE"
      }
    ]
  }
}
```

`total_balance` only counts `ACTIVE` accounts with `include_in_total = true`, whatever the `status` filter is (filtering by `ARCHIVED` still returns the total of the active accounts).

### POST `/accounts`

Request: the object fields above except `id`, `current_balance`, `status`; sending any of those, or any unknown field, returns `400`. `name` is trimmed; `institution` must be empty for `CASH` (an empty string is stored as null); `initial_balance` is an integer from -999,999,999,999 to 999,999,999,999; `last4` exactly 4 digits; `color` is `#RRGGBB` or `#RRGGBBAA`. Response `201` full object. Errors: `400` with `errors` per field.

### PATCH `/accounts/:id`

All fields optional, at least one required (`confirm` alone does not count). Optional fields can be cleared with `null`. Archived accounts can be edited. Changing `initial_balance` to a different value on an account that already has transactions (including those in the trash) returns `422 CONFIRMATION_REQUIRED` with `{ "data": { "preview": { "old_balance", "new_balance" } } }` and changes nothing; repeat with `"confirm": true` to apply it. Other fields never need confirmation. Changing `type` to `CASH` while an institution is set (or setting an institution on a cash account) returns `400` unless the institution is cleared in the same request.

### DELETE `/accounts/:id`

Response `204`. Errors: `422 BUSINESS_RULE` if transactions exist (including those in the trash, and including transfers where the account is the destination) or if a recurring plan uses the account. Templates that use the account get their `account_id` / `to_account_id` cleared.

### POST `/accounts/:id/archive`, `/unarchive`

Response `200` Account object. Both calls are idempotent. Archiving removes the balance from the total; templates that use this account get their `account_id` / `to_account_id` cleared in the same database transaction (unarchiving does not restore them). Active plans that use this account are flagged `needs_account_change` (done together with the plan feature; it is derived from the account status, not stored).

---

## 5. Categories

| Method | Path              | Description                               |
| ------ | ----------------- | ----------------------------------------- |
| GET    | `/categories`     | List. Filter `type`                       |
| POST   | `/categories`     | Create                                    |
| PATCH  | `/categories/:id` | Update name/icon                          |
| DELETE | `/categories/:id` | Delete; transactions are moved to "Other" |

Object: `{ "id", "name", "type": "INCOME" | "OUTCOME", "icon", "is_default", "is_fallback" }`. `is_fallback` is `true` only for the "Other" category of each type, so the client knows which one is protected.

All endpoints require authentication. Another user's category returns the same `404` as an unknown id.

- `GET /categories`: optional `?type=INCOME|OUTCOME` (other values and unknown parameters return `400`). Response `200`: an array. Order: by type, the fallback last within each type, then creation order.
- `POST /categories`: `{ "name", "type", "icon"? }`. `name` is trimmed, 1 to 50 characters. Response `201`. Errors: `400` (also for `is_default`, `is_fallback`, or any unknown field), `409 CONFLICT` if the user already has a category with the same name (ignoring case) **of the same type**; the same name is allowed under the other type.
- `PATCH /categories/:id`: `{ "name"?, "icon"? }`, at least one; `icon: null` clears it. The `type` cannot be changed (`400`). Renaming to an existing name of the same type returns `409`. Renaming the fallback category returns `422 BUSINESS_RULE`; changing only its icon is allowed.
- `DELETE /categories/:id[?confirm=true]`: response `200` `{ "data": { "moved_transactions": 12 } }`. All transactions of the category (including those in the trash), its templates, and its recurring plans are moved to the fallback category of the same type, in the same database transaction. If transactions would be moved and `confirm=true` is missing, the server responds `422 CONFIRMATION_REQUIRED` with `{ "data": { "affected_transactions": 12 } }` and changes nothing. A category without transactions is deleted without confirmation (`moved_transactions: 0`). `confirm` accepts `true` or `false`; anything else returns `400`.
- The "Other" category (per type) cannot be renamed or deleted, even with `confirm=true`: `422 BUSINESS_RULE`.

---

## 6. Image Upload

### POST `/uploads/sign` 🔒

Requests a signature for direct upload to Cloudinary.
Request: `{ "count": 2 }` (1–5). Response `200`:

```json
{
  "data": {
    "cloud_name": "xxx",
    "api_key": "123",
    "timestamp": 1760000000,
    "folder": "financare/u1",
    "type": "authenticated",
    "allowed_formats": "jpg,png,heic",
    "max_bytes": 5242880,
    "signatures": [{ "public_id": "financare/u1/abc123", "signature": "..." }]
  }
}
```

- The signature is short-lived (± 10 minutes) and bound to `public_id`, `type`, and `folder`.
- The client uploads to `https://api.cloudinary.com/v1_1/<cloud_name>/image/upload`, then sends the resulting `public_id` to the transaction API.
- Images that are uploaded but never attached to a transaction are cleaned up by a scheduled job.

---

## 7. Transactions

| Method | Path                                | Description                                            |
| ------ | ----------------------------------- | ------------------------------------------------------ |
| GET    | `/transactions`                     | List + filters + search                                |
| POST   | `/transactions`                     | Create (income/outcome/transfer)                       |
| GET    | `/transactions/:id`                 | Detail + signed image URLs                             |
| PATCH  | `/transactions/:id`                 | Update                                                 |
| DELETE | `/transactions/:id`                 | Move to trash (`?permanent=true` for permanent delete) |
| GET    | `/transactions/trash`               | Trash contents                                         |
| POST   | `/transactions/:id/restore`         | Restore from trash                                     |
| POST   | `/transactions/:id/images`          | Add image                                              |
| DELETE | `/transactions/:id/images/:imageId` | Delete image                                           |
| PATCH  | `/transactions/:id/images/order`    | Reorder images                                         |

**Transaction object**
| Field | Type | Required | Rule |
|---|---|---|---|
| `type` | enum | Yes | `INCOME` / `OUTCOME` / `TRANSFER` |
| `name` | string | Yes | Max 100 characters |
| `amount` | int | Yes | > 0 |
| `date` | datetime | Yes | Must not be in the future; defaults to now |
| `account_id` | string | Yes | An active account owned by the user. For transfers = source |
| `to_account_id` | string | Transfer | Active account, not the same as the source |
| `admin_fee` | int | No | Transfers only, ≥ 0. Created as a linked outcome (`parent_transaction_id`) |
| `category_id` | string | No | Category type must match. Not applicable to transfers |
| `location` | string | No | |
| `note` | string | No | |
| `tags` | string[] | No | |
| `plan_id` | string | No | ID of a recurring/one-time plan |
| `template_id` | string | No | Write-only. ID of the template this transaction was created from; only used to increment the template's `use_count`. Not stored on the transaction |
| `images` | array | No | Max 5: `{ public_id, mime_type, size }` |
| `items` | array | No | Max 100, `INCOME`/`OUTCOME` only (`400` for `TRANSFER`). Each: `{ name (1–150), quantity (> 0, default 1, up to 3 decimals), unit? (≤ 20), total_price (int ≥ 0) }`. The array order is the display order. Informational: does not change `amount` or balances. The response also includes `items_total` (sum of `total_price`) so the client can show the difference from `amount` |
| `source` | enum | Read-only | `MANUAL` / `AUTO` |

### GET `/transactions`

Query: `from`, `to`, `type`, `account_id` (matches if source or destination), `category_id`, `q` (name/note), `tag`, `cursor`, `limit`. Order: `date` descending. Response: list of compact objects (no full image URLs and no items; only `images_count`, `items_count`, and `thumbnail_url`). The `q` search also matches item names.

### POST `/transactions`

Optional `Idempotency-Key` header. Response `201`:

```json
{
  "data": {
    "transaction": {
      "id": "t1",
      "type": "OUTCOME",
      "amount": 450000,
      "images": [
        { "id": "i1", "url": "https://res.cloudinary.com/.../s--sig--/..." }
      ]
    },
    "account_balance_after": 350000,
    "warnings": []
  }
}
```

For transfers, `account_balance_after` is replaced by `balances_after: { "<source>": ..., "<destination>": ... }`.

| Condition                            | Response                                                 |
| ------------------------------------ | -------------------------------------------------------- |
| Amount ≤ 0 / not an integer          | `400`                                                    |
| Future date                          | `422 BUSINESS_RULE` (suggestion: create a One-Time Plan) |
| Account archived / not owned by user | `422` / `404`                                            |
| Source = destination on transfer     | `400`                                                    |
| Images > 5                           | `422`                                                    |
| Balance would go negative            | `201` + warning `NEGATIVE_BALANCE`                       |

### GET `/transactions/:id`

Full object; `images[].url` is a signed Cloudinary URL with a short validity (± 1 hour).

### PATCH `/transactions/:id`

All fields optional (except `images`, which are managed through the image endpoints). `items`, when sent, **replaces the whole list** (send `[]` to remove all items; omit the field to leave them unchanged). The balances of all affected accounts (old and new) are recalculated within a single database transaction. For transfers, the linked admin fee is updated as well.

### DELETE `/transactions/:id`

Soft delete: `deleted_at` is set, the balance is restored immediately. Response `204`. A transfer carries its linked admin fee along. With `?permanent=true`, the transaction and Cloudinary images are permanently deleted. Transactions in the trash for more than 30 days are permanently deleted by a daily job.

### GET `/transactions/trash`

List of transactions with `deleted_at` and `permanent_delete_at`.

### POST `/transactions/:id/restore`

Response `200` transaction object. Errors: `404` if already permanently deleted; `422` if its account has been deleted.

### Images

- `POST /transactions/:id/images` — Request: `{ "public_id", "mime_type", "size" }`. Response `201` image object. Error `422` if the total is already 5.
- `DELETE /transactions/:id/images/:imageId` — Response `204`; the file on Cloudinary is deleted.
- `PATCH /transactions/:id/images/order` — Request: `{ "ids": ["i2", "i1"] }`. Response `200`.

---

## 8. Transaction Templates

Reusable presets for recording transactions quickly. A template stores transaction fields but never receipt images.

| Method | Path                    | Description                                               |
| ------ | ----------------------- | --------------------------------------------------------- |
| GET    | `/templates`            | List, most used first                                     |
| POST   | `/templates`            | Create (from scratch or from an existing transaction)     |
| GET    | `/templates/:id`        | Detail                                                    |
| PATCH  | `/templates/:id`        | Update                                                    |
| DELETE | `/templates/:id`        | Delete (transactions created from it are unaffected)      |
| POST   | `/templates/:id/record` | Record a transaction in one call, with optional overrides |

**Template object**
| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | Yes | 1–50 characters; unique per user (case-insensitive) |
| `type` | enum | Yes | `INCOME` / `OUTCOME` / `TRANSFER` |
| `transaction_name` | string | Yes | 1–100 characters; default name of the created transaction |
| `amount` | int? | No | > 0. Null = ask every time |
| `account_id` | string? | No | An active account owned by the user. Source account for transfers |
| `to_account_id` | string? | No | Transfers only; not the same as `account_id` |
| `category_id` | string? | No | Type must match. Not applicable to transfers |
| `location` | string? | No | |
| `note` | string? | No | Max 1,000 characters |
| `tags` | string[] | No | Max 10 |
| `use_count` | int | Read-only | Times a transaction was created from this template |
| `last_used_at` | datetime? | Read-only | |
| `missing` | string[] | Read-only | Fields still needed before a transaction can be recorded, e.g. `["amount", "account_id"]` |

There is no limit on the number of templates per user (MVP).

### GET `/templates`

Sorted by `use_count` descending, then `last_used_at` descending. Response `200`: list of template objects (including `missing`).

### POST `/templates`

Request, from scratch:

```json
{
  "name": "Office lunch",
  "type": "OUTCOME",
  "transaction_name": "Lunch",
  "amount": 35000,
  "account_id": "ACC002",
  "category_id": "CAT001"
}
```

Request, from an existing transaction:

```json
{ "name": "Monthly groceries", "source_transaction_id": "TRANS001" }
```

- With `source_transaction_id`, the server copies `type`, `name` (as `transaction_name`), `amount`, `account_id`, `to_account_id`, `category_id`, `location`, `note`, and `tags`. **Images are not copied**, and a transfer's admin fee is not copied. Any field sent in the same request overrides the copied value.
- The source transaction must belong to the user and not be in the trash (else `404`).
- Response `201`: template object. Errors: `400` (invalid fields), `409` (name already used), `422` (inactive account, category type mismatch).

### PATCH `/templates/:id`

All fields optional. Send `"amount": null` to make the amount ask-every-time. Response `200`. Errors: `409` (duplicate name), `422`.

### DELETE `/templates/:id`

Response `204`.

### POST `/templates/:id/record`

Records a transaction immediately from the template. Header `Idempotency-Key` supported.

Request (all optional overrides):

```json
{
  "amount": 38000,
  "date": "2026-11-14T05:00:00Z",
  "account_id": "ACC003",
  "category_id": null,
  "note": "With a drink"
}
```

- Overridable: `name`, `amount`, `date` (defaults to now, not in the future), `account_id`, `to_account_id`, `category_id`, `location`, `note`, `tags`. Images can be added afterwards through the transaction image endpoints.
- If the template and the overrides together still lack a required value (`amount`, `account_id`, or `to_account_id` for transfers), the response is `422 BUSINESS_RULE` with `data.missing` listing the fields. The app then opens the form prefilled and asks the user to complete it.
- The transaction goes through exactly the same validation and balance logic as `POST /transactions` (including the `NEGATIVE_BALANCE` warning).
- On success, `use_count` is incremented and `last_used_at` is set, in the same database transaction.
- Response `201`: same as `POST /transactions` (`transaction`, `account_balance_after` or `balances_after`, `warnings`).

**Without the one-tap endpoint:** the app can also prefill the form from `GET /templates` and submit a normal `POST /transactions` with `template_id` set, which only updates the usage counters.

---

## 9. Recurring Plans

| Method | Path                                                | Description                          |
| ------ | --------------------------------------------------- | ------------------------------------ |
| GET    | `/recurring-plans`                                  | List. Filter `status`                |
| POST   | `/recurring-plans`                                  | Create                               |
| GET    | `/recurring-plans/:id`                              | Detail + related transaction history |
| PATCH  | `/recurring-plans/:id`                              | Update (applies to the next period)  |
| DELETE | `/recurring-plans/:id`                              | Delete; past transactions remain     |
| POST   | `/recurring-plans/:id/pause`                        | Pause                                |
| POST   | `/recurring-plans/:id/resume`                       | Resume                               |
| POST   | `/recurring-plans/:id/occurrences/:dueDate/confirm` | "Already paid/received"              |
| POST   | `/recurring-plans/:id/occurrences/:dueDate/skip`    | Skip period                          |

**RecurringPlan object**
| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | Yes | |
| `type` | enum | Yes | `INCOME` / `OUTCOME` |
| `amount` | int | Yes | > 0 |
| `account_id` | string | Yes | |
| `category_id` | string | No | |
| `frequency` | enum | Yes | `DAILY` / `WEEKLY` / `MONTHLY` / `YEARLY` |
| `start_date` | date | Yes | Today or later |
| `end_date` | date? | No | After `start_date` |
| `reminder_offsets` | int[] | Yes | Subset of `[0, 1, 3, 7]` |
| `auto_record` | bool | No | Default `false` |
| `status` | enum | Read-only | `ACTIVE` / `PAUSED` / `ENDED` |
| `next_due_date` | date | Read-only | |

Rule for monthly/yearly due dates on the 29th–31st: moves to the last day of that month, with the original date from `start_date` remaining the reference.

### POST `.../occurrences/:dueDate/confirm`

Request (optional): `{ "amount": 360000, "date": "2026-12-01T05:00:00Z", "account_id"?: "..." }`. The `Idempotency-Key` header is supported. Response `201`:

```json
{
  "data": {
    "transaction": { "id": "t9", "plan_id": "rp1" },
    "next_due_date": "2027-01-01"
  }
}
```

Errors: `409 CONFLICT` if that period has already been confirmed/skipped/auto-recorded (the response includes the existing transaction); `422` if `dueDate` is not an active due date.

### POST `.../occurrences/:dueDate/skip`

Response `200`: `{ "data": { "next_due_date" } }`.

### POST `.../pause`, `/resume`

Response `200` plan object. On `resume`, `next_due_date` is calculated to the next upcoming date (it does not create backdated due dates).

---

## 10. One-Time Plans

| Method | Path                           | Description                         |
| ------ | ------------------------------ | ----------------------------------- |
| GET    | `/one-time-plans`              | List. Filter `status`               |
| POST   | `/one-time-plans`              | Create                              |
| GET    | `/one-time-plans/:id`          | Detail + funding sufficiency status |
| PATCH  | `/one-time-plans/:id`          | Update / reschedule                 |
| DELETE | `/one-time-plans/:id`          | Delete; related transactions remain |
| POST   | `/one-time-plans/:id/complete` | Complete                            |
| POST   | `/one-time-plans/:id/cancel`   | Cancel                              |

**OneTimePlan object**
| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | Yes | |
| `date` | date | Yes | Today or later |
| `target_amount` | int | Yes | > 0 |
| `source_account_id` | string? | No | Empty = use total balance |
| `location`, `note` | string? | No | |
| `reminder_offsets` | int[] | Yes | Subset of `[1, 3, 7, 14]`, more than one allowed |
| `status` | enum | Read-only | `PLANNED` / `DONE` / `MISSED` / `CANCELLED` |
| `funding` | object | Read-only | `{ available, shortfall, sufficient }` |

When `hide_balance` is active, the server still populates `funding` (hiding is done on the client), but notification content does not include balance figures.

### POST `/one-time-plans/:id/complete`

Request:

```json
{
  "create_transaction": true,
  "amount": 1420000,
  "account_id": "a1",
  "date": "2026-12-12T06:00:00Z"
}
```

With `create_transaction: true`, an outcome transaction is created (`plan_id` populated) within a single database transaction. Status becomes `DONE`. Response `200` `{ "data": { "plan", "transaction"? } }`. Errors: `422` if the status is `CANCELLED` or `DONE`.

### POST `/one-time-plans/:id/cancel`

Response `200`; reminders are stopped.

### PATCH `/one-time-plans/:id`

Changing `date` on a `MISSED` plan returns it to `PLANNED` and recalculates the reminders.

---

## 11. Reminders

| Method | Path                    | Description                                         |
| ------ | ----------------------- | --------------------------------------------------- |
| GET    | `/reminders`            | List. `status=pending` for the "Action needed" list |
| POST   | `/reminders/:id/snooze` | Snooze                                              |

Object: `{ "id", "plan_type": "RECURRING" | "ONE_TIME", "plan_id", "due_date", "scheduled_at", "sent_at", "channel", "status": "SCHEDULED" | "SENT" | "ACTED" | "SNOOZED" | "SKIPPED" | "FAILED" }`.

`POST /reminders/:id/snooze` — Request: `{ "minutes": 60 }` (15–1440). Response `200`.

---

## 12. Dashboard & Reports

| Method | Path                           | Description                               |
| ------ | ------------------------------ | ----------------------------------------- |
| GET    | `/dashboard`                   | All main screen data in a single call     |
| GET    | `/reports/outcome-by-category` | Query `from`, `to`                        |
| GET    | `/reports/monthly-trend`       | Query `months` (default 6)                |
| GET    | `/reports/account-flow`        | Query `from`, `to`, optional `account_id` |

### GET `/dashboard`

```json
{
  "data": {
    "total_balance": 3800000,
    "accounts": [
      { "id": "a1", "name": "BCA Salary", "current_balance": 3000000 }
    ],
    "month_summary": { "income": 8000000, "outcome": 4200000, "net": 3800000 },
    "recent_transactions": [],
    "upcoming_reminders": [
      {
        "plan_type": "ONE_TIME",
        "plan_id": "op1",
        "name": "Black Friday Shopping",
        "due": "2026-12-12",
        "funding": { "sufficient": false, "shortfall": 300000 }
      }
    ],
    "action_needed": []
  }
}
```

- `recent_transactions`: the 5 most recent. `upcoming_reminders`: the next 7 days.
- Transfers are not included in `month_summary`.

### Reports

- `outcome-by-category` → `[ { "category_id", "name", "total", "percent" } ]`
- `monthly-trend` → `[ { "month": "2026-11", "income", "outcome" } ]`
- `account-flow` → `[ { "account_id", "income", "outcome", "transfer_in", "transfer_out" } ]`

Transfers only appear in `account-flow`; admin fees are counted as outcome in the "Admin Fee" category.

---

## 13. Internal Endpoints (not for clients)

Triggered by the scheduler (cron/queue) and protected by an internal secret, not a user token.

| Task                      | Frequency    | Function                                                                                  |
| ------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| Send reminders            | Every minute | Sends due `Reminder`s; batched per user per day; retry with backoff                       |
| Auto-record               | Every minute | Creates transactions for `auto_record` recurring plans (unique per `plan_id + due_date`)  |
| Mark missed               | Daily        | `OneTimePlan`s past their date become `MISSED`                                            |
| Clean up trash            | Daily        | Permanently delete transactions in the trash > 30 days along with their Cloudinary images |
| Clean up orphan images    | Daily        | Delete images that were uploaded but not attached                                         |
| Clean up tokens           | Daily        | Delete expired refresh tokens                                                             |
| Balance consistency check | Periodic     | Compare computed balance against the cache if present                                     |
| Delete account            | Per queue    | Deletes user data and their Cloudinary folder                                             |

---

## 14. Data Model Additions Summary

Required beyond the main PRD entity list:

- `RefreshToken`: `id, user_id, family_id, token_hash, device_info, expires_at, revoked_at, replaced_by, created_at`
- `DeviceToken`: `id, user_id, token, platform, created_at`
- `Transaction`: add `parent_transaction_id` (transfer admin fee), `source` (`MANUAL`/`AUTO`), `deleted_at`, `tags`; unique `(plan_id, due_date)` for recurring plan transactions
- `User`: add `preferences.hide_balance`, `notification_preferences`
- `IdempotencyKey`: `key, user_id, response, created_at`
- `TransactionItem`: `id, transaction_id, name, quantity, unit, total_price, position, created_at`
- `TransactionTemplate`: `id, user_id, name, type, transaction_name, amount, account_id, to_account_id, category_id, location, note, tags, use_count, last_used_at`
