import React from "react";

/** PriceTag — rent amount with MAD suffix and period. */
export function PriceTag({ amount = 2300, currency = "MAD", period = "mois", size = "md", style }) {
  const fs = { sm: "var(--fs-body)", md: "var(--fs-h3)", lg: "var(--fs-h1)" }[size];
  const formatted = new Intl.NumberFormat("fr-MA").format(amount).replace(/ |,/g, " ");
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, ...style }}>
      <span style={{ font: `var(--fw-extrabold) ${fs} var(--font-display)`, color: "var(--text-strong)" }}>{formatted}</span>
      <span style={{ font: "var(--fw-bold) var(--fs-sm) var(--font-display)", color: "var(--text-strong)" }}>{currency}</span>
      {period && <span style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)" }}>/{period}</span>}
    </span>
  );
}
