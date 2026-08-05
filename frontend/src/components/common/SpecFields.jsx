// Rendu générique d'un groupe de champs specs (number / text / bool / select),
// contrôlé : `values` (objet) + `onChange(nextValues)`.
export default function SpecFields({ fields, values = {}, onChange }) {
  const set = (key, v) => onChange({ ...values, [key]: v })
  const ctrl = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent'
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((f) => (
        <div key={f.key} className={f.type === 'bool' ? 'flex items-center gap-2' : ''}>
          {f.type === 'bool' ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!values[f.key]}
                onChange={(e) => set(f.key, e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
              {f.label}
            </label>
          ) : f.type === 'select' ? (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <select value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className={ctrl}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input type={f.type === 'number' ? 'number' : 'text'} value={values[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)} className={ctrl} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}
