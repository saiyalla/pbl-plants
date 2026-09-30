export type Product = {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  badge: string | null;
  care: string[];
  icon: string;
  image_url: string | null;
  price_paise: number | null;
  price_is_from: boolean;
  in_stock: boolean;
};

export type ProductCreate = {
  name: string;
  category: string;
  tagline?: string;
  badge?: string | null;
  care?: string[];
  icon?: string;
  price_paise?: number | null;
  price_is_from?: boolean;
  in_stock?: boolean;
};

export type Offer = {
  id: number;
  min_spend_paise: number;
  reward_text: string;
  active: boolean;
};

export type OfferCreate = {
  min_spend_paise: number;
  reward_text: string;
  active?: boolean;
};

export type DeliveryCheckResult = {
  pincode: string;
  deliverable: boolean;
  delivery_fee_paise: number;
  base_fee_paise: number;
  free_delivery_min_paise: number;
  distance_km: number | null;
  cod_allowed: boolean;
};

export type DeliveryZone = {
  id: number;
  pincode: string;
  distance_km: number;
  label: string;
};

export type DeliveryZoneCreate = {
  pincode: string;
  distance_km: number;
  label?: string;
};

export type DeliverySettings = {
  free_km: number;
  rate_paise_per_km: number;
  free_delivery_min_paise: number;
  max_km: number;
};

export type DiscountType = "percent" | "flat";

export type Coupon = {
  id: number;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_paise: number;
  max_discount_paise: number | null;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
  expires_at: string | null;
};

export type CouponCreate = {
  code?: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_order_paise?: number;
  max_discount_paise?: number | null;
  usage_limit?: number | null;
  active?: boolean;
  expires_at?: string | null;
};

export type CouponApplyResult = {
  valid: boolean;
  message: string;
  discount_paise: number;
};

export type CheckoutDraftLine = { name: string; quantity: number; price_paise: number };

export type CheckoutDraft = {
  id: number;
  phone: string;
  customer_name: string;
  pincode: string;
  cart_snapshot: CheckoutDraftLine[];
  subtotal_paise: number;
  recovery_coupon_code: string | null;
  recovery_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CheckoutRecoveryResult = {
  coupon_code: string;
  whatsapp_url: string;
  message: string;
};

export type OrderStatus = "placed" | "confirmed" | "packed" | "out_for_delivery" | "delivered" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "cod_due" | "cod_collected";
export type PaymentMethod = "cod" | "online";

export type OrderItem = {
  product_id: number | null;
  product_name: string;
  unit_price_paise: number;
  quantity: number;
  line_total_paise: number;
};

export type Order = {
  public_id: string;
  customer_name: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: OrderStatus;
  subtotal_paise: number;
  delivery_fee_paise: number;
  coupon_code: string | null;
  discount_paise: number;
  total_paise: number;
  items: OrderItem[];
  created_at: string;
};

export type AdminOrder = Order & {
  id: number;
  phone: string;
  address: string;
  pincode: string;
  notes: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  updated_at: string;
};

export type OrderCreated = {
  order: Order;
  razorpay: { key_id: string; razorpay_order_id: string; amount_paise: number; currency: string } | null;
};

// `||` (not `??`) on purpose: a blank env var in a hosting dashboard is an empty string,
// not undefined — `??` would let it through instead of falling back to the default.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const SERVER_API_URL = (process.env.API_URL || API_URL).replace(/\/$/, "");

export const SHOP = {
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919959558369",
  phoneDisplay: "099595 58369",
  mapsUrl: process.env.NEXT_PUBLIC_MAPS_URL || "https://share.google/9ZfxjPjrg7IeiK2Ex",
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "https://www.instagram.com/pbl_plants_/",
};

export function whatsappLink(message?: string) {
  const base = `https://wa.me/${SHOP.whatsapp}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function rupees(paise: number) {
  const value = paise / 100;
  return "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: paise % 100 ? 2 : 0 });
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turn FastAPI error bodies (string or validation list) into one readable sentence. */
function readableDetail(body: unknown): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d: { msg?: string; loc?: unknown[] }) => {
        const field = Array.isArray(d.loc) ? String(d.loc[d.loc.length - 1]).replace(/_/g, " ") : "";
        return `${field ? field + ": " : ""}${(d.msg ?? "").replace(/^Value error, /, "")}`;
      })
      .join(". ");
  }
  return "Something went wrong. Please try again.";
}

export async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the shop right now. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, readableDetail(body));
  return body as T;
}

/** Resolves an image_url returned by the API (which may be a relative /uploads/... path) to a full URL. */
export function imageSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${API_URL}${url}` : url;
}

export async function uploadProductImage(id: number, file: File, token: string): Promise<Product> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/products/${id}/image`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError(0, "Can't reach the shop right now. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, readableDetail(body));
  return body as Product;
}

/** Server-side catalog fetch with ISR. Returns [] if the API is down so the page still renders. */
export async function fetchProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${SERVER_API_URL}/api/products`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return (await res.json()) as Product[];
  } catch {
    return [];
  }
}

/** Fire-and-forget: lets an abandoned checkout be recovered later. Never surfaces errors to the customer. */
export function postCheckoutDraft(data: {
  customer_name: string;
  phone: string;
  pincode: string;
  cart_snapshot: CheckoutDraftLine[];
  subtotal_paise: number;
}) {
  api("/api/orders/draft", { method: "POST", body: JSON.stringify(data) }).catch(() => {});
}

/** Server-side active-offers fetch with ISR. Returns [] if the API is down so the page still renders. */
export async function fetchOffers(): Promise<Offer[]> {
  try {
    const res = await fetch(`${SERVER_API_URL}/api/offers`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return (await res.json()) as Offer[];
  } catch {
    return [];
  }
}

export const STATUS_STEPS: { key: OrderStatus; label: string }[] = [
  { key: "placed", label: "Order placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid online",
  failed: "Payment failed",
  cod_due: "Cash on delivery",
  cod_collected: "Cash collected",
};
