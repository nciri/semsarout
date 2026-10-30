import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import RichTextarea, { RichText } from './RichTextarea'
import { richTextToPlain, sanitizeRichText } from '../../utils/richText'

function Harness({ initial = '', ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="champ">Notes</label>
      <RichTextarea id="champ" value={value} onChange={setValue} rows={3} {...props} />
      <output data-testid="valeur">{value}</output>
    </>
  )
}

describe('RichTextarea', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  afterEach(() => { vi.restoreAllMocks() })

  it('reste relié à son <label htmlFor> et expose une zone de texte multiligne', () => {
    render(<Harness />)
    const box = screen.getByLabelText('Notes')
    expect(box).toHaveAttribute('role', 'textbox')
    expect(box).toHaveAttribute('aria-multiline', 'true')
    expect(box).toHaveAttribute('contenteditable', 'true')
    // Accessible au clavier sans souris.
    expect(box).toHaveAttribute('tabindex', '0')
    expect(box.style.minHeight).toBe('5.25rem')
  })

  it('remonte le HTML saisi à chaque frappe', async () => {
    render(<Harness />)
    const box = screen.getByLabelText('Notes')
    await userEvent.click(box)
    await userEvent.keyboard('Bonjour')
    expect(screen.getByTestId('valeur').textContent).toBe('Bonjour')
  })

  it('affiche la valeur initiale assainie et non le balisage interdit', () => {
    render(<Harness initial='<p>Salon <strong>refait</strong></p><script>alert(1)</script>' />)
    const box = screen.getByLabelText('Notes')
    expect(box.innerHTML).toBe('<p>Salon <strong>refait</strong></p>')
  })

  it('nettoie un collage venu de Word : la mise en forme utile reste, le reste tombe', async () => {
    render(<Harness />)
    const box = screen.getByLabelText('Notes')
    const sale = '<p class="MsoNormal" style="color:red"><o:p></o:p><b>Cuisine</b>'
      + ' <font face="Calibri">équipée</font><script>alert(1)</script>'
      + '<a href="javascript:alert(2)">piège</a></p>'
    box.innerHTML = sanitizeRichText(sale)
    const propre = box.innerHTML
    expect(propre).toContain('<b>Cuisine</b>')
    expect(propre).toContain('équipée')
    expect(propre).not.toContain('MsoNormal')
    expect(propre).not.toContain('o:p')
    expect(propre).not.toContain('alert(1)')
    expect(propre).not.toContain('javascript:')
    expect(propre).toContain('piège')
  })

  it('le collage passe par le nettoyage et non par le presse-papier brut', async () => {
    const exec = vi.fn().mockReturnValue(true)
    document.execCommand = exec
    render(<Harness />)
    const box = screen.getByLabelText('Notes')
    await userEvent.click(box)
    await userEvent.paste({
      getData: (type) => (type === 'text/html'
        ? '<p style="color:red">Collé<script>alert(1)</script></p>'
        : 'Collé'),
    })
    const inserted = exec.mock.calls.filter(([cmd]) => cmd === 'insertHTML').map(([, , html]) => html)
    expect(inserted.length).toBe(1)
    expect(inserted[0]).toBe('<p>Collé</p>')
  })

  it('les actions de la barre d’outils appliquent la commande d’édition correspondante', async () => {
    const exec = vi.fn().mockReturnValue(true)
    document.execCommand = exec
    render(<Harness />)
    expect(screen.getByRole('toolbar')).toHaveAccessibleName('Mise en forme')
    for (const [label, command] of [
      ['Gras', 'bold'], ['Italique', 'italic'], ['Souligné', 'underline'],
      ['Liste à puces', 'insertUnorderedList'], ['Liste numérotée', 'insertOrderedList'],
    ]) {
      await userEvent.click(screen.getByRole('button', { name: label }))
      expect(exec).toHaveBeenCalledWith(command, false, undefined)
    }
    // Le lien demande son adresse dans le champ au lieu d'un window.prompt.
    await userEvent.click(screen.getByRole('button', { name: 'Lien' }))
    await userEvent.type(screen.getByLabelText('Adresse du lien'), 'https://semsarout.com')
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }))
    expect(exec).toHaveBeenCalledWith('createLink', false, 'https://semsarout.com')
  })

  it('passe en direction droite-à-gauche et porte des libellés arabes en AR', async () => {
    await i18n.changeLanguage('ar')
    render(<Harness />)
    expect(screen.getByLabelText('Notes')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('button', { name: 'عريض' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar')).toHaveAccessibleName('التنسيق')
  })

  it('désactivé, le champ n’est plus éditable et la barre d’outils est inerte', () => {
    render(<Harness disabled />)
    const box = screen.getByLabelText('Notes')
    expect(box).toHaveAttribute('contenteditable', 'false')
    expect(box).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Gras' })).toBeDisabled()
  })

  it('porte le placeholder sans l’injecter dans la valeur', () => {
    render(<Harness placeholder="Décrivez le bien" />)
    expect(screen.getByLabelText('Notes')).toHaveAttribute('data-placeholder', 'Décrivez le bien')
    expect(screen.getByTestId('valeur').textContent).toBe('')
  })
})

describe('RichText (affichage)', () => {
  it('rend la mise en forme plutôt que des balises visibles', () => {
    render(<RichText html="<p>Mur <strong>repeint</strong></p><ul><li>salon</li></ul>" />)
    expect(screen.getByText('repeint').tagName).toBe('STRONG')
    expect(screen.getByRole('listitem')).toHaveTextContent('salon')
    expect(screen.queryByText(/<strong>/)).toBeNull()
  })

  it('n’affiche jamais un script stocké', () => {
    const { container } = render(<RichText html='<p>ok</p><script>alert(1)</script><img src=x onerror="alert(2)">' />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('ok')
  })

  it('retombe sur le libellé vide quand le champ ne contient que des balises vides', () => {
    render(<RichText html="<p><br></p>" emptyLabel="Aucune note" />)
    expect(screen.getByText('Aucune note')).toBeInTheDocument()
  })
})

describe('richTextToPlain', () => {
  it('rend un texte lisible pour les surfaces sans HTML (cellule, index, email texte)', () => {
    expect(richTextToPlain('<p>Ligne un</p><ul><li>a</li><li>b</li></ul>')).toBe('Ligne un\na\nb')
    expect(richTextToPlain('<p>a &amp; b</p>')).toBe('a & b')
    expect(richTextToPlain('')).toBe('')
  })
})
