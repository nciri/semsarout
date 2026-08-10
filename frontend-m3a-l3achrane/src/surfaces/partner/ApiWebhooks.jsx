import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Checkbox, Input } from '../../ds/index.js'
import {
  createApiKey, createWebhook, deleteWebhook, listApiKeys, listWebhooks,
  revokeApiKey, testWebhook, updateWebhook,
} from '../../services/index.js'
import { PartnerCard, PartnerScreen, PartnerTable } from './PartnerSection.jsx'

// Étoile rouge sur les champs requis — patron canonique des formulaires (cf. Inscription.jsx).
const requiredStar = <span style={{ color: 'var(--red-500)' }} aria-hidden> *</span>

const errorStyle = { padding: '12px 20px', font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }

// Valeurs techniques des types d'événements webhook — ne JAMAIS traduire, seul le libellé affiché l'est.
const WEBHOOK_EVENT_TYPES = [
  'partner.affilie_created',
  'partner.verification_decided',
  'partner.reservation_created',
  'partner.reservation_released',
  'partner.grant_paid',
  'partner.invoice_sent',
]

/** Encart show-once pour un secret brut (clé API ou secret de webhook) — jamais re-listé,
 * disparaît dès qu'on ferme l'encart ou qu'on recharge (état local uniquement, jamais loggué). */
function SecretReveal({ title, warning, value, onDismiss }) {
  const { t } = useTranslation(['partner', 'common'])
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      style={{
        background: 'rgba(239,178,77,.12)', border: '2px solid var(--gold-500)', borderRadius: 'var(--radius-lg)',
        padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ font: 'var(--fw-bold) var(--fs-h3) var(--font-display)', color: 'var(--text-heading)' }}>{title}</div>
      <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>{warning}</div>
      <code
        style={{
          display: 'block', padding: '12px 14px', background: '#fff', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)', font: '600 13.5px/1.4 monospace', color: 'var(--text-strong)', wordBreak: 'break-all',
        }}
      >
        {value}
      </code>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? t('partner:apiWebhooks.secretReveal.copied') : t('partner:apiWebhooks.secretReveal.copy')}
        </Button>
        <Button type="button" size="sm" onClick={onDismiss}>
          {t('partner:apiWebhooks.secretReveal.dismiss')}
        </Button>
      </div>
    </div>
  )
}

const isKeyRevoked = (row) => Boolean(row.revoked_at) || row.statut === 'revoquee'
const keyDisplay = (row) => (row.prefix ? `${row.prefix}••••` : row.masked ?? '—')
const keyCreatedDisplay = (row) => (row.created_at ? row.created_at.slice(0, 10) : (row.creee ?? '—'))

