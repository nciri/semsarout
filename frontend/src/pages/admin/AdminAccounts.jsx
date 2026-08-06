import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminService } from '../../services/adminService'

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700',
  deleted: 'bg-red-100 text-red-700',
}

function AdminAccounts() {
  const { t } = useTranslation(['admin', 'common'])
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading } = useQuery(
    ['admin', 'accounts', { q, type, status }],
    () => adminService.getAccounts({ q, type, status, per_page: 50 }),
    { keepPreviousData: true }
  )
  const items = data?.items || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">{t('admin:accounts.title')}</h1>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin:accounts.searchPlaceholder')}
               className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800">
          <option value="">{t('admin:accounts.filterType.all')}</option>
          <option value="user">{t('admin:accounts.filterType.user')}</option>
          <option value="agency">{t('admin:accounts.filterType.agency')}</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800">
          <option value="">{t('admin:accounts.filterStatus.all')}</option>
          <option value="active">{t('admin:accounts.filterStatus.active')}</option>
          <option value="suspended">{t('admin:accounts.filterStatus.suspended')}</option>
          <option value="deleted">{t('admin:accounts.filterStatus.deleted')}</option>
        </select>
      </div>
      {isLoading ? <p>{t('admin:shared.loading')}</p> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('admin:accounts.table.name')}</th><th className="px-4 py-3">{t('admin:accounts.table.type')}</th>
                <th className="px-4 py-3">{t('admin:accounts.table.plan')}</th><th className="px-4 py-3">{t('admin:accounts.table.listings')}</th>
                <th className="px-4 py-3">{t('admin:accounts.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${it.kind}-${it.id}`} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link className="text-midnight font-medium hover:underline"
                          to={`/admin/comptes/${it.kind === 'user' ? 'user' : 'agence'}/${it.id}`}>
                      {it.name}
                    </Link>
                    <div className="text-slate-400 text-xs">{it.email}</div>
                  </td>
                  <td className="px-4 py-3">{it.kind === 'user' ? t('admin:accounts.typeLabel.user') : t('admin:accounts.typeLabel.agency')}</td>
                  <td className="px-4 py-3">{it.plan || '—'}</td>
                  <td className="px-4 py-3">{it.listings_count}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[it.status]}`}>
                      {t(`admin:accounts.status.${it.status}`, { defaultValue: it.status })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminAccounts
