# PRD Financare: API Endpoint Specification

REST API endpoint reference (Express). User flows and sequence diagrams are in [`user_flow.md`](./user_flow.md); this document contains the API contract.

## 1. Conventions

| Item | Rule |
|---|---|
| Base URL | `/api/v1` |
| Format | JSON, `Content-Type: application/json` |
| Authentication | `Authorization: Bearer <access_token>` (JWT, 15 minutes). Endpoints marked 🔓 are public, the rest are 🔒 login required |
| Amount | IDR integer without decimals (`1500000`) |
| Date | ISO 8601 UTC for timestamps (`2026-11-13T01:00:00Z`); `YYYY-MM-DD` for pure dates (due date, plan date) |
| ID | UUID |
| Ownership | All data is scoped by the `user_id` from the token. Data belonging to other users returns `404` |
| Pagination | `?cursor=<id>&limit=20` (max 100). The response includes `pagination.next_cursor` (null when exhausted) |
| Idempotency | The `Idempotency-Key` header (UUID) is supported on `POST /transactions` and `POST .../confirm`; the same key within 24 hours returns the first result |
| Rate limit | Auth: 5 attempts/minute/IP. Others: 120 requests/minute/user |

**Response envelope (ServerCN format)**

All responses follow the standard ServerCN `ApiResponse` / `ApiError` shape (`success`, `message`, `statusCode`), implemented with the ServerCN `response-formatter`, `error-handler`, `global-error-handler`, and `request-validator` components.

Success:
```json
{
  "success": true,
  "message": "Transaction created",
  "statusCode": 201,
  "data": { }
}
```

List (cursor pagination):
```json
{
  "success": true,
  "message": "Transactions fetched",
  "statusCode": 200,
  "data": [ ],
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

| Field | Present | Notes |
|---|---|---|
| `success` | Always | `true` / `false` |
| `message` | Always | Human-readable, safe to show in the app |
| `statusCode` | Always | Same value as the HTTP status |
| `data` | Success with payload | The resource, or `{ }`. Omitted when there is nothing to return |
| `errors` | Validation errors | Map of field name to an array of messages (Zod `flatten().fieldErrors`) |
| `stack` | Development only | Included when `NODE_ENV=development`; never in production |
| `code` | Errors (project extension) | Machine-readable code from the table below. Not part of stock ServerCN: add it to `ApiError` so the app can branch on it (e.g. `TOKEN_EXPIRED` triggers a refresh) |
| `pagination` | Lists (project extension) | `next_cursor` is `null` when exhausted |

Notes:
- Examples elsewhere in this document and in `user_flow.md` write responses as `{ "data": ... }` for brevity. The real response always includes `success`, `message`, and `statusCode` around it.
- The stock ServerCN error handler only copies `message` (and `stack` in development) to the body. The project's `error-handler` must also pass through `statusCode`, `code`, and `errors`.
- Responses documented as `204` have no body.

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid input (`errors` is filled) |
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token is missing, incorrect, or expired |
| 404 | `NOT_FOUND` | Not found, or belongs to another user |
| 409 | `CONFLICT` | Conflict (email already registered, duplicate confirmation) |
| 422 | `BUSINESS_RULE` | Violates a business rule (future date, archived account, etc.) |
| 422 | `CONFIRMATION_REQUIRED` | User confirmation needed; repeat with `"confirm": true`. The preview is returned in `data` |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

**Non-fatal warnings** are returned in `data.warnings[]` on a successful response, for example `{ "code": "NEGATIVE_BALANCE", "balance_after": -150000 }`.

---

## 2. Auth

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | Register, logged in immediately |
| POST | `/auth/login` | 🔓 | Sign in |
| POST | `/auth/refresh` | 🔓 | Exchange refresh token (rotated) |
| POST | `/auth/logout` | 🔓 | Revoke this device's session |
| POST | `/auth/logout-all` | 🔒 | Revoke all sessions |
| POST | `/auth/forgot-password` | 🔓 | Send reset email |
| POST | `/auth/reset-password` | 🔓 | Set a new password with a token |

### POST `/auth/register`
Request:
```json
{ "name": "Apri", "email": "apri@mail.com", "password": "secret123", "timezone": "Asia/Makassar", "device": { "platform": "ANDROID", "name": "Pixel 7" } }
```
| Field | Required | Rule |
|---|---|---|
| `name` | Yes | 1–100 characters |
| `email` | Yes | Email format, stored lowercase, unique |
| `password` | Yes | Min. 8 characters |
| `timezone` | Yes | IANA name, default `Asia/Jakarta` |
| `device` | No | `platform` (`ANDROID`/`IOS`), `name` |

Response `201`:
```json
{ "data": { "user": { "id": "u1", "name": "Apri", "email": "apri@mail.com", "timezone": "Asia/Makassar" }, "access_token": "eyJ...", "access_expires_in": 900, "refresh_token": "rt_..." } }
```
Errors: `400`, `409` (email already registered), `429`. Side effect: creates the default categories.

### POST `/auth/login`
Request: `{ "email", "password", "device" }`. Response `200`: same as register. Errors: `401` (generic message), `429` (5 failures within 15 minutes).

### POST `/auth/refresh`
Request: `{ "refresh_token": "rt_..." }`. Response `200`: `{ "access_token", "access_expires_in", "refresh_token" }` (new token, the old one is revoked). Errors: `401` if the token is invalid, expired, or reused (the entire derived session family is revoked).

### POST `/auth/logout`
Request: `{ "refresh_token" }`. Response `204`.

### POST `/auth/logout-all`
Response `204`.

### POST `/auth/forgot-password`
Request: `{ "email" }`. Response is always `202` (does not leak whether the email exists). The token is valid for 30 minutes, single use.

### POST `/auth/reset-password`
Request: `{ "token", "new_password" }`. Response `204`; all of the user's refresh tokens are revoked. Errors: `400` (invalid/expired token, weak password).

---

## 3. Profile & Devices

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/me` | 🔒 | Profile + preferences |
| PATCH | `/me` | 🔒 | Update name, timezone |
| POST | `/me/password` | 🔒 | Change password |
| PATCH | `/me/notification-preferences` | 🔒 | Send time, quiet hours, channels |
| PATCH | `/me/preferences` | 🔒 | Display preferences (`hide_balance`) |
| DELETE | `/me` | 🔒 | Delete account and all data |
| POST | `/devices` | 🔒 | Register push token |
| DELETE | `/devices/:id` | 🔒 | Remove device |

