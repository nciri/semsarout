import { describe, it, expect, beforeEach, vi } from 'vitest'
import api from './api'
import { getLevelGeometry, listAgencyProjects } from './design3dApi'

vi.mock('./api', () => ({ default: { get: vi.fn() } }))

// La liste de reprise doit tenir en UN appel. Le cache Workbox `design3d-api`
// est plafonné à 60 entrées (vite.config.js) : un appel par projet — jusqu'à 51
// — vidait le cache hors-ligne de l'agent par la porte de derrière, exactement
// le risque que l'auteur de cette configuration avait cloisonné pour le cache
// public. C'est une atteinte directe à la promesse « utilisable Wi-Fi coupé ».
const summaries = (n) => ({
  data: {
    projects: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      title: `Projet ${i}`,
      levels: [{ id: `lv${i}`, name: 'RDC', position: 0, wall_height_m: 2.7 }],
    })),
  },
})

describe('design3dApi — reprise d’un plan existant', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('liste cinquante projets en UN SEUL appel, sans géométrie', async () => {
    api.get.mockResolvedValue(summaries(50))
    const rows = await listAgencyProjects()

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(50)
    expect(rows[0].levels[0]).toEqual({ id: 'lv0', name: 'RDC', position: 0, wall_height_m: 2.7 })
    expect(rows[0].levels[0].geometry).toBeUndefined()
  })

  it('ne charge la géométrie que du niveau effectivement choisi', async () => {
    const geometry = { walls: [{ id: 'w1' }], rooms: [], openings: [] }
    api.get.mockResolvedValue({ data: { id: 'p3', levels: [{ id: 'lv3', name: 'RDC', wall_height_m: 2.8, geometry }] } })

    const level = await getLevelGeometry('p3', 'lv3')

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(level).toMatchObject({ id: 'lv3', wall_height_m: 2.8, geometry })
  })

  it('renvoie null quand le niveau choisi a disparu du projet', async () => {
    api.get.mockResolvedValue({ data: { id: 'p3', levels: [] } })
    expect(await getLevelGeometry('p3', 'lv3')).toBeNull()
  })
})
