import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormat } from '../../../utils/format'

export const B = 'crm.properties.board'

/** Montants entiers (« 860 000 Dh », « 6 900 Dh/mois ») : sur une fiche, l'arrondi au millier trompe. */
export function useFullMoney() {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.units` })
  const { fmtNumber } = useFormat()
  const unit = (p) => (p.transaction_type !== 'rent' ? t('dh')
    : p.price_period === 'day' ? t('perDay') : p.price_period === 'week' ? t('perWeek') : t('perMonth'))
  const money = (p) => (p.price == null ? '—' : `${fmtNumber(Math.round(p.price))} ${unit(p)}`)
  money.sqm = (p, v) => `${fmtNumber(Math.round(v))} ${p.transaction_type === 'rent' ? t('sqmMonth') : t('sqm')}`
  money.unit = unit
  return money
}

/** Ce que disent les dossiers du bien, en une phrase. */
export function useStatusWhat() {
  const { t } = useTranslation('backoffice', { keyPrefix: `${B}.status` })
  const { t: tb } = useTranslation('backoffice')
  const { fmtDate, fmtNumber } = useFormat()
  return (p) => {
    const c = p.status_check
    const tx = c.transaction
    const stage = tx ? tb(`dashboard.stages.${tx.stage}`, { defaultValue: tx.stage }) : ''
    const lower = stage.toLocaleLowerCase()
    const date = tx?.closed_at ? fmtDate(tx.closed_at, { day: 'numeric', month: 'long' }) : ''
    const amount = tx?.amount != null ? `${fmtNumber(Math.round(tx.amount))} ${tb(`${B}.units.dh`)}` : null
    const lost = (p.transactions || []).filter((x) => x.status === 'lost').length
    const base = {
      won: t(amount ? 'what.won' : 'what.wonNoAmount', { stage: lower, date, amount }),
      open_deal: t(amount ? 'what.openDeal' : 'what.openDealNoAmount', { stage: amount ? stage : lower, amount, probability: tx?.probability ?? 0 }),
      lost: t('what.lost', { count: lost, stage: lower, date }),
      no_deal: t('what.noDeal'),
    }[c.reason]
    return c.open_count ? `${base} ${t('what.openOthers', { count: c.open_count })}` : base
  }
}

/**
 * Divulgation progressive, comme le tableau de bord : un seul détail ouvert sur la page, Échap
 * referme et rend le focus au bouton qui l'a ouvert.
 */
export function useDisclosure() {
  const [openKey, setOpenKey] = useState(null)
  const [shown, setShown] = useState(false)
  const titleRef = useRef(null)
  const focusTitle = useRef(false)
  const closeTimer = useRef(null)
  const cards = useRef({})

  const close = useCallback(() => {
    if (!openKey) return
    const k = openKey
    setShown(false)
    closeTimer.current = setTimeout(() => setOpenKey(null), 240)
    cards.current[k]?.querySelector('[aria-expanded]')?.focus({ preventScroll: true })
  }, [openKey])

  const toggle = (key) => {
    if (key === openKey) { close(); return }
    clearTimeout(closeTimer.current)
    focusTitle.current = true
    setShown(false)
    setOpenKey(key)
  }

  // Sans animation : quand l'élément ouvert disparaît de la liste (filtre, page suivante).
  const closeNow = useCallback(() => { setShown(false); setOpenKey(null) }, [])

  useEffect(() => {
    if (!openKey) return undefined
    const id = requestAnimationFrame(() => {
      setShown(true)
      if (focusTitle.current) {
        focusTitle.current = false
        titleRef.current?.focus({ preventScroll: true })
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        setTimeout(() => document.getElementById('dashboard-detail')?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }), 60)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [openKey])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const cardRef = (key) => (el) => { cards.current[key] = el }
  return { openKey, shown, toggle, close, closeNow, titleRef, cardRef, cards }
}

/**
 * Où insérer le détail : après le DERNIER élément de la rangée de l'élément ouvert, avec un
 * repère aligné sur lui. Mesuré avant affichage, recalculé quand la largeur change la grille.
 */
export function usePlacement(disc, keys, gridRef) {
  const [place, setPlace] = useState({ after: null, notch: 0 })
  const [tick, setTick] = useState(0)
  const { openKey, cards } = disc
  const mine = openKey && keys.includes(openKey)
  const sig = keys.join(',')

  useLayoutEffect(() => {
    if (!mine) return
    const card = cards.current[openKey]
    const grid = gridRef.current
    if (!card || !grid) return
    const row = keys.filter((k) => cards.current[k] && cards.current[k].offsetTop === card.offsetTop)
    const after = row.at(-1) || openKey
    const g = grid.getBoundingClientRect()
    const trigger = (card.querySelector('[aria-expanded]') || card).getBoundingClientRect()
    const rtl = getComputedStyle(grid).direction === 'rtl'
    const notch = (rtl ? g.right - trigger.right : trigger.left - g.left) + trigger.width / 2
    setPlace((p) => (p.after === after && Math.abs(p.notch - notch) < 1 ? p : { after, notch }))
  }, [openKey, sig, tick, mine]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => setTick((n) => n + 1)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  if (!mine) return null
  return { after: place.after && keys.includes(place.after) ? place.after : openKey, notch: place.notch }
}
