# Bancassurance Referral System

## Repo / Team Layout

Single repo holds both:
- `backend/` — Express + `mssql` API (ESM, entrypoint `backend/src/index.js`, port 5000)
- `vite/` — React frontend (Vite, port 3000)

A separate **DBA** works directly on the live UAT MSSQL database (`BANCASSURANCE_UAT_DB` on `192.5.5.142`) and its stored procedures (schema `banc`) — outside of git entirely. Backend and frontend work happens in the same repo, potentially concurrently by different people.

## Scope Boundaries

- Working backend-only: don't touch `vite/src/**`.
- Working frontend-only: don't touch `backend/src/**`.
- Never propose stored-procedure or schema changes without explicit DBA coordination — the SP layer is owned externally and may be actively in flux.

## Git Workflow

- One feature branch per unit of related work, cut from latest `main`. Never commit directly to `main`.
- **Hard stop rule (standing, non-negotiable):** never `git push`, merge a PR, or `git pull`/`merge` against `main` without the user explicitly reviewing and approving that specific action first — every time, not just once per session.

## Backend

- ESM modules (`"type": "module"` in `backend/package.json`), Express 4, `mssql` driver (raw SQL/stored-proc calls, no ORM).
- Secrets live in `backend/.env` (gitignored) — see `backend/.env.example` for required keys. `dotenv/config` is imported at the top of `backend/src/index.js`.
- Auth: OTP-based 2FA login issues a JWT in an httpOnly cookie (`auth_token`). `backend/src/middleware/auth.js` exports `requireAuth` (verifies the cookie) and `requireRole(...roles)` (checks `req.user.Role`), applied per-route in `backend/src/routes/*.js`.

### Layering convention (routes → controllers → services → models)

- `backend/src/routes/*.js` — Express routers, wire middleware (`requireAuth`/`requireRole`, `photoUpload`/`consentUpload` from `middleware/upload.js`) to controller functions. No logic here.
- `backend/src/controllers/*.js` — thin. Extract `req` params, call one service function, shape the `res` response. No direct `sql`/`bcrypt` imports — if a controller needs either, that logic belongs in a service/model instead. Request-shape validation that gates before any service call (GUID-format checks via `utils/validators.js`'s `isValidGuid`, file-presence checks) stays in the controller; everything else moves down a layer.
- `backend/src/services/*.js` — business logic + orchestration, one file per entity (`userService.js`, `referralService.js`, `notificationService.js`, plus the pre-existing `emailService.js` for outbound mail). Calls one or more model functions, does bcrypt/jwt/business-rule work, calls `emailService` where needed. **Throws `Error` on genuine failure** (optionally with a `.statusCode` property so the controller's catch block can pick the right HTTP status/message) — mirrors `emailService.js`'s existing throw-don't-catch convention. Business-rule outcomes that are still HTTP 200 today (e.g. "Invalid user", pending/deactivated account messages, `Success===0` branches) are returned as plain objects, not thrown.
- `backend/src/models/*.js` — one file per entity (`userModel.js`, `referralModel.js`, `notificationModel.js`). Every exported function builds a `sql.Request` with all its `.input(...)` calls and returns `{ request, run }`, where `run` is a zero-arg thunk that calls `.execute(spName)` or `.query(sqlText)` — never executes eagerly. This shape is what lets tests stub `request.execute`/`.query` before calling `.run()` without touching the live DB. Service call sites are always `await someModelFn(args).run()`.
- Cross-entity writes stay honest about it: e.g. `referralService.updateReferralStatus` imports `notificationModel` directly (not `notificationService`) to insert the staff alert row, since that's a Referrals-flow-triggered write to the Notifications table, not a notification-domain-initiated action.
- No behavior was intentionally changed during this refactor (completed 2026-07-16) — every write-path function was verified via a stubbed-`execute`/`.query()` isolated test (never against the live UAT DB) to confirm identical `.input()` parameters and identical response shapes before/after.

## Known Cross-Cutting Issues (not yet fixed, tracked here so they aren't rediscovered from scratch)

- **Frontend `vite/src/api/axios.js` has no `withCredentials: true`.** The backend now rejects unauthenticated requests (401) on protected routes, but the browser won't send the `auth_token` cookie cross-origin until a frontend dev adds this one line. Until then, protected flows will 401 from the real UI.
- **`getReferrals` (backend/src/controllers/referralController.js) trusts a client-supplied `req.body.user` object** (Role/UserCode/BranchCode/AreaCode) for hierarchy filtering instead of the verified `req.user` populated by `requireAuth`. `requireAuth` closes the "zero session" hole but an authenticated low-privilege user could still spoof a higher role/branch in the request body. Safe backend-only fast-follow: switch the filter source to `req.user`.
- **`GET /api/referrals` (mapped to `getReferrals`) is effectively dead** — the controller reads `req.body.user`, but GET requests carry no body from the real frontend. The actual UI always calls `POST /api/referrals/list` with `{ user }` in the body instead. Confirmed via live testing 2026-07-16.
- `backend/src/services/emailService.js` sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` process-wide (broad TLS-bypass) — kept as-is since it may be load-bearing for Graph API calls in this network, but should eventually be scoped to a dedicated `https.Agent` for just those requests.
