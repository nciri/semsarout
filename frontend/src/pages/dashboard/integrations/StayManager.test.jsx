import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import useAuthStore from '../../../store/authStore'
import StayManager from './StayManager'

// Regression test for the accessToken/token mismatch: StayManager used to
// destructure a non-existent `token` field from useAuthStore (the store
// exposes `accessToken`), so every request went out as `Bearer undefined`.
describe('StayManager auth token', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'test-access-token' })
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ integration: null, connected: false })
    })
  })

  it('sends the store accessToken as the Bearer token', async () => {
    render(
      <MemoryRouter>
        <StayManager />
      </MemoryRouter>
    )

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    const [, options] = global.fetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer test-access-token')
  })
})
