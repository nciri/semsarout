// Aucun produit n'a de photo en base : chaque catégorie a son dessin au trait (64 × 48).
const ART = {
  lit: <><path d="M8 40V12" /><path d="M8 28h48v12" /><path d="M8 28v-5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v5" /><path d="M23 24h29a4 4 0 0 1 4 4" /></>,
  canape: <><path d="M14 22v-6a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v6" /><path d="M10 22a4 4 0 0 0-4 4v10h52V26a4 4 0 0 0-8 0v4H14v-4a4 4 0 0 0-4-4z" /><line x1="10" y1="36" x2="10" y2="40" /><line x1="54" y1="36" x2="54" y2="40" /></>,
  table: <><rect x="8" y="16" width="48" height="5" rx="1" /><line x1="14" y1="21" x2="14" y2="40" /><line x1="50" y1="21" x2="50" y2="40" /><line x1="14" y1="30" x2="50" y2="30" /></>,
  armoire: <><rect x="16" y="6" width="32" height="34" rx="2" /><line x1="26.7" y1="6" x2="26.7" y2="40" /><line x1="37.3" y1="6" x2="37.3" y2="40" /><line x1="24" y1="20" x2="24" y2="25" /><line x1="29.4" y1="20" x2="29.4" y2="25" /><line x1="40" y1="20" x2="40" y2="25" /><line x1="20" y1="40" x2="20" y2="43" /><line x1="44" y1="40" x2="44" y2="43" /></>,
  chaise: <><path d="M22 6v34" /><path d="M22 24h20v16" /><path d="M22 6h14a2 2 0 0 1 2 2v16" /></>,
  bureau: <><rect x="8" y="14" width="48" height="5" rx="1" /><line x1="12" y1="19" x2="12" y2="40" /><rect x="38" y="19" width="14" height="21" /><line x1="38" y1="28" x2="52" y2="28" /></>,
  refrigerateur: <><rect x="21" y="4" width="22" height="40" rx="3" /><line x1="21" y1="18" x2="43" y2="18" /><line x1="26" y1="9" x2="26" y2="14" /><line x1="26" y1="23" x2="26" y2="30" /></>,
  lave_linge: <><rect x="17" y="5" width="30" height="38" rx="3" /><line x1="17" y1="13" x2="47" y2="13" /><circle cx="32" cy="28" r="9" /><circle cx="32" cy="28" r="5" /><line x1="22" y1="9" x2="26" y2="9" /></>,
  four: <><rect x="12" y="8" width="40" height="32" rx="3" /><line x1="12" y1="16" x2="52" y2="16" /><rect x="18" y="21" width="28" height="13" rx="2" /><circle cx="19" cy="12" r="1" /><circle cx="25" cy="12" r="1" /></>,
  micro_ondes: <><rect x="8" y="10" width="48" height="28" rx="3" /><rect x="13" y="15" width="28" height="18" rx="2" /><line x1="47" y1="16" x2="51" y2="16" /><line x1="47" y1="22" x2="51" y2="22" /></>,
  climatiseur: <><rect x="6" y="12" width="52" height="16" rx="3" /><line x1="12" y1="23" x2="52" y2="23" /><path d="M18 33v4" /><path d="M32 33v6" /><path d="M46 33v4" /></>,
  television: <><rect x="8" y="7" width="48" height="29" rx="2" /><line x1="24" y1="42" x2="40" y2="42" /><line x1="32" y1="36" x2="32" y2="42" /></>,
}
const FALLBACK = <><path d="M12 14l20-8 20 8v22l-20 8-20-8z" /><path d="M12 14l20 8 20-8" /><line x1="32" y1="22" x2="32" y2="44" /></>

export default function ProductArt({ product, className = 'w-[44%]' }) {
  if (product?.image_url) return <img src={product.image_url} alt="" className="h-full w-full object-cover" />
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" className={`h-auto ${className}`} fill="none" stroke="#A39C90" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {ART[product?.category] || FALLBACK}
    </svg>
  )
}
