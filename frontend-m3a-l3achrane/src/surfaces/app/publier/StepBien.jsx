import { useTranslation } from 'react-i18next'
import { Input, Select, Checkbox } from '../../../ds/index.js'

const PROPERTY_TYPE_VALUES = ['APPARTEMENT', 'MAISON', 'VILLA', 'STUDIO', 'RESIDENCE_ETUDIANTE', 'CHEZ_HABITANT']
const AMENITY_KEYS = ['wifi', 'parking', 'ascenseur', 'chauffage', 'climatisation', 'lave_linge']

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
  const { t } = useTranslation(['app'])

  const setAmenity = (key, checked) => {
    update({ amenities: { ...form.amenities, [key]: checked } })
  }

  const propertyTypes = PROPERTY_TYPE_VALUES.map((value) => ({ value, label: t(`app:publier.propertyTypes.${value}`) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        label={<>{t('app:publier.stepBien.cityLabel')}<Req /></>}
        value={form.city}
        onChange={(e) => update({ city: e.target.value })}
        error={errors.city ? t('app:publier.errors.required') : undefined}
      />
      <Input
        label={t('app:publier.stepBien.neighborhoodLabel')}
        value={form.neighborhood}
        onChange={(e) => update({ neighborhood: e.target.value })}
      />
      <Input
        label={t('app:publier.stepBien.addressLabel')}
        value={form.address}
        onChange={(e) => update({ address: e.target.value })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Select
          label={<>{t('app:publier.stepBien.propertyTypeLabel')}<Req /></>}
          value={form.property_type}
          onChange={(e) => update({ property_type: e.target.value })}
          options={[{ value: '', label: t('app:publier.selectPlaceholder') }, ...propertyTypes]}
        />
        {errors.property_type && <ErrorText>{t('app:publier.errors.required')}</ErrorText>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Input
          label={t('app:publier.stepBien.floorLabel')}
          type="number"
          value={form.floor}
          onChange={(e) => update({ floor: e.target.value })}
        />
        <Input
          label={t('app:publier.stepBien.areaLabel')}
          type="number"
          value={form.area_m2}
          onChange={(e) => update({ area_m2: e.target.value })}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--text-strong)' }}>
          {t('app:publier.stepBien.amenitiesLabel')}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {AMENITY_KEYS.map((key) => (
            <Checkbox
              key={key}
              label={t(`app:publier.amenities.${key}`)}
              checked={!!form.amenities?.[key]}
              onChange={(e) => setAmenity(key, e.target.checked)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
