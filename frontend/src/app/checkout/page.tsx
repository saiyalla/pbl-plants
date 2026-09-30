"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fieldClass, FieldError } from "@/components/FieldError";
import { Icon } from "@/components/Icons";
import {
  api,
  ApiError,
  type CouponApplyResult,
  type DeliveryCheckResult,
  type OrderCreated,
  type PaymentMethod,
  postCheckoutDraft,
  type Product,
  rupees,
} from "@/lib/api";
import { useCart } from "@/lib/cart";
import { clearCheckoutDraft, loadCheckoutDraft, rememberOrderPhone, saveCheckoutDraft } from "@/lib/tracking";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: () => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

type Delivery = {
  state: "idle" | "checking" | "ok" | "no";
  feePaise: number;
  baseFeePaise: number;
  freeDeliveryMinPaise: number;
  distanceKm: number | null;
  codAllowed: boolean;
};
const IDLE_DELIVERY: Delivery = { state: "idle", feePaise: 0, baseFeePaise: 0, freeDeliveryMinPaise: 0, distanceKm: null, codAllowed: false };

type AppliedCoupon = { code: string; discountPaise: number };

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, clear, subtotalPaise } = useCart();

  const [form, setForm] = useState({ customer_name: "", phone: "", address: "", pincode: "", notes: "" });
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cod");
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>(IDLE_DELIVERY);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<OrderCreated | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponStatus, setCouponStatus] = useState<{ checking: boolean; message: string | null; ok: boolean }>({
    checking: false, message: null, ok: false,
  });

  // Restore an in-progress checkout (e.g. the customer went back to add another item).
  useEffect(() => {
    const draft = loadCheckoutDraft();
    if (draft) setForm(draft);
    setDraftLoaded(true);
  }, []);

  // Keep the draft in sync as the customer types, so it survives navigating away and back.
  useEffect(() => {
    if (!draftLoaded) return;
    saveCheckoutDraft(form);
  }, [form, draftLoaded]);

  // Is online payment switched on server-side?
  useEffect(() => {
    api<{ online_payments: boolean }>("/api/health")
      .then((h) => setOnlineEnabled(h.online_payments))
      .catch(() => setOnlineEnabled(false));
  }, []);

  // Re-check the cart against live prices and stock.
  useEffect(() => {
    if (lines.length === 0) return;
    api<Product[]>("/api/products")
      .then((products) => {
        const byId = new Map(products.map((p) => [p.id, p]));
        const issues: string[] = [];
        for (const l of lines) {
          const p = byId.get(l.productId);
          if (!p) issues.push(`${l.name} is no longer available.`);
          else if (!p.in_stock) issues.push(`${l.name} just went out of stock.`);
          else if (p.price_paise == null) issues.push(`${l.name} now needs a price confirmed — ask us on WhatsApp.`);
          else if (p.price_paise !== l.pricePaise) issues.push(`${l.name} is now ${rupees(p.price_paise)} (was ${rupees(l.pricePaise)}).`);
        }
        setProblems(issues);
      })
      .catch(() => {});
  }, [lines]);

  // Live pincode check (with the current cart value) once 6 digits are typed.
  useEffect(() => {
    if (!/^\d{6}$/.test(form.pincode)) {
      setDelivery(IDLE_DELIVERY);
      return;
    }
    setDelivery((d) => ({ ...d, state: "checking" }));
    const t = window.setTimeout(() => {
      api<DeliveryCheckResult>(`/api/delivery/check?pincode=${form.pincode}&subtotal_paise=${subtotalPaise}`)
        .then((r) => {
          setDelivery({
            state: r.deliverable ? "ok" : "no", feePaise: r.delivery_fee_paise, baseFeePaise: r.base_fee_paise,
            freeDeliveryMinPaise: r.free_delivery_min_paise, distanceKm: r.distance_km, codAllowed: r.cod_allowed,
          });
          // Outside our own delivery zones: courier only, so cash on delivery is never an option.
          if (!r.deliverable) setMethod("online");
          else if (!r.cod_allowed) setMethod("online");
          else setMethod("cod");
        })
        .catch(() => setDelivery(IDLE_DELIVERY));
    }, 300);
    return () => window.clearTimeout(t);
  }, [form.pincode, subtotalPaise]);

  // Re-check any applied coupon whenever the cart value changes (min-order thresholds depend on it).
  useEffect(() => {
    if (!appliedCoupon) return;
    api<CouponApplyResult>(`/api/coupons/apply?code=${encodeURIComponent(appliedCoupon.code)}&subtotal_paise=${subtotalPaise}`)
      .then((r) => {
        if (r.valid) setAppliedCoupon({ code: appliedCoupon.code, discountPaise: r.discount_paise });
        else {
          setAppliedCoupon(null);
          setCouponStatus({ checking: false, message: r.message, ok: false });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotalPaise]);

  // Save a checkout draft server-side once we have enough to identify the customer — lets an
  // abandoned checkout be recovered later.
  useEffect(() => {
    if (!draftLoaded) return;
    if (!(form.customer_name.trim() && /^\d{10}$/.test(form.phone.replace(/\D/g, "").slice(-10)) && /^\d{6}$/.test(form.pincode))) return;
    const t = window.setTimeout(() => {
      postCheckoutDraft({
        customer_name: form.customer_name,
        phone: form.phone,
        pincode: form.pincode,
        cart_snapshot: lines.map((l) => ({ name: l.name, quantity: l.quantity, price_paise: l.pricePaise })),
        subtotal_paise: subtotalPaise,
      });
    }, 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customer_name, form.phone, form.pincode, draftLoaded, subtotalPaise]);

  const discountPaise = appliedCoupon?.discountPaise ?? 0;
  const total = useMemo(
    () => Math.max(0, subtotalPaise - discountPaise) + (delivery.state === "ok" ? delivery.feePaise : 0),
    [subtotalPaise, discountPaise, delivery],
  );

  async function applyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!couponInput.trim()) return;
    setCouponStatus({ checking: true, message: null, ok: false });
    try {
      const r = await api<CouponApplyResult>(
        `/api/coupons/apply?code=${encodeURIComponent(couponInput.trim())}&subtotal_paise=${subtotalPaise}`,
      );
      if (r.valid) {
        setAppliedCoupon({ code: couponInput.trim().toUpperCase(), discountPaise: r.discount_paise });
        setCouponStatus({ checking: false, message: r.message, ok: true });
      } else {
        setAppliedCoupon(null);
        setCouponStatus({ checking: false, message: r.message, ok: false });
      }
    } catch (e) {
      setCouponStatus({ checking: false, message: e instanceof ApiError ? e.message : "Couldn't check that code.", ok: false });
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponStatus({ checking: false, message: null, ok: false });
  }

  function set<K extends keyof typeof form>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setFieldErrors((errs) => (errs[key] ? { ...errs, [key]: "" } : errs));
    };
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.customer_name.trim().length < 2) errs.customer_name = "Enter your full name.";
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(phoneDigits.slice(-10)) || phoneDigits.length < 10) {
      errs.phone = "Enter a valid 10-digit mobile number.";
    }
    if (!/^\d{6}$/.test(form.pincode)) errs.pincode = "Enter a 6-digit pincode.";
    if (form.address.trim().length < 10) errs.address = "Enter your full delivery address.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function finish(created: OrderCreated) {
    rememberOrderPhone(created.order.public_id, form.phone);
    clearCheckoutDraft();
    clear();
    router.push(`/order/${created.order.public_id}?new=1`);
  }

  async function pay(created: OrderCreated) {
    const rp = created.razorpay!;
    const ok = await loadRazorpay();
    if (!ok || !window.Razorpay) {
      setError("Couldn't load the payment window. Check your connection, or place the order as Cash on Delivery.");
      setPending(created);
      return;
    }
    const checkout = new window.Razorpay({
      key: rp.key_id,
      order_id: rp.razorpay_order_id,
      amount: rp.amount_paise,
      currency: rp.currency,
      name: "PBL Plants",
      description: `Order ${created.order.public_id}`,
      prefill: { name: form.customer_name, contact: form.phone },
      theme: { color: "#2E5233" },
      handler: async (resp: RazorpayResponse) => {
        setBusy(true);
        try {
          await api("/api/payments/verify", {
            method: "POST",
            body: JSON.stringify({ public_id: created.order.public_id, ...resp }),
          });
        } catch {
          // The webhook will still confirm the payment server-side; the order page shows the live status.
        }
        finish(created);
      },
      modal: {
        ondismiss: () => {
          setBusy(false);
          setPending(created);
          setError("Payment wasn't completed. Your order is saved — try paying again below.");
        },
      },
    });
    checkout.on("payment.failed", () => setError("That payment didn't go through. You can try again."));
    checkout.open();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    if (delivery.state !== "ok" && delivery.state !== "no") {
      setError("Enter your pincode to continue.");
      return;
    }
    setBusy(true);
    try {
      const created = await api<OrderCreated>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          payment_method: method,
          coupon_code: appliedCoupon?.code ?? null,
          items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
        }),
      });
      if (created.razorpay) {
        await pay(created);
      } else {
        finish(created);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (lines.length === 0 && !pending) {
    return (
      <div className="wrap page">
        <div className="page-head"><h1>Checkout</h1></div>
        <div className="empty">
          Your cart is empty. <Link href="/#catalog">Browse the shop</Link> to add plants.
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <div className="page-head">
        <p className="eyebrow">Almost there</p>
        <h1>Checkout</h1>
      </div>

      <div className="checkout-grid">
        <form className="panel" onSubmit={submit} noValidate>
          <h2>Delivery details</h2>
          {error && <div className="alert error" role="alert">{error}</div>}

          <div className={fieldClass(fieldErrors.customer_name)}>
            <label htmlFor="name">Full name</label>
            <input id="name" autoComplete="name" value={form.customer_name} onChange={set("customer_name")} />
            <FieldError message={fieldErrors.customer_name} />
          </div>
          <div className="field-row">
            <div className={fieldClass(fieldErrors.phone)}>
              <label htmlFor="phone">Mobile number</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={form.phone} onChange={set("phone")} />
              <FieldError message={fieldErrors.phone} />
              {!fieldErrors.phone && <span className="hint">We&apos;ll call this number before delivering.</span>}
            </div>
            <div className={fieldClass(fieldErrors.pincode)}>
              <label htmlFor="pincode">Pincode</label>
              <input id="pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} placeholder="530016" value={form.pincode} onChange={set("pincode")} />
              <FieldError message={fieldErrors.pincode} />
              {!fieldErrors.pincode && delivery.state === "checking" && <span className="hint">Checking…</span>}
              {!fieldErrors.pincode && delivery.state === "ok" && (
                <span className="hint ok">
                  ✓ We deliver here{delivery.distanceKm != null ? ` · ${delivery.distanceKm} km away` : ""}
                </span>
              )}
              {!fieldErrors.pincode && delivery.state === "no" && (
                <span className="hint">Outside our delivery zone — we&apos;ll ship this by courier</span>
              )}
            </div>
          </div>
          <div className={fieldClass(fieldErrors.address)}>
            <label htmlFor="address">Full address</label>
            <textarea id="address" rows={3} autoComplete="street-address" placeholder="House / flat no., street, area, landmark" value={form.address} onChange={set("address")} />
            <FieldError message={fieldErrors.address} />
          </div>
          <div className="field">
            <label htmlFor="notes">Order note <span className="muted">(optional)</span></label>
            <textarea id="notes" rows={2} maxLength={500} placeholder="e.g. 3-layer bamboo please, gift wrap, call before coming" value={form.notes} onChange={set("notes")} />
          </div>

          {delivery.state !== "ok" && delivery.state !== "no" ? (
            <div className="alert info" style={{ marginTop: "1.2rem" }}>
              Enter your pincode above to see delivery &amp; payment options.
            </div>
          ) : (
            <>
              <h2 style={{ marginTop: "1.4rem" }}>Payment</h2>
              {delivery.state === "no" ? (
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: "-0.4rem" }}>
                  This address is outside our local delivery zone — we ship it by courier (DTDC/RTC) and
                  confirm the exact shipping charge after you order.
                </p>
              ) : (
                !delivery.codAllowed && (
                  <p className="muted" style={{ fontSize: "0.85rem", marginTop: "-0.4rem" }}>
                    Cash on delivery isn&apos;t available this far — please pay online for this address.
                  </p>
                )
              )}
              <div className="pay-options">
                {delivery.state !== "no" && (
                  <label className={`pay-option${delivery.codAllowed ? "" : " disabled"}`}>
                    <input type="radio" name="pay" disabled={!delivery.codAllowed} checked={method === "cod"} onChange={() => setMethod("cod")} />
                    <div><strong>Cash on delivery</strong><span>Pay cash or UPI to our delivery team at your door.</span></div>
                  </label>
                )}
                <label className={`pay-option${onlineEnabled ? "" : " disabled"}`}>
                  <input type="radio" name="pay" disabled={!onlineEnabled} checked={method === "online"} onChange={() => setMethod("online")} />
                  <div>
                    <strong>Pay online</strong>
                    <span>
                      {!onlineEnabled
                        ? "Coming soon."
                        : delivery.state === "no"
                          ? "We'll send a secure payment link once shipping is confirmed."
                          : "UPI, cards and netbanking via Razorpay."}
                    </span>
                  </div>
                </label>
              </div>

              {(delivery.state === "no" ? !onlineEnabled : !delivery.codAllowed && !onlineEnabled) ? (
                <div className="alert error" style={{ marginTop: "1.2rem" }}>
                  {delivery.state === "no"
                    ? "This address needs a courier and online payment, and online payment isn't set up yet — message us on WhatsApp and we'll help."
                    : "We can't take online payments yet, and cash on delivery isn't available this far. Message us on WhatsApp and we'll help you place the order."}
                </div>
              ) : pending ? (
                <button type="button" className="btn primary block" style={{ marginTop: "1.2rem" }} disabled={busy} onClick={() => pay(pending)}>
                  Try paying {rupees(pending.order.total_paise)} again
                </button>
              ) : (
                <>
                  <button type="submit" className="btn primary block" style={{ marginTop: "1.2rem" }} disabled={busy || problems.length > 0}>
                    {busy
                      ? "Placing order…"
                      : delivery.state === "no"
                        ? `Place order · ${rupees(total)} + shipping`
                        : method === "online" ? `Pay ${rupees(total)}` : `Place order · ${rupees(total)}`}
                  </button>
                  {delivery.state === "no" && (
                    <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.6rem" }}>
                      We&apos;ll confirm the courier charge and send a secure payment link on WhatsApp before
                      dispatch — nothing is charged yet.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </form>

        <aside className="panel summary" aria-label="Order summary">
          <h2>Order summary</h2>
          {problems.length > 0 && (
            <div className="alert info">
              {problems.map((p) => <div key={p}>{p}</div>)}
              <div style={{ marginTop: "0.4rem" }}>Please update your cart, then continue.</div>
            </div>
          )}
          {lines.map((l) => (
            <div className="line" key={l.productId}>
              <div className="line-thumb"><Icon name={l.icon} /></div>
              <div>
                <div className="line-name">{l.name}</div>
                <div className="line-price">{l.quantity} × {rupees(l.pricePaise)}</div>
              </div>
              <div className="line-total">{rupees(l.pricePaise * l.quantity)}</div>
            </div>
          ))}

          <div style={{ marginTop: "0.9rem" }}>
            {appliedCoupon ? (
              <div className="alert success" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem" }}>
                <span>
                  ✓ Coupon <strong>{appliedCoupon.code}</strong> applied — you save {rupees(appliedCoupon.discountPaise)}
                </span>
                <button type="button" className="link-btn" onClick={removeCoupon}>Remove</button>
              </div>
            ) : (
              <>
                <label htmlFor="coupon" style={{ fontSize: "0.84rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>
                  Have a coupon?
                </label>
                <form onSubmit={applyCoupon} className="coupon-bar">
                  <input id="coupon" placeholder="Enter code" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} />
                  <button disabled={couponStatus.checking || !couponInput.trim()}>
                    {couponStatus.checking ? "Checking…" : "Apply"}
                  </button>
                </form>
              </>
            )}
            {couponStatus.message && !couponStatus.ok && (
              <div className="hint bad" style={{ marginTop: "0.3rem" }}>{couponStatus.message}</div>
            )}
          </div>

          {delivery.state === "ok" && delivery.feePaise > 0 && delivery.freeDeliveryMinPaise > subtotalPaise && (
            <div className="nudge" style={{ marginTop: "0.8rem" }}>
              <Icon name="gift" />
              <span>Add {rupees(delivery.freeDeliveryMinPaise - subtotalPaise)} more to get free delivery!</span>
            </div>
          )}

          <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.9rem" }}>
            <div className="sum-row"><span>Subtotal</span><span>{rupees(subtotalPaise)}</span></div>
            {discountPaise > 0 && (
              <div className="sum-row" style={{ color: "var(--ok)" }}>
                <span>Discount ({appliedCoupon?.code})</span><span>−{rupees(discountPaise)}</span>
              </div>
            )}
            <div className="sum-row">
              <span>Delivery</span>
              <span>
                {delivery.state === "no" ? "Confirmed after ordering" : delivery.state !== "ok" ? "—" : delivery.feePaise === 0 && delivery.baseFeePaise > 0 ? (
                  <>
                    <span style={{ textDecoration: "line-through", opacity: 0.6, marginRight: "0.4rem" }}>
                      {rupees(delivery.baseFeePaise)}
                    </span>
                    <span style={{ color: "var(--ok)" }}>Free</span>
                  </>
                ) : delivery.feePaise ? rupees(delivery.feePaise) : "Free"}
              </span>
            </div>
            <div className="sum-row total"><span>Total</span><span>{rupees(total)}{delivery.state === "no" ? " + shipping" : ""}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
