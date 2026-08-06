import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "fr", key: "fr" },
  { code: "ar", key: "ar" },
];

/** LanguageSwitcher — toggles i18next language (fr/ar), persisted to localStorage. */
export function LanguageSwitcher({ tone = "dark", style }) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language;

  return (
    <div
      role="group"
      aria-label={t("languageSwitcher.label")}
      style={{
        display: "inline-flex", gap: 2, padding: 2, borderRadius: "var(--radius-pill)",
        background: tone === "dark" ? "rgba(255,255,255,.08)" : "var(--gray-100)",
        ...style,
      }}
    >
      {LANGS.map(({ code, key }) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => i18n.changeLanguage(code)}
            aria-pressed={active}
            style={{
              padding: "4px 10px", borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer",
              font: "var(--fw-semibold) var(--fs-xs) var(--font-display)",
              background: active ? "var(--brand-accent)" : "transparent",
              color: active
                ? "var(--text-on-accent)"
                : tone === "dark" ? "var(--text-on-navy-muted)" : "var(--text-muted)",
            }}
          >
            {t(`languageSwitcher.${key}`)}
          </button>
        );
      })}
    </div>
  );
}
