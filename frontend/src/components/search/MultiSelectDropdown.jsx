import { useState, useRef, useEffect } from 'react'
import { FiChevronDown, FiCheck } from 'react-icons/fi'

// Menu déroulant à cases à cocher (multi-sélection), compact comme un <select>.
export default function MultiSelectDropdown({ label, options, selected, onToggle, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const count = selected.length
  const buttonLabel =
    count === 0
      ? label
      : count === 1
        ? options.find(o => o.value === selected[0])?.label || label
        : `${count} sélectionnés`

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2 border border-gray-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      >
        <span className={count === 0 ? 'text-gray-500' : ''}>{buttonLabel}</span>
        <FiChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {options.map(opt => {
            const active = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
              >
                <span
                  className={`w-4 h-4 flex items-center justify-center rounded border ${
                    active ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300'
                  }`}
                >
                  {active && <FiCheck className="w-3 h-3" />}
                </span>
                <span className="text-slate-700">{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
