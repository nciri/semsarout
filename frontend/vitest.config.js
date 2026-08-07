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
  },
})
