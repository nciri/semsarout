import { useTranslation } from 'react-i18next'
import { FiPlus, FiTrash2 } from 'react-icons/fi'
import SearchableSelect from '../../../components/common/SearchableSelect'
import { SECONDARY_BTN } from '../../../components/backoffice/ui'
import { PARTY_ROLES, emptyParty } from './parties'

const labelCls = 'block text-[12.5px] font-medium text-gray-700 mb-0.5'
const ctrlCls = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function PartiesField({ parties, onChange, clientOptions, disabled = false, hint }) {
  const { t } = useTranslation(['backoffice'])
  const patch = (i, next) => onChange(parties.map((p, j) => (j === i ? { ...p, ...next } : p)))

  return (
    <div className="space-y-3">
      {parties.map((party, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_auto] gap-2 sm:items-end">
          <div>
            <label className={labelCls}>{t('backoffice:contracts.parties.role')} {i + 1}</label>
            <select
              value={party.role}
              disabled={disabled}
              onChange={(e) => patch(i, { role: e.target.value })}
              className={ctrlCls}
            >
              <option value="">{t('backoffice:contracts.parties.rolePlaceholder')}</option>
              {PARTY_ROLES.map((role) => (
                <option key={role} value={role}>{t(`backoffice:contracts.parties.roles.${role}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('backoffice:contracts.parties.client')} {i + 1}</label>
            <SearchableSelect
              value={party.client_id}
              onChange={(id) => patch(i, { client_id: id })}
              options={clientOptions}
              disabled={disabled}
              placeholder={t('backoffice:contracts.create.select.none')}
              searchPlaceholder={t('backoffice:contracts.create.search.client')}
              className="text-sm"
              clearable
            />
          </div>
          <button
            type="button"
            disabled={disabled || parties.length === 1}
            onClick={() => onChange(parties.filter((_, j) => j !== i))}
            title={t('backoffice:contracts.parties.remove')}
            className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-redcard-500 disabled:opacity-30 disabled:hover:text-gray-400"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      <button
        type="button"
        disabled={disabled}
        // Une partie de plus tient le plus souvent le même rôle que la précédente
        // (deux vendeurs indivis, deux colocataires) : le rôle est repris par défaut.
        onClick={() => onChange([...parties, emptyParty(parties[parties.length - 1]?.role || '')])}
        className={`${SECONDARY_BTN} py-1.5 text-sm`}
      >
        <FiPlus className="w-4 h-4" /> {t('backoffice:contracts.parties.add')}
      </button>
    </div>
  )
}