### GET `/me`
```json
{ "data": { "id": "u1", "name": "Apri", "email": "apri@mail.com", "timezone": "Asia/Makassar",
  "preferences": { "hide_balance": false },
  "notification_preferences": { "send_time": "08:00", "quiet_hours": { "start": "22:00", "end": "07:00" }, "push": true, "email_fallback": false } } }
```

### PATCH `/me`
Request: `{ "name"?, "timezone"? }`. Response `200` with the updated profile. Changing `timezone` recalculates the schedule of reminders that have not yet been sent.

### POST `/me/password`
Request: `{ "current_password", "new_password" }`. Response `204`. All other sessions are revoked. Errors: `401` if the old password is wrong.

### PATCH `/me/notification-preferences`
Request (all optional): `{ "send_time": "08:00", "quiet_hours": { "start", "end" } | null, "push": true, "email_fallback": true }`. Response `200`.

### PATCH `/me/preferences`
Request: `{ "hide_balance": true }`. Response `200`: `{ "data": { "hide_balance": true } }`. This value affects notification content (no balance figures).

### DELETE `/me`
Request: `{ "password" }`. Response `202`. Data and Cloudinary images are deleted by a background job.

### POST `/devices`
Request: `{ "platform": "ANDROID" | "IOS", "push_token": "..." }`. Response `201`: `{ "data": { "id" } }`. The same token is updated (upsert).

---

## 4. Account

| Method | Path | Description |
|---|---|---|
| GET | `/accounts` | List + total balance |
| POST | `/accounts` | Create |
| GET | `/accounts/:id` | Detail |
| PATCH | `/accounts/:id` | Update |
| DELETE | `/accounts/:id` | Delete (only if it has no transactions) |
| POST | `/accounts/:id/archive` | Archive |
| POST | `/accounts/:id/unarchive` | Reactivate |

**Account object**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | |
| `name` | string | Required, 1–50 characters |
| `type` | enum | `BANK` / `EWALLET` / `CASH` |
| `institution` | string? | Empty for Cash |
| `initial_balance` | int | Default 0, may be negative |
| `current_balance` | int | Computed: `initial + income − outcome + incoming transfers − outgoing transfers` (read-only) |
| `last4` | string? | Exactly 4 digits |
| `color`, `icon` | string? | |
| `include_in_total` | bool | Default `true` |
| `status` | enum | `ACTIVE` / `ARCHIVED` |

