import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { FiPlus, FiTrash2, FiUserPlus } from 'react-icons/fi'
import SearchableSelect from '../../../components/common/SearchableSelect'
import { Modal, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import api from '../../../services/api'
import { PARTY_ROLES, emptyParty } from './parties'

const labelCls = 'block text-[12.5px] font-medium text-gray-700 mb-0.5'
const ctrlCls = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'
const etoile = <span className="text-red-500">*</span>

export default function PartiesField({ parties, onChange, clientOptions, disabled = false, hint,
  allowCreate = false }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  // Index de la ligne qui a demandé la création ; la fenêtre est fermée quand il est nul.
  const [creation, setCreation] = useState(null)
  const [nouveau, setNouveau] = useState({ first_name: '', last_name: '', phone: '' })
  // Les clients créés depuis cet écran, gardés le temps que la liste du parent se recharge :
  // sinon la ligne porte un identifiant absent des options et retombe sur son placeholder.
  const [crees, setCrees] = useState([])
  const patch = (i, next) => onChange(parties.map((p, j) => (j === i ? { ...p, ...next } : p)))

  const options = [...clientOptions, ...crees
    .filter((c) => !clientOptions.some((o) => String(o.value) === String(c.value)))]
  // Le raccourci s'affiche sur un fichier client vide, et y reste ensuite : une agence qui
  // démarre saisit ses premiers clients les uns après les autres.
  const avecCreation = allowCreate && (clientOptions.length === 0 || crees.length > 0)

  // Un client ne tient qu'un rôle dans un acte : « Vendeur 1 » et « Vendeur 2 » ne peuvent
  // pas désigner la même personne. Les clients pris par les autres lignes sortent donc de
  // la liste, celui de la ligne courante restant visible pour qu'elle garde sa valeur.
  const optionsLibres = (i) => options.filter((o) => !parties
    .some((p, j) => j !== i && String(p.client_id) === String(o.value)))

  const creerClient = useMutation(
    (corps) => api.post('/backoffice/clients', corps).then((r) => r.data),
    {
      onSuccess: (client) => {
        qc.invalidateQueries('bo-clients-min')
        setCrees((l) => [...l, {
          value: client.id,
          label: `${client.first_name} ${client.last_name}`.trim(),
          description: client.phone || client.email,
        }])
        patch(creation, { client_id: client.id })
        setCreation(null)
        setNouveau({ first_name: '', last_name: '', phone: '' })
      },
      onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
    },
  )
  const nouveauOk = nouveau.first_name.trim() && nouveau.last_name.trim() && nouveau.phone.trim()

  return (
    <div className="space-y-3">
      {parties.map((party, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_auto] gap-2 sm:items-end">
          <div>
            <label className={labelCls}>{t('backoffice:contracts.parties.role')} {i + 1} {etoile}</label>
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
            <label className={labelCls}>{t('backoffice:contracts.parties.client')} {i + 1} {etoile}</label>
            <div className="flex items-center gap-2">
              <SearchableSelect
                value={party.client_id}
                onChange={(id) => patch(i, { client_id: id })}
                options={optionsLibres(i)}
                disabled={disabled}
                placeholder={t('backoffice:contracts.create.select.none')}
                searchPlaceholder={t('backoffice:contracts.create.search.client')}
                className="text-sm flex-1 min-w-0"
                clearable
              />
              {/* Un fichier client vide bloquait la création d'un acte : il fallait quitter
                  l'écran, créer le client, puis tout ressaisir. */}
              {avecCreation && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setCreation(i)}
                  title={t('backoffice:contracts.parties.newClient.open')}
                  aria-label={t('backoffice:contracts.parties.newClient.open')}
                  className="inline-flex items-center justify-center p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-primary-600 disabled:opacity-30"
                >
                  <FiUserPlus className="w-4 h-4" />
                </button>
              )}
            </div>
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

      <Modal
        open={creation !== null}
        onClose={() => setCreation(null)}
        title={t('backoffice:contracts.parties.newClient.title')}
        footer={(
          <>
            <button type="button" onClick={() => setCreation(null)} className={SECONDARY_BTN}>
              {t('common:confirm.cancel')}
            </button>
            <button
              type="button"
              disabled={!nouveauOk || creerClient.isLoading}
              onClick={() => creerClient.mutate({
                first_name: nouveau.first_name.trim(),
                last_name: nouveau.last_name.trim(),
                phone: nouveau.phone.trim(),
              })}
              className={PRIMARY_BTN}
            >
              {t('backoffice:contracts.parties.newClient.submit')}
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          {['first_name', 'last_name', 'phone'].map((champ) => (
            <div key={champ}>
              <label className={labelCls}>
                {t(`backoffice:contracts.parties.newClient.fields.${champ}`)} {etoile}
              </label>
              <input
                value={nouveau[champ]}
                onChange={(e) => setNouveau((n) => ({ ...n, [champ]: e.target.value }))}
                className={ctrlCls}
              />
            </div>
          ))}
          <p className="text-xs text-gray-400">{t('backoffice:contracts.parties.newClient.hint')}</p>
        </div>
      </Modal>
    </div>
  )
}
