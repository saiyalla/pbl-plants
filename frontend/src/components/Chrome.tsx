"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SHOP, whatsappLink } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { ADMIN_AUTH_EVENT, readAdminToken, saveAdminToken } from "@/lib/tracking";
import { Icon } from "./Icons";

const TICKER =
  "🌿 5.0★ rated on Google  ·  Doorstep delivery across Vizag  ·  Order online or on WhatsApp — 099595 58369  ·  Open every day, 9am–9pm  ·  Ceramic pots, soil mix & decor stones in store";

export function Ticker() {
  return (
    <div className="ticker">
      <div className="ticker-track">
        <span>{TICKER}</span>
        <span aria-hidden="true">{TICKER}</span>
      </div>
    </div>
  );
}

export function Nav() {
  const { count, open } = useCart();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  // Re-checked on every navigation (so that after signing into /admin and clicking away — e.g.
  // the logo — the nav already knows to offer a way back) and on the auth-change event (so
  // logging in/out while already on /admin, with no navigation at all, updates immediately too).
  useEffect(() => {
    const check = () => setIsAdmin(!!readAdminToken());
    check();
    window.addEventListener(ADMIN_AUTH_EVENT, check);
    return () => window.removeEventListener(ADMIN_AUTH_EVENT, check);
  }, [pathname]);

  function signOut() {
    saveAdminToken("");
    setIsAdmin(false);
    // Full reload so the admin page's own (separately-held) session state resets too.
    window.location.reload();
  }

  return (
    <nav className="nav" aria-label="Main">
      <div className="wrap row">
        <Link className="brand" href="/">
          <span className="logo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="PBL Plants" />
          </span>
          <span className="brand-text">PBL Plants</span>
        </Link>
        <ul className="nav-links">
          <li><Link href="/#catalog">Shop</Link></li>
          <li className="hide-sm"><Link href="/#care">Care notes</Link></li>
          <li className="hide-sm"><Link href="/#visit">Visit</Link></li>
          <li><Link href="/track">Track order</Link></li>
          {isAdmin && (
            pathname === "/admin"
              ? <li><button type="button" className="as-link" onClick={signOut}>Sign out</button></li>
              : <li><Link href="/admin">Dashboard</Link></li>
          )}
          <li>
            <button className="cart-btn" onClick={open} aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}>
              <Icon name="bag" />
              {count > 0 && <span key={count} className="cart-count">{count}</span>}
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="wrap footer">
      <span>© {new Date().getFullYear()} PBL Plants — Seethammapeta, Visakhapatnam</span>
      <span style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/policies#shipping">Shipping</Link>
        <Link href="/policies#refunds">Refunds</Link>
        <Link href="/policies#privacy">Privacy</Link>
        <Link href="/policies#terms">Terms</Link>
        <a href={SHOP.instagram} target="_blank" rel="noopener">Instagram</a>
      </span>
    </footer>
  );
}

export function FloatingWhatsApp() {
  return (
    <a className="fab-wa" href={whatsappLink()} target="_blank" rel="noopener" aria-label="Message PBL Plants on WhatsApp">
      <Icon name="wa" />
    </a>
  );
}
