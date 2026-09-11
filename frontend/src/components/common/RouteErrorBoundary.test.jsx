import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Suspense, lazy } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import RouteErrorBoundary from './RouteErrorBoundary'

// Une page paresseuse dont le fragment ne se charge JAMAIS : c'est exactement
// ce que produit un déploiement pendant la session (le service worker en
// `autoUpdate` purge les fragments hachés que l'onglet ouvert va réclamer) ou
// une coupure réseau en pleine navigation.
const BrokenPage = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
const WorkingPage = lazy(() => Promise.resolve({ default: () => <p>contenu de la page</p> }))

function Tree({ Page, resetKey = '/a' }) {
  return (
    <RouteErrorBoundary resetKey={resetKey}>
      <Suspense fallback={<span>attente…</span>}>
        <Page />
      </Suspense>
    </RouteErrorBoundary>
  )
}

describe('barrière d’erreur des routes', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    // React journalise l'erreur rattrapée, et la barrière la journalise aussi :
    // du bruit attendu, pas un échec.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('affiche un message et un moyen de recharger quand un fragment ne se charge pas', async () => {
    render(<Tree Page={BrokenPage} />)

    // Sans barrière, React démonte tout l'arbre : écran blanc, aucun rôle alert.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(i18n.t('routeError.title'))
    expect(alert).toHaveTextContent(i18n.t('routeError.hint'))
    expect(screen.getByRole('button', { name: i18n.t('routeError.reload') })).toBeInTheDocument()
  })

  it('le bouton recharge réellement la page', async () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })
    try {
      render(<Tree Page={BrokenPage} />)
      await screen.findByRole('alert')
      await userEvent.click(screen.getByRole('button', { name: i18n.t('routeError.reload') }))
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('laisse passer une page qui se charge normalement', async () => {
    render(<Tree Page={WorkingPage} />)
    expect(await screen.findByText('contenu de la page')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('se réarme en changeant de route : une page cassée ne condamne pas les autres', async () => {
    const { rerender } = render(<Tree Page={BrokenPage} resetKey="/casse" />)
    await screen.findByRole('alert')

    rerender(<Tree Page={WorkingPage} resetKey="/autre" />)

    expect(await screen.findByText('contenu de la page')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('affiche le message en arabe quand la langue est l’arabe (parité FR/AR)', async () => {
    await i18n.changeLanguage('ar')
    try {
      render(<Tree Page={BrokenPage} />)
      const alert = await screen.findByRole('alert')
      await waitFor(() => expect(alert).toHaveTextContent(i18n.t('routeError.title')))
      // Le libellé arabe doit être réellement traduit, pas un repli sur le français.
      expect(alert.textContent).not.toContain('Cette page')
    } finally {
      await i18n.changeLanguage('fr')
    }
  })
})