function ApiKeysSection({ apiKeys, loadError, onCreated, onRevoked }) {
  const { t } = useTranslation(['partner', 'common'])
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState(false)
  const [reveal, setReveal] = useState(null) // { key } — jamais dérivé de apiKeys, jamais re-listé

  const submit = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    setSubmitting(true)
    setFormError(false)
    try {
      const created = await createApiKey({ label: label.trim() })
      const { key, ...rest } = created
      onCreated(rest)
      if (key) setReveal({ key })
      setLabel('')
    } catch {
      setFormError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const revoke = async (id) => {
    setActingId(id)
    setActionError(false)
    try {
      const updated = await revokeApiKey(id)
      onRevoked(id, updated)
    } catch {
      setActionError(true)
    } finally {
      setActingId(null)
    }
  }

  const columns = [
    { key: 'label', label: t('partner:apiWebhooks.apiKeys.table.label'), render: (row) => row.label },
    { key: 'key', label: t('partner:apiWebhooks.apiKeys.table.key'), render: keyDisplay },
    { key: 'created', label: t('partner:apiWebhooks.apiKeys.table.created'), render: keyCreatedDisplay },
    {
      key: 'status',
      label: t('partner:apiWebhooks.apiKeys.table.status'),
      render: (row) => (
        <Badge tone={isKeyRevoked(row) ? 'neutral' : 'verified'}>
          {t(isKeyRevoked(row) ? 'partner:apiWebhooks.status.revoked' : 'partner:apiWebhooks.status.active')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: t('partner:apiWebhooks.apiKeys.table.actions'),
      render: (row) => (
        isKeyRevoked(row) ? null : (
          <Button size="sm" variant="danger" onClick={() => revoke(row.id)} disabled={actingId === row.id}>
            {t('partner:apiWebhooks.apiKeys.actions.revoke')}
          </Button>
        )
      ),
    },
  ]

  return (
    <PartnerCard title={t('partner:apiWebhooks.apiKeys.title')}>
      {reveal && (
        <div style={{ padding: '16px 20px' }}>
          <SecretReveal
            title={t('partner:apiWebhooks.apiKeys.reveal.title')}
            warning={t('partner:apiWebhooks.apiKeys.reveal.warning')}
            value={reveal.key}
            onDismiss={() => setReveal(null)}
          />
        </div>
      )}
      {loadError && <div style={errorStyle}>{t('partner:apiWebhooks.apiKeys.loadError')}</div>}
      {actionError && <div style={errorStyle}>{t('partner:apiWebhooks.apiKeys.actions.actionError')}</div>}
      <PartnerTable columns={columns} rows={apiKeys} emptyMessage={t('partner:apiWebhooks.apiKeys.noResults')} />
      <form onSubmit={submit} style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <Input
          id="apikey-label"
          label={<>{t('partner:apiWebhooks.apiKeys.addForm.labelLabel')}{requiredStar}</>}
          placeholder={t('partner:apiWebhooks.apiKeys.addForm.labelPlaceholder')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          containerStyle={{ flex: 1 }}
        />
        <Button type="submit" size="sm" disabled={submitting || !label.trim()}>
          {submitting ? t('partner:apiWebhooks.apiKeys.addForm.submitting') : t('partner:apiWebhooks.apiKeys.addForm.submit')}
        </Button>
      </form>
      {formError && <div style={errorStyle}>{t('partner:apiWebhooks.apiKeys.addForm.error')}</div>}
    </PartnerCard>
  )
}

const isWebhookActive = (row) => row.active ?? row.statut === 'actif'
const webhookEvents = (row) => row.events ?? row.evenements ?? []
const eventLabel = (t) => (type) => (
  WEBHOOK_EVENT_TYPES.includes(type) ? t(`partner:apiWebhooks.webhooks.eventTypes.${type}`) : type
)

const EMPTY_WEBHOOK_FORM = { url: '', events: [], active: true }

function WebhooksSection({ webhooks, loadError, onCreated, onUpdated, onDeleted }) {
  const { t } = useTranslation(['partner', 'common'])
  const [form, setForm] = useState(EMPTY_WEBHOOK_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState(false)
  const [reveal, setReveal] = useState(null) // { secret } — jamais dérivé de webhooks, jamais re-listé
  const [testResults, setTestResults] = useState({}) // id -> statut de la dernière tentative, UI-only

  const toEventLabel = eventLabel(t)

  const toggleEvent = (type) => (e) => {
    setForm((f) => ({
      ...f,
      events: e.target.checked ? [...f.events, type] : f.events.filter((v) => v !== type),
    }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.url.trim()) return
    setSubmitting(true)
    setFormError('')
    try {
      const created = await createWebhook({ url: form.url.trim(), events: form.events, active: form.active })
      const { secret, ...rest } = created
      onCreated(rest)
      if (secret) setReveal({ secret })
      setForm(EMPTY_WEBHOOK_FORM)
    } catch (err) {
      setFormError(err.response?.data?.error ?? t('partner:apiWebhooks.webhooks.addForm.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const runTest = async (id) => {
    setActingId(id)
    setActionError(false)
    try {
      const result = await testWebhook(id)
      const status = ['DELIVERED', 'FAILED'].includes(result.status) ? result.status : 'tested'
      setTestResults((prev) => ({ ...prev, [id]: status }))
    } catch {
      setActionError(true)
    } finally {
      setActingId(null)
    }
  }

  const toggleActive = async (row) => {
    setActingId(row.id)
    setActionError(false)
    try {
      const updated = await updateWebhook(row.id, { active: !isWebhookActive(row) })
      onUpdated(row.id, updated)
    } catch {
      setActionError(true)
    } finally {
      setActingId(null)
    }
  }

  const remove = async (id) => {
    setActingId(id)
    setActionError(false)
    try {
      await deleteWebhook(id)
      onDeleted(id)
    } catch {
      setActionError(true)
    } finally {
      setActingId(null)
    }
  }

  const columns = [
    { key: 'url', label: t('partner:apiWebhooks.webhooks.table.url'), render: (row) => row.url },
    { key: 'events', label: t('partner:apiWebhooks.webhooks.table.events'), render: (row) => webhookEvents(row).map(toEventLabel).join(', ') },
    {
      key: 'status',
      label: t('partner:apiWebhooks.webhooks.table.status'),
      render: (row) => (
        <Badge tone={isWebhookActive(row) ? 'verified' : 'neutral'}>
          {t(isWebhookActive(row) ? 'partner:apiWebhooks.status.actif' : 'partner:apiWebhooks.status.inactif')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: t('partner:apiWebhooks.webhooks.table.actions'),
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => runTest(row.id)} disabled={actingId === row.id}>
            {t('partner:apiWebhooks.webhooks.actions.test')}
          </Button>
          {testResults[row.id] && (
            <Badge tone={testResults[row.id] === 'FAILED' ? 'danger' : 'verified'}>
              {t(`partner:apiWebhooks.webhooks.testResult.${testResults[row.id]}`)}
            </Badge>
          )}
          <Button size="sm" variant="ghost" onClick={() => toggleActive(row)} disabled={actingId === row.id}>
            {t(isWebhookActive(row) ? 'partner:apiWebhooks.webhooks.actions.deactivate' : 'partner:apiWebhooks.webhooks.actions.activate')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => remove(row.id)} disabled={actingId === row.id}>
            {t('partner:apiWebhooks.webhooks.actions.delete')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PartnerCard title={t('partner:apiWebhooks.webhooks.title')}>
      {reveal && (
        <div style={{ padding: '16px 20px' }}>
          <SecretReveal
            title={t('partner:apiWebhooks.webhooks.reveal.title')}
            warning={t('partner:apiWebhooks.webhooks.reveal.warning')}
            value={reveal.secret}
            onDismiss={() => setReveal(null)}
          />
        </div>
      )}
      {loadError && <div style={errorStyle}>{t('partner:apiWebhooks.webhooks.loadError')}</div>}
      {actionError && <div style={errorStyle}>{t('partner:apiWebhooks.webhooks.actions.actionError')}</div>}
      <PartnerTable columns={columns} rows={webhooks} emptyMessage={t('partner:apiWebhooks.webhooks.noResults')} />
      <form onSubmit={submit} style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ font: 'var(--fw-bold) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
          {t('partner:apiWebhooks.webhooks.addForm.title')}
        </div>
        <Input
          id="webhook-url"
          type="url"
          label={<>{t('partner:apiWebhooks.webhooks.addForm.urlLabel')}{requiredStar}</>}
          placeholder={t('partner:apiWebhooks.webhooks.addForm.urlPlaceholder')}
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          required
        />
        <div>
          <div style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--text-strong)', marginBottom: 8 }}>
            {t('partner:apiWebhooks.webhooks.addForm.eventsLabel')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {WEBHOOK_EVENT_TYPES.map((type) => (
              <Checkbox
                key={type}
                id={`webhook-event-${type}`}
                label={toEventLabel(type)}
                checked={form.events.includes(type)}
                onChange={toggleEvent(type)}
              />
            ))}
          </div>
        </div>
        <Checkbox
          id="webhook-active"
          label={t('partner:apiWebhooks.webhooks.addForm.activeLabel')}
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
        />
        {formError && <div style={{ font: 'var(--fw-semibold) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>{formError}</div>}
        <div>
          <Button type="submit" size="sm" disabled={submitting || !form.url.trim()}>
            {submitting ? t('partner:apiWebhooks.webhooks.addForm.submitting') : t('partner:apiWebhooks.webhooks.addForm.submit')}
          </Button>
        </div>
      </form>
    </PartnerCard>
  )
}

export default function ApiWebhooks() {
  const { t } = useTranslation(['partner', 'common'])
  const [apiKeys, setApiKeys] = useState(undefined) // undefined = loading
  const [webhooks, setWebhooks] = useState(undefined)
  const [keysLoadError, setKeysLoadError] = useState(false)
  const [webhooksLoadError, setWebhooksLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setApiKeys(undefined)
    setKeysLoadError(false)
    listApiKeys()
      .then((rows) => { if (!cancelled) setApiKeys(rows) })
      .catch(() => { if (!cancelled) { setApiKeys([]); setKeysLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setWebhooks(undefined)
    setWebhooksLoadError(false)
    listWebhooks()
      .then((rows) => { if (!cancelled) setWebhooks(rows) })
      .catch(() => { if (!cancelled) { setWebhooks([]); setWebhooksLoadError(true) } })
    return () => { cancelled = true }
  }, [])

  const handleKeyCreated = (created) => setApiKeys((prev) => [...(prev ?? []), created])
  const handleKeyRevoked = (id, updated) => setApiKeys((prev) => prev.map((k) => (k.id === id ? updated : k)))

  const handleWebhookCreated = (created) => setWebhooks((prev) => [...(prev ?? []), created])
  const handleWebhookUpdated = (id, updated) => setWebhooks((prev) => prev.map((w) => (w.id === id ? updated : w)))
  const handleWebhookDeleted = (id) => setWebhooks((prev) => prev.filter((w) => w.id !== id))

  return (
    <PartnerScreen kicker={t('partner:apiWebhooks.kicker')} heading={t('partner:apiWebhooks.heading')}>
      {apiKeys === undefined ? (
        <PartnerCard title={t('partner:apiWebhooks.apiKeys.title')}>
          <div style={{ padding: '24px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        </PartnerCard>
      ) : (
        <ApiKeysSection apiKeys={apiKeys} loadError={keysLoadError} onCreated={handleKeyCreated} onRevoked={handleKeyRevoked} />
      )}
      {webhooks === undefined ? (
        <PartnerCard title={t('partner:apiWebhooks.webhooks.title')}>
          <div style={{ padding: '24px 20px', font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-muted)' }}>
            {t('common:loading')}
          </div>
        </PartnerCard>
      ) : (
        <WebhooksSection webhooks={webhooks} loadError={webhooksLoadError} onCreated={handleWebhookCreated} onUpdated={handleWebhookUpdated} onDeleted={handleWebhookDeleted} />
      )}
    </PartnerScreen>
  )
}
