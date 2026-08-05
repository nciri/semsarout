import { useRef } from 'react'
import { FiMapPin } from 'react-icons/fi'

/**
 * Champ adresse contrôlé, prêt pour Google Places Autocomplete.
 *
 * Sans clé Google (cas actuel), c'est un simple input libre : la saisie remonte
 * via `onChange`. Le branchement réel Google Places (payant, différé) se fera ici :
 * initialiser `new google.maps.places.Autocomplete(inputRef.current)` dans un
 * useEffect gardé par la présence de `window.google?.maps?.places`, écouter
 * l'événement `place_changed`, puis appeler
 * `onSelect({ address: place.formatted_address, lat: ..., lng: ... })`.
 * Aucune dépendance ni clé n'est ajoutée dans ce livrable.
 */
export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelect, // eslint-disable-line no-unused-vars -- point d'entrée Google Places (branchement différé)
  label = 'Adresse complète',
  placeholder = 'Adresse du projet',
  id = 'address-autocomplete',
}) {
  const inputRef = useRef(null)

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          autoComplete="off"
        />
      </div>
    </div>
  )
}
