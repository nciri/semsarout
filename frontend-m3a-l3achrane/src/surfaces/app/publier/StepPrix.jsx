import { useTranslation } from 'react-i18next'
import { Input, Checkbox } from '../../../ds/index.js'

function Req() {
  return <span style={{ color: 'var(--red-600)' }}> *</span>
}

export default function StepPrix({ form, errors, update }) {
  const { t } = useTranslation(['app'])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        label={<>{t('app:publier.stepPrix.rentLabel')}<Req /></>}
        type="number"
        value={form.rent}
        onChange={(e) => update({ rent: e.target.value })}
        error={errors.rent ? t('app:publier.errors.rentPositive') : undefined}
      />
      <Checkbox
        label={t('app:publier.stepPrix.chargesIncludedLabel')}
        checked={!!form.charges_included}
        onChange={(e) => update({ charges_included: e.target.checked })}
      />
      <Input
        label={t('app:publier.stepPrix.chargesAmountLabel')}
        type="number"
        value={form.charges_amount}
        onChange={(e) => update({ charges_amount: e.target.value })}
      />
      <Input
        label={t('app:publier.stepPrix.depositLabel')}
        type="number"
        value={form.deposit}
        onChange={(e) => update({ deposit: e.target.value })}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)' }}>
        <Checkbox
          label={t('app:publier.stepPrix.isCondoLabel')}
          checked={!!form.is_condo}
          onChange={(e) => update({ is_condo: e.target.checked })}
        />
        {form.is_condo && (
          <Input
            label={t('app:publier.stepPrix.condoFeesLabel')}
            type="number"
            value={form.condo_fees}
            onChange={(e) => update({ condo_fees: e.target.value })}
          />
        )}
      </div>
    </div>
  )
}
