/* @ds-bundle: {"format":4,"namespace":"M3aL3chraneDesignSystem_7918b4","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Select","sourcePath":"components/core/Select.jsx"},{"name":"Tabs","sourcePath":"components/core/Tabs.jsx"},{"name":"AmenityChip","sourcePath":"components/listing/AmenityChip.jsx"},{"name":"ListingCard","sourcePath":"components/listing/ListingCard.jsx"},{"name":"PriceTag","sourcePath":"components/listing/PriceTag.jsx"},{"name":"SidebarNav","sourcePath":"components/nav/SidebarNav.jsx"},{"name":"TopBar","sourcePath":"components/nav/TopBar.jsx"},{"name":"CompatibilityRing","sourcePath":"components/trust/CompatibilityRing.jsx"},{"name":"FeatureItem","sourcePath":"components/trust/FeatureItem.jsx"},{"name":"MatchScore","sourcePath":"components/trust/MatchScore.jsx"},{"name":"VerifiedBadge","sourcePath":"components/trust/VerifiedBadge.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"58266a880c18","components/core/Badge.jsx":"e28a39413555","components/core/Button.jsx":"b63f4b57d300","components/core/Card.jsx":"3f22ddf6b320","components/core/Chip.jsx":"cd8184a72c22","components/core/Icon.jsx":"725d2289194b","components/core/IconButton.jsx":"8fd6468778e0","components/core/Input.jsx":"d00e297a68da","components/core/Select.jsx":"ad65ded35f23","components/core/Tabs.jsx":"3be642eff925","components/listing/AmenityChip.jsx":"8d624215c399","components/listing/ListingCard.jsx":"e66812d467d8","components/listing/PriceTag.jsx":"e4a543493c5a","components/nav/SidebarNav.jsx":"16f3471d233e","components/nav/TopBar.jsx":"83cf21794ec7","components/trust/CompatibilityRing.jsx":"fb1395a31ab4","components/trust/FeatureItem.jsx":"fa79133281e9","components/trust/MatchScore.jsx":"aa21cfde7e28","components/trust/VerifiedBadge.jsx":"863e668360c0","ui_kits/app/screens.jsx":"daaa820962b9","ui_kits/partner/screens.jsx":"1e08c1dea8c1","ui_kits/web/screens.jsx":"6439b4e1be8d"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.M3aL3chraneDesignSystem_7918b4 = window.M3aL3chraneDesignSystem_7918b4 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
/** Avatar — round user image with optional verified dot and name/subtitle. */
function Avatar({
  src,
  name = "",
  size = 40,
  verified = false,
  subtitle,
  showLabel = false,
  style
}) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const circle = /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      flex: "none",
      display: "inline-block",
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "var(--radius-pill)",
      overflow: "hidden",
      background: "var(--navy-100)",
      color: "var(--navy-600)",
      font: `var(--fw-semibold) ${Math.round(size * 0.36)}px/1 var(--font-display)`
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials), verified && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: size * 0.36,
      height: size * 0.36,
      background: "var(--green-500)",
      borderRadius: "var(--radius-pill)",
      border: "2px solid #fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size * 0.2,
    height: size * 0.2,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }))));
  if (!showLabel) return circle;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      ...style
    }
  }, circle, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, name), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, subtitle)));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Card — white elevated surface. Optional hover lift, padding control. */
function Card({
  children,
  padding = 20,
  hover = false,
  radius = "var(--radius-lg)",
  style,
  ...rest
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => hover && setH(true),
    onMouseLeave: () => hover && setH(false),
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: radius,
      padding,
      boxShadow: h ? "var(--shadow-md)" : "var(--shadow-sm)",
      transform: h ? "translateY(-2px)" : "none",
      transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Icon — thin-line glyph wrapper over Lucide (loaded from CDN).
 * Renders an <i data-lucide> and (re)hydrates it via window.lucide.
 */
function Icon({
  name = "circle",
  size = 20,
  strokeWidth = 2,
  color = "currentColor",
  style,
  ...rest
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const draw = () => window.lucide && window.lucide.createIcons({
      nameAttr: "data-lucide",
      icons: window.lucide.icons
    });
    if (window.lucide) draw();else {
      // wait for the CDN script if it hasn't finished loading yet
      const t = setInterval(() => {
        if (window.lucide) {
          draw();
          clearInterval(t);
        }
      }, 60);
      setTimeout(() => clearInterval(t), 3000);
      return () => clearInterval(t);
    }
  }, [name, size, strokeWidth]);
  return /*#__PURE__*/React.createElement("i", _extends({
    ref: ref,
    "data-lucide": name,
    style: {
      display: "inline-flex",
      width: size,
      height: size,
      color,
      "--lucide-sw": strokeWidth,
      ...style
    },
    "data-stroke": strokeWidth
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Badge — small status token. tone: neutral · verified · info · warning · danger · gold · navy */
function Badge({
  children,
  tone = "neutral",
  icon,
  size = "md",
  style,
  ...rest
}) {
  const tones = {
    neutral: {
      bg: "var(--gray-100)",
      fg: "var(--gray-700)"
    },
    verified: {
      bg: "var(--green-100)",
      fg: "var(--green-700)"
    },
    info: {
      bg: "var(--info-100)",
      fg: "var(--info-500)"
    },
    warning: {
      bg: "var(--amber-100)",
      fg: "var(--gold-700)"
    },
    danger: {
      bg: "var(--red-100)",
      fg: "var(--red-600)"
    },
    gold: {
      bg: "var(--gold-100)",
      fg: "var(--gold-700)"
    },
    navy: {
      bg: "var(--navy-100)",
      fg: "var(--navy-700)"
    },
    solidNavy: {
      bg: "var(--navy-700)",
      fg: "#fff"
    },
    solidGreen: {
      bg: "var(--green-500)",
      fg: "#fff"
    }
  }[tone];
  const pad = size === "sm" ? "3px 8px" : "4px 10px";
  const fs = size === "sm" ? "var(--fs-xs)" : "var(--fs-sm)";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: pad,
      borderRadius: "var(--radius-pill)",
      background: tones.bg,
      color: tones.fg,
      font: `var(--fw-semibold) ${fs}/1 var(--font-body)`,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === "sm" ? 12 : 14,
    strokeWidth: 2.4
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — primary action control.
 * variants: primary (navy) · accent (gold) · secondary (outline) · ghost · danger
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  fullWidth = false,
  disabled = false,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      padding: "8px 14px",
      font: "var(--fw-semibold) var(--fs-sm)/1 var(--font-display)",
      gap: 6,
      icon: 15
    },
    md: {
      padding: "11px 20px",
      font: "var(--fw-semibold) var(--fs-body)/1 var(--font-display)",
      gap: 8,
      icon: 18
    },
    lg: {
      padding: "14px 26px",
      font: "var(--fw-bold) var(--fs-body-lg)/1 var(--font-display)",
      gap: 9,
      icon: 20
    }
  }[size];
  const variants = {
    primary: {
      background: "var(--brand-primary)",
      color: "#fff",
      border: "1px solid var(--brand-primary)",
      boxShadow: "var(--shadow-xs)"
    },
    accent: {
      background: "var(--brand-accent)",
      color: "var(--text-on-accent)",
      border: "1px solid var(--brand-accent)",
      boxShadow: "var(--shadow-xs)"
    },
    secondary: {
      background: "#fff",
      color: "var(--text-strong)",
      border: "1px solid var(--border-default)"
    },
    ghost: {
      background: "transparent",
      color: "var(--text-strong)",
      border: "1px solid transparent"
    },
    danger: {
      background: "var(--red-600)",
      color: "#fff",
      border: "1px solid var(--red-600)"
    }
  }[variant];
  const hover = {
    primary: "var(--brand-primary-hover)",
    accent: "var(--brand-accent-hover)",
    secondary: "var(--gray-50)",
    ghost: "var(--gray-100)",
    danger: "var(--red-500)"
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = "scale(0.98)";
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = "";
    },
    onMouseEnter: e => {
      if (!disabled) e.currentTarget.style.background = hover;
    },
    onMouseLeave: e => {
      if (!disabled) e.currentTarget.style.background = variants.background;
    },
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: sizes.gap,
      padding: sizes.padding,
      font: sizes.font,
      borderRadius: "var(--radius-sm)",
      width: fullWidth ? "100%" : "auto",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)",
      whiteSpace: "nowrap",
      ...variants,
      ...style
    }
  }, rest), iconLeft && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: sizes.icon,
    strokeWidth: 2.2
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: sizes.icon,
    strokeWidth: 2.2
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Chip — filter / attribute pill. Optional icon; selectable state. */
function Chip({
  children,
  icon,
  selected = false,
  onClick,
  style,
  ...rest
}) {
  const clickable = typeof onClick === "function";
  return /*#__PURE__*/React.createElement("span", _extends({
    onClick: onClick,
    role: clickable ? "button" : undefined,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 12px",
      borderRadius: "var(--radius-pill)",
      font: "var(--fw-medium) var(--fs-sm)/1 var(--font-body)",
      cursor: clickable ? "pointer" : "default",
      background: selected ? "var(--navy-700)" : "var(--gray-100)",
      color: selected ? "#fff" : "var(--gray-700)",
      border: selected ? "1px solid var(--navy-700)" : "1px solid var(--border-subtle)",
      transition: "all var(--dur-fast) var(--ease-standard)",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14,
    strokeWidth: 2
  }), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** IconButton — square/circular icon-only control. */
function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  round = false,
  disabled = false,
  style,
  ...rest
}) {
  const dim = {
    sm: 32,
    md: 40,
    lg: 46
  }[size];
  const iconSize = {
    sm: 16,
    md: 19,
    lg: 22
  }[size];
  const variants = {
    ghost: {
      background: "transparent",
      color: "var(--text-body)",
      border: "1px solid transparent"
    },
    soft: {
      background: "var(--gray-100)",
      color: "var(--text-strong)",
      border: "1px solid transparent"
    },
    outline: {
      background: "#fff",
      color: "var(--text-strong)",
      border: "1px solid var(--border-default)"
    },
    navy: {
      background: "var(--brand-primary)",
      color: "#fff",
      border: "1px solid var(--brand-primary)"
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    disabled: disabled,
    onMouseEnter: e => {
      if (!disabled && variant === "ghost") e.currentTarget.style.background = "var(--gray-100)";
    },
    onMouseLeave: e => {
      if (variant === "ghost") e.currentTarget.style.background = "transparent";
    },
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dim,
      height: dim,
      borderRadius: round ? "var(--radius-pill)" : "var(--radius-sm)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--dur-fast) var(--ease-standard)",
      ...variants,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize,
    strokeWidth: 2
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Input — single-line text field with optional leading icon and label. */
function Input({
  label,
  icon,
  hint,
  error,
  id,
  style,
  containerStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || label;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-body)",
      color: "var(--text-strong)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px",
      height: 44,
      background: "#fff",
      borderRadius: "var(--radius-sm)",
      border: `1px solid ${error ? "var(--red-500)" : focus ? "var(--border-focus)" : "var(--border-default)"}`,
      boxShadow: focus ? "var(--ring-focus)" : "none",
      transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)"
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18,
    color: "var(--gray-500)"
  }), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      border: "none",
      outline: "none",
      background: "transparent",
      font: "var(--fw-regular) var(--fs-body) var(--font-body)",
      color: "var(--text-strong)",
      minWidth: 0,
      ...style
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-body)",
      color: error ? "var(--red-600)" : "var(--text-muted)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Select — styled native select with label + chevron. */