### GET `/accounts`
Query: `status` (`ACTIVE` default, `ARCHIVED`, `ALL`). Response:
```json
{ "data": { "total_balance": 3800000, "accounts": [ { "id": "a1", "name": "BCA Salary", "type": "BANK", "current_balance": 3000000, "include_in_total": true, "status": "ACTIVE" } ] } }
```
`total_balance` only counts `ACTIVE` accounts with `include_in_total = true`.

### POST `/accounts`
Request: the object fields above except `id`, `current_balance`, `status`. Response `201` full object. Errors: `400`.

### PATCH `/accounts/:id`
All fields optional. Changing `initial_balance` on an account that already has transactions returns `422 CONFIRMATION_REQUIRED` with `{ "preview": { "old_balance", "new_balance" } }`; repeat with `"confirm": true`.

### DELETE `/accounts/:id`
Response `204`. Errors: `422 BUSINESS_RULE` if transactions exist (including those in the trash).

### POST `/accounts/:id/archive`, `/unarchive`
Response `200` Account object. Archiving removes the balance from the total; active plans that use this account are flagged `needs_account_change`.

---

## 5. Categories

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List. Filter `type` |
| POST | `/categories` | Create |
| PATCH | `/categories/:id` | Update name/icon |
| DELETE | `/categories/:id` | Delete; transactions are moved to "Other" |

Object: `{ "id", "name", "type": "INCOME" | "OUTCOME", "icon", "is_default" }`.

- `DELETE`: response `200` `{ "data": { "moved_transactions": 12 } }`. Without `?confirm=true`, the server responds `422 CONFIRMATION_REQUIRED` with the number of affected transactions.
- The "Other" category (per type) cannot be renamed or deleted: `422 BUSINESS_RULE`.

---

## 6. Image Upload

### POST `/uploads/sign` 🔒
Requests a signature for direct upload to Cloudinary.
Request: `{ "count": 2 }` (1–5). Response `200`:
```json
{ "data": { "cloud_name": "xxx", "api_key": "123", "timestamp": 1760000000, "folder": "financare/u1", "type": "authenticated",
  "allowed_formats": "jpg,png,heic", "max_bytes": 5242880, "signatures": [ { "public_id": "financare/u1/abc123", "signature": "..." } ] } }
```
- The signature is short-lived (± 10 minutes) and bound to `public_id`, `type`, and `folder`.
- The client uploads to `https://api.cloudinary.com/v1_1/<cloud_name>/image/upload`, then sends the resulting `public_id` to the transaction API.
- Images that are uploaded but never attached to a transaction are cleaned up by a scheduled job.

---

## 7. Transactions

| Method | Path | Description |
|---|---|---|
| GET | `/transactions` | List + filters + search |
| POST | `/transactions` | Create (income/outcome/transfer) |
| GET | `/transactions/:id` | Detail + signed image URLs |
| PATCH | `/transactions/:id` | Update |
| DELETE | `/transactions/:id` | Move to trash (`?permanent=true` for permanent delete) |
| GET | `/transactions/trash` | Trash contents |
| POST | `/transactions/:id/restore` | Restore from trash |
| POST | `/transactions/:id/images` | Add image |
| DELETE | `/transactions/:id/images/:imageId` | Delete image |
| PATCH | `/transactions/:id/images/order` | Reorder images |

**Transaction object**
| Field | Type | Required | Rule |
|---|---|---|---|
| `type` | enum | Yes | `INCOME` / `OUTCOME` / `TRANSFER` |
| `name` | string | Yes | Max 100 characters |
| `amount` | int | Yes | > 0 |
| `date` | datetime | Yes | Must not be in the future; defaults to now |
| `account_id` | uuid | Yes | An active account owned by the user. For transfers = source |
| `to_account_id` | uuid | Transfer | Active account, not the same as the source |
| `admin_fee` | int | No | Transfers only, ≥ 0. Created as a linked outcome (`parent_transaction_id`) |
| `category_id` | uuid | No | Category type must match. Not applicable to transfers |
| `location` | string | No | |
| `note` | string | No | |
| `tags` | string[] | No | |
| `plan_id` | uuid | No | ID of a recurring/one-time plan |
| `images` | array | No | Max 5: `{ public_id, mime_type, size }` |
| `source` | enum | Read-only | `MANUAL` / `AUTO` |

