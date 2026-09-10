import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import ReuseLevelDialog from './ReuseLevelDialog'

const level = (over = {}) => ({
  id: 'lv1', name: 'Plan du RDC', wall_height_m: 2.7,
  geometry: { walls: [], rooms: [], openings: [] }, ...over,
})

const makeLocal = () => ({
  listKnownProjects: vi.fn(async () => [{ id: 'p1', title: 'Projet local', levels: [level()] }]),
})

const makeApi = () => ({
  listAgencyProjects: vi.fn(async () => [{ id: 'p2', title: 'Projet agence', levels: [level({ id: 'lv2' })] }]),
})

describe('ReuseLevelDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('annonce une liste limitée quand on est hors connexion', async () => {
    const local = makeLocal()
    const api = makeApi()
    render(<ReuseLevelDialog online={false} local={local} api={api} onPick={() => {}} onClose={() => {}} />)
    expect(await screen.findByText(/liste limitée/i)).toBeInTheDocument()
    expect(api.listAgencyProjects).not.toHaveBeenCalled()
  })

  it('interroge le serveur quand on est en ligne', async () => {
    const local = makeLocal()
    const api = makeApi()
    render(<ReuseLevelDialog online local={local} api={api} onPick={() => {}} onClose={() => {}} />)
    await screen.findByText(/Plan du RDC/i)
    expect(api.listAgencyProjects).toHaveBeenCalled()
  })

  it('affiche un indicateur de chargement tant que la liste n’est pas prête', async () => {
    let resolveList
    const local = makeLocal()
    const api = { listAgencyProjects: vi.fn(() => new Promise((resolve) => { resolveList = resolve })) }
    render(<ReuseLevelDialog online local={local} api={api} onPick={() => {}} onClose={() => {}} />)
    expect(await screen.findByText(/chargement/i)).toBeInTheDocument()
    resolveList([])
    await screen.findByText(/Aucun autre plan/i)
    expect(screen.queryByText(/chargement/i)).not.toBeInTheDocument()
  })

  it('ne charge la géométrie qu’au choix, pour le seul niveau retenu', async () => {
    // La liste en ligne ne porte que des résumés : c'est le prix de la
    // suppression du N+1 qui vidait le cache hors-ligne (jusqu'à 51 requêtes
    // dans un cache plafonné à 60 entrées).
    const geometry = { walls: [{ id: 'w1' }], rooms: [], openings: [] }
    const api = {
      listAgencyProjects: vi.fn(async () => [
        { id: 'p2', title: 'Projet agence', levels: [{ id: 'lv2', name: 'Plan du RDC', position: 0, wall_height_m: 2.9 }] },
      ]),
      getLevelGeometry: vi.fn(async () => ({ id: 'lv2', name: 'Plan du RDC', wall_height_m: 2.9, geometry })),
    }
    const onPick = vi.fn()
    render(<ReuseLevelDialog online local={makeLocal()} api={api} onPick={onPick} onClose={() => {}} />)
    await userEvent.click(await screen.findByText(/Plan du RDC/i))
    expect(api.getLevelGeometry).toHaveBeenCalledExactlyOnceWith('p2', 'lv2')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ geometry, wall_height_m: 2.9 }))
  })

  it('dit que le plan choisi n’a pas pu être chargé, au lieu d’en reprendre un vide', async () => {
    const api = {
      listAgencyProjects: vi.fn(async () => [
        { id: 'p2', title: 'Projet agence', levels: [{ id: 'lv2', name: 'Plan du RDC', position: 0, wall_height_m: 2.9 }] },
      ]),
      getLevelGeometry: vi.fn(async () => { throw new Error('net') }),
    }
    const onPick = vi.fn()
    render(<ReuseLevelDialog online local={makeLocal()} api={api} onPick={onPick} onClose={() => {}} />)
    await userEvent.click(await screen.findByText(/Plan du RDC/i))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('remonte la géométrie et la hauteur du niveau choisi', async () => {
    const local = makeLocal()
    const api = makeApi()
    const onPick = vi.fn()
    render(<ReuseLevelDialog online local={local} api={api} onPick={onPick} onClose={() => {}} />)
    await userEvent.click(await screen.findByText(/Plan du RDC/i))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ wall_height_m: 2.7 }))
  })
})