function Select({
  label,
  icon,
  options = [],
  value,
  onChange,
  id,
  style,
  containerStyle,
  ...rest
}) {
  const inputId = id || label;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-body)",
      color: "var(--text-strong)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px",
      height: 44,
      background: "#fff",
      borderRadius: "var(--radius-sm)",
      border: "1px solid var(--border-default)"
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18,
    color: "var(--gray-500)"
  }), /*#__PURE__*/React.createElement("select", _extends({
    id: inputId,
    value: value,
    onChange: onChange,
    style: {
      flex: 1,
      appearance: "none",
      border: "none",
      outline: "none",
      background: "transparent",
      font: "var(--fw-medium) var(--fs-body) var(--font-body)",
      color: "var(--text-strong)",
      cursor: "pointer",
      ...style
    }
  }, rest), options.map(o => typeof o === "string" ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 18,
    color: "var(--gray-500)"
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Select.jsx", error: String((e && e.message) || e) }); }

// components/core/Tabs.jsx
try { (() => {
/** Tabs — underlined segmented navigation (Colocations / Résidences pattern). */
function Tabs({
  tabs = [],
  value,
  onChange,
  style
}) {
  const [internal, setInternal] = React.useState(value ?? (tabs[0] && (tabs[0].value ?? tabs[0])));
  const active = value ?? internal;
  const pick = v => {
    setInternal(v);
    onChange && onChange(v);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      borderBottom: "1px solid var(--border-subtle)",
      ...style
    }
  }, tabs.map(t => {
    const val = t.value ?? t;
    const label = t.label ?? t;
    const on = active === val;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      onClick: () => pick(val),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "12px 16px",
        background: "none",
        border: "none",
        borderBottom: `2px solid ${on ? "var(--navy-700)" : "transparent"}`,
        cursor: "pointer",
        marginBottom: -1,
        color: on ? "var(--navy-700)" : "var(--text-muted)",
        font: `var(--fw-semibold) var(--fs-body) var(--font-display)`,
        transition: "color var(--dur-fast)"
      }
    }, t.icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: t.icon,
      size: 17,
      strokeWidth: 2.2
    }), label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/listing/AmenityChip.jsx
try { (() => {
/** AmenityChip — small icon + label describing a listing attribute. */
function AmenityChip({
  icon = "check",
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "5px 10px",
      borderRadius: "var(--radius-pill)",
      background: "var(--gray-100)",
      color: "var(--gray-700)",
      font: "var(--fw-medium) var(--fs-sm)/1 var(--font-body)",
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14,
    color: "var(--gray-500)",
    strokeWidth: 2
  }), children);
}
Object.assign(__ds_scope, { AmenityChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/listing/AmenityChip.jsx", error: String((e && e.message) || e) }); }

// components/listing/PriceTag.jsx
try { (() => {
/** PriceTag — rent amount with MAD suffix and period. */
function PriceTag({
  amount = 2300,
  currency = "MAD",
  period = "mois",
  size = "md",
  style
}) {
  const fs = {
    sm: "var(--fs-body)",
    md: "var(--fs-h3)",
    lg: "var(--fs-h1)"
  }[size];
  const formatted = new Intl.NumberFormat("fr-MA").format(amount).replace(/\u202f|,/g, " ");
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "baseline",
      gap: 4,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--fw-extrabold) ${fs} var(--font-display)`,
      color: "var(--text-strong)"
    }
  }, formatted), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-bold) var(--fs-sm) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, currency), period && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, "/", period));
}
Object.assign(__ds_scope, { PriceTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/listing/PriceTag.jsx", error: String((e && e.message) || e) }); }

// components/nav/SidebarNav.jsx
try { (() => {
/** SidebarNav — fixed navy app sidebar with brand, nav items, help footer. */
function SidebarNav({
  items = [{
    icon: "layout-dashboard",
    label: "Tableau de bord",
    value: "dash"
  }, {
    icon: "search",
    label: "Rechercher",
    value: "search"
  }, {
    icon: "heart",
    label: "Mes favoris",
    value: "fav"
  }, {
    icon: "file-text",
    label: "Mes candidatures",
    value: "apps"
  }, {
    icon: "file-signature",
    label: "Mes contrats",
    value: "contracts"
  }, {
    icon: "message-circle",
    label: "Messagerie",
    value: "msg",
    badge: 2
  }, {
    icon: "credit-card",
    label: "Paiements",
    value: "pay"
  }, {
    icon: "user",
    label: "Profil",
    value: "profile"
  }, {
    icon: "settings",
    label: "Paramètres",
    value: "settings"
  }],
  active = "dash",
  onSelect,
  width = 248,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width,
      minWidth: width,
      height: "100%",
      background: "var(--surface-navy)",
      display: "flex",
      flexDirection: "column",
      padding: "20px 14px",
      boxSizing: "border-box",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "4px 8px 22px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 34,
      height: 34,
      borderRadius: "var(--radius-sm)",
      background: "var(--gold-500)",
      color: "var(--navy-800)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "home",
    size: 19,
    strokeWidth: 2.4
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 1.1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-extrabold) var(--fs-body) var(--font-display)",
      color: "#fff"
    }
  }, "M3a-L3chrane"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-arabic)",
      color: "var(--text-on-navy-muted)"
    }
  }, "\u0645\u0639 \u0627\u0644\u0639\u0634\u0631\u0627\u0646"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      flex: 1
    }
  }, items.map(it => {
    const on = active === it.value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      onClick: () => onSelect && onSelect(it.value),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        background: on ? "rgba(255,255,255,0.12)" : "transparent",
        color: on ? "#fff" : "var(--text-on-navy-muted)",
        font: `var(--fw-${on ? "semibold" : "medium"}) var(--fs-body) var(--font-display)`,
        transition: "background var(--dur-fast)"
      },
      onMouseEnter: e => {
        if (!on) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
      },
      onMouseLeave: e => {
        if (!on) e.currentTarget.style.background = "transparent";
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 19,
      strokeWidth: 2
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, it.label), it.badge != null && /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: "var(--radius-pill)",
        background: "var(--gold-500)",
        color: "var(--navy-800)",
        font: "var(--fw-bold) var(--fs-xs)/18px var(--font-display)",
        textAlign: "center"
      }
    }, it.badge));
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      marginTop: 12,
      background: "none",
      border: "none",
      color: "var(--text-on-navy-muted)",
      cursor: "pointer",
      font: "var(--fw-medium) var(--fs-body) var(--font-display)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "life-buoy",
    size: 19,
    strokeWidth: 2
  }), " Besoin d'aide ?"));
}
Object.assign(__ds_scope, { SidebarNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/nav/SidebarNav.jsx", error: String((e && e.message) || e) }); }

// components/nav/TopBar.jsx
try { (() => {
/** TopBar — public site navy header: brand, links, language, auth actions. */
function TopBar({
  links = ["Comment ça marche", "Découvrir", "À propos"],
  lang = "FR",
  onSignIn,
  onSignUp,
  style
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 28,
      padding: "0 40px",
      height: 68,
      background: "var(--surface-navy)",
      boxShadow: "var(--shadow-nav)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 34,
      height: 34,
      borderRadius: "var(--radius-sm)",
      background: "var(--gold-500)",
      color: "var(--navy-800)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "home",
    size: 19,
    strokeWidth: 2.4
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 1.1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-extrabold) var(--fs-body) var(--font-display)",
      color: "#fff"
    }
  }, "M3a-L3chrane"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-arabic)",
      color: "var(--text-on-navy-muted)"
    }
  }, "\u0645\u0639 \u0627\u0644\u0639\u0634\u0631\u0627\u0646"))), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      gap: 22,
      flex: 1
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      color: "var(--text-on-navy-muted)",
      font: "var(--fw-medium) var(--fs-body) var(--font-display)"
    }
  }, l))), /*#__PURE__*/React.createElement("button", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      background: "none",
      border: "none",
      color: "#fff",
      cursor: "pointer",
      font: "var(--fw-medium) var(--fs-body) var(--font-display)"
    }
  }, lang, " ", /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 15
  })), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: onSignIn,
    style: {
      color: "#fff",
      font: "var(--fw-medium) var(--fs-body) var(--font-display)"
    }
  }, "Se connecter"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "accent",
    size: "sm",
    onClick: onSignUp
  }, "S'inscrire"));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/nav/TopBar.jsx", error: String((e && e.message) || e) }); }

// components/trust/CompatibilityRing.jsx
try { (() => {
/** CompatibilityRing — animated circular gauge for the compatibility score. */
function CompatibilityRing({
  value = 85,
  size = 140,
  stroke = 12,
  label = "Excellente compatibilité",
  style
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setShown(value), 60);
    return () => clearTimeout(t);
  }, [value]);
  const color = value >= 80 ? "var(--green-500)" : value >= 60 ? "var(--gold-500)" : "var(--gray-400)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: "rotate(-90deg)"
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--gray-150)",
    strokeWidth: stroke
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeDasharray: circ,
    strokeDashoffset: circ - circ * shown / 100,
    style: {
      transition: "stroke-dashoffset 900ms var(--ease-out)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--fw-extrabold) ${Math.round(size * 0.26)}px/1 var(--font-display)`,
      color: "var(--text-strong)"
    }
  }, value, "%"))), label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-semibold) var(--fs-body) var(--font-display)",
      color: "var(--text-strong)",
      textAlign: "center"
    }
  }, label));
}
Object.assign(__ds_scope, { CompatibilityRing });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/trust/CompatibilityRing.jsx", error: String((e && e.message) || e) }); }

