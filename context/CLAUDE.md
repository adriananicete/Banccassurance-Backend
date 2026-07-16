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

## Known Cross-Cutting Issues (not yet fixed, tracked here so they aren't rediscovered from scratch)

- **Frontend `vite/src/api/axios.js` has no `withCredentials: true`.** The backend now rejects unauthenticated requests (401) on protected routes, but the browser won't send the `auth_token` cookie cross-origin until a frontend dev adds this one line. Until then, protected flows will 401 from the real UI.
- **`getReferrals` (backend/src/controllers/referralController.js) trusts a client-supplied `req.body.user` object** (Role/UserCode/BranchCode/AreaCode) for hierarchy filtering instead of the verified `req.user` populated by `requireAuth`. `requireAuth` closes the "zero session" hole but an authenticated low-privilege user could still spoof a higher role/branch in the request body. Safe backend-only fast-follow: switch the filter source to `req.user`.
- **`GET /api/referrals` (mapped to `getReferrals`) is effectively dead** — the controller reads `req.body.user`, but GET requests carry no body from the real frontend. The actual UI always calls `POST /api/referrals/list` with `{ user }` in the body instead. Confirmed via live testing 2026-07-16.
- `backend/src/services/emailService.js` sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` process-wide (broad TLS-bypass) — kept as-is since it may be load-bearing for Graph API calls in this network, but should eventually be scoped to a dedicated `https.Agent` for just those requests.
