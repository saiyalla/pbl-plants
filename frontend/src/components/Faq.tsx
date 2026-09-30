"use client";

import { useState } from "react";

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="faq-grid">
      {items.map((f, i) => (
        <div
          className={`faq-card${openIndex === i ? " is-open" : ""}`}
          key={f.q}
          tabIndex={0}
          onMouseEnter={() => setOpenIndex(i)}
          onMouseLeave={() => setOpenIndex((cur) => (cur === i ? null : cur))}
          onFocus={() => setOpenIndex(i)}
          onBlur={() => setOpenIndex((cur) => (cur === i ? null : cur))}
        >
          <h3>{f.q}</h3>
          <p className="faq-answer">{f.a}</p>
        </div>
      ))}
    </div>
  );
}