// components/trust/FeatureItem.jsx
try { (() => {
/** FeatureItem — icon + bold title + calm subtitle. Trust band / how-it-works cell. */
function FeatureItem({
  icon = "shield-check",
  title,
  subtitle,
  layout = "row",
  tone = "navy",
  style
}) {
  const chip = {
    navy: {
      bg: "var(--navy-50)",
      fg: "var(--navy-700)"
    },
    green: {
      bg: "var(--green-50)",
      fg: "var(--green-600)"
    },
    gold: {
      bg: "var(--gold-100)",
      fg: "var(--gold-700)"
    }
  }[tone];
  const col = layout === "col";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: col ? "column" : "row",
      alignItems: col ? "flex-start" : "flex-start",
      gap: 12,
      textAlign: "left",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 44,
      height: 44,
      borderRadius: "var(--radius-md)",
      background: chip.bg,
      color: chip.fg
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 22,
    strokeWidth: 2
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-bold) var(--fs-body) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-sm)/1.45 var(--font-body)",
      color: "var(--text-muted)"
    }
  }, subtitle)));
}
Object.assign(__ds_scope, { FeatureItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/trust/FeatureItem.jsx", error: String((e && e.message) || e) }); }

// components/trust/MatchScore.jsx
try { (() => {
/** MatchScore — compatibility % pill that floats on a listing photo. Green ≥80, gold ≥60, grey below. */
function MatchScore({
  value = 85,
  size = "md",
  style
}) {
  const tone = value >= 80 ? "var(--green-500)" : value >= 60 ? "var(--gold-600)" : "var(--gray-500)";
  const pad = size === "sm" ? "3px 8px" : "4px 11px";
  const fs = size === "sm" ? "var(--fs-xs)" : "var(--fs-sm)";
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: pad,
      borderRadius: "var(--radius-pill)",
      background: "rgba(255,255,255,0.94)",
      color: tone,
      boxShadow: "var(--shadow-sm)",
      font: `var(--fw-bold) ${fs}/1 var(--font-display)`,
      backdropFilter: "blur(2px)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: tone
    }
  }), value, "%");
}
Object.assign(__ds_scope, { MatchScore });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/trust/MatchScore.jsx", error: String((e && e.message) || e) }); }

// components/trust/VerifiedBadge.jsx
try { (() => {
/** VerifiedBadge — trust token showing identity/status verification. */
function VerifiedBadge({
  label = "Vérifiée",
  level = "full",
  size = "md",
  style
}) {
  const on = {
    full: "var(--green-500)",
    partial: "var(--gold-600)",
    none: "var(--gray-400)"
  }[level];
  const bg = {
    full: "var(--green-100)",
    partial: "var(--gold-100)",
    none: "var(--gray-100)"
  }[level];
  const fs = size === "sm" ? "var(--fs-xs)" : "var(--fs-sm)";
  const ic = size === "sm" ? 13 : 15;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: size === "sm" ? "3px 9px" : "5px 11px",
      borderRadius: "var(--radius-pill)",
      background: bg,
      color: on,
      font: `var(--fw-semibold) ${fs}/1 var(--font-body)`,
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "shield-check",
    size: ic,
    strokeWidth: 2.4
  }), label);
}
Object.assign(__ds_scope, { VerifiedBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/trust/VerifiedBadge.jsx", error: String((e && e.message) || e) }); }

// components/listing/ListingCard.jsx
try { (() => {
/** ListingCard — the core marketplace card: photo + match score, title, location, price, amenities. */
function ListingCard({
  image,
  imageTone = "var(--navy-100)",
  match = 85,
  verified = true,
  title = "Chambre dans un F4",
  city = "Maârif, Casablanca",
  price = 2300,
  amenities = [{
    icon: "users",
    label: "3 colocs"
  }, {
    icon: "volume-x",
    label: "Calme"
  }, {
    icon: "cigarette-off",
    label: "Non-fumeur"
  }],
  onClick,
  style
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      cursor: onClick ? "pointer" : "default",
      boxShadow: h ? "var(--shadow-md)" : "var(--shadow-sm)",
      transform: h ? "translateY(-3px)" : "none",
      transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
      display: "flex",
      flexDirection: "column",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 150,
      background: image ? `center/cover url(${image})` : imageTone
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 10,
      left: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.MatchScore, {
    value: match,
    size: "sm"
  })), verified && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 10,
      right: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.VerifiedBadge, {
    label: "V\xE9rifi\xE9e",
    size: "sm"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      color: "var(--text-muted)",
      font: "var(--fw-medium) var(--fs-xs) var(--font-body)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "map-pin",
    size: 13,
    strokeWidth: 2
  }), " ", city), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-h3) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, title), /*#__PURE__*/React.createElement(__ds_scope.PriceTag, {
    amount: price,
    size: "md"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 2
    }
  }, amenities.map((a, i) => /*#__PURE__*/React.createElement(__ds_scope.AmenityChip, {
    key: i,
    icon: a.icon
  }, a.label)))));
}
Object.assign(__ds_scope, { ListingCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/listing/ListingCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/screens.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const NS = window.M3aL3chraneDesignSystem_7918b4;
const {
  Button,
  IconButton,
  Icon,
  Badge,
  Chip,
  Avatar,
  Input,
  ListingCard,
  MatchScore,
  VerifiedBadge,
  CompatibilityRing,
  SidebarNav
} = NS;
const {
  useState,
  useRef,
  useEffect
} = React;
function AppHeader({
  title,
  subtitle
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "20px 32px",
      borderBottom: "1px solid var(--border-subtle)",
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) 24px var(--font-display)",
      color: "var(--navy-700)"
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "bell",
    label: "Notifications",
    variant: "soft",
    round: true
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Yassine E.",
    showLabel: true,
    subtitle: "\xC9tudiant",
    verified: true,
    size: 38
  })));
}
function StatCard({
  icon,
  tone,
  label,
  value,
  sub
}) {
  const c = {
    green: ["var(--green-50)", "var(--green-600)"],
    navy: ["var(--navy-50)", "var(--navy-700)"],
    gold: ["var(--gold-100)", "var(--gold-700)"]
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: 18,
      boxShadow: "var(--shadow-sm)",
      display: "flex",
      gap: 14,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 46,
      height: 46,
      borderRadius: "var(--radius-md)",
      background: c[0],
      color: c[1]
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 23
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-extrabold) 22px var(--font-display)",
      color: "var(--text-strong)"
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-xs) var(--font-body)",
      color: c[1]
    }
  }, sub)));
}
function Dashboard() {
  const recs = [{
    match: 85,
    title: "Chambre dans un F4",
    city: "Maârif, Casablanca",
    price: 2300,
    tone: "var(--navy-100)",
    amenities: [{
      icon: "users",
      label: "3 colocs"
    }, {
      icon: "volume-x",
      label: "Calme"
    }]
  }, {
    match: 82,
    title: "Chambre dans un F3",
    city: "Agdal, Rabat",
    price: 2000,
    tone: "var(--gold-100)",
    amenities: [{
      icon: "users",
      label: "2 colocs"
    }, {
      icon: "graduation-cap",
      label: "Étudiants"
    }]
  }, {
    match: 78,
    title: "Chambre dans un F4",
    city: "Guéliz, Marrakech",
    price: 2200,
    tone: "var(--green-100)",
    amenities: [{
      icon: "users",
      label: "4 colocs"
    }, {
      icon: "wifi",
      label: "Wi-Fi"
    }]
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      background: "var(--bg-page)"
    }
  }, /*#__PURE__*/React.createElement(AppHeader, {
    title: /*#__PURE__*/React.createElement("span", null, "Bonjour Yassine ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 22
      }
    }, "\uD83D\uDC4B")),
    subtitle: "Voici un aper\xE7u de votre recherche"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      marginBottom: 26
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    icon: "badge-check",
    tone: "green",
    label: "Profil v\xE9rifi\xE9",
    value: "\xC9tudiant",
    sub: "CIN + statut"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "git-compare-arrows",
    tone: "navy",
    label: "Compatibilit\xE9 moyenne",
    value: "85%",
    sub: "Excellent"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "file-text",
    tone: "gold",
    label: "Candidatures",
    value: "3",
    sub: "En cours"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--fw-bold) var(--fs-h2) var(--font-display)",
      color: "var(--navy-700)",
      margin: 0
    }
  }, "Recommandations pour vous"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-body)"
    }
  }, "Voir tout")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 18,
      marginBottom: 28
    }
  }, recs.map((r, i) => /*#__PURE__*/React.createElement(ListingCard, _extends({
    key: i
  }, r, {
    imageTone: r.tone
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.5fr 1fr",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: 20,
      boxShadow: "var(--shadow-sm)"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--fw-bold) var(--fs-h3) var(--font-display)",
      color: "var(--navy-700)",
      margin: "0 0 14px"
    }
  }, "Activit\xE9 r\xE9cente"), [["eye", "Votre candidature a été vue par Sarah", "var(--navy-50)", "var(--navy-700)"], ["message-circle", "Nouveau message de Youssef", "var(--info-100)", "var(--info-500)"], ["file-signature", "Contrat prêt à être signé", "var(--gold-100)", "var(--gold-700)"]].map(([ic, t, bg, fg], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 0",
      borderBottom: i < 2 ? "1px solid var(--border-subtle)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 34,
      height: 34,
      borderRadius: "var(--radius-sm)",
      background: bg,
      color: fg
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 17
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-medium) var(--fs-body) var(--font-body)",
      color: "var(--text-body)"
    }
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: 20,
      boxShadow: "var(--shadow-sm)"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--fw-bold) var(--fs-h3) var(--font-display)",
      color: "var(--navy-700)",
      margin: "0 0 14px"
    }
  }, "Prochaine \xE9tape"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 42,
      height: 42,
      borderRadius: "var(--radius-md)",
      background: "var(--gold-100)",
      color: "var(--gold-700)",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar-check",
    size: 21
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-body) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, "Visite planifi\xE9e"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)",
      margin: "2px 0"
    }
  }, "Samedi 24 mai \xE0 10:00 \xB7 Agdal, Rabat"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-body)"
    }
  }, "Voir le d\xE9tail")))))));
}
const CONVOS = [{
  name: "Sarah",
  status: "En ligne",
  time: "10:24",
  last: "Parfait, à samedi ! 😊",
  unread: true,
  online: true
}, {
  name: "Youssef",
  status: "En ligne",
  time: "Hier",
  last: "Peux-tu m'envoyer plus…",
  online: true
}, {
  name: "Omar",
  status: "",
  time: "Hier",
  last: "Merci à toi !"
}, {
  name: "Admin M3a-L3chrane",
  status: "",
  time: "2 j",
  last: "Votre contrat est prêt à être signé.",
  admin: true
}];
function Messaging() {
  const [active, setActive] = useState(0);
  const [msgs, setMsgs] = useState([{
    me: false,
    t: "Salut Yassine ! Est-ce que tu es disponible ce samedi pour une visite ?",
    time: "10:22"
  }, {
    me: true,
    t: "Salut Sarah ! Oui, je suis dispo à 10h. Ça te va ?",
    time: "10:23"
  }, {
    me: false,
    t: "Parfait, à samedi ! 😊",
    time: "10:24"
  }]);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current && endRef.current.scrollIntoView && endRef.current.parentElement.scrollTo(0, 99999);
  });
  const send = () => {
    if (!draft.trim()) return;
    setMsgs([...msgs, {
      me: true,
      t: draft,
      time: "10:26"
    }]);
    setDraft("");
  };
  const c = CONVOS[active];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      minHeight: 0,
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 320,
      borderRight: "1px solid var(--border-subtle)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px 20px 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) var(--fs-h2) var(--font-display)",
      color: "var(--navy-700)",
      marginBottom: 12
    }
  }, "Messagerie"), /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: "Rechercher une conversation"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: "auto",
      flex: 1
    }
  }, CONVOS.map((cv, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => setActive(i),
    style: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      width: "100%",
      padding: "12px 20px",
      background: i === active ? "var(--navy-50)" : "transparent",
      border: "none",
      borderBottom: "1px solid var(--gray-100)",
      cursor: "pointer",
      textAlign: "left"
    }
  }, cv.admin ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 42,
      borderRadius: "var(--radius-pill)",
      background: "var(--navy-700)",
      color: "var(--gold-500)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "home",
    size: 20
  })) : /*#__PURE__*/React.createElement(Avatar, {
    name: cv.name,
    verified: cv.online,
    size: 42
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-semibold) var(--fs-body) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, cv.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, cv.time)), /*#__PURE__*/React.createElement("div", {
    style: {
      font: `var(--fw-${cv.unread ? "semibold" : "regular"}) var(--fs-sm) var(--font-body)`,
      color: cv.unread ? "var(--text-strong)" : "var(--text-muted)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, cv.last)), cv.unread && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: "var(--gold-500)",
      flex: "none"
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 24px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: c.name,
    showLabel: true,
    subtitle: c.status || "Hors ligne",
    verified: c.online,
    size: 40
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "phone",
    label: "Appeler",
    variant: "ghost",
    round: true
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "video",
    label: "Visio",
    variant: "ghost",
    round: true
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      background: "var(--bg-page)"
    }
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: m.me ? "flex-end" : "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "68%",
      padding: "10px 14px",
      borderRadius: m.me ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
      background: m.me ? "var(--navy-700)" : "#fff",
      color: m.me ? "#fff" : "var(--text-body)",
      border: m.me ? "none" : "1px solid var(--border-subtle)",
      font: "var(--fw-regular) var(--fs-body)/1.45 var(--font-body)",
      boxShadow: "var(--shadow-xs)"
    }
  }, m.t, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) 10px var(--font-body)",
      color: m.me ? "rgba(255,255,255,.6)" : "var(--text-muted)",
      textAlign: "right",
      marginTop: 4
    }
  }, m.time)))), /*#__PURE__*/React.createElement("div", {
    ref: endRef
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      padding: "14px 24px",
      borderTop: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "plus",
    label: "Joindre",
    variant: "soft",
    round: true
  }), /*#__PURE__*/React.createElement("input", {
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => e.key === "Enter" && send(),
    placeholder: "\xC9crire un message\u2026",
    style: {
      flex: 1,
      height: 44,
      padding: "0 16px",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-pill)",
      outline: "none",
      font: "var(--fw-regular) var(--fs-body) var(--font-body)",
      color: "var(--text-strong)"
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "send",
    label: "Envoyer",
    variant: "navy",
    round: true,
    onClick: send
  }))));
}
function AppShell() {
  const [view, setView] = useState("dash");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "100vh",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(SidebarNav, {
    active: view === "msg" ? "msg" : "dash",
    onSelect: v => setView(v === "msg" ? "msg" : "dash")
  }), view === "msg" ? /*#__PURE__*/React.createElement(Messaging, null) : /*#__PURE__*/React.createElement(Dashboard, null));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(AppShell, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/partner/screens.jsx
try { (() => {
const NS = window.M3aL3chraneDesignSystem_7918b4;
const {
  Button,
  IconButton,
  Icon,
  Badge,
  Avatar,
  Input,
  VerifiedBadge
} = NS;
const {
  useState
} = React;
const NAV = [{
  icon: "layout-dashboard",
  label: "Tableau de bord",
  value: "dash"
}, {
  icon: "users",
  label: "Affiliés",
  value: "aff"
}, {
  icon: "badge-check",
  label: "Vérifications",
  value: "ver",
  badge: 12
}, {
  icon: "bookmark",
  label: "Offres réservées",
  value: "res"
}, {
  icon: "hand-coins",
  label: "Subventions",
  value: "sub"
}, {
  icon: "bar-chart-3",
  label: "Reporting",
  value: "rep"
}, {
  icon: "file-text",
  label: "Facturation",
  value: "bill"
}, {
  icon: "plug",
  label: "API & webhooks",
  value: "api"
}];
function PartnerSidebar({
  active,
  onSelect
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 248,
      minWidth: 248,
      background: "var(--surface-navy)",
      display: "flex",
      flexDirection: "column",
      padding: "20px 14px",
      boxSizing: "border-box"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "4px 8px 8px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 34,
      height: 34,
      borderRadius: "var(--radius-sm)",
      background: "var(--gold-500)",
      color: "var(--navy-800)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "home",
    size: 19,
    strokeWidth: 2.4
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-extrabold) var(--fs-body) var(--font-display)",
      color: "#fff"
    }
  }, "M3a-L3chrane"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-medium) var(--fs-xs) var(--font-body)",
      color: "var(--gold-400)"
    }
  }, "Portail partenaire"))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "12px 4px 16px",
      padding: "10px 12px",
      borderRadius: "var(--radius-md)",
      background: "rgba(255,255,255,.07)",
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: "var(--radius-sm)",
      background: "var(--navy-400)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      font: "var(--fw-bold) var(--fs-xs) var(--font-display)"
    }
  }, "UM"), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.15
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-display)",
      color: "#fff"
    }
  }, "Universit\xE9 M6P"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-body)",
      color: "var(--text-on-navy-muted)"
    }
  }, "Convention active"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      flex: 1
    }
  }, NAV.map(it => {
    const on = active === it.value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      onClick: () => onSelect(it.value),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        background: on ? "rgba(255,255,255,.12)" : "transparent",
        color: on ? "#fff" : "var(--text-on-navy-muted)",
        font: `var(--fw-${on ? "semibold" : "medium"}) var(--fs-body) var(--font-display)`
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: it.icon,
      size: 19,
      strokeWidth: 2
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, it.label), it.badge != null && /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: "var(--radius-pill)",
        background: "var(--gold-500)",
        color: "var(--navy-800)",
        font: "var(--fw-bold) var(--fs-xs)/18px var(--font-display)",
        textAlign: "center"
      }
    }, it.badge));
  })));
}
function Metric({
  label,
  value,
  delta,
  deltaTone = "green",
  icon
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: 20,
      boxShadow: "var(--shadow-sm)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 18,
    color: "var(--gray-400)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-extrabold) 30px var(--font-display)",
      color: "var(--navy-700)"
    }
  }, value), delta && /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-xs) var(--font-body)",
      color: deltaTone === "green" ? "var(--green-600)" : "var(--text-muted)",
      marginTop: 4
    }
  }, delta));
}
const ROSTER = [{
  id: "STU-4821",
  promo: "2025 · Ingénierie",
  status: "Logé",
  tone: "verified",
  city: "Rabat"
}, {
  id: "STU-4822",
  promo: "2025 · Management",
  status: "Vérifié",
  tone: "info",
  city: "Casablanca"
}, {
  id: "STU-4823",
  promo: "2024 · Data",
  status: "En recherche",
  tone: "warning",
  city: "Rabat"
}, {
  id: "STU-4824",
  promo: "2025 · Ingénierie",
  status: "Logé",
  tone: "verified",
  city: "Marrakech"
}, {
  id: "STU-4825",
  promo: "2025 · Design",
  status: "Non inscrit",
  tone: "neutral",
  city: "—"
}];
function Dash() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      background: "var(--bg-page)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "20px 32px",
      borderBottom: "1px solid var(--border-subtle)",
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) 24px var(--font-display)",
      color: "var(--navy-700)"
    }
  }, "Tableau de bord"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, "H\xE9bergement de vos \xE9tudiants \xB7 Ann\xE9e 2025")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "download"
  }, "Exporter"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "upload"
  }, "Importer un r\xE9f\xE9rentiel"))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Metric, {
    label: "Affili\xE9s inscrits",
    value: "1 284",
    delta: "+96 ce mois",
    icon: "users"
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "Taux de logement",
    value: "71%",
    delta: "+4 pts",
    icon: "home"
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "D\xE9lai m\xE9dian de mise en relation",
    value: "9 j",
    delta: "\u22122 j",
    icon: "clock"
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "Budget m\xE9dian",
    value: "1 900 MAD",
    delta: "stable",
    deltaTone: "muted",
    icon: "wallet"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      padding: "10px 14px",
      background: "var(--navy-50)",
      borderRadius: "var(--radius-md)",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 16,
    color: "var(--navy-600)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)",
      color: "var(--navy-700)"
    }
  }, "Reporting anonymis\xE9 \xB7 agr\xE9gats masqu\xE9s sous le seuil de k-anonymat (k \u2265 5). Aucune adresse ni identit\xE9 de colocataire n'est expos\xE9e.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-sm)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 20px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--fw-bold) var(--fs-h3) var(--font-display)",
      color: "var(--navy-700)",
      margin: 0
    }
  }, "R\xE9f\xE9rentiel d'affili\xE9s"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 240
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: "Rechercher un identifiant"
  }))), /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--gray-50)"
    }
  }, ["Identifiant externe", "Promotion", "Ville", "Statut", ""].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: "left",
      padding: "11px 20px",
      font: "var(--fw-semibold) var(--fs-xs) var(--font-body)",
      color: "var(--text-muted)",
      textTransform: "uppercase",
      letterSpacing: ".04em"
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, ROSTER.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      borderTop: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "13px 20px",
      font: "var(--fw-semibold) var(--fs-sm) var(--font-mono)",
      color: "var(--navy-700)"
    }
  }, r.id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "13px 20px",
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-body)"
    }
  }, r.promo), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "13px 20px",
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-body)"
    }
  }, r.city), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "13px 20px"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: r.tone
  }, r.status)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "13px 20px",
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "chevron-right",
    label: "D\xE9tail",
    variant: "ghost",
    size: "sm"
  })))))))));
}
function PartnerApp() {
  const [view, setView] = useState("dash");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "100vh",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(PartnerSidebar, {
    active: view,
    onSelect: setView
  }), /*#__PURE__*/React.createElement(Dash, null));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(PartnerApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/partner/screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/screens.jsx
try { (() => {
const NS = window.M3aL3chraneDesignSystem_7918b4;
const {
  Button,
  IconButton,
  Icon,
  Badge,
  Chip,
  Avatar,
  Input,
  Select,
  Tabs,
  VerifiedBadge,
  MatchScore,
  FeatureItem,
  ListingCard,
  PriceTag,
  AmenityChip,
  TopBar
} = NS;
const {
  useState
} = React;
const LISTINGS = [{
  match: 85,
  title: "Chambre dans un F4",
  city: "Maârif, Casablanca",
  price: 2300,
  tone: "var(--navy-100)",
  amenities: [{
    icon: "users",
    label: "3 colocs"
  }, {
    icon: "volume-x",
    label: "Calme"
  }, {
    icon: "cigarette-off",
    label: "Non-fumeur"
  }]
}, {
  match: 82,
  title: "Chambre dans un F3",
  city: "Agdal, Rabat",
  price: 2000,
  tone: "var(--gold-100)",
  amenities: [{
    icon: "users",
    label: "2 colocs"
  }, {
    icon: "graduation-cap",
    label: "Étudiants"
  }, {
    icon: "wifi",
    label: "Wi-Fi"
  }]
}, {
  match: 78,
  title: "Chambre dans un F4",
  city: "Guéliz, Marrakech",
  price: 2200,
  tone: "var(--green-100)",
  amenities: [{
    icon: "users",
    label: "4 colocs"
  }, {
    icon: "sparkles",
    label: "Mixte"
  }, {
    icon: "paw-print",
    label: "Animaux OK"
  }]
}, {
  match: 74,
  title: "Studio à partager",
  city: "Ain Diab, Casablanca",
  price: 2600,
  tone: "var(--info-100)",
  amenities: [{
    icon: "users",
    label: "2 colocs"
  }, {
    icon: "waves",
    label: "Bord de mer"
  }, {
    icon: "car",
    label: "Parking"
  }]
}, {
  match: 69,
  title: "Chambre chez l'habitant",
  city: "Hassan, Rabat",
  price: 1500,
  tone: "var(--gray-150)",
  amenities: [{
    icon: "users",
    label: "Famille"
  }, {
    icon: "utensils",
    label: "Repas inclus"
  }]
}, {
  match: 66,
  title: "Résidence étudiante",
  city: "Route de Casa, Fès",
  price: 1800,
  tone: "var(--navy-50)",
  amenities: [{
    icon: "building-2",
    label: "Résidence"
  }, {
    icon: "shield",
    label: "Gardien"
  }, {
    icon: "wifi",
    label: "Wi-Fi"
  }]
}];
const PARTNERS = ["UM6P", "Univ. Mohammed V", "INPT", "OFPPT", "Maroc Telecom", "Société Générale"];
function Section({
  children,
  bg,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "72px 40px",
      background: bg || "transparent",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto"
    }
  }, children));
}
function Eyebrow({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) var(--fs-xs) var(--font-body)",
      letterSpacing: ".06em",
      textTransform: "uppercase",
      color: "var(--gold-600)",
      marginBottom: 10
    }
  }, children);
}

