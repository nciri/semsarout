import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'
import useAuthStore from '../../store/authStore'

function AcceptInvitation() {
  const { t } = useTranslation(['auth', 'common'])
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
    if (form.password.length < 8) return toast.error(t('common:validation.passwordMin8'))
    if (form.password !== form.confirm) return toast.error(t('common:validation.passwordsMismatch'))
    setSubmitting(true)
    try {
      const res = await api.post(`/invitations/${token}/accept`, {
        first_name: form.first_name, last_name: form.last_name, password: form.password,
      })
      const { user, access_token, refresh_token } = res.data
      localStorage.setItem('token', access_token)
      localStorage.setItem('userId', String(user.id))
      useAuthStore.setState({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true })
      toast.success(t('auth:invite.welcome'))
      navigate('/backoffice')
    } catch (err) {
      toast.error(err.response?.data?.error || t('common:errors.short'))
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">{t('auth:invite.loading')}</div>
  if (isError) {
    const msg = error?.response?.status === 410 ? t('auth:invite.expired') : t('auth:invite.invalid')
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-gray-700">{msg}</p>
        <Link to="/connexion" className="text-primary-600 underline">{t('auth:invite.goToLogin')}</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow p-6 w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold text-gray-900">{t('auth:invite.joinTitle', { agency: data.agency_name })}</h1>
        <p className="text-sm text-gray-500">{t('auth:invite.subtitle', { email: data.email })}{data.role_name ? ` · ${data.role_name}` : ''}</p>
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder={t('auth:invite.firstNamePlaceholder')} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                 className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
          <input required placeholder={t('auth:invite.lastNamePlaceholder')} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                 className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        </div>
        <input required type="password" placeholder={t('auth:invite.passwordPlaceholder')} value={form.password}
               onChange={(e) => setForm({ ...form, password: e.target.value })}
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <input required type="password" placeholder={t('auth:invite.confirmPlaceholder')} value={form.confirm}
               onChange={(e) => setForm({ ...form, confirm: e.target.value })}
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <button disabled={submitting} className="btn-primary w-full">
          {submitting ? t('auth:invite.submitting') : t('auth:invite.submit')}
        </button>
      </form>
    </div>
  )
}

export default AcceptInvitation
