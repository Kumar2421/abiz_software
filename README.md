# Abiz — WhatsApp Inbox

Lightweight WhatsApp inbox for small businesses. Next.js frontend, Express +
Socket.IO API, Postgres.

```
abiz software/
  web/         Next.js 16 (App Router), Tailwind v4, shadcn/ui
  server/      Express 5, Socket.IO, Postgres
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

For staging and production set a real connection string — Supabase, Neon, RDS —
and the same code switches to `node-postgres`:

```
DATABASE_URL=postgresql://user:pass@host:5432/abiz?sslmode=require
```

Delete `server/.data/` to reset local data.

## WhatsApp drivers

`WHATSAPP_DRIVER` decides where outbound messages go.

| Value | Behaviour |
|-------|-----------|
| `mock` (default) | Messages stay inside Abiz. `POST /api/dev/inbound` plays the customer's side, so the whole loop — inbound, auto-welcome, unread badge, realtime — works with no Meta account. |
| `cloud` | Real Meta Cloud API calls using the token and Phone Number ID saved in Settings. |

Under `cloud`, Meta's **24-hour customer service window** is enforced: free-form
replies are rejected once 24h have passed since the customer's last inbound
message, and the composer shows the closed-window banner. Under `mock` the
window stays open so new conversations can be started in development.

## Attachments

**Sending attachments is off.** The composer is text-only on purpose: outbound
files need durable object storage (S3 / Cloudflare R2 / Supabase Storage), and
local disk is wiped on every redeploy on Render, Railway, and Fly. Turning it
on without that would silently lose customers' files.

Incoming attachments still render in the thread — images, video, audio, and
document rows — so nothing breaks when a customer sends a photo.

The upload endpoint and `media` table stay in place for when storage is wired:
add an S3 driver behind `server/src/services/media.ts`, then restore the
paperclip and mic buttons in `web/src/components/inbox/composer.tsx`.

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

## When the welcome message fires

Only on the **first inbound message of a conversation the customer started**.

- Customer messages you first → welcome sends automatically.
- You message the customer first → no welcome, then or later. Sending marks the
  conversation as already greeted, so their eventual reply does not trigger a
  belated "thank you for contacting us".
- It never fires twice, and a delivery failure still marks it done rather than
  retrying forever.

## Deploying

- **Frontend** — Netlify / Vercel. Static plus client rendering, no server needed.
- **API** — needs a long-running process for Socket.IO, so Netlify cannot host
  it. Render, Railway, Fly.io, or any Node host works. Set `CLIENT_ORIGIN` to
  the deployed frontend URL (comma-separated for previews) and `NODE_ENV=production`
  so the session cookie is issued with `Secure` and `SameSite=None`.
- **Webhook** — point Meta at `https://<api-host>/api/whatsapp/webhook` and use
  the verify token from Settings.

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` `/login` `/logout` | session (httpOnly cookie) |
| GET | `/api/auth/me` | current user + company |
| POST | `/api/auth/change-password` | change while signed in |
| POST | `/api/auth/forgot-password` `/reset-password` | reset by emailed token |
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
| GET/POST | `/api/whatsapp/webhook` | Meta verification + events |
| GET/POST/DELETE | `/api/admin/*` | users, accounts, webhook logs |
| POST | `/api/dev/inbound` `/status` | simulate a customer (non-cloud only) |

Socket.IO events, scoped to a `company:<id>` room: `message:new`,
`message:status`, `conversation:updated`.

## Security notes

- Passwords hashed with bcrypt (cost 12).
- Session JWT lives in an httpOnly cookie; `Secure` + `SameSite=None` in production.
- Access tokens are write-only over the API — reads return `••••1234` hints.
- Login answers identically for unknown email and wrong password.
- Every query is scoped by `company_id`; one tenant cannot read another's data.
#   a b i z _ s o f t w a r e  
 