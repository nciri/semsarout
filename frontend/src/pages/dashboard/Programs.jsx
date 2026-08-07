import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiPlus, FiSearch, FiFilter, FiMoreVertical, FiEdit2, FiTrash2,
  FiEye, FiGrid, FiList, FiMapPin, FiCalendar, FiHome, FiLock,
  FiArrowRight, FiCheckCircle, FiClock, FiAlertCircle
} from 'react-icons/fi'
import DirIcon from '../../components/common/DirIcon'
import { formatPrice } from '../../utils/currency'
import { useFormat } from '../../utils/format'
import MesBiensTabs from '../../components/dashboard/MesBiensTabs'
import api from '../../services/api'

const programsService = {
  getMyPrograms: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/programs/my?${searchParams}`)
    return data
  },
  deleteProgram: async (id) => {
    const { data } = await api.delete(`/programs/${id}`)
    return data
  },
  publishProgram: async (id) => {
    const { data } = await api.post(`/programs/${id}/publish`)
    return data
  },
  unpublishProgram: async (id) => {
    const { data } = await api.post(`/programs/${id}/unpublish`)
    return data
  }
}

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-red-100 text-red-700'
}

const STATUS_KEYS = ['active', 'draft', 'completed', 'archived']

const CONSTRUCTION_STATUS_META = {
  planning: { icon: FiClock, color: 'text-gray-500' },
  under_construction: { icon: FiAlertCircle, color: 'text-orange-500' },
  delivered: { icon: FiCheckCircle, color: 'text-green-500' }
}

function ProgramCard({ program, onDelete, onPublish, onUnpublish, viewMode }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const { fmtDate } = useFormat()
  const [menuOpen, setMenuOpen] = useState(false)
  const constructionStatusMeta = CONSTRUCTION_STATUS_META[program.construction_status] || CONSTRUCTION_STATUS_META.planning
  const constructionStatus = {
    ...constructionStatusMeta,
    label: t(`dashboard:programs.constructionStatus.${program.construction_status}`, {
      defaultValue: t('dashboard:programs.constructionStatus.planning')
    })
  }
  const ConstructionIcon = constructionStatus.icon

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-4 p-4 bg-white border-b border-gray-100 hover:bg-gray-50">
        <div className="w-24 h-24 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
          {program.cover_image_url ? (
            <img
              src={program.cover_image_url}
              alt={program.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FiHome className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                to={`/dashboard/programmes/${program.id}`}
                className="font-semibold text-gray-900 hover:text-primary-600 line-clamp-1"
              >
                {program.name}
              </Link>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <FiMapPin className="w-3 h-3" />
                {program.city}{program.neighborhood && `, ${program.neighborhood}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[program.status]}`}>
                {t(`dashboard:programs.status.${program.status}`, { defaultValue: program.status })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-gray-600">{t(`dashboard:programs.type.${program.program_type}`, { defaultValue: t('dashboard:programs.type.residential') })}</span>
            {program.min_price && (
              <span className="font-semibold text-gray-900">
                {t('dashboard:programs.startingFrom', { price: formatPrice(program.min_price) })}
              </span>
            )}
            <span className="flex items-center gap-1 text-gray-500">
              <ConstructionIcon className={`w-4 h-4 ${constructionStatus.color}`} />
              {constructionStatus.label}
            </span>
            <span className="text-gray-400">{t('dashboard:programs.viewsCount', { count: program.views_count || 0 })}</span>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <FiMoreVertical className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute end-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20">
                {program.status === 'active' && (
                  <Link
                    to={`/programmes/${program.slug}`}
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FiEye className="w-4 h-4" /> {t('dashboard:programs.menu.viewOnline')}
                  </Link>
                )}
                <Link
                  to={`/dashboard/programmes/${program.id}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FiEdit2 className="w-4 h-4" /> {t('dashboard:programs.menu.edit')}
                </Link>
                {program.status === 'draft' && (
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onPublish(program.id)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50 w-full"
                  >
                    <FiCheckCircle className="w-4 h-4" /> {t('dashboard:programs.menu.publish')}
                  </button>
                )}
                {program.status === 'active' && (
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onUnpublish(program.id)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 w-full"
                  >
                    <FiClock className="w-4 h-4" /> {t('dashboard:programs.menu.unpublish')}
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(program.id)
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                >
                  <FiTrash2 className="w-4 h-4" /> {t('dashboard:programs.menu.archive')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-video bg-gray-200 relative">
        {program.cover_image_url ? (
          <img
            src={program.cover_image_url}
            alt={program.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FiHome className="w-12 h-12 text-gray-400" />
          </div>
        )}
        <span className={`absolute top-2 start-2 px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[program.status]}`}>
          {t(`dashboard:programs.status.${program.status}`, { defaultValue: program.status })}
        </span>
        <div className="absolute top-2 end-2">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 bg-white/90 text-gray-600 hover:bg-white rounded-lg shadow"
          >
            <FiMoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute end-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20">
                {program.status === 'active' && (
                  <Link
                    to={`/programmes/${program.slug}`}
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FiEye className="w-4 h-4" /> {t('dashboard:programs.menu.viewOnline')}
                  </Link>
                )}
                <Link
                  to={`/dashboard/programmes/${program.id}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FiEdit2 className="w-4 h-4" /> {t('dashboard:programs.menu.edit')}
                </Link>
                {program.status === 'draft' && (
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onPublish(program.id)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50 w-full"
                  >
                    <FiCheckCircle className="w-4 h-4" /> {t('dashboard:programs.menu.publish')}
                  </button>
                )}
                {program.status === 'active' && (
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onUnpublish(program.id)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 w-full"
                  >
                    <FiClock className="w-4 h-4" /> {t('dashboard:programs.menu.unpublish')}
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(program.id)
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                >
                  <FiTrash2 className="w-4 h-4" /> {t('dashboard:programs.menu.archive')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="p-4">
        <Link
          to={`/dashboard/programmes/${program.id}`}
          className="font-semibold text-gray-900 hover:text-primary-600 line-clamp-1"
        >
          {program.name}
        </Link>
        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
          <FiMapPin className="w-3 h-3" />
          {program.city}{program.neighborhood && `, ${program.neighborhood}`}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`flex items-center gap-1 text-xs ${constructionStatus.color}`}>
            <ConstructionIcon className="w-3 h-3" />
            {constructionStatus.label}
          </span>
          {program.delivery_date && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <FiCalendar className="w-3 h-3" />
              {fmtDate(program.delivery_date, { month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          {program.min_price ? (
            <span className="text-lg font-bold text-gray-900">
              {t('dashboard:programs.startingFrom', { price: formatPrice(program.min_price) })}
            </span>
          ) : (
            <span className="text-sm text-gray-400">{t('dashboard:programs.priceUndefined')}</span>
          )}
          <span className="text-sm text-gray-500">{t('dashboard:programs.viewsCount', { count: program.views_count || 0 })}</span>
        </div>
      </div>
    </div>
  )
}

function UpgradePrompt() {
  const { t } = useTranslation(['dashboard', 'common'])
  return (
    <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl p-8 text-center">
      <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <FiLock className="w-8 h-8 text-primary-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {t('dashboard:programs.upgrade.title')}
      </h2>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        {t('dashboard:programs.upgrade.description')}
      </p>
      <Link
        to="/dashboard/abonnement"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
      >
        {t('dashboard:programs.upgrade.cta')}
        <DirIcon icon={FiArrowRight} className="w-5 h-5" />
      </Link>
    </div>
  )
}

export default function DashboardPrograms() {
  const { t } = useTranslation(['dashboard', 'common'])
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [filters, setFilters] = useState({
    status: '',
    page: 1
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery(
    ['my-programs', filters, search],
    () => programsService.getMyPrograms({ ...filters, q: search }),
    { keepPreviousData: true }
  )

  const deleteMutation = useMutation(programsService.deleteProgram, {
    onSuccess: () => {
      queryClient.invalidateQueries('my-programs')
    }
  })

  const publishMutation = useMutation(programsService.publishProgram, {
    onSuccess: () => {
      queryClient.invalidateQueries('my-programs')
    }
  })

  const unpublishMutation = useMutation(programsService.unpublishProgram, {
    onSuccess: () => {
      queryClient.invalidateQueries('my-programs')
    }
  })

  const handleDelete = (id) => {
    if (window.confirm(t('dashboard:programs.archiveConfirm'))) {
      deleteMutation.mutate(id)
    }
  }

  const handlePublish = (id) => {
    publishMutation.mutate(id)
  }

  const handleUnpublish = (id) => {
    unpublishMutation.mutate(id)
  }

  // Check if user has programs feature
  const hasProgramsFeature = data?.has_programs_feature
  const programsLimit = data?.programs_limit

  // Show upgrade prompt if feature not available
  if (!isLoading && hasProgramsFeature === false) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <UpgradePrompt />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* En-tête unifié avec « Mes annonces » : ici on affiche le nombre de programmes gérés */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">{t('dashboard:programs.title')}</h1>
          <p className="text-gray-600">
            {t('dashboard:programs.managedCount', { count: data?.total || 0 })}
            {programsLimit && (
              <span className="ms-1 text-sm text-gray-400">{t('dashboard:programs.outOf', { limit: programsLimit })}</span>
            )}
          </p>
        </div>
        <Link
          to="/dashboard/programmes/nouveau"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <FiPlus className="w-5 h-5" />
          {t('dashboard:programs.newProgram')}
        </Link>
      </div>
      <MesBiensTabs />
      <div className="space-y-6">

      {/* Search and filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('dashboard:programs.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
                }`}
              >
                <FiGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
                }`}
              >
                <FiList className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                showFilters ? 'border-primary-500 text-primary-600 bg-primary-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FiFilter className="w-5 h-5" />
              {t('dashboard:programs.filters')}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard:programs.status.label')}</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('dashboard:programs.status.all')}</option>
                {STATUS_KEYS.map((key) => (
                  <option key={key} value={key}>{t(`dashboard:programs.status.${key}`)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ status: '', page: 1 })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                {t('dashboard:programs.reset')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Programs */}
      {isLoading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'bg-white rounded-xl shadow-sm border border-gray-100'}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="aspect-video bg-gray-200 rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : data?.programs?.length > 0 ? (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.programs.map(program => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  onDelete={handleDelete}
                  onPublish={handlePublish}
                  onUnpublish={handleUnpublish}
                  viewMode={viewMode}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {data.programs.map(program => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  onDelete={handleDelete}
                  onPublish={handlePublish}
                  onUnpublish={handleUnpublish}
                  viewMode={viewMode}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page === 1}
                className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('dashboard:programs.pagination.previous')}
              </button>
              <span className="text-gray-600">
                {t('dashboard:programs.pagination.pageOf', { page: filters.page, total: data.pages })}
              </span>
              <button
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page === data.pages}
                className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('dashboard:programs.pagination.next')}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FiHome className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('dashboard:programs.empty.title')}</h3>
          <p className="text-gray-500 mb-4">
            {search || filters.status
              ? t('dashboard:programs.empty.noMatch')
              : t('dashboard:programs.empty.getStarted')}
          </p>
          <Link
            to="/dashboard/programmes/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-5 h-5" />
            {t('dashboard:programs.empty.createButton')}
          </Link>
        </div>
      )}
      </div>
    </div>
  )
}
