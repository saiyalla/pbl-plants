"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Order, PAYMENT_LABEL, rupees, STATUS_STEPS, whatsappLink } from "@/lib/api";
import { recallOrderPhone, rememberOrderPhone } from "@/lib/tracking";

export default function OrderPage() {
  const { code } = useParams<{ code: string }>();
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(
    async (ph: string) => {
      setLoading(true);
      setError(null);
      try {
        const o = await api<Order>(`/api/orders/${encodeURIComponent(code)}?phone=${encodeURIComponent(ph)}`);
        setOrder(o);
        rememberOrderPhone(code, ph);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't load the order.");
      } finally {
        setLoading(false);
      }
    },
    [code],
  );

  useEffect(() => {
    setIsNew(new URLSearchParams(window.location.search).has("new"));
    const saved = recallOrderPhone(code);
    if (saved) {
      setPhone(saved);
      load(saved);
    }
  }, [code, load]);

  // Poll every 30s so the customer sees status changes without refreshing.
  useEffect(() => {
    if (!order || order.status === "delivered" || order.status === "cancelled") return;
    const t = window.setInterval(() => load(phone), 30_000);
    return () => window.clearInterval(t);
  }, [order, phone, load]);

  if (!order) {
    return (
      <div className="wrap page" style={{ maxWidth: 520 }}>
        <div className="page-head">
          <p className="eyebrow">Order {code}</p>
          <h1>Check your order</h1>
        </div>
        <form className="panel" onSubmit={(e) => { e.preventDefault(); load(phone); }}>
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="phone">Mobile number used for the order</label>
            <input id="phone" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button className="btn primary block" disabled={loading}>{loading ? "Loading…" : "Show order"}</button>
        </form>
      </div>
    );
  }

  const cancelled = order.status === "cancelled";
  const currentIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const awaitingPayment = order.payment_method === "online" && order.payment_status !== "paid";

  return (
    <div className="wrap page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        {isNew && !awaitingPayment && <div className="success-mark" aria-hidden="true">✓</div>}
        <p className="eyebrow">Order {order.public_id}</p>
        <h1>{isNew ? `Thank you, ${order.customer_name.split(" ")[0]}!` : "Your order"}</h1>
        {isNew && (
          <p className="muted">
            We&apos;ve got your order. Save the code <strong>{order.public_id}</strong> — you can track it any time
            from <Link href="/track">Track order</Link>.
          </p>
        )}
      </div>

      {awaitingPayment && (
        <div className="alert info">
          We&apos;re waiting for payment confirmation. If you paid, this updates within a minute. Questions?{" "}
          <a href={whatsappLink(`Hi PBL Plants, about my order ${order.public_id}`)} target="_blank" rel="noopener">Message us</a>.
        </div>
      )}

      <div className="checkout-grid">
        <section className="panel">
          <h2>Status</h2>
          {cancelled ? (
            <div className="alert error">This order was cancelled. If that&apos;s unexpected, message us on WhatsApp.</div>
          ) : (
            <ol className="timeline">
              {STATUS_STEPS.map((s, i) => (
                <li key={s.key} className={i < currentIndex || order.status === "delivered" ? "done" : i === currentIndex ? "current" : ""}>
                  <span className="dot">{i < currentIndex || order.status === "delivered" ? "✓" : ""}</span>
                  <span className="step-label">{s.label}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: "1.2rem", marginBottom: 0 }}>
            Our team delivers across Vizag and will call you before arriving.
          </p>
        </section>

        <aside className="panel">
          <h2>Summary</h2>
          {order.items.map((it) => (
            <div className="sum-row" key={it.product_name} style={{ marginBottom: "0.4rem" }}>
              <span>{it.quantity} × {it.product_name}</span>
              <span>{rupees(it.line_total_paise)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--line)", marginTop: "0.6rem", paddingTop: "0.6rem", display: "grid", gap: "0.35rem" }}>
            <div className="sum-row"><span>Delivery</span><span>{order.delivery_fee_paise ? rupees(order.delivery_fee_paise) : "Free"}</span></div>
            <div className="sum-row total"><span>Total</span><span>{rupees(order.total_paise)}</span></div>
            <div className="sum-row muted"><span>Payment</span><span>{PAYMENT_LABEL[order.payment_status]}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
