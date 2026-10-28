import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiBriefcase, FiDatabase, FiPercent, FiSave, FiSliders } from 'react-icons/fi'
import api from '../../services/api'
import MyAgency from '../dashboard/MyAgency'

/**
 * Onglet « Agence » des paramètres : ce qu'une agence règle une fois pour toute l'équipe.
 *
 * Répartition assumée avec l'onglet « Mon compte » : ici l'agence (profil public,
 * commissions, règles de travail, intégrations) ; là-bas la personne (son profil, son mot
 * de passe, ses alertes). Le profil de l'agence n'est plus saisi deux fois : l'écran
 * « Mon agence » est réemployé tel quel dans le premier sous-onglet, et c'est lui qui écrit
 * dans la table des agences — le blob de réglages ne porte plus que l'exploitation.
 */
const SETTINGS_FIELDS = {
  default_sale_commission_fee: 0,
  default_rental_commission_rate: 50,
  currency: 'MAD',
  timezone: 'Africa/Casablanca',
  sms_notifications: false,
  lead_auto_assign: false,
  visit_reminder_hours: 24,
  smtp_host: '',
  smtp_port: '',
  smtp_user: '',
  smtp_password: '',
}

const TABS = [
  { id: 'profile', icon: FiBriefcase },
  { id: 'commissions', icon: FiPercent },
  { id: 'rules', icon: FiSliders },
  { id: 'integrations', icon: FiDatabase },
]

const INPUT = 'w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'

const backofficeService = {
  getSettings: async () => (await api.get('/backoffice/settings')).data,
  updateSettings: async (data) => (await api.put('/backoffice/settings', data)).data,
}

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label className={LABEL} htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

/** Interrupteur de réglage : le même rendu partout, au lieu d'un bloc recopié par option. */
function Toggle({ id, title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-4">
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:start-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rtl:peer-checked:after:-translate-x-full" />
      </label>
    </div>
  )
}

export default function BackofficeSettings({ embedded = false }) {
  const { t } = useTranslation(['backoffice'])
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState(SETTINGS_FIELDS)
  const [saved, setSaved] = useState(false)

  const { isLoading } = useQuery('backoffice-settings', backofficeService.getSettings, {
    onSuccess: (data) => {
      if (!data) return
      // On ne garde que les réglages de cet écran : le profil de l'agence vit ailleurs.
      const next = {}
      for (const key of Object.keys(SETTINGS_FIELDS)) {
        if (data[key] !== undefined && data[key] !== null) next[key] = data[key]
      }
      setFormData((prev) => ({ ...prev, ...next }))
    },
  })

  const mutation = useMutation(backofficeService.updateSettings, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-settings')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const set = (key) => (value) => setFormData({ ...formData, [key]: value })
  const field = (key) => (e) => set(key)(e.target.value)
  const g = (key, opts) => t(`backoffice:settings.general.${key}`, opts)

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600 motion-reduce:animate-none" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{g('pageTitle')}</h1>
            <p className="text-gray-500">{g('subtitle')}</p>
          </div>
        )}
        {saved && <div className="rounded-lg bg-green-100 px-4 py-2 text-sm text-green-700">{g('savedNotice')}</div>}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex overflow-x-auto border-b border-gray-100">
          {TABS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {g(`tabs.${id}`)}
            </button>
          ))}
        </div>

        {/* Profil : l'écran « Mon agence », réemployé — un seul formulaire pour une seule donnée. */}
        {activeTab === 'profile' ? (
          <div className="p-4 sm:p-6"><MyAgency embedded /></div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(formData) }} className="p-6">
            {activeTab === 'commissions' && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500">{g('commissions.intro')}</p>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <Field id="default_sale_commission_fee" label={g('fields.saleCommissionFee')} hint={g('fields.saleCommissionFeeHint')}>
                    <input id="default_sale_commission_fee" type="number" min="0" step="100" className={INPUT}
                      value={formData.default_sale_commission_fee} onChange={field('default_sale_commission_fee')} />
                  </Field>
                  <Field id="default_rental_commission_rate" label={g('fields.rentalCommissionRate')} hint={g('fields.rentalCommissionHint')}>
                    <input id="default_rental_commission_rate" type="number" min="0" max="100" step="0.1" className={INPUT}
                      value={formData.default_rental_commission_rate} onChange={field('default_rental_commission_rate')} />
                  </Field>
                </div>
              </div>
            )}

            {activeTab === 'rules' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <Toggle id="lead_auto_assign" title={g('rules.leadAutoAssign.title')} description={g('rules.leadAutoAssign.description')}
                    checked={formData.lead_auto_assign} onChange={set('lead_auto_assign')} />
                  <Toggle id="sms_notifications" title={g('rules.sms.title')} description={g('rules.sms.description')}
                    checked={formData.sms_notifications} onChange={set('sms_notifications')} />
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <Field id="visit_reminder_hours" label={g('rules.visitReminder.label')} hint={g('rules.visitReminder.hint')}>
                    <select id="visit_reminder_hours" className={INPUT} value={formData.visit_reminder_hours}
                      onChange={(e) => set('visit_reminder_hours')(parseInt(e.target.value, 10))}>
                      {[1, 2, 12, 24, 48].map((hours) => (
                        <option key={hours} value={hours}>{g('rules.visitReminder.hours', { count: hours })}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="timezone" label={g('fields.timezone')}>
                    <select id="timezone" className={INPUT} value={formData.timezone} onChange={field('timezone')}>
                      <option value="Africa/Casablanca">{g('timezoneOptions.casablanca')}</option>
                      <option value="Europe/Paris">{g('timezoneOptions.paris')}</option>
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-gray-500">{g('rules.accountNote')}</p>
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-medium text-gray-900">{g('integrations.smtp.title')}</h2>
                  <p className="text-sm text-gray-500">{g('integrations.smtp.description')}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field id="smtp_host" label={g('integrations.smtp.host')}>
                    <input id="smtp_host" type="text" className={INPUT} value={formData.smtp_host}
                      onChange={field('smtp_host')} placeholder={g('integrations.smtp.hostPlaceholder')} />
                  </Field>
                  <Field id="smtp_port" label={g('integrations.smtp.port')}>
                    <input id="smtp_port" type="text" className={INPUT} value={formData.smtp_port}
                      onChange={field('smtp_port')} placeholder={g('integrations.smtp.portPlaceholder')} />
                  </Field>
                  <Field id="smtp_user" label={g('integrations.smtp.user')}>
                    <input id="smtp_user" type="text" className={INPUT} value={formData.smtp_user} onChange={field('smtp_user')} />
                  </Field>
                  <Field id="smtp_password" label={g('integrations.smtp.password')} hint={g('integrations.smtp.passwordHint')}>
                    <input id="smtp_password" type="password" className={INPUT} value={formData.smtp_password}
                      onChange={field('smtp_password')} autoComplete="new-password" />
                  </Field>
                </div>
                <p className="text-xs text-gray-500">{g('integrations.apiKeyNote')}</p>
              </div>
            )}

            <div className="mt-6 flex justify-end border-t border-gray-100 pt-6">
              <button type="submit" disabled={mutation.isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2 text-white transition-colors hover:bg-primary-700 disabled:opacity-50">
                <FiSave className="h-5 w-5" aria-hidden="true" />
                {mutation.isLoading ? g('save.saving') : g('save.button')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
