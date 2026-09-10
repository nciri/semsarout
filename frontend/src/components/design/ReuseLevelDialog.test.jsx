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

  it('remonte la géométrie et la hauteur du niveau choisi', async () => {
    const local = makeLocal()
    const api = makeApi()
    const onPick = vi.fn()
    render(<ReuseLevelDialog online local={local} api={api} onPick={onPick} onClose={() => {}} />)
    await userEvent.click(await screen.findByText(/Plan du RDC/i))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ wall_height_m: 2.7 }))
  })
})
