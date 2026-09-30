# PBL Plants — online shop

The PBL Plants website with a real cart, checkout (Cash on Delivery or Razorpay online payments),
order tracking for customers, coupons, delivery-zone-based shipping fees, abandoned-checkout
recovery, and a dashboard for the delivery team.

```
frontend/   Next.js 16 (React 19, TypeScript) — the website customers use
backend/    FastAPI (Python) — products, orders, payments, delivery, coupons, team dashboard API
```

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Python | 3.11+ | Backend (FastAPI) |
| Node.js | 20+ | Frontend (Next.js) |
| Git | any recent | Version control, deployment |

Backend Python packages are pinned in `backend/requirements.txt` (FastAPI, SQLAlchemy, Pydantic,
`slowapi` for rate limiting, `python-multipart` for product image uploads, `psycopg` for
Postgres in production) — `pip install -r requirements.txt` installs everything, nothing extra
to add by hand. Frontend packages are in `frontend/package.json` — `npm install` covers it.

**External accounts you'll eventually want** (all optional until you need that feature):
- [Razorpay](https://razorpay.com) — online payments (cards, UPI, netbanking, wallets). COD works
  with no account at all.
- A Telegram bot — instant order alerts to the team (optional; orders are always logged either way).
- A host for the backend (Render, Railway, Fly.io, etc.) + Postgres, and [Vercel](https://vercel.com)
  for the frontend — only needed when you're ready to put the site on the internet (see **Deploy**
  below). Local development needs neither.

## How an order flows

1. The customer adds items to the cart and goes to checkout.
2. At checkout they enter name, phone, address and pincode. The pincode is checked against the
   delivery zones you've configured in `/admin → Delivery` — anything not listed there, or beyond
   your configured max distance, isn't deliverable.
3. The delivery fee is calculated from a distance-based formula (free within a radius, a per-km
   rate beyond it, waived entirely above a cart-value threshold) — also tuned from
   `/admin → Delivery`. Cash on delivery is only offered within the free radius; further out, the
   customer must pay online.
4. A coupon code, if entered, is validated and its discount applied to the subtotal — never to the
   delivery fee. Coupons are created and tracked (usage limits, expiry) from `/admin → Coupons`.
5. The backend recalculates every price, fee and discount from the database at order time. It
   never trusts amounts sent by the browser.
6. **Cash on delivery:** the order is saved and the team is alerted immediately.
   **Online:** a Razorpay order is created and the customer pays in the Razorpay window. The order
   only counts as paid once Razorpay's signature is verified, either from the browser callback or
   from the webhook (so it still works if the customer closes the tab).
7. The team works through each order in `/admin → Orders`: **Confirm → Packed → Out for delivery →
   Delivered**. Marking a COD order delivered records the cash as collected.
8. The customer follows progress at `/track` using the order code and their phone number.
9. If a customer fills in their name, phone and pincode at checkout but doesn't complete the
   order, it shows up under `/admin → Coupons → Abandoned checkouts` — generate a one-time
   discount coupon and a pre-filled WhatsApp message to try to win them back.

## What's in the admin dashboard (`/admin`)

Sign in with your `ADMIN_TOKEN`. Tabs:

- **Orders** — live list, filter by status, move an order through its lifecycle, cancel.
- **Products** — add/edit/delete products, set price and stock (or leave price blank to show
  "Ask for price"), upload a photo per product straight from your device.
- **Offers** — promotional banners shown on the homepage ("Spend ₹999+, get a free succulent") —
  informational only, the team honours it manually.
- **Delivery** — the fee formula (free radius, per-km rate, free-delivery cart threshold, max
  distance) and the list of deliverable pincodes with their distance from the store.
- **Coupons** — create discount codes (percent or flat, with optional minimum order, usage limit,
  expiry), and the abandoned-checkout recovery tool described above.

## Run it locally

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then set ADMIN_TOKEN to any long random string
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. The catalog is seeded automatically on first start
(SQLite file at `backend/pbl.db` — nothing else to set up).

**Frontend** (Node 20+):

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Site: http://localhost:3000. Team dashboard: http://localhost:3000/admin (sign in with your
`ADMIN_TOKEN`).

**Or everything at once with Docker** (includes Postgres): create `backend/.env` from the example,
then run `docker compose up --build`.

**Tests:** `cd backend && pytest`. Covers pricing, delivery zones, coupons, payment signatures,
webhooks, rate limiting and the order lifecycle.

## Deploy

A typical setup: **frontend on Vercel**, **backend + Postgres on Render or Railway**, connected
by environment variables. None of this is required for local development — only do this when
you're ready to put the site on the internet.

### 1. Push the code to GitHub

