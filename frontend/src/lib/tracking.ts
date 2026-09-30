/**
 * Orders are looked up with code + phone number. We keep the phone in sessionStorage
 * (never in the URL) so the confirmation page can load straight after checkout.
 */
const key = (code: string) => `pbl-order-phone:${code.toUpperCase()}`;

export function rememberOrderPhone(code: string, phone: string) {
  try {
    window.sessionStorage.setItem(key(code), phone);
  } catch {
    /* storage blocked — the page will just ask for the phone number */
  }
}

export function recallOrderPhone(code: string): string {
  try {
    return window.sessionStorage.getItem(key(code)) ?? "";
  } catch {
    return "";
  }
}

/** Keeps checkout details filled in if the customer browses away (e.g. to add another item) and comes back. */
const CHECKOUT_DRAFT_KEY = "pbl-checkout-draft";

export type CheckoutDraft = { customer_name: string; phone: string; address: string; pincode: string; notes: string };

export function saveCheckoutDraft(draft: CheckoutDraft) {
  try {
    window.sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage blocked — the form just won't persist across navigation */
  }
}

export function loadCheckoutDraft(): CheckoutDraft | null {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CheckoutDraft) : null;
  } catch {
    return null;
  }
}

export function clearCheckoutDraft() {
  try {
    window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Whether the team is currently signed into /admin this browser session — lets the site
 * offer a "Dashboard" shortcut instead of making them retype the URL after clicking the logo. */
const ADMIN_TOKEN_KEY = "pbl-admin-token";

export function readAdminToken(): string {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export const ADMIN_AUTH_EVENT = "pbl-admin-auth-change";

export function saveAdminToken(token: string) {
  try {
    token ? window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token) : window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  // Logging in/out doesn't always change the URL (e.g. signing in while already on /admin), so
  // the nav can't rely on route changes alone to notice — it listens for this instead.
  window.dispatchEvent(new Event(ADMIN_AUTH_EVENT));
}
