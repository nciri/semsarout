import { useTranslation } from 'react-i18next'
import { Input, Select, Button } from '../../../ds/index.js'

const MEDIA_TYPE_VALUES = ['CHAMBRE', 'PARTIES_COMMUNES', 'AUTRE']

export default function StepDispoPhotos({ form, update }) {
  const { t } = useTranslation(['app'])

  const mediaTypes = MEDIA_TYPE_VALUES.map((value) => ({ value, label: t(`app:publier.mediaTypes.${value}`) }))

  const onFilesSelected = (e) => {
    const files = Array.from(e.target.files || [])
    const newPhotos = files.map((file, i) => ({
      file,
      media_type: 'AUTRE',
      position: form.photos.length + i,
      previewUrl: URL.createObjectURL(file),
    }))
    update({ photos: [...form.photos, ...newPhotos] })
    e.target.value = ''
  }

  const setMediaType = (index, mediaType) => {
    const photos = form.photos.map((p, i) => (i === index ? { ...p, media_type: mediaType } : p))
    update({ photos })
  }

  const removePhoto = (index) => {
    const photos = form.photos.filter((_, i) => i !== index).map((p, i) => ({ ...p, position: i }))
    update({ photos })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input
        label={t('app:publier.stepDispoPhotos.availableFromLabel')}
        type="date"
        value={form.available_from}
        onChange={(e) => update({ available_from: e.target.value })}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Input
          label={t('app:publier.stepDispoPhotos.durationMinLabel')}
          type="number"
          value={form.duration_min_months}
          onChange={(e) => update({ duration_min_months: e.target.value })}
        />
        <Input
          label={t('app:publier.stepDispoPhotos.durationMaxLabel')}
          type="number"
          value={form.duration_max_months}
          onChange={(e) => update({ duration_max_months: e.target.value })}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)', color: 'var(--text-strong)' }}>
          {t('app:publier.stepDispoPhotos.photosLabel')}
        </span>
        <label style={{ display: 'inline-block', width: 'fit-content' }}>
          <input type="file" accept="image/*" multiple onChange={onFilesSelected} style={{ display: 'none' }} />
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '11px 20px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)', background: '#fff', cursor: 'pointer',
              font: 'var(--fw-semibold) var(--fs-body)/1 var(--font-display)', color: 'var(--text-strong)',
            }}
          >
            {t('app:publier.stepDispoPhotos.addPhotos')}
          </span>
        </label>

        {form.photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {form.photos.map((p, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <img
                  src={p.previewUrl}
                  alt=""
                  style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}
                />
                <Select value={p.media_type} onChange={(e) => setMediaType(i, e.target.value)} options={mediaTypes} />
                <Button size="sm" variant="ghost" onClick={() => removePhoto(i)}>{t('app:publier.stepDispoPhotos.removePhoto')}</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