### GET `/transactions`
Query: `from`, `to`, `type`, `account_id` (matches if source or destination), `category_id`, `q` (name/note), `tag`, `cursor`, `limit`. Order: `date` descending. Response: list of compact objects (no full image URLs; only `images_count` and `thumbnail_url`).

### POST `/transactions`
Optional `Idempotency-Key` header. Response `201`:
```json
{ "data": { "transaction": { "id": "t1", "type": "OUTCOME", "amount": 450000, "images": [ { "id": "i1", "url": "https://res.cloudinary.com/.../s--sig--/..." } ] },
  "account_balance_after": 350000, "warnings": [] } }
```
For transfers, `account_balance_after` is replaced by `balances_after: { "<source>": ..., "<destination>": ... }`.

| Condition | Response |
|---|---|
| Amount ≤ 0 / not an integer | `400` |
| Future date | `422 BUSINESS_RULE` (suggestion: create a One-Time Plan) |
| Account archived / not owned by user | `422` / `404` |
| Source = destination on transfer | `400` |
| Images > 5 | `422` |
| Balance would go negative | `201` + warning `NEGATIVE_BALANCE` |

### GET `/transactions/:id`
Full object; `images[].url` is a signed Cloudinary URL with a short validity (± 1 hour).

### PATCH `/transactions/:id`
All fields optional (except `images`, which are managed through the image endpoints). The balances of all affected accounts (old and new) are recalculated within a single database transaction. For transfers, the linked admin fee is updated as well.

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

## 8. Recurring Plans

| Method | Path | Description |
|---|---|---|
| GET | `/recurring-plans` | List. Filter `status` |
| POST | `/recurring-plans` | Create |
| GET | `/recurring-plans/:id` | Detail + related transaction history |
| PATCH | `/recurring-plans/:id` | Update (applies to the next period) |
| DELETE | `/recurring-plans/:id` | Delete; past transactions remain |
| POST | `/recurring-plans/:id/pause` | Pause |
| POST | `/recurring-plans/:id/resume` | Resume |
| POST | `/recurring-plans/:id/occurrences/:dueDate/confirm` | "Already paid/received" |
| POST | `/recurring-plans/:id/occurrences/:dueDate/skip` | Skip period |

