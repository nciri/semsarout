import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import { Icon } from '../../ds/index.js'
import { formatMad } from '../../lib/format.js'
import { cityCentroid, MOROCCO_CENTER, MOROCCO_DEFAULT_ZOOM } from '../../data/moroccoCities.js'

// Icône de marqueur maison (SVG inline en divIcon) : évite la requête réseau CDN du
// bug classique de Leaflet (icônes par défaut chargées depuis leaflet.github.io) et
// évite de dépendre du bundling des PNG par défaut de la lib.
const markerIcon = L.divIcon({
  className: 'm3a-map-marker',
  html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.27 21.73 0 14 0z" fill="#1e3a5f"/>
    <circle cx="14" cy="14" r="6" fill="#fff"/>
  </svg>`,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -34],
})

// Léger décalage déterministe (basé sur l'index) autour du centroïde de la ville, pour
// éviter que toutes les annonces d'une même ville se superposent exactement. Ce n'est
// PAS l'adresse réelle — juste un étalement visuel du marqueur "ville".
function jitteredPosition([lat, lng], index) {
  const angle = (index * 137.508 * Math.PI) / 180 // angle d'or : répartition homogène
  const radius = 0.01 + (index % 5) * 0.004
  return [lat + radius * Math.cos(angle), lng + radius * Math.sin(angle)]
}

export default function SearchResultsMap({ items, cityFilter }) {
  const { t } = useTranslation(['web', 'common'])
  const navigate = useNavigate()

  const center = cityFilter ? cityCentroid(cityFilter) : MOROCCO_CENTER
  const zoom = cityFilter ? 12 : MOROCCO_DEFAULT_ZOOM

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px',
          borderRadius: 'var(--radius-md, 10px)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)',
        }}
      >
        <Icon name="shield-check" size={16} color="var(--navy-700)" />
        <span style={{ font: 'var(--fw-medium) var(--fs-sm) var(--font-body)', color: 'var(--text-heading)' }}>
          {t('web:search.mapPrivacyNotice')}
        </span>
      </div>

      <div style={{ height: 420, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {items.map((it, index) => (
            <Marker key={it.id} position={jitteredPosition(cityCentroid(it.ville), index)} icon={markerIcon}>
              <Popup>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                  <strong>{it.titre}</strong>
                  <span>{formatMad(it.prixMad)}</span>
                  <a
                    href={`/annonce/${it.id}`}
                    onClick={(e) => { e.preventDefault(); navigate(`/annonce/${it.id}`) }}
                  >
                    {t('web:search.mapPopupSeeListing')}
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
