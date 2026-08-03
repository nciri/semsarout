import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center' }}>
      <h1 style={{ color: 'var(--text-heading)' }}>Page introuvable</h1>
      <p>La page que vous cherchez n’existe pas.</p>
      <Link to="/">Retour à l’accueil</Link>
    </div>
  )
}
