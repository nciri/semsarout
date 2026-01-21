/**
 * Dirham currency icon - similar to $ but with D
 * Usage: <DirhamIcon /> or <DirhamIcon className="w-4 h-4" />
 */
export default function DirhamIcon({ className = "w-4 h-4", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Vertical line through */}
      <line x1="12" y1="2" x2="12" y2="22" />
      {/* D shape */}
      <path d="M8 6h4a6 6 0 0 1 0 12H8V6z" />
    </svg>
  )
}

/**
 * Inline Dirham symbol for use in text
 * Renders as a styled "D" with line through, similar to $
 */
export function DirhamSymbol({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center font-bold ${className}`}
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative'
      }}
      aria-label="Dirham"
    >
      <span style={{ position: 'relative' }}>
        D
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '-2px',
            bottom: '-2px',
            width: '2px',
            backgroundColor: 'currentColor',
            transform: 'translateX(-50%)'
          }}
        />
      </span>
    </span>
  )
}
