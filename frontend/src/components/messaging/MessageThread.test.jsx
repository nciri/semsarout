import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  // Le champ de réponse est en texte riche : son invite n'est plus un attribut
  // `placeholder` (que seul un contrôle de formulaire natif porte) mais le libellé
  // accessible du `div[role=textbox]`.
  it('affiche l\'invite de réponse en FR', async () => {
    render(<MessageThread message={message} viewerRole="buyer" onReply={() => {}} isReplying={false} />)
    expect(await screen.findByRole('textbox', { name: 'Écrire une réponse...' })).toBeInTheDocument()
  })

  it('affiche l\'invite de réponse en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<MessageThread message={message} viewerRole="buyer" onReply={() => {}} isReplying={false} />)
    expect(await screen.findByRole('textbox', { name: 'اكتب ردًا...' })).toBeInTheDocument()
  })
})

describe('MessageThread en texte riche', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('envoie la reponse en HTML nettoye et vide le champ', async () => {
    const onReply = vi.fn()
    render(<MessageThread message={message} viewerRole="buyer" onReply={onReply} isReplying={false} />)

    const editor = screen.getByRole('textbox', { name: 'Écrire une réponse...' })
    // Le seul bouton sans libellé est celui d'envoi : ceux de la barre d'outils sont nommés.
    expect(screen.getByRole('button', { name: '' })).toBeDisabled()   // champ vide

    editor.innerHTML = '<p>Oui, <b>toujours</b> disponible</p><script>alert(1)</script>'
    await userEvent.click(editor)
    await userEvent.tab()

    await userEvent.click(screen.getByRole('button', { name: '' }))
    expect(onReply).toHaveBeenCalledWith('<p>Oui, <b>toujours</b> disponible</p>')
  })

  it('refuse un editeur vide meme quand il contient du HTML sans contenu', async () => {
    const onReply = vi.fn()
    render(<MessageThread message={message} viewerRole="buyer" onReply={onReply} isReplying={false} />)

    const editor = screen.getByRole('textbox', { name: 'Écrire une réponse...' })
    // Ce que rend un `contentEditable` vidé : du HTML valide, mais sans contenu. `trim()`
    // ne l'aurait pas vu vide et la réponse serait partie.
    editor.innerHTML = '<p><br></p>'
    await userEvent.click(editor)
    await userEvent.tab()

    expect(screen.getByRole('button', { name: '' })).toBeDisabled()
  })

  // Les réponses sont du HTML ; le message d'origine est antérieur à la bascule et reste du
  // texte brut. Les bulles doivent rendre la mise en forme des unes sans aplatir les sauts
  // de ligne de l'autre, et jamais afficher de balise en clair.
  it('rend la mise en forme des reponses et remonte le message d\'origine en paragraphes', () => {
    const { container } = render(
      <MessageThread
        message={{ ...message, message: 'Bonjour,\n\nje suis intéressé.',
          replies: [{ role: 'agent', sender_role: 'agent', created_at: '2026-01-02T10:00:00Z',
            body: '<p>Bien <strong>disponible</strong></p>' }] }}
        viewerRole="buyer" onReply={() => {}} isReplying={false} />,
    )

    expect(container.querySelector('.rich-text strong').textContent).toBe('disponible')
    expect(container.querySelectorAll('.rich-text')[0].querySelectorAll('p')).toHaveLength(2)
    expect(container.innerHTML).not.toContain('&lt;strong&gt;')
  })
})
