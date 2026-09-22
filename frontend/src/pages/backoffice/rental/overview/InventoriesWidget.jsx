import { useMutation } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCheckCircle, FiExternalLink, FiPlus } from 'react-icons/fi'
import { rentalService } from '../../../../services/rentalService'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, IconAction, Kv, TD, TH } from '../../components/kit'
import { INVENTORY_TONE } from '../model'
import { useRentalFormat, useRentalRefresh } from '../hooks'

function useSituation() {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const long = { day: 'numeric', month: 'long' }
  return (i) => {
    if (i.type === 'sortie') return t('rental.overview.edl.situation.exit', { date: f.date(i.since, long) })
    if (i.status === 'missing') return i.start_date ? t('rental.overview.edl.situation.missingSince', { date: f.date(i.start_date, long) }) : t('rental.overview.edl.situation.missing')
    return t(`rental.overview.edl.situation.${i.status}`, { date: f.date(i.since, long) })
  }
}

export function InventoriesCompact({ s }) {
  const { t } = useTranslation('backoffice')
  const situation = useSituation()
  const inv = s.inventories
  if (!inv.active_leases) return <p className="text-sm text-gray-500">{t('rental.overview.edl.noActive')}</p>
  const missing = inv.items.filter((i) => i.type === 'entree').length
  if (!inv.items.length) return <Alert tone="plain" icon={FiCheckCircle}>{t('rental.overview.edl.allSigned')}</Alert>
  return (
    <>
      <Figure value={missing}>{t('rental.overview.edl.headline', { count: missing })}</Figure>
      <ul className="grid">
        {inv.items.slice(0, 4).map((i) => (
          <li key={`${i.lease_id}-${i.type}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
            <b className="truncate font-semibold">{t(`rental.overview.inventoryType.${i.type}`)} · {i.property_title || i.reference}</b>
            <span className="row-span-2 self-center"><Chip tone={INVENTORY_TONE[i.status]}>{t(`rental.overview.inventoryStatus.${i.status}`)}</Chip></span>
            <span className="truncate text-[12.5px] text-gray-500">{situation(i)}</span>
          </li>
        ))}
      </ul>
      {missing > 0 && <Alert tone="crit" icon={FiAlertCircle}>{t('rental.overview.edl.depositAlert')}</Alert>}
    </>
  )
}

export function InventoriesDetail({ s, onClose, titleRef }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const f = useRentalFormat()
  const navigate = useNavigate()
  const refresh = useRentalRefresh()
  const situation = useSituation()
  const inv = s.inventories
  const create = useMutation(({ leaseId, type }) => rentalService.createInventory(leaseId, type), {
    onSuccess: (created) => { toast.success(t('backoffice:rental.lease.toasts.inventoryCreated')); refresh(); navigate(`/backoffice/gestion-locative/etats-des-lieux/${created.id}`) },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  return (
    <DetailFrame title={t('backoffice:rental.overview.edl.title')} sub={t('backoffice:rental.overview.edl.detailSub')} onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!inv.items.length
          ? <p className="text-sm text-gray-500">{inv.active_leases ? t('backoffice:rental.overview.edl.allSigned') : t('backoffice:rental.overview.edl.noActive')}</p>
          : (
            <table className="w-full text-[13px]">
              <thead><tr>
                <th className={TH}>{t('backoffice:rental.overview.edl.columns.property')}</th>
                <th className={TH}>{t('backoffice:rental.overview.edl.columns.tenant')}</th>
                <th className={TH}>{t('backoffice:rental.overview.edl.columns.type')}</th>
                <th className={TH}>{t('backoffice:rental.overview.edl.columns.situation')}</th>
                <th className={`${TH} text-end`}><span className="sr-only">{t('backoffice:rental.overview.actions')}</span></th>
              </tr></thead>
              <tbody>
                {inv.items.map((i) => (
                  <tr key={`${i.lease_id}-${i.type}`} className="hover:bg-gray-50">
                    <td className={TD}><b className="font-semibold">{i.property_title || i.reference}</b><span className="block text-xs text-gray-500">{i.property_city}</span></td>
                    <td className={TD}>{i.tenant_name || '—'}</td>
                    <td className={TD}>{t(`backoffice:rental.overview.inventoryType.${i.type}`)}</td>
                    <td className={TD}>{situation(i)}</td>
                    <td className={`${TD} text-end`}>
                      {i.inventory_id
                        ? <IconAction icon={FiExternalLink} label={t('backoffice:rental.overview.edl.resume')} to={`/backoffice/gestion-locative/etats-des-lieux/${i.inventory_id}`} tone="gold" tipAlign="end" />
                        : <IconAction icon={FiPlus} label={t(`backoffice:rental.lease.inventories.${i.type === 'entree' ? 'createEntryButton' : 'createExitButton'}`)} tone="gold" tipAlign="end"
                          disabled={create.isLoading} onClick={() => create.mutate({ leaseId: i.lease_id, type: i.type })} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        aside={<>
          <div className="grid grid-cols-2 gap-3">
            <Kv label={t('backoffice:rental.overview.edl.entrySigned')} value={inv.entry_signed} unit={t('backoffice:rental.overview.edl.ofLeases', { count: inv.active_leases })} />
            <Kv label={t('backoffice:rental.overview.edl.exposed')} value={f.n(inv.deposits_exposed)} unit={t('backoffice:dashboard.units.dirham')} />
          </div>
          <p className="m-0 text-[12.5px] text-gray-500">{t('backoffice:rental.overview.edl.note')}</p>
        </>}
      />
    </DetailFrame>
  )
}
