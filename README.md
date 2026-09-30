# PBL Plants — online shop

The PBL Plants website with a real cart, checkout (Cash on Delivery now, Razorpay online payments when you're ready), order tracking for customers, and a dashboard for the delivery team.

```
frontend/   Next.js 16 (React 19, TypeScript) — the website customers use
backend/    FastAPI (Python) — products, orders, payments, team dashboard API
```

## How an order flows

1. The customer adds items to the cart and goes to checkout.
2. At checkout they enter name, phone, address and pincode. Only pincodes you deliver to are accepted (`530`/`531` by default).
3. The backend recalculates every price from the database. It never trusts prices sent by the browser.
4. **Cash on delivery:** the order is saved and the team is alerted immediately.
   **Online:** a Razorpay order is created and the customer pays in the Razorpay window. The order only counts as paid once Razorpay's signature is verified, either from the browser callback or from the webhook. The webhook still works if the customer closes the tab.
5. The team works through each order in `/admin`: **Confirm → Packed → Out for delivery → Delivered**. Marking a COD order delivered records the cash as collected.
6. The customer follows progress at `/track` using the order code and their phone number.

The team can also set prices and stock from `/admin → Products`. Any item without a price shows "Ask for price" and a WhatsApp button, so you can go live before every price is decided.

## Run it locally

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then set ADMIN_TOKEN to any long random string
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. The catalog is seeded automatically on first start.

**Frontend** (Node 20+):

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Site: http://localhost:3000. Team dashboard: http://localhost:3000/admin (sign in with your `ADMIN_TOKEN`).

**Or everything at once with Docker** (includes Postgres): create `backend/.env` from the example, then run `docker compose up --build`.

**Tests:** `cd backend && pytest`. The 23 tests cover pricing, pincode rules, payment signatures, webhooks and the order lifecycle.

## Going live — checklist

**Content (the shop):**
- [ ] Real photos for each product. Upload them anywhere public, such as Cloudinary or an S3 bucket, and put the URL in `image_url`. Until then the illustrated icons are shown.
- [ ] Prices for every item in `/admin → Products`.
- [ ] Review and edit `frontend/src/app/policies/page.tsx` (shipping, refunds, privacy, terms) so it matches how the shop really works, then remove the "Draft" notice.
- [ ] Decide the delivery fee and minimum order (`DELIVERY_FEE_PAISE`, `MIN_ORDER_PAISE`) and the delivery pincodes (`ALLOWED_PINCODE_PREFIXES`).

**Hosting (suggested):**
- [ ] **Domain**, e.g. `pblplants.in`.
- [ ] **Frontend → Vercel.** Import the `frontend` folder and set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` and the shop variables from `.env.example`.
- [ ] **Backend + Postgres → Render, Railway or AWS.** Set the variables from `backend/.env.example` and set `DATABASE_URL` to Postgres. Put the API on a subdomain like `api.pblplants.in`, and set `FRONTEND_ORIGINS` to the live site URL.
- [ ] Set a strong `ADMIN_TOKEN` and share it only with the team.
- [ ] Optional: create a Telegram bot and group for order alerts, then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

**Online payments (when ready):**
- [ ] Sign up for Razorpay and complete business KYC. The policies page and a contact page must be live on the domain.
- [ ] Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Use test keys first, then live keys.
- [ ] Turn on **automatic payment capture** in the Razorpay dashboard.
- [ ] Add a webhook at `https://api.<your-domain>/api/payments/webhook` for the events `payment.captured`, `order.paid` and `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET` to the same secret.
- [ ] Place a test order with Razorpay test mode before switching to live keys.

The "Pay online" option shows up at checkout automatically once the keys are set.

## Before the shop grows

- **Migrations:** tables are created automatically on startup. Add Alembic before you start changing the database schema in production.
- **Team logins:** the dashboard uses one shared token. Move to per-person accounts when more people need access.
- ~~**Rate limiting:** add it on `POST /api/orders`~~ Done — `slowapi` limits order placement, payment verification, order tracking, coupon checks, and admin-token attempts, all keyed by IP.
- **Customer messages:** SMS or WhatsApp status updates to customers (e.g. MSG91, or the WhatsApp Business API).
- **Variants:** sizes and colours such as pot sizes as options on one product, instead of separate products.
