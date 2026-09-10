/**
 * Carton rouge du design system — le « Out » du logo et les titres qui le reprennent.
 * Une seule définition dans le dépôt : dupliquer le dégradé le ferait diverger.
 */
function RedCartouche({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center text-white px-[9px] py-[2px] rounded-[5px] shadow-red -rotate-[4deg] ${className}`}
      style={{ background: 'linear-gradient(150deg,#C1121F 0%,#870B15 100%)' }}
    >
      {children}
    </span>
  )
}

export default RedCartouche
