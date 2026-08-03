import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { FiMail, FiMessageSquare } from 'react-icons/fi'
import { buyerService } from '../../services/buyerService'
import MessageThread from '../../components/messaging/MessageThread'

const STATUS_LABELS = {
  new: { label: 'Nouveau', class: 'bg-blue-100 text-blue-700' },
  read: { label: 'Lu', class: 'bg-gray-100 text-gray-600' },
  replied: { label: 'Répondu', class: 'bg-green-100 text-green-700' },
  archived: { label: 'Archivé', class: 'bg-gray-100 text-gray-500' }
}

function BuyerMessages() {
  const [selectedId, setSelectedId] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery('buyer-messages', () => buyerService.getMessages({ per_page: 50 }))

  const { data: threadData } = useQuery(
    ['buyer-message', selectedId],
    () => buyerService.getMessage(selectedId),
    { enabled: !!selectedId }
  )

  const replyMutation = useMutation(
    (body) => buyerService.replyToMessage(selectedId, body),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['buyer-message', selectedId])
        queryClient.invalidateQueries('buyer-messages')
      }
    }
  )

  const messages = data?.messages || []

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">Mes messages</h1>
        <p className="text-gray-600">Vos échanges avec les agences et propriétaires</p>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-64 bg-gray-200 rounded-xl"></div>
      ) : messages.length === 0 ? (
        <div className="card p-12 text-center">
          <FiMail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">Aucun message pour le moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 card p-0 overflow-hidden" style={{ minHeight: '500px' }}>
          {/* List */}
          <div className="md:col-span-1 border-r border-gray-100 max-h-[600px] overflow-y-auto">
            {messages.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 ${
                  selectedId === m.id ? 'bg-primary-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 truncate">{m.subject}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${STATUS_LABELS[m.status]?.class}`}>
                    {STATUS_LABELS[m.status]?.label}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate">{m.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {format(new Date(m.created_at), 'dd MMM yyyy', { locale: fr })}
                </p>
              </button>
            ))}
          </div>

          {/* Thread */}
          <div className="md:col-span-2 p-6">
            {threadData?.message ? (
              <MessageThread
                message={threadData.message}
                viewerRole="buyer"
                onReply={(body) => replyMutation.mutate(body)}
                isReplying={replyMutation.isLoading}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <FiMessageSquare className="w-10 h-10 mx-auto mb-2" />
                  <p>Sélectionnez un message pour voir la conversation</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BuyerMessages
