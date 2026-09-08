import { expect, test } from '@playwright/test'

/**
 * Éditeur de plan 2D — parcours tactile sur les six formats de tablette.
 *
 * L'API est entièrement simulée (`page.route`) : ces tests portent sur
 * l'ergonomie doigts-seulement et sur le comportement hors-ligne du front, pas
 * sur le service design3d (couvert par ses propres tests Python).
 *
 * Les gestes passent par CDP (`Input.dispatchTouchEvent`) et non par
 * `page.touchscreen.tap` seul : l'outil « Mur » se trace par appui-glissé-relâché
 * (un simple tap produit un mur de longueur nulle, rejeté par le canevas), et le
 * pinch demande deux points de contact simultanés.
 */

const PROJECT_ID = 'a'.repeat(32)
const LEVEL_ID = 'b'.repeat(32)

const emptyGeometry = { walls: [], rooms: [], openings: [] }

const serverLevel = (over = {}) => ({
  id: LEVEL_ID,
  project_id: PROJECT_ID,
  name: 'RDC',
  position: 0,
  revision: 1,
  wall_height_m: 2.7,
  calibration: null,
  geometry: emptyGeometry,
  shelved_count: 0,
  ...over,
})

async function mockApi(page) {
  // Révision côté « serveur » : incrémentée par chaque PUT accepté, comme le
  // fait le vrai service (verrou optimiste sur base_revision).
  const state = { revision: 1 }

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/v1', '')
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/auth/me') return json({ id: 1, email: 'agent@example.com', role: 'agency', features: ['design3d'] })
    if (path === '/design3d/sync') return json({ projects: [{ id: PROJECT_ID, levels: [serverLevel({ revision: state.revision })] }] })
    if (path === `/design3d/projects/${PROJECT_ID}`) {
      return json({ id: PROJECT_ID, title: 'Plan de test', status: 'draft', levels: [serverLevel({ revision: state.revision })] })
    }
    if (path === `/design3d/levels/${LEVEL_ID}` && req.method() === 'PUT') {
      state.revision += 1
      return json({ ...serverLevel({ revision: state.revision }), ...JSON.parse(req.postData() || '{}'), revision: state.revision, shelved: false })
    }
    if (path.endsWith('/shelf')) return json({ items: [] })
    return json({})
  })
}

async function seedSession(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('lang', 'fr')
    window.localStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: {
          user: { id: 1, email: 'agent@example.com', role: 'agency', features: ['design3d'] },
          accessToken: 'e2e-token',
          refreshToken: 'e2e-refresh',
          isAuthenticated: true,
          impersonating: false,
          impersonatedUser: null,
        },
        version: 0,
      }),
    )
  })
}

/** Ouvre l'éditeur et attend que le niveau distant soit chargé localement. */
async function openEditor(page) {
  await seedSession(page)
  await mockApi(page)
  await page.goto(`/dashboard/conception/${PROJECT_ID}`)
  const canvas = page.getByTestId('floorplan-canvas')
  await expect(canvas).toBeVisible()
  // Le pied de page n'apparaît qu'une fois le niveau amorcé depuis IndexedDB :
  // c'est le signal fiable que l'éditeur est prêt à enregistrer.
  await expect(page.getByText(/Niveau RDC/)).toBeVisible({ timeout: 15000 })
  return canvas
}

async function touchSession(page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id ?? i })),
    })
  return {
    async tap(p) {
      await send('touchStart', [p])
      await send('touchEnd', [])
    },
    async drag(from, to, steps = 10) {
      await send('touchStart', [from])
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [{
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        }])
      }
      await send('touchEnd', [])
    },
    async pinch(center, fromGap, toGap, steps = 10) {
      const pts = (gap) => [
        { x: center.x - gap / 2, y: center.y, id: 1 },
        { x: center.x + gap / 2, y: center.y, id: 2 },
      ]
      await send('touchStart', pts(fromGap))
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', pts(fromGap + ((toGap - fromGap) * i) / steps))
      }
      await send('touchEnd', [])
    },
  }
}

