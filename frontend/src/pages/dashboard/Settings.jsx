import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
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
  { id: 'profile', label: 'Profil', icon: FiUser },
  { id: 'security', label: 'Sécurité', icon: FiLock },
  { id: 'notifications', label: 'Notifications', icon: FiBell },
  { id: 'privacy', label: 'Confidentialité', icon: FiShield },
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
      toast.success('Photo de profil mise à jour')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors du téléchargement')
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
            toast.error('Les mots de passe ne correspondent pas')
            setSaving(false)
            return
          }
          if (securityForm.new_password.length < 8) {
            toast.error('Le mot de passe doit contenir au moins 8 caractères')
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
      toast.error(error.response?.data?.error || 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    if (!deletePassword) {
      setDeleteError('Mot de passe requis')
      return
    }
    setDeleting(true)
    try {
      await api.delete('/auth/me', { data: { password: deletePassword } })
      logout()
      navigate('/')
      toast.success('Votre compte a été supprimé')
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Erreur lors de la suppression')
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
            className="absolute bottom-0 right-0 p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            <FiCamera className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <div>
          <h3 className="font-medium text-gray-900">{user?.first_name} {user?.last_name}</h3>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <p className="text-xs text-gray-400 mt-1">
            {user?.user_type === 'professional' ? 'Compte Professionnel' : 'Compte Particulier'}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Prénom</label>
          <input
            type="text"
            value={profileForm.first_name}
            onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
          <input
            type="text"
            value={profileForm.last_name}
            onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full px-4 py-2.5 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">L'email ne peut pas être modifié pour le moment</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
          <input
            type="tel"
            value={profileForm.phone}
            onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
            placeholder="+212 6XX XXX XXX"
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
            <h4 className="font-medium text-yellow-800">Sécurisez votre compte</h4>
            <p className="text-sm text-yellow-700 mt-1">
              Utilisez un mot de passe fort avec au moins 8 caractères, incluant des lettres, chiffres et symboles.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-gray-900">Changer le mot de passe</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe actuel</label>
            <input
              type="password"
              value={securityForm.current_password}
              onChange={e => setSecurityForm({ ...securityForm, current_password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nouveau mot de passe</label>
            <input
              type="password"
              value={securityForm.new_password}
              onChange={e => setSecurityForm({ ...securityForm, new_password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirmer le mot de passe</label>
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
        <h3 className="font-medium text-gray-900 mb-4">Sessions actives</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <FiShield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Session actuelle</p>
                <p className="text-sm text-gray-500">Cet appareil</p>
              </div>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Active</span>
          </div>
        </div>
      </div>
    </div>
  )

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-gray-900 mb-4">Notifications par email</h3>
        <div className="space-y-4">
          {[
            { key: 'email_new_lead', label: 'Nouveaux leads', description: 'Recevoir un email à chaque nouveau lead' },
            { key: 'email_messages', label: 'Messages', description: 'Notifications des nouveaux messages' },
            { key: 'email_property_updates', label: 'Mises à jour annonces', description: 'Changements de statut de vos annonces' },
            { key: 'email_newsletter', label: 'Newsletter', description: 'Actualités et conseils immobiliers' },
          ].map(item => (
            <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <div>
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.description}</p>
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
        <h3 className="font-medium text-gray-900 mb-4">Notifications push</h3>
        <div className="space-y-4">
          {[
            { key: 'push_new_lead', label: 'Nouveaux leads', description: 'Notification instantanée' },
            { key: 'push_messages', label: 'Messages', description: 'Notifications des nouveaux messages' },
            { key: 'push_reminders', label: 'Rappels', description: 'Rappels de visites et rendez-vous' },
          ].map(item => (
            <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <div>
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.description}</p>
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
          { key: 'profile_visible', label: 'Profil visible', description: 'Rendre votre profil visible aux autres utilisateurs' },
          { key: 'show_phone', label: 'Afficher le téléphone', description: 'Permettre aux visiteurs de voir votre numéro' },
          { key: 'show_email', label: 'Afficher l\'email', description: 'Permettre aux visiteurs de voir votre email' },
          { key: 'allow_contact', label: 'Autoriser les contacts', description: 'Recevoir des demandes de contact' },
        ].map(item => (
          <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
            <div>
              <p className="font-medium text-gray-900">{item.label}</p>
              <p className="text-sm text-gray-500">{item.description}</p>
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
        <h3 className="font-medium text-red-600 mb-4">Zone de danger</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-red-800">Supprimer mon compte</p>
              <p className="text-sm text-red-600">Cette action est irréversible</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-600 mt-1">Gérez vos informations personnelles et préférences</p>
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
                  {tab.label}
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
              Modifications enregistrées
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <FiSave className="w-4 h-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Delete account confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="font-semibold text-lg text-gray-900 mb-2">Supprimer votre compte</h3>
            <p className="text-sm text-gray-600 mb-4">
              Cette action est irréversible. Confirmez votre mot de passe pour supprimer définitivement votre compte.
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
              placeholder="Mot de passe"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteError('') }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
