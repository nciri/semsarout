import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActeAChamps from './ActeAChamps'

const CORPS = '<h3>ARTICLE 1</h3>'
  + '<p style="text-align:justify;">Titre foncier n° …………, Conservation de ………</p>'
  + '<table><tbody><tr><th>Étape</th><td colspan="2">……… %</td></tr></tbody></table>'

const libelle = (rang) => `Champ ${rang}`

function monte(props = {}) {
  const onChange = vi.fn()
  const utils = render(
    <ActeAChamps html={CORPS} valeurs={{}} onChange={onChange} libelle={libelle} {...props} />,
  )
  return { onChange, ...utils }
}

describe('acte à champs', () => {
  it('rend la structure du document, un champ par pointillé', () => {
    monte()
    // La structure survit : titre d'article, alignement, tableau avec sa cellule fusionnée.
    expect(screen.getByRole('heading', { name: 'ARTICLE 1' })).toBeInTheDocument()
    expect(document.querySelector('p').style.textAlign).toBe('justify')
    expect(document.querySelector('td').getAttribute('colspan')).toBe('2')
    expect(screen.getByRole('columnheader', { name: 'Étape' })).toBeInTheDocument()
    // Trois pointillés, trois champs, numérotés dans l'ordre du document.
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(screen.getByLabelText('Champ 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Champ 3')).toBeInTheDocument()
  })

  it('remonte la saisie sous le rang du champ', async () => {
    const { onChange } = monte()
    await userEvent.type(screen.getByLabelText('Champ 1'), 'T')
    expect(onChange).toHaveBeenCalledWith('1', 'T')
  })

  it('affiche les valeurs déjà saisies et se verrouille quand il le faut', () => {
    monte({ valeurs: { 2: 'Rabat' }, disabled: true })
    expect(screen.getByLabelText('Champ 2')).toHaveValue('Rabat')
    expect(screen.getByLabelText('Champ 1')).toBeDisabled()
  })

  it("n'injecte pas de HTML brut", () => {
    // Le corps est assaini côté serveur, mais l'arbre est reconstruit en éléments React :
    // aucune chaîne n'est posée telle quelle.
    monte({ html: '<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>' })
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/alert\(1\)/)).toBeInTheDocument()
  })
})
