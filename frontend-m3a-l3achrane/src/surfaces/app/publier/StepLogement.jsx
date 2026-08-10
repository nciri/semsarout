import { useTranslation } from 'react-i18next'
import { Input, Select, Textarea, Checkbox } from '../../../ds/index.js'

const BED_TYPE_VALUES = ['CHAMBRE_INDIVIDUELLE', 'CHAMBRE_PARTAGEE', 'LIT_DORTOIR', 'STUDIO_ENTIER', 'APPARTEMENT_ENTIER']

// Restreint à FEMININ/MASCULIN pour cette annonce (pas de MIXTE_FAMILIAL).
const HOUSING_GENDER_VALUES = ['FEMININ', 'MASCULIN']

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
  const { t } = useTranslation(['app'])

  const bedTypes = BED_TYPE_VALUES.map((value) => ({ value, label: t(`app:publier.bedTypes.${value}`) }))
  const housingGenders = HOUSING_GENDER_VALUES.map((value) => ({ value, label: t(`app:publier.housingGenders.${value}`) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        label={<>{t('app:publier.stepLogement.titleLabel')}<Req /></>}
        value={form.title}
        onChange={(e) => update({ title: e.target.value })}
        error={errors.title ? t('app:publier.errors.required') : undefined}
      />
      <Textarea
        label={t('app:publier.stepLogement.descriptionLabel')}
        rows={5}
        value={form.description}
        onChange={(e) => update({ description: e.target.value })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Select
          label={<>{t('app:publier.stepLogement.bedTypeLabel')}<Req /></>}
          value={form.bed_type}
          onChange={(e) => update({ bed_type: e.target.value })}
          options={[{ value: '', label: t('app:publier.selectPlaceholder') }, ...bedTypes]}
        />
        {errors.bed_type && <ErrorText>{t('app:publier.errors.required')}</ErrorText>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Select
          label={<>{t('app:publier.stepLogement.housingGenderLabel')}<Req /></>}
          value={form.housing_gender}
          onChange={(e) => update({ housing_gender: e.target.value })}
          options={housingGenders}
        />
        {errors.housing_gender && <ErrorText>{t('app:publier.errors.required')}</ErrorText>}
      </div>
      <Checkbox
        label={t('app:publier.stepLogement.furnishedLabel')}
        checked={!!form.furnished}
        onChange={(e) => update({ furnished: e.target.checked })}
      />
      <Input
        label={t('app:publier.stepLogement.capacityLabel')}
        type="number"
        min={1}
        max={8}
        value={form.capacity}
        onChange={(e) => update({ capacity: e.target.value })}
      />
    </div>
  )
}
