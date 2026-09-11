# Abiz — WhatsApp Inbox

Multi-tenant WhatsApp Business inbox for small businesses. Next.js frontend,
Express API, Supabase Postgres — deployed as a single Netlify site.

```
abiz software/
  web/         Next.js 16 (App Router), Tailwind v4, shadcn/ui
  server/      Express 5, Postgres, Netlify function wrapper
  UIUX.md      design spec (layout, tokens, screens)
  requirment.md
```

## Run it

Two terminals.

```bash
# 1. API  -> http://localhost:4000
cd server
cp .env.example .env      # set JWT_SECRET
npm install
npm run dev

# 2. Web  -> http://localhost:3000 (or 3001 if 3000 is taken)
cd web
npm install
npm run dev
```

`web/.env.local` must point at the API:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Open `/login` and create an account — you land on the onboarding flow.

## Accounts

Every visitor signs in. There is no anonymous access: each account owns its own
company, and every query is scoped by `company_id`, so two businesses can never
see each other's contacts or messages.

The dev server seeds one admin from `SEED_ADMIN_LOGIN` / `SEED_ADMIN_PASSWORD`
(defaults `admin` / `admin123`) and prints it on boot. Admins land on `/admin`;
everyone else lands on their inbox. Seeding refuses to run when
`NODE_ENV=production`.

**Password reset.** `POST /api/auth/forgot-password` issues a single-use token
that expires after `RESET_TOKEN_TTL_MINUTES` (default 30). Only the SHA-256
hash is stored, requesting a new link invalidates the previous one, and the
response is identical for known and unknown addresses so accounts cannot be
enumerated. Email delivery is not wired yet: in development the reset URL comes
back in the response (`devResetUrl`) and the UI navigates straight to it; in
production the link is logged and the token is never returned — plug an email
provider in at that point in `server/src/routes/auth.ts`.

## Database

No install and no container needed for local work: with `DATABASE_URL` empty
the API runs **PGlite**, an embedded Postgres, storing data in
`server/.data/pgdata`. Migrations in `server/src/db/migrations/` run
automatically on boot.

For staging and production set a real connection string and the same code
switches to `node-postgres`. Use Supabase's **session pooler** host — the
direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from most
networks, including Netlify's build and function runtimes:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Percent-encode the password (`%` → `%25`, `@` → `%40`). Delete `server/.data/`
to reset local data.

Migrations are embedded into the bundle at build time by
`server/scripts/gen-migrations.mjs`, because `tsc` does not copy `.sql` files
into `dist/` and a bundled serverless function has no migrations directory at
all. `npm run migrate` applies anything not yet recorded in
`schema_migrations`.

## No realtime

Messages are fetched when a page loads, not pushed. There is no Socket.IO
server and no open connection to keep alive — that is what lets the whole API
run as a serverless function rather than a process that must stay up.

## WhatsApp drivers

`WHATSAPP_DRIVER` decides where outbound messages go.

| Value | Behaviour |
|-------|-----------|
| `mock` (default) | Messages stay inside Abiz. `POST /api/dev/inbound` plays the customer's side, so the whole loop — inbound, auto-welcome, unread badge — works with no Meta account. |
| `cloud` | Real Meta Cloud API calls using the token and Phone Number ID saved in Settings. |

Under `cloud`, Meta's **24-hour customer service window** is enforced: free-form
replies are rejected once 24h have passed since the customer's last inbound
message, and the composer shows the closed-window banner. Under `mock` the
window stays open so new conversations can be started in development.

## Billing and plans

Two plans are on sale, both charged through Razorpay Checkout:

| Code | Price | Term |
|------|-------|------|
| `monthly` | ₹1,999 | 30 days |
| `lifetime` | ₹14,999 | one time, never expires |

There is **no free trial** (`TRIAL_DAYS=0`): a new account can read its inbox
but cannot send until it is paid for.

Neither plan auto-charges. Abiz uses the Razorpay **Orders** API, not
Subscriptions with an e-mandate, so a monthly term simply ends —
`getSubscription` settles the row to `EXPIRED` on the next read and the
customer chooses whether to pay again. No UI copy may promise automatic
renewal.

