import { Input, Select, Textarea, Checkbox } from '../../../ds/index.js'

const BED_TYPES = [
  { value: 'CHAMBRE_INDIVIDUELLE', label: 'Chambre individuelle' },
  { value: 'CHAMBRE_PARTAGEE', label: 'Chambre partagée' },
  { value: 'LIT_DORTOIR', label: 'Lit en dortoir' },
  { value: 'STUDIO_ENTIER', label: 'Studio entier' },
  { value: 'APPARTEMENT_ENTIER', label: 'Appartement entier' },
]

// Restreint à FEMININ/MASCULIN pour cette annonce (pas de MIXTE_FAMILIAL).
const HOUSING_GENDERS = [
  { value: 'FEMININ', label: 'Femmes uniquement' },
  { value: 'MASCULIN', label: 'Hommes uniquement' },
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

export default function StepLogement({ form, errors, update }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        label={<>{"Titre de l'annonce"}<Req /></>}
        value={form.title}
        onChange={(e) => update({ title: e.target.value })}
        error={errors.title ? 'Champ requis' : undefined}
      />
      <Textarea
        label="Description"
        rows={5}
        value={form.description}
        onChange={(e) => update({ description: e.target.value })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Select
          label={<>Type de chambre<Req /></>}
          value={form.bed_type}
          onChange={(e) => update({ bed_type: e.target.value })}
          options={[{ value: '', label: 'Sélectionner…' }, ...BED_TYPES]}
        />
        {errors.bed_type && <ErrorText>Champ requis</ErrorText>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Select
          label={<>Public accueilli<Req /></>}
          value={form.housing_gender}
          onChange={(e) => update({ housing_gender: e.target.value })}
          options={HOUSING_GENDERS}
        />
        {errors.housing_gender && <ErrorText>Champ requis</ErrorText>}
      </div>
      <Checkbox
        label="Meublé"
        checked={!!form.furnished}
        onChange={(e) => update({ furnished: e.target.checked })}
      />
      <Input
        label="Capacité (nombre de colocataires)"
        type="number"
        min={1}
        max={8}
        value={form.capacity}
        onChange={(e) => update({ capacity: e.target.value })}
      />
    </div>
  )
}
