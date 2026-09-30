"use client";

import { useState } from "react";
import { imageSrc, type Product, rupees, whatsappLink } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { Icon } from "./Icons";

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "leaf" },
  { key: "bamboo", label: "Lucky Bamboo", icon: "logo" },
  { key: "foliage", label: "Foliage", icon: "leaf" },
  { key: "succulent", label: "Succulents", icon: "succulent" },
  { key: "gift", label: "Gifting", icon: "gift" },
  { key: "pots", label: "Pots", icon: "pot-ceramic" },
  { key: "decor", label: "Soil & Stones", icon: "stones" },
];

export function Catalog({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? products : products.filter((p) => p.category === filter);
  const categories = CATEGORIES.filter((c) => c.key === "all" || products.some((p) => p.category === c.key));

  if (products.length === 0) {
    return (
      <div className="empty">
        The catalog is taking a moment to load. Message us on{" "}
        <a href={whatsappLink("Hi PBL Plants, what's in stock today?")} target="_blank" rel="noopener">WhatsApp</a>{" "}
        and we&apos;ll send you today&apos;s stock.
      </div>
    );
  }

  return (
    <>
      <div className="cat-strip" role="group" aria-label="Filter by category">
        {categories.map((c) => (
          <button key={c.key} type="button" className="cat-chip" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>
            <span className="ring"><Icon name={c.icon} /></span>
            <span className="label">{c.label}</span>
          </button>
        ))}
      </div>

      {/* key={filter} replays the pop-in animation when the filter changes */}
      <div className="product-grid" key={filter}>
        {visible.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  const { add } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const orderable = p.in_stock && p.price_paise != null;

  function onAdd() {
    add(p);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 600);
  }

  return (
    <article className="product-card">
      <div className="product-media">
        {p.badge && <span className="badge">{p.badge}</span>}
        {!p.in_stock && <span className="stock-pill">Out of stock</span>}
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc(p.image_url)!} alt={p.name} loading="lazy" />
        ) : (
          <Icon name={p.icon} />
        )}
      </div>
      <div className="product-body">
        <h3>{p.name}</h3>
        <p className="tagline">{p.tagline}</p>
        <div className="care">{p.care.map((c) => <span key={c}>{c}</span>)}</div>
      </div>
      <div className="product-foot">
        {p.price_paise != null ? (
          <span className="price">{p.price_is_from && <small>from</small>}{rupees(p.price_paise)}</span>
        ) : (
          <span className="price ask">Ask for price</span>
        )}
        {orderable ? (
          <button className={`pill-btn${justAdded ? " added" : ""}`} onClick={onAdd}>
            <Icon name="bag" /> {justAdded ? "Added" : "Add"}
          </button>
        ) : (
          <a
            className="pill-btn outline"
            href={whatsappLink(`Hi PBL Plants, I'd like to ask about the ${p.name}`)}
            target="_blank"
            rel="noopener"
          >
            <Icon name="wa" /> Ask
          </a>
        )}
      </div>
    </article>
  );
}
