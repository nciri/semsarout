import { useState } from 'react'
import { FiUser, FiLock, FiBell, FiShield, FiSave, FiCamera, FiCheck, FiAlertCircle } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'

const TABS = [
  { id: 'profile', label: 'Profil', icon: FiUser },
  { id: 'security', label: 'Sécurité', icon: FiLock },
  { id: 'notifications', label: 'Notifications', icon: FiBell },
  { id: 'privacy', label: 'Confidentialité', icon: FiShield },
]

export default function Settings() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    bio: '',
  })

  // Security form state
  const [securityForm, setSecurityForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  // Notification settings
  const [notifications, setNotifications] = useState({
    email_new_lead: true,
    email_messages: true,
    email_property_updates: false,
    email_newsletter: true,
    push_new_lead: true,
    push_messages: true,
    push_reminders: true,
  })

  // Privacy settings
  const [privacy, setPrivacy] = useState({
    profile_visible: true,
    show_phone: false,
    show_email: true,
    allow_contact: true,
  })

  const handleSave = async () => {
    setSaving(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const renderProfileTab = () => (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-3xl font-bold text-primary-600">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </span>
          </div>
          <button className="absolute bottom-0 right-0 p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50">
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
            value={profileForm.email}
            onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
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
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
          <textarea
            value={profileForm.bio}
            onChange={e => setProfileForm({ ...profileForm, bio: e.target.value })}
            rows={4}
            placeholder="Présentez-vous en quelques mots..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
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
                <p className="text-sm text-gray-500">Chrome sur macOS - Casablanca, Maroc</p>
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
            <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
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
    </div>
  )
}