/* ---------------- Landing ---------------- */
function Landing({
  go
}) {
  const [role, setRole] = useState("etudiant");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--bg-page)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "linear-gradient(180deg,var(--navy-50),var(--bg-page))"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "56px 40px 40px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 48,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--fw-extrabold) 52px/1.08 var(--font-display)",
      color: "var(--navy-700)",
      letterSpacing: "-.02em",
      margin: "0 0 18px"
    }
  }, "Trouvez votre colocation id\xE9ale en toute ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--gold-500)"
    }
  }, "confiance")), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--fw-regular) 18px/1.55 var(--font-body)",
      color: "var(--text-body)",
      margin: "0 0 26px",
      maxWidth: 440
    }
  }, "La plateforme de colocation v\xE9rifi\xE9e pour \xE9tudiants et jeunes actifs au Maroc."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginBottom: 26
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: role === "etudiant" ? "primary" : "secondary",
    size: "lg",
    iconLeft: "graduation-cap",
    onClick: () => setRole("etudiant")
  }, "Je suis \xE9tudiant"), /*#__PURE__*/React.createElement(Button, {
    variant: role === "salarie" ? "primary" : "secondary",
    size: "lg",
    iconLeft: "briefcase",
    onClick: () => setRole("salarie")
  }, "Je suis salari\xE9")), /*#__PURE__*/React.createElement(SearchBox, {
    go: go
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 28,
      marginTop: 26,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(MiniTrust, {
    icon: "shield-check",
    title: "Profils v\xE9rifi\xE9s",
    sub: "CIN, statut \xE9tudiant ou employeur"
  }), /*#__PURE__*/React.createElement(MiniTrust, {
    icon: "git-compare-arrows",
    title: "Compatibilit\xE9 intelligente",
    sub: "Plus qu'un prix, un mode de vie"
  }), /*#__PURE__*/React.createElement(MiniTrust, {
    icon: "lock",
    title: "Paiement s\xE9curis\xE9",
    sub: "Caution et premier loyer sous s\xE9questre"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 460,
      borderRadius: "var(--radius-xl)",
      overflow: "hidden",
      background: "linear-gradient(160deg,var(--navy-300),var(--navy-600))",
      boxShadow: "var(--shadow-lg)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,.55)",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "image",
    size: 40
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)"
    }
  }, "Photo \u2014 ville marocaine")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 20,
      bottom: 20,
      right: 20,
      display: "flex",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(FloatCard, {
    icon: "user-check",
    title: "Salma, 19 ans",
    sub: "V\xE9rifi\xE9e \xB7 Rabat"
  }), /*#__PURE__*/React.createElement(FloatCard, {
    icon: "home",
    title: "F4 \xB7 Agdal",
    sub: "85% compatible"
  }))))), /*#__PURE__*/React.createElement(Section, {
    bg: "#fff",
    style: {
      padding: "56px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 36
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--fw-bold) 26px var(--font-display)",
      color: "var(--navy-700)",
      margin: 0
    }
  }, "La confiance, au c\u0153ur de M3a-L3chrane")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 18
    }
  }, [["scan-face", "Identité vérifiée", "CIN vérifiée"], ["badge-check", "Statut vérifié", "Étudiant ou employé"], ["clipboard-check", "Annonces modérées", "Contrôle qualité"], ["lock", "Paiement sécurisé", "Séquestre jusqu'à l'état des lieux"]].map(([ic, t, s]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: "24px 20px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 52,
      height: 52,
      borderRadius: "var(--radius-md)",
      background: "var(--navy-50)",
      color: "var(--navy-700)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 26,
    strokeWidth: 1.9
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-bold) var(--fs-body) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, s))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Comment \xE7a marche"), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--fw-bold) 28px var(--font-display)",
      color: "var(--navy-700)",
      margin: 0
    }
  }, "Cinq \xE9tapes, en toute s\xE9r\xE9nit\xE9")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      gap: 20
    }
  }, [["user-round", "Créez votre profil", "Vérification d'identité et de statut"], ["search", "Recherchez & filtrez", "Trouvez les colocations compatibles"], ["messages-square", "Échangez", "Discutez en toute sécurité"], ["calendar-check", "Visitez & choisissez", "Rencontrez vos futurs colocataires"], ["file-signature", "Signez & emménagez", "Contrat en ligne, paiement sécurisé"]].map(([ic, t, s], i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 46,
      height: 46,
      borderRadius: "var(--radius-pill)",
      background: "var(--gold-100)",
      color: "var(--gold-700)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 22
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-bold) var(--fs-sm) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, i + 1, ". ", t), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-sm)/1.45 var(--font-body)",
      color: "var(--text-muted)"
    }
  }, s))))), /*#__PURE__*/React.createElement(Section, {
    bg: "#fff",
    style: {
      padding: "48px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 26
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-semibold) var(--fs-body) var(--font-display)",
      color: "var(--text-muted)"
    }
  }, "Ils nous font confiance")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      gap: 40,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, PARTNERS.map(p => /*#__PURE__*/React.createElement("span", {
    key: p,
    style: {
      font: "var(--fw-bold) 18px var(--font-display)",
      color: "var(--gray-400)",
      letterSpacing: "-.01em"
    }
  }, p)))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--navy-700)",
      borderRadius: "var(--radius-xl)",
      padding: "44px 48px",
      display: "grid",
      gridTemplateColumns: "1.2fr 1fr",
      gap: 40,
      alignItems: "center",
      color: "#fff"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, null, "Partenaires institutions"), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--fw-bold) 28px var(--font-display)",
      margin: "0 0 12px"
    }
  }, "Des portails d\xE9di\xE9s et des int\xE9grations API"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--fw-regular) var(--fs-body-lg)/1.5 var(--font-body)",
      color: "var(--text-on-navy-muted)",
      margin: "0 0 24px"
    }
  }, "Pour accompagner vos \xE9tudiants et vos collaborateurs, avec un reporting anonymis\xE9 et un r\xE9f\xE9rentiel v\xE9rifi\xE9."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "rgba(255,255,255,.08)",
      borderRadius: "var(--radius-md)",
      padding: "12px 16px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "graduation-cap",
    size: 22,
    color: "var(--gold-500)"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-display)"
    }
  }, "Portail Universit\xE9s"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-body)",
      color: "var(--text-on-navy-muted)"
    }
  }, "G\xE9rez le logement de vos \xE9tudiants"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "rgba(255,255,255,.08)",
      borderRadius: "var(--radius-md)",
      padding: "12px 16px"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "building-2",
    size: 22,
    color: "var(--gold-500)"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-display)"
    }
  }, "Portail Entreprises"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-xs) var(--font-body)",
      color: "var(--text-on-navy-muted)"
    }
  }, "Relocation de vos nouveaux talents"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 200,
      borderRadius: "var(--radius-lg)",
      background: "rgba(255,255,255,.06)",
      border: "1px solid rgba(255,255,255,.12)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,.4)",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bar-chart-3",
    size: 34
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)"
    }
  }, "Tableau de bord partenaire")))), /*#__PURE__*/React.createElement(Footer, null));
}
function MiniTrust({
  icon,
  title,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      maxWidth: 200
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 22,
    color: "var(--navy-700)",
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) var(--fs-sm) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-xs)/1.4 var(--font-body)",
      color: "var(--text-muted)"
    }
  }, sub)));
}
function FloatCard({
  icon,
  title,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: "rgba(255,255,255,.96)",
      borderRadius: "var(--radius-md)",
      padding: "10px 12px",
      boxShadow: "var(--shadow-md)",
      display: "flex",
      alignItems: "center",
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 32,
      borderRadius: "var(--radius-sm)",
      background: "var(--navy-50)",
      color: "var(--navy-700)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 17
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) var(--fs-xs) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) 10px var(--font-body)",
      color: "var(--text-muted)"
    }
  }, sub)));
}
function SearchBox({
  go
}) {
  const [tab, setTab] = useState("coloc");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      border: "1px solid var(--border-subtle)",
      padding: 16,
      maxWidth: 520
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    tabs: [{
      label: "Colocations",
      value: "coloc",
      icon: "users"
    }, {
      label: "Résidences",
      value: "res",
      icon: "building-2"
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr auto",
      gap: 10,
      alignItems: "end"
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Ville ou quartier",
    icon: "map-pin",
    options: ["Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir"]
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Budget max",
    icon: "wallet",
    options: ["1 500 MAD", "2 500 MAD", "4 000 MAD"]
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "md",
    onClick: () => go("results"),
    style: {
      height: 44
    }
  }, "Rechercher")));
}

