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
      <span
        className="inline-flex items-center text-white text-[18px] px-[9px] py-[2px] rounded-[5px] shadow-red -rotate-[4deg]"
        style={{ background: 'linear-gradient(150deg,#C1121F 0%,#870B15 100%)' }}
      >
        Out
      </span>
    </span>
  )
}

export default Wordmark