/** Deux points de tracé horizontaux, au centre du canevas. */
async function wallPoints(canvas) {
  const box = await canvas.boundingBox()
  const y = box.y + box.height / 2
  return {
    a: { x: box.x + box.width * 0.3, y },
    b: { x: box.x + box.width * 0.7, y },
    middle: { x: box.x + box.width * 0.5, y },
    box,
  }
}

async function selectTool(page, label) {
  await page.getByRole('button', { name: label, exact: true }).first().click()
}

async function drawWall(page, canvas) {
  const touch = await touchSession(page)
  const { a, b } = await wallPoints(canvas)
  await selectTool(page, 'Mur')
  await touch.drag(a, b)
  await expect(canvas.locator('line')).toHaveCount(1)
}

test.describe('éditeur de plan sur tablette', () => {
  test('trace un mur au doigt', async ({ page }) => {
    const canvas = await openEditor(page)
    await drawWall(page, canvas)
    // Le mur est bien un segment épais (épaisseur en mètres), pas un trait d'aide.
    const thickness = await canvas.locator('line').first().getAttribute('stroke-width')
    expect(Number(thickness)).toBeGreaterThan(0)
  })

  test('pose une porte sur un mur existant', async ({ page }) => {
    const canvas = await openEditor(page)
    await drawWall(page, canvas)
    const touch = await touchSession(page)
    const { middle } = await wallPoints(canvas)
    await selectTool(page, 'Porte')
    await touch.tap(middle)
    // L'ouverture est dessinée par-dessus le mur, en blanc (percement).
    await expect(canvas.locator('line[stroke="#ffffff"]')).toHaveCount(1)
    await expect(canvas.locator('line')).toHaveCount(2)
  })

  test('le panneau des propriétés suit la largeur disponible', async ({ page }, testInfo) => {
    await openEditor(page)
    const width = testInfo.project.use.viewport.width
    const sheet = page.locator('button[aria-expanded]')

    if (width < 900) {
      // Étroit : panneau replié dans une feuille en bas, dépliable au doigt.
      await expect(sheet).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByText('Touchez un élément du plan pour le modifier.')).toBeHidden()
      await sheet.click()
      await expect(sheet).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByText('Touchez un élément du plan pour le modifier.')).toBeVisible()
    } else {
      // Large : le panneau est en colonne latérale, toujours visible.
      await expect(sheet).toHaveCount(0)
      await expect(page.getByText('Touchez un élément du plan pour le modifier.')).toBeVisible()
    }
  })

  test('le pinch à deux doigts modifie la vue', async ({ page }) => {
    const canvas = await openEditor(page)
    const before = await canvas.getAttribute('viewBox')
    const touch = await touchSession(page)
    const { middle } = await wallPoints(canvas)
    await touch.pinch(middle, 120, 340)
    await expect.poll(async () => canvas.getAttribute('viewBox')).not.toBe(before)
  })

  test('la rotation de la tablette conserve le plan', async ({ page }, testInfo) => {
    const canvas = await openEditor(page)
    await drawWall(page, canvas)
    const { width, height } = testInfo.project.use.viewport
    await page.setViewportSize({ width: height, height: width })
    await expect(canvas).toBeVisible()
    await expect(canvas.locator('line')).toHaveCount(1)
  })

  test('hors ligne, les modifications sont mises en attente puis synchronisées', async ({ page, context }) => {
    const canvas = await openEditor(page)
    const badge = page.getByTestId('sync-badge')
    await expect(badge).toHaveAttribute('data-pending', '0')

    await context.setOffline(true)
    await drawWall(page, canvas)
    await expect(badge).toHaveAttribute('data-pending', '1', { timeout: 15000 })
    await expect(badge).toContainText('Hors connexion')

    await context.setOffline(false)
    await expect(badge).toHaveAttribute('data-pending', '0', { timeout: 30000 })
    await expect(badge).toContainText('À jour')
    // Le mur n'a jamais disparu de l'écran pendant l'aller-retour réseau.
    await expect(canvas.locator('line')).toHaveCount(1)
  })
})
