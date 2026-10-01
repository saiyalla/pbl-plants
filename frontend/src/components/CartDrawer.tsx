"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type Product, rupees } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { Icon } from "./Icons";

export function Suggestions() {
  const { add } = useCart();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    api<Product[]>("/api/products")
      .then((ps) => setProducts(ps.filter((p) => p.in_stock && p.price_paise != null).slice(0, 4)))
      .catch(() => {});
  }, []);

  if (products.length === 0) return null;

  return (
    <div style={{ marginTop: "1.2rem", display: "grid", gap: "0.6rem" }}>
      <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>Popular right now</p>
      {products.map((p) => (
        <div className="line" key={p.id}>
          <div className="line-thumb"><Icon name={p.icon} /></div>
          <div>
            <div className="line-name">{p.name}</div>
            <div className="line-price">{rupees(p.price_paise!)}</div>
          </div>
          <button className="pill-btn" style={{ fontSize: "0.78rem" }} onClick={() => add(p)}>Add</button>
        </div>
      ))}
    </div>
  );
}

export function CartDrawer() {
  const { lines, isOpen, close, setQuantity, remove, subtotalPaise, count } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="drawer-head">
          <h2 id="cart-title">Your cart {count > 0 && <span className="muted">({count})</span>}</h2>
          <button ref={closeRef} className="icon-btn" onClick={close} aria-label="Close cart">
            <Icon name="close" />
          </button>
        </div>

        <div className="drawer-body">
          {lines.length === 0 ? (
            <>
              <div className="empty" style={{ marginTop: "1rem" }}>
                Your cart is empty. Add a plant from the shop to get started.
              </div>
              <Link className="btn primary block" href="/#catalog" onClick={close} style={{ marginTop: "1rem" }}>
                Shop now
              </Link>
              <Suggestions />
            </>
          ) : (
            lines.map((l) => (
              <div className="line" key={l.productId}>
                <div className="line-thumb"><Icon name={l.icon} /></div>
                <div>
                  <div className="line-name">{l.name}</div>
                  <div className="line-price">{rupees(l.pricePaise)} each</div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div className="qty">
                      <button onClick={() => setQuantity(l.productId, l.quantity - 1)} aria-label={`One fewer ${l.name}`}>−</button>
                      <span aria-live="polite">{l.quantity}</span>
                      <button onClick={() => setQuantity(l.productId, l.quantity + 1)} aria-label={`One more ${l.name}`} disabled={l.quantity >= 20}>+</button>
                    </div>
                    <button className="link-btn" onClick={() => remove(l.productId)}>Remove</button>
                  </div>
                </div>
                <div className="line-total">{rupees(l.pricePaise * l.quantity)}</div>
              </div>
            ))
          )}
        </div>

        {lines.length > 0 && (
          <div className="drawer-foot">
            <div className="sum-row total"><span>Subtotal</span><span>{rupees(subtotalPaise)}</span></div>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Delivery charges, if any, are shown at checkout.</p>
            <Link className="btn primary block" href="/checkout" onClick={close}>Checkout</Link>
            <button className="btn ghost block" onClick={close}>Keep shopping</button>
          </div>
        )}
      </aside>
    </>
  );
}
