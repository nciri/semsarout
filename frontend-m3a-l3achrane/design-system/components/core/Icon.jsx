import React from "react";

/**
 * Icon — thin-line glyph wrapper over Lucide (loaded from CDN).
 * Renders an <i data-lucide> and (re)hydrates it via window.lucide.
 */
export function Icon({ name = "circle", size = 20, strokeWidth = 2, color = "currentColor", style, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const draw = () => window.lucide && window.lucide.createIcons({ nameAttr: "data-lucide", icons: window.lucide.icons });
    if (window.lucide) draw();
    else {
      // wait for the CDN script if it hasn't finished loading yet
      const t = setInterval(() => { if (window.lucide) { draw(); clearInterval(t); } }, 60);
      setTimeout(() => clearInterval(t), 3000);
      return () => clearInterval(t);
    }
  }, [name, size, strokeWidth]);
  return (
    <i
      ref={ref}
      data-lucide={name}
      style={{ display: "inline-flex", width: size, height: size, color, "--lucide-sw": strokeWidth, ...style }}
      data-stroke={strokeWidth}
      {...rest}
    />
  );
}
