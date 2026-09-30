"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fieldClass, FieldError } from "@/components/FieldError";
import {
  type AdminOrder,
  api,
  ApiError,
  type CheckoutDraft,
  type CheckoutRecoveryResult,
  type Coupon,
  type CouponCreate,
  type DeliverySettings,
  type DeliveryZone,
  type DeliveryZoneCreate,
  type DiscountType,
  imageSrc,
  type Offer,
  type OfferCreate,
  type OrderStatus,
  PAYMENT_LABEL,
  type Product,
  type ProductCreate,
  rupees,
  uploadProductImage,
} from "@/lib/api";

// Keep in sync with CATEGORIES in components/Catalog.tsx.
const CATEGORY_OPTIONS = ["bamboo", "foliage", "succulent", "gift", "pots", "decor"];
const ICON_OPTIONS = ["leaf", "logo", "succulent", "gift", "pot-ceramic", "pot-plastic", "soil", "stones"];

function ImagePlaceholder() {
  return (
    <div className="thumb-empty" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
        <path d="M21 16.5l-5.2-5.2a2 2 0 0 0-2.8 0L4 20.4" />
      </svg>
    </div>
  );
}

const TOKEN_KEY = "pbl-admin-token";

// Mirrors ALLOWED_TRANSITIONS in the backend.
const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  placed: { to: "confirmed", label: "Confirm" },
  confirmed: { to: "packed", label: "Mark packed" },
  packed: { to: "out_for_delivery", label: "Out for delivery" },
  out_for_delivery: { to: "delivered", label: "Mark delivered" },
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "New",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function readToken() {
  try { return window.sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}
function saveToken(t: string) {
  try { t ? window.sessionStorage.setItem(TOKEN_KEY, t) : window.sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"orders" | "products" | "offers" | "delivery" | "coupons">("orders");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setToken(readToken()), []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/orders?limit=1", { token: draft });
      saveToken(draft);
      setToken(draft);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in.");
    }
  }

  if (!token) {
    return (
      <div className="wrap page" style={{ maxWidth: 440 }}>
        <div className="page-head"><p className="eyebrow">PBL team</p><h1>Dashboard sign-in</h1></div>
        <form className="panel" onSubmit={login}>
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="token">Admin token</label>
            <input id="token" type="password" autoComplete="current-password" required value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <button className="btn primary block">Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <div className="admin-bar">
        <div className="page-head" style={{ margin: 0 }}><p className="eyebrow">PBL team</p><h1>Dashboard</h1></div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <div className="tabs">
            <button aria-pressed={tab === "orders"} onClick={() => setTab("orders")}>Orders</button>
            <button aria-pressed={tab === "products"} onClick={() => setTab("products")}>Products</button>
            <button aria-pressed={tab === "offers"} onClick={() => setTab("offers")}>Offers</button>
            <button aria-pressed={tab === "delivery"} onClick={() => setTab("delivery")}>Delivery</button>
            <button aria-pressed={tab === "coupons"} onClick={() => setTab("coupons")}>Coupons</button>
          </div>
          <button className="btn ghost" onClick={() => { saveToken(""); setToken(""); }}>Sign out</button>
        </div>
      </div>
      {tab === "orders" ? <Orders token={token} />
        : tab === "products" ? <Products token={token} />
        : tab === "offers" ? <Offers token={token} />
        : tab === "delivery" ? <Delivery token={token} />
        : <Coupons token={token} />}
    </div>
  );
}

function Orders({ token }: { token: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState<"active" | OrderStatus | "all">("active");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders(await api<AdminOrder[]>("/api/admin/orders?limit=200", { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load orders.");
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 20_000); // new orders appear without refreshing
    return () => window.clearInterval(t);
  }, [load]);

  async function move(o: AdminOrder, to: OrderStatus) {
    if (to === "cancelled" && !window.confirm(`Cancel order ${o.public_id}?`)) return;
    setBusyId(o.id);
    try {
      const updated = await api<AdminOrder>(`/api/admin/orders/${o.id}/status`, {
        method: "PATCH", token, body: JSON.stringify({ status: to }),
      });
      setOrders((list) => list.map((x) => (x.id === o.id ? updated : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  const shown = orders.filter((o) =>
    filter === "all" ? true : filter === "active" ? !["delivered", "cancelled"].includes(o.status) : o.status === filter,
  );
  const newCount = orders.filter((o) => o.status === "placed").length;

  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="filter-row">
        {(["active", "placed", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled", "all"] as const).map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "active" ? "Active" : f === "all" ? "All" : STATUS_LABEL[f]}
            {f === "placed" && newCount > 0 ? ` (${newCount})` : ""}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">No orders here.</div>
      ) : (
        <div className="order-list">
          {shown.map((o) => {
            const next = NEXT_STEP[o.status];
            const unpaidOnline = o.payment_method === "online" && o.payment_status !== "paid";
            const payTag = o.payment_status === "paid" || o.payment_status === "cod_collected" ? "good" : o.payment_status === "failed" ? "bad" : "warn";
            return (
              <article className="order-card" key={o.id} data-status={o.status}>
                <div className="order-top">
                  <div>
                    <span className="order-code">{o.public_id}</span>
                    <span className="tag">{STATUS_LABEL[o.status]}</span>
                    <span className={`tag ${payTag}`}>{PAYMENT_LABEL[o.payment_status]}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{rupees(o.total_paise)}</div>
                </div>
                <div className="order-meta">
                  <div>
                    <strong>{o.customer_name}</strong><br />
                    <a href={`tel:+91${o.phone}`}>{o.phone}</a> · <a href={`https://wa.me/91${o.phone}`} target="_blank" rel="noopener">WhatsApp</a>
                  </div>
                  <div>{o.address}, {o.pincode}</div>
                  <div className="muted">{new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
                <ul className="order-items">
                  {o.items.map((i) => <li key={i.product_name}>{i.quantity} × {i.product_name} — {rupees(i.line_total_paise)}</li>)}
                </ul>
                {o.notes && <p style={{ margin: "0.6rem 0 0", fontSize: "0.88rem" }}><strong>Note:</strong> {o.notes}</p>}
                <div className="order-actions">
                  {next && !unpaidOnline && (
                    <button className="btn primary" disabled={busyId === o.id} onClick={() => move(o, next.to)}>{next.label}</button>
                  )}
                  {unpaidOnline && o.status === "placed" && <span className="muted" style={{ fontSize: "0.85rem", alignSelf: "center" }}>Waiting for online payment…</span>}
                  {!["delivered", "cancelled"].includes(o.status) && (
                    <button className="btn ghost" disabled={busyId === o.id} onClick={() => move(o, "cancelled")}>Cancel</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function Products({ token }: { token: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    api<Product[]>("/api/admin/products", { token })
      .then((ps) => {
        setProducts(ps);
        setPrices(Object.fromEntries(ps.map((p) => [p.id, p.price_paise == null ? "" : String(p.price_paise / 100)])));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load products."));
  }, [token]);

  useEffect(() => load(), [load]);

  async function save(p: Product, patch: Record<string, unknown>) {
    setError(null);
    try {
      const updated = await api<Product>(`/api/admin/products/${p.id}`, { method: "PATCH", token, body: JSON.stringify(patch) });
      setProducts((list) => list.map((x) => (x.id === p.id ? updated : x)));
      setSaved(p.id);
      window.setTimeout(() => setSaved(null), 1500);
      return updated;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
      return null;
    }
  }

  async function createProduct(data: ProductCreate, imageFile?: File | null) {
    setError(null);
    try {
      let created = await api<Product>("/api/admin/products", { method: "POST", token, body: JSON.stringify(data) });
      if (imageFile) {
        try {
          created = await uploadProductImage(created.id, imageFile, token);
        } catch (e) {
          setError(e instanceof ApiError ? `Product added, but the image failed to upload: ${e.message}` : "Product added, but the image failed to upload.");
        }
      }
      setProducts((list) => [...list, created]);
      setPrices((s) => ({ ...s, [created.id]: created.price_paise == null ? "" : String(created.price_paise / 100) }));
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add product.");
    }
  }

  async function deleteProduct(p: Product) {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    setError(null);
    setDeletingId(p.id);
    try {
      await api<void>(`/api/admin/products/${p.id}`, { method: "DELETE", token });
      setProducts((list) => list.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete product.");
    } finally {
      setDeletingId(null);
    }
  }

  function savePrice(p: Product) {
    const raw = prices[p.id]?.trim() ?? "";
    if (raw === "") return save(p, { clear_price: true });
    const rupeesValue = Number(raw);
    if (!Number.isFinite(rupeesValue) || rupeesValue < 0) return setError(`Enter a valid price for ${p.name}.`);
    return save(p, { price_paise: Math.round(rupeesValue * 100) });
  }

  async function onImageChosen(p: Product, file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploadingId(p.id);
    try {
      const updated = await uploadProductImage(p.id, file, token);
      setProducts((list) => list.map((x) => (x.id === p.id ? updated : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Image upload failed.");
    } finally {
      setUploadingId(null);
    }
  }

  function removeImage(p: Product) {
    return save(p, { clear_image: true });
  }

  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Leave the price empty to show &ldquo;Ask for price&rdquo;. Changes appear on the website within a minute.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.6rem" }}>
        <button className="btn primary" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Cancel" : "+ Add product"}</button>
      </div>
      {showAdd && <AddProductForm onCreate={createProduct} onCancel={() => setShowAdd(false)} />}
      <div className="panel table-wrap" style={{ padding: "0.4rem 1rem" }}>
        <table className="admin-table">
          <thead><tr><th>Image</th><th className="col-flex">Product</th><th>Price (₹)</th><th>In stock</th><th /></tr></thead>
          <tbody>
            {products.map((p) =>
              editingId === p.id ? (
                <EditProductRow
                  key={p.id}
                  product={p}
                  uploading={uploadingId === p.id}
                  onImageChosen={(file) => onImageChosen(p, file)}
                  onRemoveImage={() => removeImage(p)}
                  onCancel={() => setEditingId(null)}
                  onSave={async (patch) => {
                    const updated = await save(p, patch);
                    if (updated) setEditingId(null);
                  }}
                />
              ) : (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-start" }}>
                      <div className="thumb-wrap">
                        {imageSrc(p.image_url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageSrc(p.image_url)!} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                        ) : (
                          <ImagePlaceholder />
                        )}
                        {p.image_url && (
                          <button
                            type="button" className="thumb-remove" aria-label={`Remove ${p.name} image`}
                            disabled={uploadingId === p.id} onClick={() => removeImage(p)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <label className="pill-btn" style={{ fontSize: "0.75rem", cursor: "pointer" }}>
                        {uploadingId === p.id ? "Uploading…" : "Upload"}
                        <input
                          type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }}
                          disabled={uploadingId === p.id}
                          onChange={(e) => { onImageChosen(p, e.target.files?.[0]); e.target.value = ""; }}
                        />
                      </label>
                    </div>
                  </td>
                  <td className="col-flex"><strong>{p.name}</strong><div className="muted" style={{ fontSize: "0.78rem" }}>{p.category}</div></td>
                  <td>
                    <input
                      type="number" min={0} step="1" inputMode="decimal" aria-label={`Price for ${p.name}`}
                      value={prices[p.id] ?? ""} placeholder="Ask"
                      onChange={(e) => setPrices((s) => ({ ...s, [p.id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`${p.name} in stock`} checked={p.in_stock} onChange={(e) => save(p, { in_stock: e.target.checked })} />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "nowrap" }}>
                      <button className="pill-btn" onClick={() => savePrice(p)}>{saved === p.id ? "Saved ✓" : "Save price"}</button>
                      <button className="pill-btn" onClick={() => setEditingId(p.id)}>Edit</button>
                      <button className="pill-btn" disabled={deletingId === p.id} onClick={() => deleteProduct(p)}>
                        {deletingId === p.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AddProductForm({
  onCreate, onCancel,
}: {
  onCreate: (data: ProductCreate, imageFile?: File | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [tagline, setTagline] = useState("");
  const [badge, setBadge] = useState("");
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onImagePicked(file: File | undefined) {
    setImage(file ?? null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    if (!file && fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setNameError("Enter a product name.");
    setNameError(undefined);
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), category, tagline: tagline.trim(), icon, badge: badge.trim() || null }, image);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel edit-panel" style={{ marginBottom: "0.8rem", display: "grid", gap: "0.6rem" }} onSubmit={submit} noValidate>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
        <div className={fieldClass(nameError)}>
          <label htmlFor="new-name">Name</label>
          <input id="new-name" value={name} onChange={(e) => { setName(e.target.value); if (nameError) setNameError(undefined); }} />
          <FieldError message={nameError} />
        </div>
        <div className="field">
          <label htmlFor="new-category">Category</label>
          <select id="new-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-icon">Icon</label>
          <select id="new-icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
            {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-badge">Badge (optional)</label>
          <input id="new-badge" value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. Bestseller, Statement piece" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem" }}>
        <div className="field">
          <label htmlFor="new-tagline">Tagline</label>
          <input id="new-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Short description shown on the site" />
        </div>
        <div className="field">
          <label htmlFor="new-image">Photo (optional)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            {imagePreview && (
              <div className="thumb-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                <button type="button" className="thumb-remove" aria-label="Remove selected image" onClick={() => onImagePicked(undefined)}>×</button>
              </div>
            )}
            <label className="pill-btn" style={{ cursor: "pointer" }}>
              {image ? "Change photo" : "Choose photo"}
              <input
                id="new-image" ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }}
                onChange={(e) => onImagePicked(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.6rem" }}>
        <button className="btn primary" disabled={busy}>{busy ? "Adding…" : "Add product"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EditProductRow({
  product, uploading, onImageChosen, onRemoveImage, onSave, onCancel,
}: {
  product: Product;
  uploading: boolean;
  onImageChosen: (file: File | undefined) => void;
  onRemoveImage: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [icon, setIcon] = useState(product.icon);
  const [tagline, setTagline] = useState(product.tagline);
  const [badge, setBadge] = useState(product.badge ?? "");
  const [care, setCare] = useState(product.care.join(", "));
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setNameError("Enter a product name.");
    setNameError(undefined);
    setBusy(true);
    const trimmedBadge = badge.trim();
    try {
      await onSave({
        name: name.trim(),
        category,
        icon,
        tagline: tagline.trim(),
        care: care.split(",").map((c) => c.trim()).filter(Boolean),
        ...(trimmedBadge ? { badge: trimmedBadge } : { clear_badge: true }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="edit-row">
      <td colSpan={5} style={{ padding: "0.6rem" }}>
        <form onSubmit={submit} className="edit-panel" style={{ display: "grid", gap: "0.6rem" }} noValidate>
          <div className="field">
            <label>Photo</label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div className="thumb-wrap">
                {imageSrc(product.image_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageSrc(product.image_url)!} alt={product.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                ) : (
                  <ImagePlaceholder />
                )}
                {product.image_url && (
                  <button type="button" className="thumb-remove" aria-label={`Remove ${product.name} image`} disabled={uploading} onClick={onRemoveImage}>×</button>
                )}
              </div>
              <label className="pill-btn" style={{ fontSize: "0.75rem", cursor: "pointer" }}>
                {uploading ? "Uploading…" : "Upload"}
                <input
                  type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }}
                  disabled={uploading}
                  onChange={(e) => { onImageChosen(e.target.files?.[0]); e.target.value = ""; }}
                />
              </label>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
            <div className={fieldClass(nameError)}>
              <label>Name</label>
              <input value={name} onChange={(e) => { setName(e.target.value); if (nameError) setNameError(undefined); }} />
              <FieldError message={nameError} />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Icon</label>
              <select value={icon} onChange={(e) => setIcon(e.target.value)}>
                {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Care tags (comma-separated)</label>
              <input value={care} onChange={(e) => setCare(e.target.value)} />
            </div>
            <div className="field">
              <label>Badge (optional)</label>
              <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. Bestseller, Statement piece" />
            </div>
          </div>
          <div className="field">
            <label>Tagline</label>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function Offers({ token }: { token: string }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [minSpend, setMinSpend] = useState("");
  const [rewardText, setRewardText] = useState("");
  const [offerErrors, setOfferErrors] = useState<{ minSpend?: string; rewardText?: string }>({});
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(() => {
    api<Offer[]>("/api/admin/offers", { token })
      .then(setOffers)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load offers."));
  }, [token]);

  useEffect(() => load(), [load]);

  async function createOffer(e: React.FormEvent) {
    e.preventDefault();
    const rupeesValue = Number(minSpend);
    const errs: { minSpend?: string; rewardText?: string } = {};
    if (!minSpend.trim() || !Number.isFinite(rupeesValue) || rupeesValue < 0) errs.minSpend = "Enter a valid minimum spend.";
    if (!rewardText.trim()) errs.rewardText = "Describe what the customer gets.";
    setOfferErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setError(null);
    setBusy(true);
    try {
      const data: OfferCreate = { min_spend_paise: Math.round(rupeesValue * 100), reward_text: rewardText.trim() };
      const created = await api<Offer>("/api/admin/offers", { method: "POST", token, body: JSON.stringify(data) });
      setOffers((list) => [...list, created]);
      setMinSpend("");
      setRewardText("");
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add offer.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(o: Offer) {
    setSavingId(o.id);
    setError(null);
    try {
      const updated = await api<Offer>(`/api/admin/offers/${o.id}`, {
        method: "PATCH", token, body: JSON.stringify({ active: !o.active }),
      });
      setOffers((list) => list.map((x) => (x.id === o.id ? updated : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteOffer(o: Offer) {
    if (!window.confirm(`Delete this offer ("${o.reward_text}")?`)) return;
    setDeletingId(o.id);
    setError(null);
    try {
      await api<void>(`/api/admin/offers/${o.id}`, { method: "DELETE", token });
      setOffers((list) => list.filter((x) => x.id !== o.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete offer.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Shown as a banner on the site when a cart would cross the minimum spend. Nothing is applied automatically —
        honour the offer yourself when packing the order.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.6rem" }}>
        <button className="btn primary" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Cancel" : "+ Add offer"}</button>
      </div>
      {showAdd && (
        <form className="panel edit-panel" style={{ marginBottom: "0.8rem", display: "grid", gap: "0.6rem" }} onSubmit={createOffer} noValidate>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.6rem" }}>
            <div className={fieldClass(offerErrors.minSpend)}>
              <label htmlFor="offer-min">Minimum spend (₹)</label>
              <input
                id="offer-min" type="number" min={0} value={minSpend}
                onChange={(e) => { setMinSpend(e.target.value); if (offerErrors.minSpend) setOfferErrors((s) => ({ ...s, minSpend: undefined })); }}
              />
              <FieldError message={offerErrors.minSpend} />
            </div>
            <div className={fieldClass(offerErrors.rewardText)}>
              <label htmlFor="offer-reward">Reward</label>
              <input
                id="offer-reward" value={rewardText} placeholder="e.g. a free succulent (worth ₹150)"
                onChange={(e) => { setRewardText(e.target.value); if (offerErrors.rewardText) setOfferErrors((s) => ({ ...s, rewardText: undefined })); }}
              />
              <FieldError message={offerErrors.rewardText} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn primary" disabled={busy}>{busy ? "Adding…" : "Add offer"}</button>
            <button type="button" className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </form>
      )}

      {offers.length === 0 ? (
        <div className="empty">No offers yet — add one to show a banner on the site.</div>
      ) : (
        <div className="panel table-wrap" style={{ padding: "0.4rem 1rem" }}>
          <table className="admin-table">
            <thead><tr><th className="col-flex">Offer</th><th>Active</th><th /></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td className="col-flex">
                    Spend <strong>{rupees(o.min_spend_paise)}+</strong> and get <strong>{o.reward_text}</strong>
                  </td>
                  <td>
                    <input
                      type="checkbox" aria-label="Offer active" checked={o.active}
                      disabled={savingId === o.id} onChange={() => toggleActive(o)}
                    />
                  </td>
                  <td>
                    <button
                      type="button" className="pill-btn outline" disabled={deletingId === o.id}
                      onClick={() => deleteOffer(o)}
                    >
                      {deletingId === o.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Delivery({ token }: { token: string }) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [settings, setSettings] = useState<DeliverySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [pincode, setPincode] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [label, setLabel] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [zoneErrors, setZoneErrors] = useState<{ pincode?: string; distanceKm?: string }>({});

  const [freeKm, setFreeKm] = useState("");
  const [ratePerKm, setRatePerKm] = useState("");
  const [freeMin, setFreeMin] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const load = useCallback(() => {
    api<DeliveryZone[]>("/api/admin/delivery-zones", { token }).then(setZones).catch(() => {});
    api<DeliverySettings>("/api/admin/delivery-settings", { token })
      .then((s) => {
        setSettings(s);
        setFreeKm(String(s.free_km));
        setRatePerKm(String(s.rate_paise_per_km / 100));
        setFreeMin(String(s.free_delivery_min_paise / 100));
        setMaxKm(String(s.max_km));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load delivery settings."));
  }, [token]);

  useEffect(() => load(), [load]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const parsed = {
      free_km: Number(freeKm),
      rate_paise_per_km: Math.round(Number(ratePerKm) * 100),
      free_delivery_min_paise: Math.round(Number(freeMin) * 100),
      max_km: Number(maxKm),
    };
    if (Object.values(parsed).some((v) => !Number.isFinite(v) || v < 0)) {
      return setError("Enter valid, non-negative numbers for the delivery formula.");
    }
    setError(null);
    setSettingsBusy(true);
    try {
      const updated = await api<DeliverySettings>("/api/admin/delivery-settings", {
        method: "PATCH", token, body: JSON.stringify(parsed),
      });
      setSettings(updated);
      setSettingsSaved(true);
      window.setTimeout(() => setSettingsSaved(false), 1500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save delivery settings.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function addZone(e: React.FormEvent) {
    e.preventDefault();
    const km = Number(distanceKm);
    const errs: { pincode?: string; distanceKm?: string } = {};
    if (!/^\d{6}$/.test(pincode)) errs.pincode = "Enter a valid 6-digit pincode.";
    if (!distanceKm.trim() || !Number.isFinite(km) || km < 0) errs.distanceKm = "Enter a valid distance in km.";
    setZoneErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setError(null);
    setAddBusy(true);
    try {
      const data: DeliveryZoneCreate = { pincode, distance_km: km, label: label.trim() };
      const created = await api<DeliveryZone>("/api/admin/delivery-zones", { method: "POST", token, body: JSON.stringify(data) });
      setZones((list) => [...list, created].sort((a, b) => a.distance_km - b.distance_km));
      setPincode("");
      setDistanceKm("");
      setLabel("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add delivery zone.");
    } finally {
      setAddBusy(false);
    }
  }

  async function deleteZone(z: DeliveryZone) {
    if (!window.confirm(`Remove ${z.pincode} from the delivery zones?`)) return;
    setDeletingId(z.id);
    setError(null);
    try {
      await api<void>(`/api/admin/delivery-zones/${z.id}`, { method: "DELETE", token });
      setZones((list) => list.filter((x) => x.id !== z.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't remove delivery zone.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}

      <div className="panel edit-panel" style={{ marginBottom: "1.2rem" }}>
        <h2>Delivery fee formula</h2>
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: "-0.4rem" }}>
          Free within the first distance, then a per-km charge beyond it — waived entirely once the cart reaches
          the free-delivery threshold. Cash on delivery is only offered within the free radius.
        </p>
        <form onSubmit={saveSettings} style={{ display: "grid", gap: "0.6rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.6rem" }}>
            <div className="field">
              <label htmlFor="free-km">Free radius (km)</label>
              <input id="free-km" type="number" min={0} step="0.1" value={freeKm} onChange={(e) => setFreeKm(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rate-km">Rate per km beyond that (₹)</label>
              <input id="rate-km" type="number" min={0} step="1" value={ratePerKm} onChange={(e) => setRatePerKm(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="free-min">Free delivery above cart value (₹)</label>
              <input id="free-min" type="number" min={0} step="1" value={freeMin} onChange={(e) => setFreeMin(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="max-km">Max delivery distance (km)</label>
              <input id="max-km" type="number" min={0} step="0.1" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} />
            </div>
          </div>
          <div>
            <button className="btn primary" disabled={settingsBusy}>
              {settingsBusy ? "Saving…" : settingsSaved ? "Saved ✓" : "Save formula"}
            </button>
          </div>
        </form>
      </div>

      <h2>Delivery zones</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Only pincodes listed here are deliverable. Add every pincode you deliver to, with its distance from the store.
      </p>
      <form className="panel edit-panel" style={{ marginBottom: "0.8rem", display: "grid", gap: "0.6rem" }} onSubmit={addZone} noValidate>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
          <div className={fieldClass(zoneErrors.pincode)}>
            <label htmlFor="zone-pincode">Pincode</label>
            <input
              id="zone-pincode" inputMode="numeric" maxLength={6} placeholder="530016" value={pincode}
              onChange={(e) => { setPincode(e.target.value); if (zoneErrors.pincode) setZoneErrors((s) => ({ ...s, pincode: undefined })); }}
            />
            <FieldError message={zoneErrors.pincode} />
          </div>
          <div className={fieldClass(zoneErrors.distanceKm)}>
            <label htmlFor="zone-km">Distance (km)</label>
            <input
              id="zone-km" type="number" min={0} step="0.1" value={distanceKm}
              onChange={(e) => { setDistanceKm(e.target.value); if (zoneErrors.distanceKm) setZoneErrors((s) => ({ ...s, distanceKm: undefined })); }}
            />
            <FieldError message={zoneErrors.distanceKm} />
          </div>
          <div className="field">
            <label htmlFor="zone-label">Area name (optional)</label>
            <input id="zone-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. MVP Colony" />
          </div>
        </div>
        <div>
          <button className="btn primary" disabled={addBusy}>{addBusy ? "Adding…" : "+ Add zone"}</button>
        </div>
      </form>

      {zones.length === 0 ? (
        <div className="empty">No delivery zones yet — add your first pincode above.</div>
      ) : (
        <div className="panel table-wrap" style={{ padding: "0.4rem 1rem" }}>
          <table className="admin-table">
            <thead><tr><th>Pincode</th><th className="col-flex">Area</th><th>Distance</th><th /></tr></thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <td>{z.pincode}</td>
                  <td className="col-flex">{z.label || "—"}</td>
                  <td>{z.distance_km} km</td>
                  <td>
                    <button
                      type="button" className="pill-btn outline" disabled={deletingId === z.id}
                      onClick={() => deleteZone(z)}
                    >
                      {deletingId === z.id ? "Removing…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} day(s) ago`;
}

function Coupons({ token }: { token: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [drafts, setDrafts] = useState<CheckoutDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [recoveringId, setRecoveringId] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<Record<number, CheckoutRecoveryResult>>({});

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [valueError, setValueError] = useState<string | undefined>();

  const load = useCallback(() => {
    api<Coupon[]>("/api/admin/coupons", { token }).then(setCoupons).catch(() => {});
    api<CheckoutDraft[]>("/api/admin/checkout-drafts", { token }).then(setDrafts).catch(() => {});
  }, [token]);

  useEffect(() => load(), [load]);

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(discountValue);
    if (!discountValue.trim() || !Number.isFinite(value) || value <= 0) {
      return setValueError(discountType === "percent" ? "Enter a percent between 1 and 100." : "Enter a valid amount.");
    }
    if (discountType === "percent" && value > 100) return setValueError("A percent discount can't exceed 100.");
    setValueError(undefined);
    setError(null);
    setBusy(true);
    try {
      const data: CouponCreate = {
        code: code.trim() || null,
        discount_type: discountType,
        discount_value: discountType === "percent" ? value : Math.round(value * 100),
        min_order_paise: minOrder ? Math.round(Number(minOrder) * 100) : 0,
        max_discount_paise: maxDiscount ? Math.round(Number(maxDiscount) * 100) : null,
        usage_limit: usageLimit ? Number(usageLimit) : null,
        // End of the chosen day in IST (the shop's timezone), not the start of it.
        expires_at: expiresAt ? `${expiresAt}T23:59:59+05:30` : null,
      };
      const created = await api<Coupon>("/api/admin/coupons", { method: "POST", token, body: JSON.stringify(data) });
      setCoupons((list) => [created, ...list]);
      setShowAdd(false);
      setCode(""); setDiscountValue("10"); setMinOrder(""); setMaxDiscount(""); setUsageLimit(""); setExpiresAt("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create coupon.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c: Coupon) {
    setSavingId(c.id);
    try {
      const updated = await api<Coupon>(`/api/admin/coupons/${c.id}`, { method: "PATCH", token, body: JSON.stringify({ active: !c.active }) });
      setCoupons((list) => list.map((x) => (x.id === c.id ? updated : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteCoupon(c: Coupon) {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    setDeletingId(c.id);
    try {
      await api<void>(`/api/admin/coupons/${c.id}`, { method: "DELETE", token });
      setCoupons((list) => list.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete coupon.");
    } finally {
      setDeletingId(null);
    }
  }

  async function recoverDraft(d: CheckoutDraft) {
    setRecoveringId(d.id);
    setError(null);
    try {
      const result = await api<CheckoutRecoveryResult>(`/api/admin/checkout-drafts/${d.id}/recover`, { method: "POST", token });
      setRecovery((r) => ({ ...r, [d.id]: result }));
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't generate a recovery coupon.");
    } finally {
      setRecoveringId(null);
    }
  }

  async function dismissDraft(d: CheckoutDraft) {
    try {
      await api<void>(`/api/admin/checkout-drafts/${d.id}`, { method: "DELETE", token });
      setDrafts((list) => list.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't dismiss.");
    }
  }

  return (
    <>
      {error && <div className="alert error" role="alert">{error}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <h2 style={{ margin: 0 }}>Coupons</h2>
        <button className="btn primary" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Cancel" : "+ Add coupon"}</button>
      </div>

      {showAdd && (
        <form className="panel edit-panel" style={{ marginBottom: "0.8rem", display: "grid", gap: "0.6rem" }} onSubmit={createCoupon} noValidate>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
            <div className="field">
              <label htmlFor="c-code">Code (optional — auto-generated if blank)</label>
              <input id="c-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. WELCOME10" />
            </div>
            <div className="field">
              <label htmlFor="c-type">Type</label>
              <select id="c-type" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                <option value="percent">Percent off</option>
                <option value="flat">Flat amount off (₹)</option>
              </select>
            </div>
            <div className={fieldClass(valueError)}>
              <label htmlFor="c-value">{discountType === "percent" ? "Percent off (1-100)" : "Amount off (₹)"}</label>
              <input
                id="c-value" type="number" min={1} value={discountValue}
                onChange={(e) => { setDiscountValue(e.target.value); if (valueError) setValueError(undefined); }}
              />
              <FieldError message={valueError} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
            <div className="field">
              <label htmlFor="c-min">Minimum order (₹, optional)</label>
              <input id="c-min" type="number" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
            </div>
            {discountType === "percent" && (
              <div className="field">
                <label htmlFor="c-max">Max discount cap (₹, optional)</label>
                <input id="c-max" type="number" min={0} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor="c-usage">Usage limit (optional)</label>
              <input id="c-usage" type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" />
            </div>
            <div className="field">
              <label htmlFor="c-expires">Expires on (optional)</label>
              <input id="c-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div>
            <button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create coupon"}</button>
          </div>
        </form>
      )}

      {coupons.length === 0 ? (
        <div className="empty">No coupons yet.</div>
      ) : (
        <div className="panel table-wrap" style={{ padding: "0.4rem 1rem", marginBottom: "1.4rem" }}>
          <table className="admin-table">
            <thead><tr><th className="col-flex">Code</th><th>Discount</th><th>Used</th><th>Active</th><th /></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="col-flex">
                    <strong>{c.code}</strong>
                    {c.min_order_paise > 0 && <div className="muted" style={{ fontSize: "0.78rem" }}>Min order {rupees(c.min_order_paise)}</div>}
                    {c.expires_at && <div className="muted" style={{ fontSize: "0.78rem" }}>Expires {new Date(c.expires_at).toLocaleDateString("en-IN")}</div>}
                  </td>
                  <td>{c.discount_type === "percent" ? `${c.discount_value}%` : rupees(c.discount_value)}</td>
                  <td>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                  <td>
                    <input type="checkbox" aria-label="Coupon active" checked={c.active} disabled={savingId === c.id} onChange={() => toggleActive(c)} />
                  </td>
                  <td>
                    <button type="button" className="pill-btn outline" disabled={deletingId === c.id} onClick={() => deleteCoupon(c)}>
                      {deletingId === c.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Abandoned checkouts</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        Customers who entered their details at checkout but didn&apos;t place an order. Generate a one-time
        10%-off coupon and send the prepared WhatsApp message to bring them back.
      </p>
      {drafts.length === 0 ? (
        <div className="empty">No abandoned checkouts right now.</div>
      ) : (
        <div style={{ display: "grid", gap: "0.8rem" }}>
          {drafts.map((d) => {
            const sent = recovery[d.id] ?? (d.recovery_coupon_code ? { coupon_code: d.recovery_coupon_code, whatsapp_url: "", message: "" } : null);
            return (
              <div className="panel" key={d.id} style={{ padding: "1rem 1.2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}>
                  <div>
                    <strong>{d.customer_name || "(no name yet)"}</strong>{" "}
                    <span className="muted">· {d.phone} · {d.pincode}</span>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {d.cart_snapshot.map((l) => `${l.quantity} × ${l.name}`).join(", ") || "empty cart"} — {rupees(d.subtotal_paise)}
                    </div>
                    <div className="muted" style={{ fontSize: "0.78rem" }}>Last active {timeAgo(d.updated_at)}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <button type="button" className="pill-btn outline" onClick={() => dismissDraft(d)}>Dismiss</button>
                    <button type="button" className="pill-btn" disabled={recoveringId === d.id} onClick={() => recoverDraft(d)}>
                      {recoveringId === d.id ? "Generating…" : sent ? "Regenerate coupon" : "Generate recovery coupon"}
                    </button>
                  </div>
                </div>
                {recovery[d.id] && (
                  <div className="alert info" style={{ marginTop: "0.7rem" }}>
                    Coupon <strong>{recovery[d.id].coupon_code}</strong> ready.{" "}
                    <a href={recovery[d.id].whatsapp_url} target="_blank" rel="noopener">Open WhatsApp to send it</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
