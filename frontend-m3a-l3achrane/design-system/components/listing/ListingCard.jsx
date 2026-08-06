import React from "react";
import { Icon } from "../core/Icon.jsx";
import { MatchScore } from "../trust/MatchScore.jsx";
import { VerifiedBadge } from "../trust/VerifiedBadge.jsx";
import { PriceTag } from "./PriceTag.jsx";
import { AmenityChip } from "./AmenityChip.jsx";

/** ListingCard — the core marketplace card: photo + match score, title, location, price, amenities. */
export function ListingCard({
  image, imageTone = "var(--navy-100)", match = 85, verified = true, title = "Chambre dans un F4",
  city = "Maârif, Casablanca", price = 2300, amenities = [{ icon: "users", label: "3 colocs" }, { icon: "volume-x", label: "Calme" }, { icon: "cigarette-off", label: "Non-fumeur" }],
  onClick, style,
}) {
  const [h, setH] = React.useState(false);
  return (
    <div
      onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden",
        cursor: onClick ? "pointer" : "default", boxShadow: h ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: h ? "translateY(-3px)" : "none", transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
        display: "flex", flexDirection: "column", ...style,
      }}
    >
      <div style={{ position: "relative", height: 150, background: image ? `center/cover url(${image})` : imageTone }}>
        <div style={{ position: "absolute", top: 10, left: 10 }}><MatchScore value={match} size="sm" /></div>
        {verified && <div style={{ position: "absolute", top: 10, right: 10 }}><VerifiedBadge label="Vérifiée" size="sm" /></div>}
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)", font: "var(--fw-medium) var(--fs-xs) var(--font-body)" }}>
          <Icon name="map-pin" size={13} strokeWidth={2} /> {city}
        </div>
        <div style={{ font: "var(--fw-semibold) var(--fs-h3) var(--font-display)", color: "var(--text-strong)" }}>{title}</div>
        <PriceTag amount={price} size="md" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {amenities.map((a, i) => <AmenityChip key={i} icon={a.icon}>{a.label}</AmenityChip>)}
        </div>
      </div>
    </div>
  );
}
