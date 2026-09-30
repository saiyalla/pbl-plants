import type { Metadata, Viewport } from "next";
// Self-hosted fonts (bundled from npm): no request to Google, no build-time download.
import "@fontsource-variable/fraunces";
import "@fontsource-variable/work-sans";
import { CartDrawer } from "@/components/CartDrawer";
import { FloatingWhatsApp, Footer, Nav, Ticker } from "@/components/Chrome";
import { IconSprite } from "@/components/Icons";
import { CartProvider } from "@/lib/cart";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "PBL Plants — Indoor plants & gifting in Visakhapatnam", template: "%s · PBL Plants" },
  description:
    "Indoor plants, lucky bamboo, ceramic pots, soil mix and decorative stones in Seethammapeta, Vizag. Doorstep delivery across Visakhapatnam. Open daily 9am–9pm.",
  openGraph: {
    title: "PBL Plants — Vizag's indoor plant shop",
    description: "Indoor plants & gifting with doorstep delivery across Visakhapatnam.",
    locale: "en_IN",
    type: "website",
    images: ["/logo.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6ec" },
    { media: "(prefers-color-scheme: dark)", color: "#121a13" },
  ],
};

// Local business structured data — helps the shop show up properly in Google results.
const localBusiness = {
  "@context": "https://schema.org",
  "@type": "Store",
  name: "PBL Plants",
  description: "Indoor plants & gifting shop with doorstep delivery across Visakhapatnam.",
  image: "/logo.jpg",
  telephone: "+91-9959558369",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Seethammapeta, beside SRM Transport, near Sai Baba Temple",
    addressLocality: "Visakhapatnam",
    addressRegion: "Andhra Pradesh",
    postalCode: "530016",
    addressCountry: "IN",
  },
  openingHours: "Mo-Su 09:00-21:00",
  sameAs: ["https://www.instagram.com/pbl_plants_/"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <IconSprite />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }} />
        <CartProvider>
          <Ticker />
          <Nav />
          <main>{children}</main>
          <Footer />
          <CartDrawer />
          <FloatingWhatsApp />
        </CartProvider>
      </body>
    </html>
  );
}
