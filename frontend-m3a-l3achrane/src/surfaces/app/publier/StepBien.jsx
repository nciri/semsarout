import { Input, Select, Checkbox } from '../../../ds/index.js'

const PROPERTY_TYPES = [
  { value: 'APPARTEMENT', label: 'Appartement' },
  { value: 'MAISON', label: 'Maison' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'RESIDENCE_ETUDIANTE', label: 'Résidence étudiante' },
  { value: 'CHEZ_HABITANT', label: "Chez l'habitant" },
]

const AMENITIES = [
  { key: 'wifi', label: 'Wifi' },
  { key: 'parking', label: 'Parking' },
  { key: 'ascenseur', label: 'Ascenseur' },
  { key: 'chauffage', label: 'Chauffage' },
  { key: 'climatisation', label: 'Climatisation' },
  { key: 'lave_linge', label: 'Lave-linge' },
]

function Req() {
  return <span style={{ color: 'var(--red-600)' }}> *</span>
}

function ErrorText({ children }) {
  return (
    <span style={{ font: 'var(--fw-regular) var(--fs-xs) var(--font-body)', color: 'var(--red-600)' }}>
      {children}
    </span>
  )
}

export default function StepBien({ form, errors, update }) {
  const setAmenity = (key, checked) => {
    update({ amenities: { ...form.amenities, [key]: checked } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        label={<>Ville<Req /></>}
        value={form.city}
        onChange={(e) => update({ city: e.target.value })}
        error={errors.city ? 'Champ requis' : undefined}
      />
      <Input
        label="Quartier"
        value={form.neighborhood}
        onChange={(e) => update({ neighborhood: e.target.value })}
      />
      <Input
        label="Adresse"
        value={form.address}
        onChange={(e) => update({ address: e.target.value })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Select
          label={<>Type de bien<Req /></>}
          value={form.property_type}
          onChange={(e) => update({ property_type: e.target.value })}
          options={[{ value: '', label: 'Sélectionner…' }, ...PROPERTY_TYPES]}
        />
        {errors.property_type && <ErrorText>Champ requis</ErrorText>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Input
          label="Étage"
          type="number"
          value={form.floor}
          onChange={(e) => update({ floor: e.target.value })}
        />
        <Input
          label="Surface (m²)"
          type="number"
          value={form.area_m2}
          onChange={(e) => update({ area_m2: e.target.value })}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--text-strong)' }}>
          Équipements
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {AMENITIES.map((a) => (
            <Checkbox
              key={a.key}
              label={a.label}
              checked={!!form.amenities?.[a.key]}
              onChange={(e) => setAmenity(a.key, e.target.checked)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
