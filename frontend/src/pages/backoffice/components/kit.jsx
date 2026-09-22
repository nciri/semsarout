import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { FiChevronDown, FiArrowUpRight } from 'react-icons/fi'

/**
 * Action réduite à son icône, avec une infobulle au survol ET au focus clavier. Les libellés
 * sur chaque action chargeaient trop les pages : le texte reste porté par `aria-label` pour
 * les lecteurs d'écran, et par l'infobulle pour tout le monde.
 */
export function IconAction({ icon: Icon, label, to, onClick, tone = 'default', tipAlign = 'center', className = '', ...rest }) {
  const tones = {
    default: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
    gold: 'text-primary-700 hover:bg-primary-50',
    primary: 'bg-primary-400 text-[#241906] hover:bg-primary-600',
    danger: 'text-red-600 hover:text-red-700 hover:bg-red-50',
  }
  const cls = `group relative inline-flex items-center justify-center rounded-lg p-2 transition-colors ${tones[tone]} ${className}`
  const body = (
    <>
      <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
      {/* `hidden` et non une simple opacité nulle : cachée mais présente, l'infobulle d'une action
          en bord de page élargissait le document et faisait apparaître une barre horizontale. */}
      <span role="tooltip" className={`pointer-events-none absolute bottom-full z-30 mb-1.5 hidden w-max max-w-[16rem] rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block ${
        tipAlign === 'end' ? 'end-0' : 'start-1/2 -translate-x-1/2 rtl:translate-x-1/2'
      }`}>
        {label}
      </span>
    </>
  )
  return to
    ? <Link to={to} aria-label={label} className={cls} {...rest}>{body}</Link>
    : <button type="button" onClick={onClick} aria-label={label} className={cls} {...rest}>{body}</button>
}

const TONES = {
  good: 'bg-green-50 text-green-700',
  warn: 'bg-amber-50 text-amber-700',
  crit: 'bg-red-50 text-red-700',
  neutral: 'bg-gray-100 text-gray-600',
  gold: 'bg-primary-50 text-primary-700',
}

export function Chip({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-[18px] whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** Barre segmentée : proportions d'un tout, avec un espace de 2 px entre segments. */
export function SegBar({ parts, label, tall = false }) {
  return (
    <div role="img" aria-label={label} className={`flex gap-0.5 overflow-hidden ${tall ? 'h-3.5 rounded-md' : 'h-2.5 rounded'}`}>
      {parts.filter((p) => p.value > 0).map((p, i) => (
        <span key={i} className="block h-full" style={{ flex: p.value, background: p.color }} />
      ))}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-gray-600">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px] flex-none" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

const ALERT_TONES = {
  warn: 'bg-amber-50 text-amber-900',
  crit: 'bg-red-50 text-red-900',
  info: 'bg-primary-50 text-primary-900',
  plain: 'bg-gray-50 text-gray-700',
}

export function Alert({ tone = 'warn', icon: Icon, children }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px] ${ALERT_TONES[tone]}`}>
      {Icon && <Icon className="w-4 h-4 mt-0.5 flex-none" aria-hidden="true" />}
      <span>{children}</span>
    </div>
  )
}

/** Texte traduit contenant du <strong> (les chaînes i18n portent l'emphase). */
export function Rich({ i18nKey, values }) {
  return <Trans ns="backoffice" i18nKey={i18nKey} values={values} components={{ strong: <strong className="font-semibold" /> }} />
}

export function Kv({ label, value, unit, sub }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-display text-xl font-extrabold tabular-nums">
        {value}{unit && <small className="ms-1 text-[12.5px] font-bold text-gray-600">{unit}</small>}
      </span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}

/** Chiffre principal d'un widget, suivi de sa phrase de contexte. */
export function Figure({ value, unit, children }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums">
        {value}{unit && <small className="ms-1 text-sm font-bold tracking-normal text-gray-600">{unit}</small>}
      </span>
      {children && <span className="font-medium text-gray-600">{children}</span>}
    </div>
  )
}

export function Widget({ id, title, icon: Icon, open, onToggle, className = '', children, cardRef }) {
  const { t } = useTranslation('backoffice')
  return (
    <section
      ref={cardRef}
      aria-labelledby={`w-${id}`}
      className={`grid content-start gap-3.5 rounded-xl border bg-white p-5 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${
        open ? 'border-primary-400 shadow-[0_0_0_3px] shadow-primary-50' : 'border-gray-200'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2.5">
        <h2 id={`w-${id}`} className="flex items-center gap-2 font-display text-[14.5px] font-bold">
          <Icon className="w-[17px] h-[17px] text-gray-400" aria-hidden="true" />{title}
        </h2>
        <IconAction
          icon={FiChevronDown}
          label={open ? t('dashboard.collapse') : t('dashboard.expand')}
          onClick={onToggle}
          tone="gold"
          tipAlign="end"
          aria-expanded={open}
          aria-controls="dashboard-detail"
          className={`-m-2 [&>svg]:transition-transform [&>svg]:duration-200 motion-reduce:[&>svg]:transition-none ${open ? '[&>svg]:rotate-180' : ''}`}
        />
      </div>
      {children}
    </section>
  )
}

export function DetailFrame({ title, sub, controls, link, onClose, titleRef, children }) {
  const { t } = useTranslation('backoffice')
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
        <div>
          <h2 ref={titleRef} tabIndex={-1} id="dashboard-detail-title" className="font-display text-base font-bold focus:outline-none">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-gray-500">{sub}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          {link && <IconAction icon={FiArrowUpRight} label={link.label} to={link.to} tone="gold" tipAlign="end" />}
          <IconAction icon={FiChevronDown} label={t('dashboard.collapse')} onClick={onClose} tipAlign="end" className="[&>svg]:rotate-180" />
        </div>
      </div>
      <div className="px-4 pb-6 pt-5 sm:px-6">{children}</div>
    </>
  )
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-[12.5px] ${value === o.value ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Cadre des vues détaillées : tableau à gauche, constats à droite (une colonne sur mobile). */
export function DetailColumns({ main, aside }) {
  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto">{main}</div>
      <div className="grid content-start gap-3.5">{aside}</div>
    </div>
  )
}

export const TH = 'whitespace-nowrap px-3 pb-2 text-start text-[11.5px] font-semibold uppercase tracking-wide text-gray-500'
export const TD = 'border-t border-gray-100 px-3 py-2.5 align-middle'
