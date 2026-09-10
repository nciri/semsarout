import RedCartouche from './RedCartouche'

/**
 * Wordmark SemsarOut — "Semsar" + carton rouge "Out" incliné (design system).
 * `dark` : variante pour fonds midnight (texte ivoire).
 */
function Wordmark({ dark = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-baseline gap-[5px] font-display font-extrabold text-[22px] tracking-tight ${
        dark ? 'text-ivory' : 'text-midnight'
      } ${className}`}
    >
      <span>Semsar</span>
      <RedCartouche className="text-[18px]">Out</RedCartouche>
    </span>
  )
}

export default Wordmark
