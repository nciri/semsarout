import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import {
  FiArrowLeft, FiSave, FiUser, FiMail, FiPhone, FiMapPin,
  FiDollarSign, FiTag, FiFileText, FiX, FiPlus
} from 'react-icons/fi'
import { DIRHAM_SYMBOL } from '../../utils/currency'
import SearchableSelect from '../../components/common/SearchableSelect'
import DirIcon from '../../components/common/DirIcon'
import api from '../../services/api'

const backofficeService = {
  getClient: async (id) => {
    const { data } = await api.get(`/backoffice/clients/${id}`)
    return data
  },
  createClient: async (data) => {
    const { data: responseData } = await api.post('/backoffice/clients', data)
    return responseData
  },
  updateClient: async ({ id, data }) => {
    const { data: responseData } = await api.put(`/backoffice/clients/${id}`, data)
    return responseData
  },
  getAgents: async () => {
    try {
      const { data } = await api.get('/backoffice/users?role=agent')
      return data
    } catch {
      return { users: [] }
    }
  }
}

// Libellés via t('backoffice:crm.shared.propertyTypes.<value>'), keyés sur l'enum API.
const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'land', 'commercial', 'office']

const CITIES = [
  'Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Fès', 'Agadir',
  'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Mohammedia'
]

export default function BackofficeClientForm() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = !!id

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    secondary_phone: '',
    client_type: 'buyer',
    status: 'active',
    source: 'direct',
    address: '',
    city: '',
    budget_min: '',
    budget_max: '',
    preferred_property_types: [],
    preferred_locations: [],
    notes: '',
    tags: [],
    assigned_agent_id: '',
    gdpr_consent: false
  })

  const [newTag, setNewTag] = useState('')
  const [errors, setErrors] = useState({})

  const { data: clientData, isLoading: loadingClient } = useQuery(
    ['backoffice-client', id],
    () => backofficeService.getClient(id),
    { enabled: isEditing }
  )

  const { data: agentsData } = useQuery('backoffice-agents', backofficeService.getAgents)

  useEffect(() => {
    if (clientData) {
      setFormData({
        first_name: clientData.first_name || '',
        last_name: clientData.last_name || '',
        email: clientData.email || '',
        phone: clientData.phone || '',
        secondary_phone: clientData.secondary_phone || '',
        client_type: clientData.client_type || 'buyer',
        status: clientData.status || 'active',
        source: clientData.source || 'direct',
        address: clientData.address || '',
        city: clientData.city || '',
        budget_min: clientData.budget_min || '',
        budget_max: clientData.budget_max || '',
        preferred_property_types: clientData.search_criteria?.property_types || [],
        preferred_locations: clientData.search_criteria?.locations || [],
        notes: clientData.notes || '',
        tags: clientData.tags || [],
        assigned_agent_id: clientData.assigned_agent_id || '',
        gdpr_consent: clientData.gdpr_consent || false
      })
    }
  }, [clientData])

  const createMutation = useMutation(backofficeService.createClient, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-clients')
      navigate('/backoffice/clients')
    }
  })

  const updateMutation = useMutation(backofficeService.updateClient, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-clients')
      queryClient.invalidateQueries(['backoffice-client', id])
      navigate(`/backoffice/clients/${id}`)
    }
  })

  const backTo = isEditing ? `/backoffice/clients/${id}` : '/backoffice/clients'

  const validate = () => {
    const newErrors = {}
    if (!formData.first_name) newErrors.first_name = t('common:validation.firstNameRequired')
    if (!formData.last_name) newErrors.last_name = t('common:validation.lastNameRequired')
    if (!formData.email && !formData.phone) {
      newErrors.contact = t('backoffice:crm.clients.form.validation.contactRequired')
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('common:validation.emailInvalid')
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const data = {
      ...formData,
      budget_min: formData.budget_min ? parseFloat(formData.budget_min) : null,
      budget_max: formData.budget_max ? parseFloat(formData.budget_max) : null,
      search_criteria: {
        property_types: formData.preferred_property_types,
        locations: formData.preferred_locations
      }
    }

    if (isEditing) {
      updateMutation.mutate({ id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleAddTag = () => {
    if (newTag && !formData.tags.includes(newTag)) {
      setFormData({ ...formData, tags: [...formData.tags, newTag] })
      setNewTag('')
    }
  }

  const handleRemoveTag = (tag) => {
    setFormData({ ...formData, tags: formData.tags.filter(tg => tg !== tag) })
  }

  const togglePropertyType = (type) => {
    const types = formData.preferred_property_types.includes(type)
      ? formData.preferred_property_types.filter(t => t !== type)
      : [...formData.preferred_property_types, type]
    setFormData({ ...formData, preferred_property_types: types })
  }

  const toggleLocation = (location) => {
    const locations = formData.preferred_locations.includes(location)
      ? formData.preferred_locations.filter(l => l !== location)
      : [...formData.preferred_locations, location]
    setFormData({ ...formData, preferred_locations: locations })
  }

  if (loadingClient) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(backTo)}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <DirIcon icon={FiArrowLeft} className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? t('backoffice:crm.clients.form.titleEdit') : t('backoffice:crm.clients.form.titleNew')}
          </h1>
          <p className="text-gray-500">
            {isEditing ? t('backoffice:crm.clients.form.subtitleEdit') : t('backoffice:crm.clients.form.subtitleNew')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiUser className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.clients.form.sections.personalInfo')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.firstName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.first_name ? 'border-red-500' : 'border-gray-200'
                }`}
              />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.lastName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.last_name ? 'border-red-500' : 'border-gray-200'
                }`}
              />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.email')}
              </label>
              <div className="relative">
                <FiMail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full ps-10 pe-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.email ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.phonePrimary')}
              </label>
              <div className="relative">
                <FiPhone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full ps-10 pe-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.phoneSecondary')}
              </label>
              <div className="relative">
                <FiPhone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={formData.secondary_phone}
                  onChange={(e) => setFormData({ ...formData, secondary_phone: e.target.value })}
                  className="w-full ps-10 pe-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.clientType')}
              </label>
              <select
                value={formData.client_type}
                onChange={(e) => setFormData({ ...formData, client_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="buyer">{t('backoffice:crm.shared.clientTypes.buyer')}</option>
                <option value="seller">{t('backoffice:crm.shared.clientTypes.seller')}</option>
                <option value="landlord">{t('backoffice:crm.shared.clientTypes.landlord')}</option>
                <option value="tenant">{t('backoffice:crm.shared.clientTypes.tenant')}</option>
                <option value="investor">{t('backoffice:crm.shared.clientTypes.investor')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.status')}
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="active">{t('backoffice:crm.shared.status.active')}</option>
                <option value="prospect">{t('backoffice:crm.shared.status.prospect')}</option>
                <option value="inactive">{t('backoffice:crm.shared.status.inactive')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.source')}
              </label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="direct">{t('backoffice:crm.clients.form.sourceOptions.direct')}</option>
                <option value="website">{t('backoffice:crm.clients.form.sourceOptions.website')}</option>
                <option value="referral">{t('backoffice:crm.clients.form.sourceOptions.referral')}</option>
                <option value="social">{t('backoffice:crm.clients.form.sourceOptions.social')}</option>
                <option value="advertising">{t('backoffice:crm.clients.form.sourceOptions.advertising')}</option>
                <option value="partner">{t('backoffice:crm.clients.form.sourceOptions.partner')}</option>
              </select>
            </div>
          </div>

          {errors.contact && (
            <p className="text-red-500 text-sm mt-2">{errors.contact}</p>
          )}
        </div>

        {/* Address */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiMapPin className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.clients.form.sections.address')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.address')}
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.city')}
              </label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('backoffice:crm.clients.form.fields.selectCity')}</option>
                {CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Search criteria */}
        {['buyer', 'tenant', 'investor'].includes(formData.client_type) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FiDollarSign className="w-5 h-5 text-gray-400" />
              {t('backoffice:crm.clients.form.sections.searchCriteria')}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:crm.clients.form.fields.budgetMin', { currency: DIRHAM_SYMBOL })}
                </label>
                <input
                  type="number"
                  value={formData.budget_min}
                  onChange={(e) => setFormData({ ...formData, budget_min: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('backoffice:crm.clients.form.fields.budgetMax', { currency: DIRHAM_SYMBOL })}
                </label>
                <input
                  type="number"
                  value={formData.budget_max}
                  onChange={(e) => setFormData({ ...formData, budget_max: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('backoffice:crm.clients.form.fields.propertyTypesWanted')}
              </label>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => togglePropertyType(type)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      formData.preferred_property_types.includes(type)
                        ? 'bg-primary-100 text-primary-700 border border-primary-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {t(`backoffice:crm.shared.propertyTypes.${type}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('backoffice:crm.clients.form.fields.preferredCities')}
              </label>
              <div className="flex flex-wrap gap-2">
                {CITIES.map(city => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => toggleLocation(city)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      formData.preferred_locations.includes(city)
                        ? 'bg-primary-100 text-primary-700 border border-primary-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiTag className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.clients.form.sections.tags')}
          </h2>

          <div className="flex flex-wrap gap-2 mb-3">
            {formData.tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FiX className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              placeholder={t('backoffice:crm.clients.form.tagsPlaceholder')}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <FiPlus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notes & Agent */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiFileText className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.clients.form.sections.notes')}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.agentAssigned')}
              </label>
              <SearchableSelect
                value={formData.assigned_agent_id}
                onChange={(v) => setFormData({ ...formData, assigned_agent_id: v })}
                options={(agentsData?.users || []).map((agent) => ({ value: agent.id, label: `${agent.first_name} ${agent.last_name}`, description: agent.email }))}
                placeholder={t('backoffice:crm.clients.form.fields.agentPlaceholder')}
                searchPlaceholder={t('backoffice:crm.clients.form.fields.agentSearchPlaceholder')}
                clearable
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('backoffice:crm.clients.form.fields.notes')}
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('backoffice:crm.clients.form.fields.notesPlaceholder')}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="gdpr_consent"
                checked={formData.gdpr_consent}
                onChange={(e) => setFormData({ ...formData, gdpr_consent: e.target.checked })}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="gdpr_consent" className="text-sm text-gray-700">
                {t('backoffice:crm.clients.form.fields.gdprConsent')}
              </label>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('backoffice:crm.clients.form.cancelButton')}
          </button>
          <button
            type="submit"
            disabled={createMutation.isLoading || updateMutation.isLoading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <FiSave className="w-5 h-5" />
            {isEditing ? t('backoffice:crm.clients.form.updateButton') : t('backoffice:crm.clients.form.createButton')}
          </button>
        </div>
      </form>
    </div>
  )
}
