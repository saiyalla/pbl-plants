import type { Metadata } from "next";

export const metadata: Metadata = { title: "Shipping, refunds, privacy & terms" };

/*
 * DRAFT POLICIES — the PBL team must review and edit these before launch.
 * Payment gateways (Razorpay) check that these pages exist and match how the shop actually works.
 */
export default function PoliciesPage() {
  return (
    <div className="wrap page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <p className="eyebrow">Policies</p>
        <h1>Shipping, refunds, privacy &amp; terms</h1>
        <div className="alert info" style={{ marginTop: "1rem" }}>
          Draft — to be reviewed by PBL Plants before the site goes live.
        </div>
      </div>

      <section id="shipping" className="section">
        <h2>Shipping &amp; delivery</h2>
        <p>We deliver within Visakhapatnam using our own delivery team. At checkout we check your pincode; if we
          can&apos;t deliver to it, message us on WhatsApp and we&apos;ll try to help. After you order, we call to confirm a
          delivery time. Delivery charges, if any, are shown before you pay.</p>
      </section>

      <section id="refunds" className="section">
        <h2>Cancellations &amp; refunds</h2>
        <p>You can cancel any order before it leaves the shop by calling or messaging us. Plants are living things,
          so please check your order when it arrives — if anything is damaged, tell the delivery person or message us
          a photo the same day and we&apos;ll replace it or refund you. Refunds for online payments go back to the original
          payment method.</p>
      </section>

      <section id="privacy" className="section">
        <h2>Privacy</h2>
        <p>We collect your name, phone number and address only to deliver your order and contact you about it. We
          don&apos;t sell or share your details. Online payments are handled by Razorpay; we never see or store your card
          or UPI details.</p>
      </section>

      <section id="terms" className="section">
        <h2>Terms</h2>
        <p>Prices and stock can change without notice; the price you pay is the one shown at checkout. Plant sizes and
          pot colours may vary slightly from photos. For any questions, contact PBL Plants, Seethammapeta,
          Visakhapatnam 530016 · 099595 58369.</p>
      </section>
    </div>
  );
}