**RecurringPlan object**
| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | Yes | |
| `type` | enum | Yes | `INCOME` / `OUTCOME` |
| `amount` | int | Yes | > 0 |
| `account_id` | uuid | Yes | |
| `category_id` | uuid | No | |
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
{ "data": { "transaction": { "id": "t9", "plan_id": "rp1" }, "next_due_date": "2027-01-01" } }
```
Errors: `409 CONFLICT` if that period has already been confirmed/skipped/auto-recorded (the response includes the existing transaction); `422` if `dueDate` is not an active due date.

### POST `.../occurrences/:dueDate/skip`
Response `200`: `{ "data": { "next_due_date" } }`.

### POST `.../pause`, `/resume`
Response `200` plan object. On `resume`, `next_due_date` is calculated to the next upcoming date (it does not create backdated due dates).

---

## 9. One-Time Plans

| Method | Path | Description |
|---|---|---|
| GET | `/one-time-plans` | List. Filter `status` |
| POST | `/one-time-plans` | Create |
| GET | `/one-time-plans/:id` | Detail + funding sufficiency status |
| PATCH | `/one-time-plans/:id` | Update / reschedule |
| DELETE | `/one-time-plans/:id` | Delete; related transactions remain |
| POST | `/one-time-plans/:id/complete` | Complete |
| POST | `/one-time-plans/:id/cancel` | Cancel |

**OneTimePlan object**
| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | Yes | |
| `date` | date | Yes | Today or later |
| `target_amount` | int | Yes | > 0 |
| `source_account_id` | uuid? | No | Empty = use total balance |
| `location`, `note` | string? | No | |
| `reminder_offsets` | int[] | Yes | Subset of `[1, 3, 7, 14]`, more than one allowed |
| `status` | enum | Read-only | `PLANNED` / `DONE` / `MISSED` / `CANCELLED` |
| `funding` | object | Read-only | `{ available, shortfall, sufficient }` |

When `hide_balance` is active, the server still populates `funding` (hiding is done on the client), but notification content does not include balance figures.

### POST `/one-time-plans/:id/complete`
Request:
```json
{ "create_transaction": true, "amount": 1420000, "account_id": "a1", "date": "2026-12-12T06:00:00Z" }
```
With `create_transaction: true`, an outcome transaction is created (`plan_id` populated) within a single database transaction. Status becomes `DONE`. Response `200` `{ "data": { "plan", "transaction"? } }`. Errors: `422` if the status is `CANCELLED` or `DONE`.

### POST `/one-time-plans/:id/cancel`
Response `200`; reminders are stopped.

### PATCH `/one-time-plans/:id`
Changing `date` on a `MISSED` plan returns it to `PLANNED` and recalculates the reminders.

---

## 10. Reminders

| Method | Path | Description |
|---|---|---|
| GET | `/reminders` | List. `status=pending` for the "Action needed" list |
| POST | `/reminders/:id/snooze` | Snooze |

Object: `{ "id", "plan_type": "RECURRING" | "ONE_TIME", "plan_id", "due_date", "scheduled_at", "sent_at", "channel", "status": "SCHEDULED" | "SENT" | "ACTED" | "SNOOZED" | "SKIPPED" | "FAILED" }`.

`POST /reminders/:id/snooze` — Request: `{ "minutes": 60 }` (15–1440). Response `200`.

---

## 11. Dashboard & Reports

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | All main screen data in a single call |
| GET | `/reports/outcome-by-category` | Query `from`, `to` |
| GET | `/reports/monthly-trend` | Query `months` (default 6) |
| GET | `/reports/account-flow` | Query `from`, `to`, optional `account_id` |

### GET `/dashboard`
```json
{ "data": {
  "total_balance": 3800000,
  "accounts": [ { "id": "a1", "name": "BCA Salary", "current_balance": 3000000 } ],
  "month_summary": { "income": 8000000, "outcome": 4200000, "net": 3800000 },
  "recent_transactions": [ ],
  "upcoming_reminders": [ { "plan_type": "ONE_TIME", "plan_id": "op1", "name": "Black Friday Shopping", "due": "2026-12-12", "funding": { "sufficient": false, "shortfall": 300000 } } ],
  "action_needed": [ ]
} }
```
- `recent_transactions`: the 5 most recent. `upcoming_reminders`: the next 7 days.
- Transfers are not included in `month_summary`.

### Reports
- `outcome-by-category` → `[ { "category_id", "name", "total", "percent" } ]`
- `monthly-trend` → `[ { "month": "2026-11", "income", "outcome" } ]`
- `account-flow` → `[ { "account_id", "income", "outcome", "transfer_in", "transfer_out" } ]`

Transfers only appear in `account-flow`; admin fees are counted as outcome in the "Admin Fee" category.

---

## 12. Internal Endpoints (not for clients)

Triggered by the scheduler (cron/queue) and protected by an internal secret, not a user token.

| Task | Frequency | Function |
|---|---|---|
| Send reminders | Every minute | Sends due `Reminder`s; batched per user per day; retry with backoff |
| Auto-record | Every minute | Creates transactions for `auto_record` recurring plans (unique per `plan_id + due_date`) |
| Mark missed | Daily | `OneTimePlan`s past their date become `MISSED` |
| Clean up trash | Daily | Permanently delete transactions in the trash > 30 days along with their Cloudinary images |
| Clean up orphan images | Daily | Delete images that were uploaded but not attached |
| Clean up tokens | Daily | Delete expired refresh tokens |
| Balance consistency check | Periodic | Compare computed balance against the cache if present |
| Delete account | Per queue | Deletes user data and their Cloudinary folder |

---

## 13. Data Model Additions Summary

Required beyond the main PRD entity list:
- `RefreshToken`: `id, user_id, family_id, token_hash, device_info, expires_at, revoked_at, replaced_by, created_at`
- `DeviceToken`: `id, user_id, token, platform, created_at`
- `Transaction`: add `parent_transaction_id` (transfer admin fee), `source` (`MANUAL`/`AUTO`), `deleted_at`, `tags`; unique `(plan_id, due_date)` for recurring plan transactions
- `User`: add `preferences.hide_balance`, `notification_preferences`
- `IdempotencyKey`: `key, user_id, response, created_at`
