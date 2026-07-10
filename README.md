# Household Finance App

A private, personal finance app for our household to view and manage our own
**UK** bank accounts in one place — budgets & expense tracking, net worth across
accounts, and bills & subscriptions. Bank data comes from
[Enable Banking](https://enablebanking.com/)'s open banking API, with our own
explicit consent.

- **Privacy policy:** https://rupertmcd.github.io/claude-code-test-project/
- **Terms of use:** https://rupertmcd.github.io/claude-code-test-project/terms.html

> **Status:** Phase 0 — backend + Enable Banking integration. The Expo mobile
> app (accounts, net worth, budgets, bills) is built on top of this in later
> phases. See the implementation plan for the full roadmap.

## Repository layout

```
server/     Node + Fastify + Prisma backend (Enable Banking integration)
docs/       Privacy policy + terms (served via GitHub Pages)
app/        Expo mobile app (added in Phase 1)
```

## How the bank connection works

Enable Banking authenticates each API call with a short-lived **RS256 JWT**
signed by your application's **private key** (the `<APP_ID>.pem` you downloaded
at registration). Because the key must never live in a browser or on a phone,
all bank communication goes through this backend. The flow:

1. `GET /aspsps?country=GB` — list UK banks.
2. `POST /auth { "aspsp": "<bank name>" }` — returns a `url` to send the user to.
3. The user approves at their bank (on mobile this hands off to the bank app +
   Face ID) and is redirected to `EB_REDIRECT_URL` (`/callback`) with a `code`.
4. `/callback` exchanges the code for a session and stores accounts + balances.
5. `GET /accounts`, `GET /net-worth`, `POST /accounts/:uid/sync` expose the data.

## Backend setup

Requirements: Node 18+ (tested on Node 22).

```bash
cd server
npm install
cp .env.example .env          # then edit .env (see below)
npm run prisma:migrate        # creates the SQLite dev database
npm run dev                   # starts the server on http://localhost:8000
```

### Configure `.env`

| Variable | What to put |
| --- | --- |
| `EB_APP_ID` | Your Enable Banking application ID (already filled in the example). |
| `EB_PRIVATE_KEY_PATH` | **Absolute path** to your `<APP_ID>.pem` private key, kept **outside** this repo. |
| `EB_REDIRECT_URL` | A redirect URL registered on your Enable Banking app (see tunnel note). |
| `EB_COUNTRY` | `GB` for the UK. |
| `PORT` | `8000` by default. |

> ⚠️ **Never commit your private key or `.env`.** Both are git-ignored, and the
> key should be stored somewhere safe (e.g. a password manager / encrypted
> drive). It cannot be re-downloaded from Enable Banking.

### Exposing the backend for mobile (dev tunnel)

To link a bank from your phone, the bank needs to redirect to a public **HTTPS**
URL, and your phone needs to reach the backend. In development, a free tunnel
does both:

```bash
# Option A: Cloudflare Tunnel (no signup)
cloudflared tunnel --url http://localhost:8000

# Option B: ngrok
ngrok http 8000
```

This prints a URL like `https://something.trycloudflare.com`. Then:

1. In the Enable Banking control panel, add `https://something.trycloudflare.com/callback`
   to your application's **redirect URLs**.
2. Set `EB_REDIRECT_URL` in `.env` to that exact URL and restart the server.

## Quick manual test

```bash
curl http://localhost:8000/health
curl "http://localhost:8000/aspsps?country=GB"        # lists UK banks
curl -X POST http://localhost:8000/auth \
  -H 'content-type: application/json' \
  -d '{"aspsp":"Mock ASPSP"}'                          # returns a URL to open
# open the returned URL, approve, then:
curl http://localhost:8000/accounts
curl http://localhost:8000/net-worth
```

## API reference (Phase 0)

| Method & path | Purpose |
| --- | --- |
| `GET /health` | Liveness check. |
| `GET /aspsps?country=GB` | List banks for a country. |
| `POST /auth` | Start a bank authorization; body `{ "aspsp": "<name>" }`. |
| `GET /callback` | Redirect target; exchanges code, stores accounts. |
| `GET /accounts` | All linked accounts with balances. |
| `GET /net-worth` | Assets − liabilities, grouped by currency. |
| `POST /accounts/:uid/sync` | Fetch + store transactions (`?date_from=YYYY-MM-DD`). |
| `GET /accounts/:uid/transactions` | Stored transactions for an account. |

## Security notes

- The backend is the only holder of secrets; the (future) mobile app only ever
  talks to this backend, never to Enable Banking directly.
- Private key loaded from a local path via `.env`; never committed.
- SQLite database (`server/prisma/dev.db`) is git-ignored — your financial data
  stays on your machine.
