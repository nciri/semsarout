import { createContext, useContext } from 'react'

/**
 * Demander une confirmation depuis n'importe quel écran, sans `window.confirm` : le
 * fournisseur (`ConfirmProvider`, monté une fois par l'application) porte la fenêtre, les
 * écrans n'appellent que `ask(...)`.
 *
 * Par défaut la demande est ignorée plutôt qu'exécutée : un écran monté hors fournisseur ne
 * doit pas supprimer sans avoir demandé.
 */
export const ConfirmContext = createContext(null)

/** `ask({ message, onConfirm, title?, confirmLabel?, tone? })` */
export function useConfirm() {
  return useContext(ConfirmContext) ?? (() => {})
}
