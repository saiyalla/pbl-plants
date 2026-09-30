import { Catalog } from "@/components/Catalog";
import { Icon } from "@/components/Icons";
import { fetchOffers, fetchProducts, rupees, SHOP, whatsappLink } from "@/lib/api";

// Rebuild the page in the background at most once a minute, so price/stock edits
// from the admin panel show up quickly while visitors still get a static, fast page.
export const revalidate = 60;

const CARE_NOTES = [
  { title: "Light", text: "Match the plant to the window, not the other way round. Most indoor plants want bright, indirect light — near a window, not under direct sun." },
  { title: "Water", text: "Check the soil, not the calendar. Push a finger in an inch — water only if it feels dry. Overwatering kills more plants than underwatering." },
  { title: "Repotting", text: "Roots circling the pot or poking out of the drainage holes mean it's time to size up — usually every 12–18 months for fast growers." },
  { title: "Pests", text: "White fuzz or sticky leaves are usually mealybugs or aphids. A wipe-down with diluted neem oil sorts out most cases within a week." },
];

const FAQS = [
  { q: "Do you deliver outside Visakhapatnam?", a: "Right now we only deliver within Vizag, using our own delivery team. Enter your pincode at checkout to check — if we can't reach you yet, message us on WhatsApp and we'll try to help." },
  { q: "What payment methods do you accept?", a: "Cash on delivery for addresses close to the store, and online payment (cards, UPI, netbanking, wallets via Razorpay) for everyone else — checkout shows exactly which options apply to your address." },
  { q: "How do I track my order?", a: "Use the order code from your confirmation plus the mobile number you ordered with on the Track order page — you'll see live status from placed through to delivered." },
  { q: "What if my plant arrives damaged?", a: "Plants are living things, so please check your order when it arrives. Tell the delivery person or message us a photo the same day and we'll replace it or refund you." },
  { q: "Can I cancel an order?", a: "Yes — call or message us any time before it leaves the shop. Once it's out for delivery, cash-on-delivery orders can still be refused at the door if needed." },
  { q: "Do you do bulk or gifting orders?", a: "Absolutely — for large quantities or a custom gift box, message us on WhatsApp with what you need and we'll sort out pricing and packing." },
];

export default async function Home() {
  const [products, offers] = await Promise.all([fetchProducts(), fetchOffers()]);

  return (
    <div className="wrap">
      <section className="hero">
        <span className="hero-leaf a" aria-hidden="true"><Icon name="leaf" /></span>
        <span className="hero-leaf b" aria-hidden="true"><Icon name="leaf" /></span>
        <span className="hero-leaf c" aria-hidden="true"><Icon name="leaf" /></span>
        <div>
          <p className="eyebrow">Visakhapatnam&apos;s neighbourhood indoor plant store</p>
          <h1>Bring more green<br />into your home.</h1>
          <p className="lede">
            Indoor plants, gifting, ceramic pots, soil mix and decor stones from Seethammapeta — order online
            for doorstep delivery across Vizag.
          </p>
          <div className="cta-row">
            <a className="btn primary" href="#catalog">Shop plants</a>
            <a className="btn ghost" href={whatsappLink()} target="_blank" rel="noopener">
              <Icon name="wa" /> Order on WhatsApp
            </a>
          </div>
          <div className="hero-badge">
            <span className="stars" aria-hidden="true">★★★★★</span>
            <span>5.0 rated on Google</span>
          </div>
        </div>
        <div className="hero-art"><Icon name="logo" /></div>
      </section>

      {offers.length > 0 && (
        <section id="offers" className="section" style={{ paddingBlock: "1.6rem" }}>
          <div className="section-head">
            <p className="eyebrow">Limited time</p>
            <h2>Special offers</h2>
          </div>
          <div className="offer-grid">
            {offers.map((o) => (
              <div className="offer-card" key={o.id}>
                <Icon name="gift" />
                <p>
                  Spend <strong>{rupees(o.min_spend_paise)}+</strong> and get <strong>{o.reward_text}</strong>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="catalog" className="section">
        <div className="section-head">
          <p className="eyebrow">The shop</p>
          <h2>What&apos;s in stock this week</h2>
        </div>
        <Catalog products={products} />
        <p className="catalog-note">
          Items marked &ldquo;Ask for price&rdquo; vary by size — message us for photos, sizes and today&apos;s price.
        </p>
      </section>

      <section id="care" className="section">
        <div className="section-head">
          <p className="eyebrow">From our counter</p>
          <h2>Care notes we give every customer</h2>
        </div>
        <div className="care-grid">
          {CARE_NOTES.map((n, i) => (
            <div className="care-card" key={n.title}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{n.title}</h3>
              <p>{n.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="section">
        <div className="section-head">
          <p className="eyebrow">Good to know</p>
          <h2>Frequently asked questions</h2>
        </div>
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: "-0.8rem" }}>Hover a question to see the answer.</p>
        <div className="faq-grid">
          {FAQS.map((f) => (
            <div className="faq-card" key={f.q} tabIndex={0}>
              <h3>{f.q}</h3>
              <p className="faq-answer">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="reviews" className="section">
        <div className="review-cta">
          <div className="review-left">
            <span className="stars-badge" aria-hidden="true">★</span>
            <div>
              <p className="review-rating">5.0 <span className="stars" aria-hidden="true">★★★★★</span></p>
              <p className="review-text">Rated on Google — bought from us? A quick review helps other plant lovers in Vizag find the shop.</p>
            </div>
          </div>
          <a className="btn primary" href={SHOP.mapsUrl} target="_blank" rel="noopener">Leave a review</a>
        </div>
      </section>

      <section id="visit" className="section">
        <div className="section-head">
          <p className="eyebrow">Find us</p>
          <h2>Visit the store</h2>
        </div>
        <div className="visit-grid">
          <div className="visit-card">
            <div className="contact-row">
              <span className="icon-circle"><Icon name="pin" /></span>
              <div>
                <strong>Seethammapeta, beside SRM Transport, near Sai Baba Temple</strong>
                <span className="sub">Visakhapatnam, Andhra Pradesh 530016</span>
              </div>
            </div>
            <div className="contact-row">
              <span className="icon-circle"><Icon name="clock" /></span>
              <div>
                <strong>Open every day</strong>
                <span className="sub">9:00 AM – 9:00 PM</span>
              </div>
            </div>
            <div className="contact-row">
              <span className="icon-circle"><Icon name="phone" /></span>
              <div>
                <a href="tel:+919959558369"><strong>{SHOP.phoneDisplay}</strong></a>
                <span className="sub">Call for photos or a quick question</span>
              </div>
            </div>
            <div className="contact-row">
              <span className="icon-circle wa"><Icon name="wa" /></span>
              <div>
                <a href={whatsappLink()} target="_blank" rel="noopener"><strong>{SHOP.phoneDisplay}</strong></a>
                <span className="sub">Fastest way to reach us</span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "1rem 0 0" }}>
              Seasonal sale point: Aqua Sport Complex, RK Beach Road
            </p>
          </div>
          <div className="map-card">
            <Icon name="pin" />
            <p className="muted" style={{ margin: 0 }}>Seethammapeta, Visakhapatnam — 530016</p>
            <a className="btn primary" href={SHOP.mapsUrl} target="_blank" rel="noopener">Open in Google Maps</a>
          </div>
        </div>
      </section>
    </div>
  );
}
