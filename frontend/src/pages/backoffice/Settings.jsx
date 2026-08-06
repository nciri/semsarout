import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import {
  FiSave, FiUpload, FiGlobe, FiMail, FiPhone, FiMapPin,
  FiDollarSign, FiBell, FiShield, FiDatabase, FiKey, FiCreditCard
} from 'react-icons/fi'
import api from '../../services/api'
import useAuthStore from '../../store/authStore'
import StripeConfig from './StripeConfig'

const backofficeService = {
  getSettings: async () => {
    const { data } = await api.get('/backoffice/settings')
    return data
  },
  updateSettings: async (data) => {
    const { data: responseData } = await api.put('/backoffice/settings', data)
    return responseData
  }
}

function SettingsSection({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-gray-50">
        <Icon className="w-5 h-5 text-gray-400" />
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  )
}

export default function BackofficeSettings() {
  const { t } = useTranslation(['backoffice'])
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('general')
  const [formData, setFormData] = useState({
    agency_name: '',
    agency_email: '',
    agency_phone: '',
    agency_address: '',
    agency_city: '',
    agency_website: '',
    agency_description: '',
    default_commission_rate: 3,
    currency: 'MAD',
    timezone: 'Africa/Casablanca',
    email_notifications: true,
    sms_notifications: false,
    lead_auto_assign: false,
    visit_reminder_hours: 24,
    smtp_host: '',
    smtp_port: '',
    smtp_user: '',
    smtp_password: ''
  })
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery('backoffice-settings', backofficeService.getSettings, {
    onSuccess: (data) => {
      if (data) {
        setFormData(prev => ({ ...prev, ...data }))
      }
    }
  })

  const mutation = useMutation(backofficeService.updateSettings, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-settings')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const tabs = [
    { id: 'general', label: t('backoffice:settings.general.tabs.general'), icon: FiGlobe },
    { id: 'notifications', label: t('backoffice:settings.general.tabs.notifications'), icon: FiBell },
    { id: 'stripe', label: t('backoffice:settings.general.tabs.stripe'), icon: FiCreditCard, adminOnly: true },
    { id: 'integrations', label: t('backoffice:settings.general.tabs.integrations'), icon: FiDatabase },
    { id: 'security', label: t('backoffice:settings.general.tabs.security'), icon: FiShield }
  ].filter((tab) => !tab.adminOnly || user?.role === 'admin')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('backoffice:settings.general.pageTitle')}</h1>
          <p className="text-gray-500">{t('backoffice:settings.general.subtitle')}</p>
        </div>
        {saved && (
          <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm">
            {t('backoffice:settings.general.savedNotice')}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex overflow-x-auto border-b border-gray-100">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'stripe' ? (
          <div className="p-6">
            <StripeConfig />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-6">
          {/* General settings */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('backoffice:settings.general.fields.agencyName')}
                  </label>
                  <input
                    type="text"
                    value={formData.agency_name}
                    onChange={(e) => setFormData({ ...formData, agency_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('backoffice:settings.general.fields.website')}
                  </label>
                  <div className="relative">
                    <FiGlobe className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="url"
                      value={formData.agency_website}
                      onChange={(e) => setFormData({ ...formData, agency_website: e.target.value })}
                      className="w-full ps-10 pe-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('backoffice:settings.general.fields.email')}
                  </label>
                  <div className="relative">
                    <FiMail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={formData.agency_email}
                      onChange={(e) => setFormData({ ...formData, agency_email: e.target.value })}
                      className="w-full ps-10 pe-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('backoffice:settings.general.fields.phone')}
                  </label>
                  <div className="relative">
                    <FiPhone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.agency_phone}
                      onChange={(e) => setFormData({ ...formData, agency_phone: e.target.value })}
                      className="w-full ps-10 pe-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('backoffice:settings.general.fields.address')}
                  </label>
                  <div className="relative">
                    <FiMapPin className="absolute start-3 top-3 w-4 h-4 text-gray-400" />
                    <textarea
                      value={formData.agency_address}
                      onChange={(e) => setFormData({ ...formData, agency_address: e.target.value })}
                      rows={2}
                      className="w-full ps-10 pe-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('backoffice:settings.general.fields.city')}
                  </label>
                  <input
                    type="text"
                    value={formData.agency_city}
                    onChange={(e) => setFormData({ ...formData, agency_city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('backoffice:settings.general.fields.timezone')}
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="Africa/Casablanca">{t('backoffice:settings.general.timezoneOptions.casablanca')}</option>
                    <option value="Europe/Paris">{t('backoffice:settings.general.timezoneOptions.paris')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:settings.general.fields.description')}
                </label>
                <textarea
                  value={formData.agency_description}
                  onChange={(e) => setFormData({ ...formData, agency_description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder={t('backoffice:settings.general.fields.descriptionPlaceholder')}
                />
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{t('backoffice:settings.general.notifications.email.title')}</p>
                    <p className="text-sm text-gray-500">{t('backoffice:settings.general.notifications.email.description')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.email_notifications}
                      onChange={(e) => setFormData({ ...formData, email_notifications: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{t('backoffice:settings.general.notifications.sms.title')}</p>
                    <p className="text-sm text-gray-500">{t('backoffice:settings.general.notifications.sms.description')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.sms_notifications}
                      onChange={(e) => setFormData({ ...formData, sms_notifications: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{t('backoffice:settings.general.notifications.leadAutoAssign.title')}</p>
                    <p className="text-sm text-gray-500">{t('backoffice:settings.general.notifications.leadAutoAssign.description')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.lead_auto_assign}
                      onChange={(e) => setFormData({ ...formData, lead_auto_assign: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:settings.general.notifications.visitReminder.label')}
                </label>
                <select
                  value={formData.visit_reminder_hours}
                  onChange={(e) => setFormData({ ...formData, visit_reminder_hours: parseInt(e.target.value) })}
                  className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {[1, 2, 12, 24, 48].map((hours) => (
                    <option key={hours} value={hours}>
                      {t('backoffice:settings.general.notifications.visitReminder.hours', { count: hours })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Integrations */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">{t('backoffice:settings.general.integrations.smtp.title')}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {t('backoffice:settings.general.integrations.smtp.description')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:settings.general.integrations.smtp.host')}</label>
                    <input
                      type="text"
                      value={formData.smtp_host}
                      onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                      placeholder={t('backoffice:settings.general.integrations.smtp.hostPlaceholder')}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:settings.general.integrations.smtp.port')}</label>
                    <input
                      type="text"
                      value={formData.smtp_port}
                      onChange={(e) => setFormData({ ...formData, smtp_port: e.target.value })}
                      placeholder={t('backoffice:settings.general.integrations.smtp.portPlaceholder')}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:settings.general.integrations.smtp.user')}</label>
                    <input
                      type="text"
                      value={formData.smtp_user}
                      onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:settings.general.integrations.smtp.password')}</label>
                    <input
                      type="password"
                      value={formData.smtp_password}
                      onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">{t('backoffice:settings.general.integrations.api.title')}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {t('backoffice:settings.general.integrations.api.description')}
                </p>
                <div className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-200">
                  <FiKey className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{t('backoffice:settings.general.integrations.api.keyLabel')}</p>
                    <p className="text-xs text-gray-500 font-mono">••••••••••••••••</p>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg"
                  >
                    {t('backoffice:settings.general.integrations.api.regenerate')}
                  </button>
                </div>
              </div>

              {/* ERP Integrations */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">{t('backoffice:settings.general.integrations.erp.title')}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {t('backoffice:settings.general.integrations.erp.description')}
                </p>
                <div className="space-y-3">
                  {/* Odoo */}
                  <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                        <span className="text-lg font-bold text-purple-600">O</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{t('backoffice:settings.general.integrations.erp.odoo.name')}</p>
                        <p className="text-sm text-gray-500">{t('backoffice:settings.general.integrations.erp.odoo.description')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{t('backoffice:settings.general.integrations.status.notConnected')}</span>
                      <button
                        type="button"
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                      >
                        {t('backoffice:settings.general.integrations.actions.configure')}
                      </button>
                    </div>
                  </div>

                  {/* SAP */}
                  <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                        <span className="text-lg font-bold text-blue-600">SAP</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{t('backoffice:settings.general.integrations.erp.sap.name')}</p>
                        <p className="text-sm text-gray-500">{t('backoffice:settings.general.integrations.erp.sap.description')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{t('backoffice:settings.general.integrations.status.notConnected')}</span>
                      <button
                        type="button"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        {t('backoffice:settings.general.integrations.actions.configure')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* CRM Integrations */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">{t('backoffice:settings.general.integrations.crm.title')}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {t('backoffice:settings.general.integrations.crm.description')}
                </p>
                <div className="space-y-3">
                  {/* Salesforce */}
                  <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center">
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="#00A1E0">
                          <path d="M10.5 3.5C9.12 3.5 7.91 4.26 7.28 5.37C6.78 5.13 6.21 5 5.62 5C3.61 5 2 6.61 2 8.62C2 9.61 2.43 10.5 3.11 11.12C2.43 11.74 2 12.64 2 13.62C2 15.63 3.61 17.25 5.62 17.25C5.93 17.25 6.22 17.21 6.5 17.13C6.94 18.76 8.41 20 10.15 20C11.58 20 12.83 19.19 13.45 18C13.97 18.31 14.58 18.5 15.23 18.5C17.26 18.5 18.88 16.88 18.88 14.85C18.88 14.35 18.79 13.87 18.62 13.43C20.5 12.78 21.88 11.03 21.88 9C21.88 6.38 19.75 4.25 17.13 4.25C16.58 4.25 16.05 4.34 15.55 4.5C14.86 3.86 13.93 3.5 12.94 3.5C12.08 3.5 11.28 3.78 10.63 4.25C10.63 3.82 10.6 3.5 10.5 3.5Z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{t('backoffice:settings.general.integrations.crm.salesforce.name')}</p>
                        <p className="text-sm text-gray-500">{t('backoffice:settings.general.integrations.crm.salesforce.description')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{t('backoffice:settings.general.integrations.status.notConnected')}</span>
                      <button
                        type="button"
                        className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm"
                      >
                        {t('backoffice:settings.general.integrations.actions.connect')}
                      </button>
                    </div>
                  </div>

                  {/* HubSpot */}
                  <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                        <span className="text-lg font-bold text-orange-600">HS</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{t('backoffice:settings.general.integrations.crm.hubspot.name')}</p>
                        <p className="text-sm text-gray-500">{t('backoffice:settings.general.integrations.crm.hubspot.description')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{t('backoffice:settings.general.integrations.status.notConnected')}</span>
                      <button
                        type="button"
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
                      >
                        {t('backoffice:settings.general.integrations.actions.connect')}
                      </button>
                    </div>
                  </div>

                  {/* Zoho CRM */}
                  <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                        <span className="text-lg font-bold text-red-600">Z</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{t('backoffice:settings.general.integrations.crm.zoho.name')}</p>
                        <p className="text-sm text-gray-500">{t('backoffice:settings.general.integrations.crm.zoho.description')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{t('backoffice:settings.general.integrations.status.notConnected')}</span>
                      <button
                        type="button"
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                      >
                        {t('backoffice:settings.general.integrations.actions.connect')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">{t('backoffice:settings.general.security.twoFactor.title')}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {t('backoffice:settings.general.security.twoFactor.description')}
                </p>
                <button
                  type="button"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {t('backoffice:settings.general.security.twoFactor.button')}
                </button>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">{t('backoffice:settings.general.security.sessions.title')}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {t('backoffice:settings.general.security.sessions.description')}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t('backoffice:settings.general.security.sessions.chromeMacos')}</p>
                      <p className="text-xs text-gray-500">{t('backoffice:settings.general.security.sessions.currentSession')}</p>
                    </div>
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">{t('backoffice:settings.general.security.sessions.active')}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-medium text-red-900 mb-2">{t('backoffice:settings.general.security.dangerZone.title')}</h3>
                <p className="text-sm text-red-700 mb-4">
                  {t('backoffice:settings.general.security.dangerZone.description')}
                </p>
                <button
                  type="button"
                  className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                >
                  {t('backoffice:settings.general.security.dangerZone.deleteAccount')}
                </button>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end pt-6 mt-6 border-t border-gray-100">
            <button
              type="submit"
              disabled={mutation.isLoading}
              className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <FiSave className="w-5 h-5" />
              {mutation.isLoading ? t('backoffice:settings.general.save.saving') : t('backoffice:settings.general.save.button')}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
