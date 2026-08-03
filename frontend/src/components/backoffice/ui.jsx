import { useEffect } from 'react'
import { FiSearch, FiX } from 'react-icons/fi'

// Primitives de présentation du back-office, calquées sur le langage visuel des
// pages CRM (Clients / Leads / Transactions). Un seul point d'import pour garantir
// que toutes les pages Finance partagent exactement la même finition.

const TONES = {
  default: 'text-gray-900',
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  purple: 'text-purple-600',
  red: 'text-red-600',
  primary: 'text-primary-700',
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-gray-500">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}

export function StatCard({ label, value, tone = 'default', icon: Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 truncate">{label}</p>
          <p className={`text-2xl font-bold ${TONES[tone] || TONES.default}`}>{value}</p>
        </div>
        {Icon && <Icon className="w-8 h-8 text-gray-200 flex-shrink-0" />}
      </div>
    </div>
  )
}

export function Toolbar({ children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">{children}</div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Rechercher…' }) {
  return (
    <div className="flex-1 relative min-w-[180px]">
      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  )
}

export function Select({ className = '', ...props }) {
  return (
    <select
      {...props}
      className={`px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
    />
  )
}

export function StatusBadge({ label, className = 'bg-gray-100 text-gray-700' }) {
  return <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${className}`}>{label}</span>
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          {title && <h2 className="font-semibold text-gray-900">{title}</h2>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

export function Field({ label, className = '', ...props }) {
  return (
    <div className="mb-3">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        {...props}
        className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
      />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="p-12 text-center">
      {Icon && <Icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-gray-500 mb-4 max-w-md mx-auto">{description}</p>}
      {action}
    </div>
  )
}

function TableSkeleton({ cols }) {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            {[...Array(cols)].map((_, j) => (
              <div key={j} className="h-4 bg-gray-200 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Table stylée du back-office.
 * columns: [{ header, cell: (row) => node, align?: 'right', className?, thClassName? }]
 */
export function DataTable({ columns, rows, keyField = 'id', isLoading, empty, footer }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {isLoading ? (
        <TableSkeleton cols={columns.length} />
      ) : rows.length === 0 ? (
        empty
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.thClassName || ''}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row[keyField]} className="hover:bg-gray-50">
                  {columns.map((c, i) => (
                    <td key={i} className={`px-4 py-3 text-sm text-gray-700 ${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${maxWidth} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">{footer}</div>}
      </div>
    </div>
  )
}

export const PRIMARY_BTN = 'inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const SECONDARY_BTN = 'inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors'

export function GatedNotice({ icon: Icon, title, message }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center max-w-lg mx-auto">
      {Icon && <Icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />}
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="text-gray-500 mt-2 mb-5">{message}</p>
      <a
        href="/dashboard/compte/abonnement"
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
      >
        Voir les offres Pro & Entreprise
      </a>
    </div>
  )
}