/* ---------------- Search results ---------------- */
function SearchResults({
  go
}) {
  const [selected, setSelected] = useState("Casablanca");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--bg-page)",
      minHeight: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      borderBottom: "1px solid var(--border-subtle)",
      padding: "18px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      gap: 12,
      alignItems: "end",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 220
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Ville ou quartier",
    icon: "map-pin",
    defaultValue: "Casablanca"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 160
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Budget max",
    options: ["2 500 MAD", "4 000 MAD"]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 150
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Type",
    options: ["Tout", "Chambre", "Studio"]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 150
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Genre",
    options: ["Tout", "Féminin", "Masculin"]
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    style: {
      height: 44
    }
  }, "Rechercher"))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "24px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--fw-bold) 24px var(--font-display)",
      color: "var(--navy-700)",
      margin: 0
    }
  }, "Colocations \xE0 Casablanca"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, "128 annonces v\xE9rifi\xE9es")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)"
    }
  }, "Trier par"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 180
    }
  }, /*#__PURE__*/React.createElement(Select, {
    options: ["Pertinence", "Prix croissant", "Date", "Distance"]
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 20,
      flexWrap: "wrap"
    }
  }, ["Non-fumeur", "Meublé", "Wi-Fi", "Féminin", "Proche campus", "Court séjour"].map((f, i) => /*#__PURE__*/React.createElement(Chip, {
    key: f,
    selected: i === 0
  }, f))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 20
    }
  }, LISTINGS.map((l, i) => /*#__PURE__*/React.createElement(ListingCard, {
    key: i,
    match: l.match,
    title: l.title,
    city: l.city,
    price: l.price,
    imageTone: l.tone,
    amenities: l.amenities,
    onClick: () => go("detail")
  })))), /*#__PURE__*/React.createElement(Footer, null));
}

