"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rememberOrderPhone } from "@/lib/tracking";

export default function TrackPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    const full = clean.startsWith("PBL-") ? clean : `PBL-${clean}`;
    rememberOrderPhone(full, phone);
    router.push(`/order/${full}`);
  }

  return (
    <div className="wrap page" style={{ maxWidth: 520 }}>
      <div className="page-head">
        <p className="eyebrow">Track order</p>
        <h1>Where&apos;s my order?</h1>
        <p className="muted">Enter the order code from your confirmation and the mobile number you ordered with.</p>
      </div>
      <form className="panel" onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">Order code</label>
          <input id="code" required placeholder="PBL-7K2QH9XM" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="phone">Mobile number</label>
          <input id="phone" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button className="btn primary block">Track order</button>
      </form>
    </div>
  );
}
