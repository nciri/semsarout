import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de bout en bout de l'éditeur de plan (design3d), joués sur les six
 * formats de tablette visés par le cahier des charges : l'éditeur est
 * doigts-seulement, il doit tenir aussi bien en portrait qu'en paysage.
 *
 * Ces tests NE SONT PAS branchés sur `npm test` (vitest/jsdom) : ils exigent un
 * Chromium et le build servi par `vite preview`. Lancer `npm run build` avant
 * `npm run test:e2e` — le serveur de prévisualisation sert `dist/`.
 */

const VIEWPORTS = {
  'ipad-mini-portrait': { width: 768, height: 1024 },
  'ipad-mini-landscape': { width: 1024, height: 768 },
  'ipad-portrait': { width: 820, height: 1180 },
  'ipad-landscape': { width: 1180, height: 820 },
  'ipad-pro-portrait': { width: 1024, height: 1366 },
  'ipad-pro-landscape': { width: 1366, height: 1024 },
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    // Le service worker de la PWA n'est pas le sujet de ces tests et brouille
    // l'interception réseau (il répond avant `page.route`). Il est vérifié
    // séparément, à la main, sur appareil réel.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
  },
  projects: Object.entries(VIEWPORTS).map(([name, viewport]) => ({
    name,
    use: {
      ...devices['Desktop Chrome'],
      viewport,
      // Tablette : tactile, mais pas la vue « mobile » du navigateur.
      hasTouch: true,
      isMobile: false,
      deviceScaleFactor: 2,
    },
  })),
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
