import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiUser, FiLock, FiBell, FiShield, FiSave, FiCamera, FiCheck, FiAlertCircle } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'

const NOTIFICATIONS_STORAGE_KEY = 'semsarout-notification-prefs'
const PRIVACY_STORAGE_KEY = 'semsarout-privacy-prefs'

const loadPrefs = (key, defaults) => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults
  } catch {
    return defaults
  }
}

const TABS = [
  { id: 'profile', key: 'profile', icon: FiUser },
  { id: 'security', key: 'security', icon: FiLock },
  { id: 'notifications', key: 'notifications', icon: FiBell },
  { id: 'privacy', key: 'privacy', icon: FiShield },
]

const DEFAULT_NOTIFICATIONS = {
  email_new_lead: true,
  email_messages: true,
  email_property_updates: false,
  email_newsletter: true,
  push_new_lead: true,
  push_messages: true,
  push_reminders: true,
}

const DEFAULT_PRIVACY = {
  profile_visible: true,
  show_phone: false,
  show_email: true,
  allow_contact: true,
}

export default function Settings() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { user, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const avatarInputRef = useRef(null)
  const [activeTab, setActiveTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
  })

  // Security form state
  const [securityForm, setSecurityForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  // Notification settings (persisted locally - no server-side notification engine yet)
  const [notifications, setNotifications] = useState(() => loadPrefs(NOTIFICATIONS_STORAGE_KEY, DEFAULT_NOTIFICATIONS))

  // Privacy settings (persisted locally - no server-side enforcement yet)
  const [privacy, setPrivacy] = useState(() => loadPrefs(PRIVACY_STORAGE_KEY, DEFAULT_PRIVACY))

  const handleAvatarClick = () => avatarInputRef.current?.click()

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kind', 'photo')
      const uploadRes = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const avatarUrl = uploadRes.data.url
      const meRes = await api.put('/auth/me', { avatar_url: avatarUrl })
      updateUser(meRes.data.user)
      toast.success(t('dashboard:settings.profile.avatarUpdated'))
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard:settings.profile.avatarUploadError'))
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (activeTab === 'profile') {
        const response = await api.put('/auth/me', {
          first_name: profileForm.first_name,
          last_name: profileForm.last_name,
          phone: profileForm.phone
        })
        updateUser(response.data.user)
      } else if (activeTab === 'security') {
        if (securityForm.new_password || securityForm.current_password) {
          if (securityForm.new_password !== securityForm.confirm_password) {
            toast.error(t('dashboard:settings.security.passwordMismatch'))
            setSaving(false)
            return
          }
          if (securityForm.new_password.length < 8) {
            toast.error(t('dashboard:settings.security.passwordTooShort'))
            setSaving(false)
            return
          }
          await api.post('/auth/change-password', {
            current_password: securityForm.current_password,
            new_password: securityForm.new_password
          })
          setSecurityForm({ current_password: '', new_password: '', confirm_password: '' })
        }
      } else if (activeTab === 'notifications') {
        localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications))
      } else if (activeTab === 'privacy') {
        localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(privacy))
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard:settings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    if (!deletePassword) {
      setDeleteError(t('dashboard:settings.deleteModal.passwordRequired'))
      return
    }
    setDeleting(true)
    try {
      await api.delete('/auth/me', { data: { password: deletePassword } })
      logout()
      navigate('/')
      toast.success(t('dashboard:settings.toasts.accountDeleted'))
    } catch (error) {
      setDeleteError(error.response?.data?.error || t('dashboard:settings.toasts.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  const renderProfileTab = () => (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary-600">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </span>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <button
            onClick={handleAvatarClick}
            disabled={uploadingAvatar}
            className="absolute bottom-0 end-0 p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiCamera className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <div>
          <h3 className="font-medium text-gray-900">{user?.first_name} {user?.last_name}</h3>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <p className="text-xs text-gray-400 mt-1">
            {user?.user_type === 'professional' ? t('dashboard:settings.profile.accountType.professional') : t('dashboard:settings.profile.accountType.individual')}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:settings.profile.firstName')}</label>
          <input
            type="text"
            value={profileForm.first_name}
            onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:settings.profile.lastName')}</label>
          <input
            type="text"
            value={profileForm.last_name}
            onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:settings.profile.email')}</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('dashboard:settings.profile.emailNote')}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:settings.profile.phone')}</label>
          <input
            type="tel"
            value={profileForm.phone}
            onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
            placeholder={t('dashboard:settings.profile.phonePlaceholder')}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  )

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex gap-3">
          <FiAlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-yellow-800">{t('dashboard:settings.security.bannerTitle')}</h4>
            <p className="text-sm text-yellow-700 mt-1">
              {t('dashboard:settings.security.bannerMessage')}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-gray-900">{t('dashboard:settings.security.changePassword')}</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:settings.security.currentPassword')}</label>
            <input
              type="password"
              value={securityForm.current_password}
              onChange={e => setSecurityForm({ ...securityForm, current_password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:settings.security.newPassword')}</label>
            <input
              type="password"
              value={securityForm.new_password}
              onChange={e => setSecurityForm({ ...securityForm, new_password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard:settings.security.confirmPassword')}</label>
            <input
              type="password"
              value={securityForm.confirm_password}
              onChange={e => setSecurityForm({ ...securityForm, confirm_password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="font-medium text-gray-900 mb-4">{t('dashboard:settings.security.sessionsTitle')}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <FiShield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{t('dashboard:settings.security.currentSession')}</p>
                <p className="text-sm text-gray-500">{t('dashboard:settings.security.currentDevice')}</p>
              </div>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{t('dashboard:settings.security.active')}</span>
          </div>
        </div>
      </div>
    </div>
  )

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-gray-900 mb-4">{t('dashboard:settings.notifications.emailTitle')}</h3>
        <div className="space-y-4">
          {[
            { key: 'email_new_lead', i18nKey: 'emailNewLead' },
            { key: 'email_messages', i18nKey: 'emailMessages' },
            { key: 'email_property_updates', i18nKey: 'emailPropertyUpdates' },
            { key: 'email_newsletter', i18nKey: 'emailNewsletter' },
          ].map(item => (
            <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <div>
                <p className="font-medium text-gray-900">{t(`dashboard:settings.notifications.items.${item.i18nKey}.label`)}</p>
                <p className="text-sm text-gray-500">{t(`dashboard:settings.notifications.items.${item.i18nKey}.desc`)}</p>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={notifications[item.key]}
                  onChange={e => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${notifications[item.key] ? 'bg-primary-600' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${notifications[item.key] ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`}></div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium text-gray-900 mb-4">{t('dashboard:settings.notifications.pushTitle')}</h3>
        <div className="space-y-4">
          {[
            { key: 'push_new_lead', i18nKey: 'pushNewLead' },
            { key: 'push_messages', i18nKey: 'pushMessages' },
            { key: 'push_reminders', i18nKey: 'pushReminders' },
          ].map(item => (
            <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <div>
                <p className="font-medium text-gray-900">{t(`dashboard:settings.notifications.items.${item.i18nKey}.label`)}</p>
                <p className="text-sm text-gray-500">{t(`dashboard:settings.notifications.items.${item.i18nKey}.desc`)}</p>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={notifications[item.key]}
                  onChange={e => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${notifications[item.key] ? 'bg-primary-600' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${notifications[item.key] ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`}></div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )

  const renderPrivacyTab = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        {[
          { key: 'profile_visible', i18nKey: 'profileVisible' },
          { key: 'show_phone', i18nKey: 'showPhone' },
          { key: 'show_email', i18nKey: 'showEmail' },
          { key: 'allow_contact', i18nKey: 'allowContact' },
        ].map(item => (
          <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div>
              <p className="font-medium text-gray-900">{t(`dashboard:settings.privacy.items.${item.i18nKey}.label`)}</p>
              <p className="text-sm text-gray-500">{t(`dashboard:settings.privacy.items.${item.i18nKey}.desc`)}</p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={privacy[item.key]}
                onChange={e => setPrivacy({ ...privacy, [item.key]: e.target.checked })}
                className="sr-only"
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${privacy[item.key] ? 'bg-primary-600' : 'bg-gray-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${privacy[item.key] ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`}></div>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="border-t pt-6">
        <h3 className="font-medium text-red-600 mb-4">{t('dashboard:settings.privacy.dangerZone')}</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-red-800">{t('dashboard:settings.privacy.deleteAccountTitle')}</p>
              <p className="text-sm text-red-600">{t('dashboard:settings.privacy.deleteAccountDesc')}</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              {t('dashboard:shared.actions.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard:settings.title')}</h1>
        <p className="text-gray-600 mt-1">{t('dashboard:settings.subtitle')}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(`dashboard:settings.tabs.${tab.key}`)}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'profile' && renderProfileTab()}
          {activeTab === 'security' && renderSecurityTab()}
          {activeTab === 'notifications' && renderNotificationsTab()}
          {activeTab === 'privacy' && renderPrivacyTab()}
        </div>

        {/* Save button */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-4">
          {saved && (
            <span className="flex items-center gap-2 text-green-600">
              <FiCheck className="w-4 h-4" />
              {t('dashboard:settings.saved')}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <FiSave className="w-4 h-4" />
            {saving ? t('dashboard:shared.actions.saving') : t('dashboard:shared.actions.save')}
          </button>
        </div>
      </div>

      {/* Delete account confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="font-semibold text-lg text-gray-900 mb-2">{t('dashboard:settings.deleteModal.title')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('dashboard:settings.deleteModal.message')}
            </p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {deleteError}
              </div>
            )}
            <input
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder={t('dashboard:settings.deleteModal.passwordPlaceholder')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteError('') }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t('dashboard:shared.actions.cancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? t('dashboard:settings.deleteModal.confirming') : t('dashboard:settings.deleteModal.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
