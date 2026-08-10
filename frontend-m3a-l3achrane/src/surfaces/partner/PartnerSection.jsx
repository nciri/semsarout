// Shared layout pieces for the partner portal sub-screens (Lot E) — mirrors the header/card/table
// look of PartnerPortal.jsx so the 7 new screens read as one surface rather than 7 one-offs.

export function PartnerHeader({ kicker, heading, action }) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '18px 28px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {kicker}
        </div>
        <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 23px var(--font-display)', letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>
          {heading}
        </h1>
      </div>
      {action}
    </div>
  )
}

export function PartnerScreen({ kicker, heading, action, children }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <PartnerHeader kicker={kicker} heading={heading} action={action} />
      <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>
    </div>
  )
}

export function PartnerCard({ title, children }) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {title && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-heading)', margin: 0 }}>
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  )
}

// columns: [{ key, label, render?: (row) => node }]
export function PartnerTable({ columns, rows, rowKey = 'id', emptyMessage }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--gray-50)' }}>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: 'start',
                padding: '11px 20px',
                font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
              }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ padding: '24px 20px', textAlign: 'center', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row[rowKey]} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '13px 20px', font: 'var(--fw-regular) var(--fs-sm) var(--font-body)', color: 'var(--text-body)' }}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

export function PartnerKpi({ label, value, sub }) {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ font: 'var(--fw-bold) 11.5px var(--font-body)', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ font: 'var(--fw-extrabold) 24px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {sub && <div style={{ font: 'var(--fw-regular) 12px var(--font-body)', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}