Rules enforced server-side in `server/src/services/billing.ts`:

- The amount is always read from the `plans` table using the submitted plan
  **code**. A tampered client cannot buy lifetime at the monthly price.
- A running term blocks a renewal of the same kind, but **not** an upgrade to
  lifetime — that is a genuine upgrade, and capturing it clears `expires_at`.
- An account already on lifetime refuses all further checkout.
- Platform admins operate Abiz rather than subscribe to it, so billing is
  hidden for them (`billable: false`).

`GET /api/billing/status` returns every plan with its own availability window,
so the picker can disable one option and leave the other open.

Payment is confirmed twice over: the browser callback signature
(HMAC-SHA256 of `<order_id>|<payment_id>`, compared in constant time) and the
webhook, which is signed with `RAZORPAY_WEBHOOK_SECRET` over the exact bytes
received. The secret in Netlify must match what was typed into the Razorpay
webhook form — a mismatch rejects real webhooks silently while the browser
callback still works.

## Attachments

Images, video, voice notes, and documents, both directions. Size caps mirror
Meta's: image 5 MB, video and audio 16 MB, document 100 MB.

`STORAGE_DRIVER` decides where the bytes go:

| Value | Behaviour |
|-------|-----------|
| `local` (default) | `server/.data/uploads/<company_id>/`. Development only — most hosts wipe the disk on redeploy and two instances cannot share it. |
| `supabase` | Supabase Storage bucket. Survives deploys, works across instances. |

Either way files are served only through `GET /api/media/:id`, scoped to the
caller's company — another tenant's media id returns 404. Keep the Supabase
bucket **private**; the API streams the bytes after checking the session, so a
public bucket would hand out every customer's photos to anyone with the URL.

Under `WHATSAPP_DRIVER=cloud`, sending uploads the bytes to Meta's `/media`
endpoint first, then sends a message referencing the returned media id.

## Supabase setup

Supabase covers both the database and attachment storage.

1. **Database** — Project Settings → Database → *Session pooler* connection
   string, into `DATABASE_URL`. Migrations run automatically on boot.
2. **Storage** — Storage → New bucket → name `attachments`, **not** public.
3. **Keys** — Project Settings → API. Copy the project URL and the
   `service_role` key:

```
STORAGE_DRIVER=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SUPABASE_STORAGE_BUCKET=attachments
```

The `service_role` key bypasses row level security. It belongs on the server
only — never in `NEXT_PUBLIC_*`, never in the browser bundle, never committed.

## Secrets at rest

WhatsApp access tokens are encrypted with AES-256-GCM before they reach the
database — random IV per value, auth tag appended, stored as
`v1.<iv>.<tag>.<ciphertext>`. The key comes from `ENCRYPTION_KEY`.

The browser never receives a token, only a `••••1234` hint. Values written
before encryption existed are read back as-is and re-encrypted the next time
they are saved.

Rotating `ENCRYPTION_KEY` makes existing tokens unreadable — they have to be
re-entered.

## Connection status

`connected` is only ever written after Meta confirms the credentials. Saving
the form runs two checks:

