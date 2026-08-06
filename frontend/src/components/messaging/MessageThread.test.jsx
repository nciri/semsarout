import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import MessageThread from './MessageThread'

const message = {
  subject: 'Sujet du message',
  buyer_email: 'buyer@example.com',
  message: 'Bonjour, je suis intéressé.',
  created_at: '2026-01-01T10:00:00Z',
  replies: []
}

describe('MessageThread i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le placeholder de réponse en FR', async () => {
    render(<MessageThread message={message} viewerRole="buyer" onReply={() => {}} isReplying={false} />)
    expect(await screen.findByPlaceholderText('Écrire une réponse...')).toBeInTheDocument()
  })

  it('affiche le placeholder de réponse en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<MessageThread message={message} viewerRole="buyer" onReply={() => {}} isReplying={false} />)
    expect(await screen.findByPlaceholderText('اكتب ردًا...')).toBeInTheDocument()
  })
})
