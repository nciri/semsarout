import { Input, Checkbox } from '../../../ds/index.js'

function Req() {
  return <span style={{ color: 'var(--red-600)' }}> *</span>
}

export default function StepPrix({ form, errors, update }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        label={<>Loyer mensuel (Dh)<Req /></>}
        type="number"
        value={form.rent}
        onChange={(e) => update({ rent: e.target.value })}
        error={errors.rent ? 'Le loyer doit être supérieur à 0' : undefined}
      />
      <Checkbox
        label="Charges comprises"
        checked={!!form.charges_included}
        onChange={(e) => update({ charges_included: e.target.checked })}
      />
      <Input
        label="Montant des charges (Dh/mois)"
        type="number"
        value={form.charges_amount}
        onChange={(e) => update({ charges_amount: e.target.value })}
      />
      <Input
        label="Caution (Dh)"
        type="number"
        value={form.deposit}
        onChange={(e) => update({ deposit: e.target.value })}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--navy-50)', border: '1px solid var(--navy-100)' }}>
        <Checkbox
          label="Immeuble en copropriété"
          checked={!!form.is_condo}
          onChange={(e) => update({ is_condo: e.target.checked })}
        />
        {form.is_condo && (
          <Input
            label="Charges de copropriété (Dh/mois)"
            type="number"
            value={form.condo_fees}
            onChange={(e) => update({ condo_fees: e.target.value })}
          />
        )}
      </div>
    </div>
  )
}
