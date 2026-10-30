import { useState } from 'react'
import { format } from 'date-fns'
import { fr, ar } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { FiSend } from 'react-icons/fi'
import RichTextarea, { RichText } from '../common/RichTextarea'
import { isRichTextEmpty } from '../../utils/richText'

/**
 * Renders a BuyerMessage thread (original message + replies) and a reply form.
 * `viewerRole` is 'buyer' or 'agent' — determines which side messages appear on.
 */
function MessageThread({ message, viewerRole, onReply, isReplying }) {
  const { t, i18n } = useTranslation(['common'])
  const dateFnsLocale = i18n.language === 'ar' ? ar : fr
  const [body, setBody] = useState('')

  if (!message) return null

  // Le champ est en texte riche : un éditeur vidé rend `<p><br></p>`, du HTML valide mais
  // sans contenu — `trim()` ne le verrait pas vide.
  const empty = isRichTextEmpty(body)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (empty) return
    onReply(body)
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
                {/* Les réponses sont saisies en texte riche ; le message d'origine est
                    antérieur à la bascule, et `RichText` remonte son texte brut en
                    paragraphes plutôt que d'aplatir ses sauts de ligne. */}
                <RichText html={b.body} className="text-sm" />
                <p className={`text-xs mt-1 ${isMine ? 'text-white/70' : 'text-gray-400'}`}>
                  {b.created_at && format(new Date(b.created_at), 'dd MMM à HH:mm', { locale: dateFnsLocale })}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t border-gray-100">
        <RichTextarea
          value={body}
          onChange={setBody}
          aria-label={t('common:messaging.replyPlaceholder')}
          placeholder={t('common:messaging.replyPlaceholder')}
          rows={2}
          className="min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={isReplying || empty}
          className="btn-primary self-end disabled:opacity-50"
        >
          <FiSend className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}

export default MessageThread
