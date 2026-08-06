import { useState } from 'react'
import { format } from 'date-fns'
import { fr, ar } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { FiSend } from 'react-icons/fi'

/**
 * Renders a BuyerMessage thread (original message + replies) and a reply form.
 * `viewerRole` is 'buyer' or 'agent' — determines which side messages appear on.
 */
function MessageThread({ message, viewerRole, onReply, isReplying }) {
  const { i18n } = useTranslation()
  const dateFnsLocale = i18n.language === 'ar' ? ar : fr
  const [body, setBody] = useState('')

  if (!message) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!body.trim()) return
    onReply(body.trim())
    setBody('')
  }

  const bubbles = [
    { role: 'buyer', body: message.message, created_at: message.created_at, isOriginal: true },
    ...(message.replies || [])
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-100 pb-4 mb-4">
        <h2 className="font-semibold text-gray-900">{message.subject}</h2>
        <p className="text-sm text-gray-500">
          {message.buyer_email} {message.buyer_phone && `· ${message.buyer_phone}`}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto mb-4">
        {bubbles.map((b, idx) => {
          const isMine = b.role === viewerRole || b.sender_role === viewerRole
          return (
            <div key={idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                isMine ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}>
                <p className="text-sm whitespace-pre-line">{b.body}</p>
                <p className={`text-xs mt-1 ${isMine ? 'text-white/70' : 'text-gray-400'}`}>
                  {b.created_at && format(new Date(b.created_at), 'dd MMM à HH:mm', { locale: dateFnsLocale })}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t border-gray-100">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Écrire une réponse..."
          rows={2}
          className="input flex-1 resize-none"
        />
        <button
          type="submit"
          disabled={isReplying || !body.trim()}
          className="btn-primary self-end disabled:opacity-50"
        >
          <FiSend className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}

export default MessageThread
