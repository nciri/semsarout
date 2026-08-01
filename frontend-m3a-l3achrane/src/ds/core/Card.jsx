import React from "react";

/** Card — white elevated surface. Optional hover lift, padding control. */
export function Card({ children, padding = 20, hover = false, radius = "var(--radius-lg)", style, ...rest }) {
  const [h, setH] = React.useState(false);
  return (
    <div
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border-subtle)",
        borderRadius: radius, padding, boxShadow: h ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: h ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
