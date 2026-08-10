import { useTranslation } from "react-i18next";

/** PriceTag — rent amount with Đh suffix and period. */
export function PriceTag({ amount = 2300, currency = "Đh", period, size = "md", style }) {
  const { t } = useTranslation();
  const displayPeriod = period ?? t("priceTag.perMonth");
  const fs = { sm: "var(--fs-body)", md: "var(--fs-h3)", lg: "var(--fs-h1)" }[size];
  const formatted = new Intl.NumberFormat("fr-MA").format(amount).replace(/\u202f|,/g, " ");
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, ...style }}>
      <span style={{ font: `var(--fw-extrabold) ${fs} var(--font-display)`, color: "var(--text-strong)" }}>{formatted}</span>
      <span style={{ font: "var(--fw-bold) var(--fs-sm) var(--font-display)", color: "var(--text-strong)" }}>{currency}</span>
      {displayPeriod && <span style={{ font: "var(--fw-regular) var(--fs-sm) var(--font-body)", color: "var(--text-muted)" }}>/{displayPeriod}</span>}
    </span>
  );
}
