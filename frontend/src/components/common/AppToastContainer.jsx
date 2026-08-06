import { ToastContainer } from 'react-toastify'
import { useTranslation } from 'react-i18next'

// main.jsx est hors des providers React classiques : ce wrapper lit i18next
// pour adapter dynamiquement le sens et la position des toasts selon la langue.
export default function AppToastContainer() {
  const { i18n } = useTranslation()
  const rtl = i18n.dir() === 'rtl'

  return (
    <ToastContainer
      position={rtl ? 'top-left' : 'top-right'}
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={rtl}
      pauseOnFocusLoss
      draggable
      pauseOnHover
    />
  )
}