```bash
git init && git branch -M main               # skip if already a git repo
git add -A && git commit -m "Initial commit"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Backend → Render (or Railway/Fly.io) + Postgres

1. Create a Postgres database on your host — copy its connection string.
2. Create a new **Web Service** from your GitHub repo, root directory `backend`.
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Set environment variables (from `backend/.env.example`):
   - `DATABASE_URL` → your Postgres connection string, rewritten to use the `psycopg` driver:
     `postgresql+psycopg://user:password@host:5432/dbname`
   - `ADMIN_TOKEN` → a long random string (`python -c "import secrets; print(secrets.token_urlsafe(32))"`)
   - `FRONTEND_ORIGINS` → your Vercel URL, e.g. `https://pbl-plants.vercel.app` (comma-separate
     multiple origins if you also keep a custom domain)
   - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` → once you have a
     Razorpay account (see checklist below); leave blank to stay COD-only
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` → optional order alerts
4. Deploy, then note the live backend URL (e.g. `https://pbl-plants-api.onrender.com`).

### 3. Frontend → Vercel

1. Import the GitHub repo in Vercel, set the project's **root directory** to `frontend`.
2. Set environment variables (from `frontend/.env.example`):
   - `NEXT_PUBLIC_API_URL` → the backend URL from step 2
   - `NEXT_PUBLIC_SITE_URL` → your Vercel URL (used for metadata/SEO)
   - `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_MAPS_URL`, `NEXT_PUBLIC_INSTAGRAM_URL` → your shop details
3. Deploy. Vercel auto-redeploys on every push to `main`.
4. Go back to the backend's `FRONTEND_ORIGINS` and make sure it matches the exact Vercel URL
   (and any custom domain) — otherwise the browser's CORS check will block every API call.

### 4. Add your delivery zones

The database starts with only the store's own pincode as a delivery zone. Go to
`/admin → Delivery` on the live site and add every pincode you actually deliver to, with its
distance — nothing else is deliverable until you do.

## Going live — checklist

**Content (the shop):**
- [ ] Real photos for each product — upload them from `/admin → Products` (per-product **Upload**
      button). Until then, illustrated icons are shown.
- [ ] Prices for every item in `/admin → Products`.
- [ ] Review and edit `frontend/src/app/policies/page.tsx` (shipping, refunds, privacy, terms) so
      it matches how the shop really works, then remove the "Draft" notice.
- [ ] Add your delivery zones and tune the fee formula in `/admin → Delivery`.
- [ ] Decide the minimum order value (`MIN_ORDER_PAISE` in `backend/.env`).

**Hosting:**
- [ ] Domain, e.g. `pblplants.in` (optional — a Vercel URL works fine to start).
- [ ] Frontend on Vercel, backend + Postgres on Render/Railway/AWS — see **Deploy** above.
- [ ] Set a strong `ADMIN_TOKEN` and share it only with the team.
- [ ] Optional: create a Telegram bot and group for order alerts, then set `TELEGRAM_BOT_TOKEN`
      and `TELEGRAM_CHAT_ID`.

**Online payments (when ready):**
- [ ] Sign up for Razorpay ([razorpay.com](https://razorpay.com)) and complete KYC — test-mode
      keys are available immediately, before KYC clears, so you can verify the flow early.
- [ ] Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Use test keys first, then live keys.
- [ ] Turn on **automatic payment capture** in the Razorpay dashboard.
- [ ] Add a webhook at `https://<your-backend>/api/payments/webhook` for the events
      `payment.captured`, `order.paid` and `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET` to
      the same secret.
- [ ] Place a test order with Razorpay test mode before switching to live keys.

The "Pay online" option shows up at checkout automatically once the keys are set. Credit/debit
cards, UPI, netbanking and wallets all appear in Razorpay's checkout widget automatically — no
extra code needed for any of them.

## Security notes

- Every price, fee and discount is recalculated server-side at order time — the browser's numbers
  are never trusted.
- Payment confirmation only happens after verifying Razorpay's HMAC signature (checkout callback
  and webhook both), never from an unsigned client claim.
- `slowapi` rate-limits (per IP) order placement, payment verification, order tracking, coupon
  checks, and every admin-token attempt — see `backend/app/limiter.py` and the `@limiter.limit(...)`
  decorators in each router.

## Before the shop grows

- **Migrations:** tables are created automatically on startup. Add Alembic before you start
  changing the database schema in production.
- **Team logins:** the dashboard uses one shared token. Move to per-person accounts when more
  people need access.
- **Customer messages:** SMS or WhatsApp status updates to customers (e.g. MSG91, or the WhatsApp
  Business API) — currently only the team gets Telegram alerts.
- **Variants:** sizes and colours such as pot sizes as options on one product, instead of separate
  products.
