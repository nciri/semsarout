import { describe, it, expect, beforeEach } from 'vitest'
import { lazy, useState } from 'react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import RouteOutlet from './RouteOutlet'
import useNavigationPending from '../../hooks/useNavigationPending'

function Shell() {
  return (
    <div>
      <p>en-tête toujours visible</p>
      <RouteOutlet />
    </div>
  )
}

describe('RouteOutlet', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('garde l’en-tête affiché pendant qu’un fragment de page se charge', async () => {
    let resolvePage
    const Slow = lazy(() => new Promise((resolve) => { resolvePage = resolve }))

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Shell />}>
            <Route index element={<Slow />} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    // Le Suspense est SOUS l'en-tête : la navigation reste à l'écran.
    expect(screen.getByText('en-tête toujours visible')).toBeInTheDocument()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)

    await act(async () => { resolvePage({ default: () => <p>page chargée</p> }) })
    expect(await screen.findByText('page chargée')).toBeInTheDocument()
    expect(screen.getByText('en-tête toujours visible')).toBeInTheDocument()
  })
})

// Sonde minimale : le hook est la seule source du bandeau de progression, et
// son comportement (comparer l'URL poussée à l'URL affichée) ne se voit pas
// dans un rendu figé.
function Probe() {
  const pending = useNavigationPending()
  return <span data-testid="pending">{pending ? 'oui' : 'non'}</span>
}

function PushButton() {
  const [, force] = useState(0)
  const navigate = useNavigate()
  return (
    <>
      <Probe />
      <button type="button" onClick={() => { window.history.pushState({}, '', '/ailleurs'); force((n) => n + 1) }}>
        pousser sans afficher
      </button>
      <button type="button" onClick={() => navigate('/ailleurs')}>naviguer</button>
    </>
  )
}

describe('useNavigationPending', () => {
  it('est faux au repos', () => {
    render(<MemoryRouter><PushButton /></MemoryRouter>)
    expect(screen.getByTestId('pending')).toHaveTextContent('non')
  })

  it('passe à vrai quand l’URL du navigateur a changé mais que l’écran affiché n’a pas suivi', async () => {
    // MemoryRouter n'écoute pas `window.history` : l'URL poussée ne sera donc
    // jamais rendue, ce qui reproduit exactement la fenêtre d'attente d'une
    // navigation dont le fragment n'est pas encore arrivé.
    const previous = window.location.pathname + window.location.search
    try {
      render(<MemoryRouter><PushButton /></MemoryRouter>)
      expect(screen.getByTestId('pending')).toHaveTextContent('non')

      await userEvent.click(screen.getByRole('button', { name: 'pousser sans afficher' }))
      expect(screen.getByTestId('pending')).toHaveTextContent('oui')
    } finally {
      window.history.replaceState({}, '', previous)
    }
  })

  it('restaure history.pushState au démontage (aucune fuite entre les pages)', () => {
    const before = window.history.pushState
    const { unmount } = render(<MemoryRouter><Probe /></MemoryRouter>)
    expect(window.history.pushState).not.toBe(before)
    unmount()
    expect(window.history.pushState).toBe(before)
  })
})