1. **Shape** — the number must be valid E.164, the Phone Number ID must be
   digits only (it is Meta's numeric ID, not the phone number), the access
   token must be at least 20 characters, and the verify token at least 8.
   Failures come back per-field and render under the inputs.
2. **Live** — `GET /<phone_number_id>?fields=display_phone_number,verified_name,
   quality_rating` with the token. Success stores Meta's own copy of the number
   plus the verified business name; failure stores Meta's error message and
   leaves the status `disconnected`.

Under `WHATSAPP_DRIVER=mock` there is nothing to ask, so the status stays
`pending` and the UI says the credentials were not verified — it never claims a
connection it cannot prove. Migration `005` resets any row previously marked
connected under the old behaviour.

"Test connection" in Settings re-runs the check on demand. The webhook
handshake independently flips the status to `connected` when Meta calls back
with the right verify token.

Numbers connected through Meta's Embedded Signup are also **registered** for
the Cloud API with a generated 6-digit PIN. An unregistered number cannot send
at all, so the connect flow surfaces a registration warning ahead of a webhook
one.

## When the welcome message fires

Only on the **first inbound message of a conversation the customer started**.

- Customer messages you first → welcome sends automatically.
- You message the customer first → no welcome, then or later. Sending marks the
  conversation as already greeted, so their eventual reply does not trigger a
  belated "thank you for contacting us".
- It never fires twice, and a delivery failure still marks it done rather than
  retrying forever.

## Deploying

One Netlify site serves both halves, so the session cookie is first-party and
there is no CORS preflight on every request. See `netlify.toml`:

- **Frontend** — `web/out`, a static export of the Next.js app.
- **API** — the whole Express app wrapped by `serverless-http` as a single
  Netlify **v2 ESM** function (`server/netlify/functions/api.mjs`), which
  claims `/api/*` and `/health` through its own `export const config`. A
  Lambda-style `export const handler` makes Netlify emit a CJS wrapper and the
  function fails with `ERR_REQUIRE_ESM`.
- **Build** — `npm ci` must run **without** `NODE_ENV=production`, or npm skips
  the devDependencies that hold TypeScript and Tailwind; hence `--include=dev`.
  The Next build itself then runs with `NODE_ENV=production`, because a stray
  `development` builds React in dev mode and crashes prerendering.
- **Webhook** — point Meta at `https://<site>/api/whatsapp/webhook` and use the
  verify token from Settings. Point Razorpay at
  `https://<site>/api/billing/webhook`.

Continuous deployment is driven by pushes to `main`. If a push does not produce
a deploy, the site's Git integration has come unlinked — reconnect it under
Project configuration → Build & deploy → Continuous deployment, and check that
builds are not stopped.

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` `/login` `/logout` | session (httpOnly cookie) |
| GET | `/api/auth/me` | current user + company |
| POST | `/api/auth/change-password` | change while signed in |
| POST | `/api/auth/forgot-password` `/reset-password` | reset by emailed token |
| POST | `/api/auth/meta/start` `/callback` | Meta Embedded Signup |
| GET | `/api/conversations` | list, `?folder=all\|unread\|archived&search=` |
| POST | `/api/conversations` | start or reuse a chat by phone number |
| GET | `/api/conversations/:id/messages` | thread + send-window state |
| POST | `/api/conversations/:id/messages` | send text |
| POST | `/api/conversations/:id/media` | send an attachment (multipart `file` + `caption`) |
| GET | `/api/media/:id` | stream an attachment (session-scoped) |
| POST | `/api/conversations/:id/read` `/archive` | list state |
| GET/POST/PATCH/DELETE | `/api/contacts` | contact CRUD |
| GET/PUT | `/api/settings` `/company` `/whatsapp` `/welcome` `/profile` | settings |
| POST | `/api/settings/whatsapp/test` | re-check credentials with Meta |
| GET | `/api/settings/stats` | dashboard counters |
| GET | `/api/billing/status` | subscription, plans, availability |
| POST | `/api/billing/order` `/verify` | create a Razorpay order, confirm payment |
| GET | `/api/billing/payments` | payment history |
| POST | `/api/billing/webhook` | Razorpay events (signed, no session) |
| GET/POST | `/api/whatsapp/webhook` | Meta verification + events |
| GET/POST/DELETE | `/api/admin/*` | users, accounts, webhook logs |
| POST | `/api/dev/inbound` `/status` | simulate a customer (non-cloud only) |

## Security notes

- Passwords hashed with bcrypt (cost 12).
- Session JWT lives in an httpOnly cookie; `Secure` + `SameSite=None` in production.
- Access tokens are write-only over the API — reads return `••••1234` hints.
- Login answers identically for unknown email and wrong password.
- Every query is scoped by `company_id`; one tenant cannot read another's data.
- Razorpay signatures are compared with `timingSafeEqual`, never `===`.
