import { useEffect, useMemo, useRef, useState } from 'react'
import { FiChevronDown, FiSearch, FiCheck, FiX } from 'react-icons/fi'

// Dropdown enrichi : affiche la valeur sélectionnée, ouvre un panneau avec un
// champ de recherche qui filtre les options (par libellé + description).
// options: [{ value, label, description? }]
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Sélectionner…',
  searchPlaceholder = 'Rechercher…',
  disabled = false,
  clearable = false,
  emptyLabel = 'Aucun résultat',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) =>
      `${o.label} ${o.description || ''}`.toLowerCase().includes(q),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setHighlight(0)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => { setHighlight(0) }, [query])

  const choose = (opt) => {
    onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight]) choose(filtered[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const triggerCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-left bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center justify-between gap-2'

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`${triggerCls} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {clearable && selected && !disabled && (
            <FiX
              className="w-4 h-4 text-gray-400 hover:text-gray-600"
              onClick={(e) => { e.stopPropagation(); onChange('') }}
            />
          )}
          <FiChevronDown className="w-4 h-4 text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">{emptyLabel}</li>
            ) : (
              filtered.map((opt, i) => {
                const isSel = String(opt.value) === String(value)
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => choose(opt)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                        i === highlight ? 'bg-primary-50' : ''
                      } ${isSel ? 'text-primary-700 font-medium' : 'text-gray-700'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{opt.label}</span>
                        {opt.description && (
                          <span className="block truncate text-xs text-gray-400">{opt.description}</span>
                        )}
                      </span>
                      {isSel && <FiCheck className="w-4 h-4 flex-shrink-0" />}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
