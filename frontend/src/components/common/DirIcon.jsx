import { useTranslation } from 'react-i18next'
import { isRtl } from '../../i18n/rtl'

// Icône directionnelle : miroir horizontal en RTL (chevrons, flèches).
export default function DirIcon({ icon: Icon, className = '' }) {
  const { i18n } = useTranslation()
  const style = isRtl(i18n.language) ? { transform: 'scaleX(-1)' } : undefined
  return <Icon className={className} style={style} />
}
