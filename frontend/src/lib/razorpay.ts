import { api } from "@/lib/api";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: () => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** Razorpay's `prefill.contact` needs a clean "+91XXXXXXXXXX" — anything else (spaces, a
 * leading 0, no country code) is silently dropped and Checkout asks for the number again,
 * even though we already collected it. */
export function razorpayContact(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? `+91${last10}` : "";
}

export type PayWithRazorpayOptions = {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency?: string;
  customerName: string;
  phone: string;
  publicId: string;
  onVerified: () => void;
  onDismiss: () => void;
  onFailed?: () => void;
};

/** Opens Razorpay's embedded Checkout widget (not a hosted Payment Link page), so the payment
 * stays on our own branded page with the customer's details already prefilled. Used both at
 * checkout and on the order tracking page (for an out-of-zone order once its shipping charge
 * is confirmed). */
export async function payWithRazorpay(opts: PayWithRazorpayOptions): Promise<boolean> {
  const ok = await loadRazorpayScript();
  if (!ok || !window.Razorpay) return false;

  const checkout = new window.Razorpay({
    key: opts.keyId,
    order_id: opts.razorpayOrderId,
    amount: opts.amountPaise,
    currency: opts.currency ?? "INR",
    name: "PBL Plants",
    description: `Order ${opts.publicId}`,
    prefill: { name: opts.customerName, contact: razorpayContact(opts.phone) },
    theme: { color: "#2E5233" },
    handler: async (resp: RazorpayResponse) => {
      try {
        await api("/api/payments/verify", {
          method: "POST",
          body: JSON.stringify({ public_id: opts.publicId, ...resp }),
        });
      } catch {
        // The webhook will still confirm the payment server-side; the order page shows the live status.
      }
      opts.onVerified();
    },
    modal: { ondismiss: opts.onDismiss },
  });
  checkout.on("payment.failed", () => opts.onFailed?.());
  checkout.open();
  return true;
}
