import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { toast } from 'react-toastify'
import api from '../../services/api'
import useAuthStore from '../../store/authStore'

function AcceptInvitation() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', password: '', confirm: '' })
  const [submitting, setSubmitting] = useState(false)

  const { data, isLoading, isError, error } = useQuery(
    ['invitation', token],
    async () => (await api.get(`/invitations/${token}`)).data,
    { retry: false }
  )

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error('Mot de passe : 8 caractères minimum')
    if (form.password !== form.confirm) return toast.error('Les mots de passe ne correspondent pas')
    setSubmitting(true)
    try {
      const res = await api.post(`/invitations/${token}/accept`, {
        first_name: form.first_name, last_name: form.last_name, password: form.password,
      })
      const { user, access_token, refresh_token } = res.data
      localStorage.setItem('token', access_token)
      localStorage.setItem('userId', String(user.id))
      useAuthStore.setState({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true })
      toast.success('Bienvenue dans l\'équipe !')
      navigate('/backoffice')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Chargement…</div>
  if (isError) {
    const msg = error?.response?.status === 410 ? 'Cette invitation a expiré.' : 'Invitation invalide.'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-gray-700">{msg}</p>
        <Link to="/connexion" className="text-primary-600 underline">Aller à la connexion</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow p-6 w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Rejoindre {data.agency_name}</h1>
        <p className="text-sm text-gray-500">Invitation pour {data.email}{data.role_name ? ` · ${data.role_name}` : ''}</p>
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                 className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
          <input required placeholder="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                 className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        </div>
        <input required type="password" placeholder="Mot de passe (8 car. min.)" value={form.password}
               onChange={(e) => setForm({ ...form, password: e.target.value })}
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <input required type="password" placeholder="Confirmer le mot de passe" value={form.confirm}
               onChange={(e) => setForm({ ...form, confirm: e.target.value })}
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <button disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Création…' : 'Activer mon compte'}
        </button>
      </form>
    </div>
  )
}

export default AcceptInvitation
