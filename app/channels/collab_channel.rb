# Sincronização Yjs (CRDT) via ActionCable.
#
# O servidor não interpreta o CRDT — apenas retransmite updates (base64)
# entre os clientes da mesma página e persiste o snapshot + Markdown que os
# clientes enviam com debounce. Como updates Yjs são idempotentes e
# comutativos, reaplicar estado completo é seguro e tudo converge.
#
# Mensagens (campo "type"):
#   sync      → estado completo do documento (servidor→cliente ao entrar,
#               ou peer→peer em resposta a "joined")
#   joined    → alguém entrou; peers respondem reenviando estado + awareness
#   update    → update incremental do documento
#   awareness → cursores/presença (protocolo de awareness do Yjs)
#
# Cada cliente manda um client_id aleatório nos params; os broadcasts levam
# "from" para o remetente ignorar as próprias mensagens.
class CollabChannel < ApplicationCable::Channel
  def subscribed
    @page = Page.find_by(id: params[:page_id])
    return reject unless @page

    stream_for @page
    # Cliente novo parte do conteúdo persistido…
    transmit({ type: "sync", update: Base64.strict_encode64(@page.ydoc) }) if @page.ydoc.present?
    # …e os peers reenviam o que ainda não foi salvo.
    relay({ type: "joined" })
  end

  def update(data)
    relay({ type: "update", update: data["update"] })
  end

  def awareness(data)
    relay({ type: "awareness", update: data["update"] })
  end

  def sync(data)
    relay({ type: "sync", update: data["update"] })
  end

  # Persistência (debounced no cliente): snapshot CRDT + Markdown legível.
  def save(data)
    return unless @page
    @page.update(ydoc: Base64.decode64(data["update"].to_s), markdown: data["markdown"].to_s)
  rescue ActiveRecord::ActiveRecordError
    # página excluída enquanto o doc ainda estava aberto — ignora
  end

  private
    def relay(message)
      self.class.broadcast_to(@page, message.merge(from: params[:client_id]))
    end
end
