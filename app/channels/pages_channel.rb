# Canal de eventos da árvore de páginas: avisa os clientes que algo mudou
# (criação/renomeio/exclusão/edição) — cada cliente refaz o GET /pages.
class PagesChannel < ApplicationCable::Channel
  def subscribed
    stream_from "pages"
  end
end
