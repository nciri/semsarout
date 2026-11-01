import { useCallback, useMemo, useState } from 'react'
import { ConfirmDialog } from '../backoffice/ui'
import { ConfirmContext } from './confirm'

/** Porte la fenêtre de confirmation de toute l'application (voir `confirm.js`). */
export default function ConfirmProvider({ children }) {
  const [pending, setPending] = useState(null)
  const close = useCallback(() => setPending(null), [])
  const ask = useCallback((options) => setPending(options), [])
  const value = useMemo(() => ask, [ask])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.title}
        message={pending?.message}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        tone={pending?.tone}
        onCancel={close}
        onConfirm={() => { close(); pending?.onConfirm?.() }}
      />
    </ConfirmContext.Provider>
  )
}