/* ---------------- Listing detail ---------------- */
function ListingDetail({
  go
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--bg-page)",
      minHeight: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "20px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("results");
    }
  }, "Rechercher"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 14
  }), "Casablanca", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 14
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-strong)"
    }
  }, "Ma\xE2rif")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.7fr 1fr",
      gap: 28
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 320,
      borderRadius: "var(--radius-lg)",
      background: "linear-gradient(150deg,var(--navy-200),var(--navy-400))",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,.55)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "image",
    size: 40
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 14,
      bottom: 14
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "images"
  }, "Voir les 12 photos"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 10
    }
  }, [0, 1, 2, 3, 4].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: 56,
      borderRadius: "var(--radius-sm)",
      background: "var(--navy-100)"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--fw-bold) 26px var(--font-display)",
      color: "var(--navy-700)",
      margin: "0 0 8px"
    }
  }, "Chambre dans un F4 \u2014 Ma\xE2rif"), /*#__PURE__*/React.createElement(PriceTag, {
    amount: 2300,
    size: "lg"
  })), /*#__PURE__*/React.createElement(VerifiedBadge, {
    label: "V\xE9rifi\xE9e"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 18,
      margin: "16px 0",
      flexWrap: "wrap",
      font: "var(--fw-medium) var(--fs-sm) var(--font-body)",
      color: "var(--text-body)"
    }
  }, [["users", "3 colocs"], ["bath", "2 salles de bain"], ["ruler", "120 m²"], ["building", "Étage 3"]].map(([ic, t]) => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 16,
    color: "var(--gray-500)"
  }), t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 24
    }
  }, [["cigarette-off", "Non-fumeur"], ["volume-x", "Calme"], ["user-plus", "Invités OK"], ["wifi", "Wi-Fi"]].map(([ic, t]) => /*#__PURE__*/React.createElement(AmenityChip, {
    key: t,
    icon: ic
  }, t))), /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--fw-bold) var(--fs-h3) var(--font-display)",
      color: "var(--navy-700)",
      margin: "0 0 8px"
    }
  }, "\xC0 propos du logement"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--fw-regular) var(--fs-body)/1.6 var(--font-body)",
      color: "var(--text-body)",
      margin: "0 0 8px"
    }
  }, "Appartement lumineux et bien situ\xE9, proche du tram et de toutes commodit\xE9s. Ambiance conviviale et respectueuse."), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      color: "var(--text-muted)",
      margin: 0
    }
  }, "Inclus : eau, \xE9lectricit\xE9, internet, m\xE9nage 1x/semaine."), /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--fw-bold) var(--fs-h3) var(--font-display)",
      color: "var(--navy-700)",
      margin: "26px 0 12px"
    }
  }, "Colocataires actuels"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Sarah, 23",
    showLabel: true,
    subtitle: "\xC9tudiante",
    verified: true
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Youssef, 24",
    showLabel: true,
    subtitle: "\xC9tudiant",
    verified: true
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Omar, 25",
    showLabel: true,
    subtitle: "Ing\xE9nieur",
    verified: true
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: 20,
      boxShadow: "var(--shadow-sm)",
      position: "sticky",
      top: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) var(--fs-h3) var(--font-display)",
      color: "var(--navy-700)",
      marginBottom: 14
    }
  }, "Contacter"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    iconLeft: "send",
    style: {
      marginBottom: 10
    }
  }, "Envoyer un message"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    iconLeft: "heart"
  }, "Ajouter aux favoris"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--border-subtle)",
      margin: "18px 0"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 20,
    color: "var(--green-600)"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-semibold) var(--fs-sm) var(--font-display)",
      color: "var(--text-strong)"
    }
  }, "Paiement s\xE9curis\xE9"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-regular) var(--fs-xs)/1.45 var(--font-body)",
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, "Caution et premier loyer sous s\xE9questre jusqu'\xE0 l'\xE9tat des lieux d'entr\xE9e."), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      font: "var(--fw-semibold) var(--fs-xs) var(--font-body)",
      display: "inline-block",
      marginTop: 6
    }
  }, "En savoir plus"))))))), /*#__PURE__*/React.createElement(Footer, null));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: "var(--navy-900)",
      color: "var(--text-on-navy-muted)",
      padding: "44px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 300
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 32,
      borderRadius: "var(--radius-sm)",
      background: "var(--gold-500)",
      color: "var(--navy-800)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "home",
    size: 18,
    strokeWidth: 2.4
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--fw-extrabold) var(--fs-body) var(--font-display)",
      color: "#fff"
    }
  }, "M3a-L3chrane")), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--fw-regular) var(--fs-sm)/1.5 var(--font-body)",
      margin: 0
    }
  }, "La colocation v\xE9rifi\xE9e au Maroc. Identit\xE9, compatibilit\xE9 et paiement, en toute confiance.")), [["Produit", ["Rechercher", "Publier une annonce", "Résidences", "Tarifs"]], ["Partenaires", ["Universités", "Entreprises", "API développeurs"]], ["Aide", ["Centre de sécurité", "Contact", "CGU", "Confidentialité"]]].map(([h, items]) => /*#__PURE__*/React.createElement("div", {
    key: h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--fw-bold) var(--fs-sm) var(--font-display)",
      color: "#fff",
      marginBottom: 12
    }
  }, h), items.map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      font: "var(--fw-regular) var(--fs-sm) var(--font-body)",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: "var(--text-on-navy-muted)"
    }
  }, i)))))));
}

/* ---------------- App shell ---------------- */
function WebApp() {
  const [view, setView] = useState("landing");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "var(--bg-page)"
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    onSignUp: () => {},
    onSignIn: () => {}
  }), view === "landing" && /*#__PURE__*/React.createElement(Landing, {
    go: setView
  }), view === "results" && /*#__PURE__*/React.createElement(SearchResults, {
    go: setView
  }), view === "detail" && /*#__PURE__*/React.createElement(ListingDetail, {
    go: setView
  }));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(WebApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/screens.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.AmenityChip = __ds_scope.AmenityChip;

__ds_ns.ListingCard = __ds_scope.ListingCard;

__ds_ns.PriceTag = __ds_scope.PriceTag;

__ds_ns.SidebarNav = __ds_scope.SidebarNav;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.CompatibilityRing = __ds_scope.CompatibilityRing;

__ds_ns.FeatureItem = __ds_scope.FeatureItem;

__ds_ns.MatchScore = __ds_scope.MatchScore;

__ds_ns.VerifiedBadge = __ds_scope.VerifiedBadge;

})();
