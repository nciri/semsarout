import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus, FiShield, FiAlertCircle } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'
import { StatCard, Toolbar, Select, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'

const STATUS = {
  open: ['Ouvert', 'bg-blue-100 text-blue-700'],
  in_progress: ['En cours', 'bg-amber-100 text-amber-700'],
  closed: ['Clôturé', 'bg-emerald-50 text-emerald-700'],
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50'

function LegalCasesList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('legal-cases', () => legalService.listCases())
  const { data: notariesData } = useQuery('notaries', () => legalService.listNotaries())
  const [title, setTitle] = useState('')
  const [type, setType] = useState('sale')

  const create = useMutation(() => legalService.createCase({ title: title || undefined, case_type: type }), {
    onSuccess: () => { toast.success('Dossier créé'); setTitle(''); qc.invalidateQueries('legal-cases') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const cases = data?.cases || []
  const notaries = notariesData?.notaries || []
  const noNotary = notaries.length === 0
  const stats = useMemo(() => ({
    total: cases.length,
    open: cases.filter((c) => c.status === 'open').length,
    in_progress: cases.filter((c) => c.status === 'in_progress').length,
    closed: cases.filter((c) => c.status === 'closed').length,
  }), [cases])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title="Dossiers juridiques" message="Le suivi juridique est réservé aux plans Pro et Entreprise." />
  }

  const columns = [
    { header: 'Titre', cell: (c) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/notaires/dossiers/${c.id}`}>{c.title}</Link>
    ) },
    { header: 'Type', cell: (c) => <span className="text-gray-600">{c.case_type === 'sale' ? 'Vente' : 'Location'}</span> },
    { header: 'Notaire', cell: (c) => <span className="text-gray-600">{c.notary?.name || '—'}</span> },
    { header: 'Progression', cell: (c) => {
      const pct = c.tasks_total ? Math.round((c.tasks_done / c.tasks_total) * 100) : 0
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-gray-500 tabular-nums">{c.tasks_done}/{c.tasks_total}</span>
        </div>
      )
    } },
    { header: 'Statut', cell: (c) => <StatusBadge label={STATUS[c.status]?.[0] || c.status} className={STATUS[c.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} icon={FiShield} />
        <StatCard label="Ouverts" value={stats.open} tone="blue" />
        <StatCard label="En cours" value={stats.in_progress} tone="amber" />
        <StatCard label="Clôturés" value={stats.closed} tone="green" />
      </div>

      {noNotary && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Aucun notaire configuré. Ajoutez un notaire dans l’onglet{' '}
            <Link to="/backoffice/notaires" className="underline font-medium">Notaires</Link>{' '}pour pouvoir créer un dossier.</span>
        </div>
      )}

      <Toolbar>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre du dossier (optionnel)"
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="sale">Vente</option>
          <option value="rental">Location</option>
        </Select>
        <button
          onClick={() => create.mutate()}
          disabled={create.isLoading || noNotary}
          title={noNotary ? 'Configurez d’abord un notaire (onglet Notaires)' : undefined}
          className={PRIMARY_BTN}
        >
          <FiPlus className="w-5 h-5" /> Nouveau dossier
        </button>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={cases}
        isLoading={isLoading}
        empty={<EmptyState icon={FiShield} title="Aucun dossier" description="Créez un dossier ci-dessus pour générer automatiquement sa liste d'étapes juridiques." />}
      />
    </div>
  )
}
export default LegalCasesList
