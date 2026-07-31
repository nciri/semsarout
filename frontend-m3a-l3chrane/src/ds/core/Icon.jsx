import { icons } from 'lucide-react'

// kebab-case ("map-pin") -> PascalCase ("MapPin") to index lucide-react's registry
function toPascal(name) {
  return name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

export function Icon({ name = 'circle', size = 20, strokeWidth = 2, color = 'currentColor', style, ...rest }) {
  const Cmp = icons[toPascal(name)] || icons.Circle
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      style={{ display: 'inline-flex', ...style }}
      {...rest}
    />
  )
}
