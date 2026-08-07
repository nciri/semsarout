import { useEffect } from 'react'
import { MapContainer as LeafletMapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in React
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom marker icons
const createCustomIcon = (color = '#0369a1') => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          transform: rotate(45deg);
          color: white;
          font-weight: bold;
          font-size: 12px;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  })
}

// Price marker for properties
const createPriceMarker = (price, isSelected = false) => {
  const bgColor = isSelected ? '#dc2626' : '#0369a1'
  return L.divIcon({
    className: 'price-marker',
    html: `
      <div style="
        background-color: ${bgColor};
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        border: 2px solid white;
      ">${price}</div>
    `,
    iconSize: [80, 28],
    iconAnchor: [40, 28],
    popupAnchor: [0, -28],
  })
}

// Agency marker
const createAgencyMarker = (isSelected = false) => {
  const bgColor = isSelected ? '#dc2626' : '#c2410c'
  return L.divIcon({
    className: 'agency-marker',
    html: `
      <div style="
        background-color: ${bgColor};
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  })
}

// Component to fit bounds when markers change
function FitBounds({ markers }) {
  const map = useMap()

  useEffect(() => {
    if (markers && markers.length > 0) {
      const validMarkers = markers.filter(m => m.lat && m.lng)
      if (validMarkers.length > 0) {
        const bounds = L.latLngBounds(validMarkers.map(m => [m.lat, m.lng]))
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
      }
    }
  }, [markers, map])

  return null
}

// Morocco center coordinates
const MOROCCO_CENTER = [31.7917, -7.0926]
const MOROCCO_BOUNDS = [
  [21.0, -17.0], // Southwest
  [36.0, -1.0],  // Northeast
]

export {
  // eslint-disable-next-line react-refresh/only-export-components
  createCustomIcon,
  // eslint-disable-next-line react-refresh/only-export-components
  createPriceMarker,
  // eslint-disable-next-line react-refresh/only-export-components
  createAgencyMarker,
  FitBounds,
  MOROCCO_CENTER,
  MOROCCO_BOUNDS
}

export default function MapContainer({
  children,
  center = MOROCCO_CENTER,
  zoom = 6,
  className = '',
  style = {},
  scrollWheelZoom = true,
  ...props
}) {
  return (
    <LeafletMapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={scrollWheelZoom}
      className={`w-full h-full ${className}`}
      style={{ minHeight: '400px', ...style }}
      {...props}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {children}
    </LeafletMapContainer>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Marker, Popup, useMap }
