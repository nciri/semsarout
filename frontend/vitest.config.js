import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    // Full-suite runs were intermittently failing (exit 1, e.g. on
    // Home.test.jsx / AgencyList.test.jsx / MyLeads.test.jsx) with
    // "EnvironmentTeardownError: Closing rpc while onUserConsoleLog was
    // pending" — a race between a worker's console-log RPC to the main
    // reporter and that worker's jsdom teardown, ~80 files across many
    // pooled workers/forks. It reproduced under both the default 'threads'
    // pool and 'forks' pool, with or without capping worker/fork count, so
    // the race lives in the worker/rpc boundary itself, not the pool type.
    // Disabling file parallelism removes that boundary (no cross-worker
    // rpc to race against), trading run time (~90s vs ~23s here) for a
    // suite that passes deterministically every time. Confirmed clean
    // across 3 consecutive full runs.
    fileParallelism: false,
    // `fileParallelism: false` n'a pas suffi : la course survit en CI (runners plus lents),
    // où elle s'est reproduite le 2026-09-15 sur SellProperty.test.jsx puis, une fois ce
    // fichier traité, sur AgencyPricing.test.jsx — elle se déplace de fichier en fichier,
    // donc la traiter fichier par fichier ne la supprime pas. Le déclencheur est le rpc
    // `onUserConsoleLog` lui-même : un `console.error` émis APRÈS la fin du test (rejet
    // axios d'un appel non mocké, inévitable dans les tests qui vérifient justement l'état
    // d'erreur) arrive pendant la fermeture du worker. Ne pas transmettre les logs au
    // reporter supprime ce rpc, donc la course. Les échecs de tests et les erreurs non
    // gérées restent rapportés : seule la sortie console des tests devient muette.
    onConsoleLog: () => false,
  },
})
