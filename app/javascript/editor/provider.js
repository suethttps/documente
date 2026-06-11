// Provider Yjs sobre ActionCable (substitui o y-websocket).
//
// O servidor (CollabChannel) é um relay burro: retransmite updates em base64
// entre os clientes da mesma página e persiste snapshot+markdown enviados
// com debounce. Como updates Yjs são idempotentes/comutativos, reenviar o
// estado completo quando alguém entra garante convergência.
import { Y, awarenessProtocol } from "editor-deps"
import { createConsumer } from "@rails/actioncable"

const consumer = createConsumer()

const SAVE_DEBOUNCE_MS = 1000

// base64 ↔ Uint8Array (em blocos para não estourar a pilha em docs grandes)
function encode (u8) {
  let bin = ""
  for (let i = 0; i < u8.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}
const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export class CableProvider {
  // getMarkdown: callback que devolve o conteúdo atual em Markdown (persistido junto).
  constructor (pageId, doc, { getMarkdown } = {}) {
    this.doc = doc
    this.awareness = new awarenessProtocol.Awareness(doc)
    this.clientId = crypto.randomUUID()
    this.getMarkdown = getMarkdown
    this.onStatus = () => {}
    this._saveTimer = null
    this._destroyed = false

    this._onDocUpdate = (update, origin) => {
      if (origin === this) return // veio da rede — não devolve nem re-salva
      this._perform("update", { update: encode(update) })
      this._scheduleSave()
    }
    this._onAwarenessUpdate = ({ added, updated, removed }) => {
      const ids = added.concat(updated, removed)
      this._perform("awareness", {
        update: encode(awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids))
      })
    }
    doc.on("update", this._onDocUpdate)
    this.awareness.on("update", this._onAwarenessUpdate)

    this.subscription = consumer.subscriptions.create(
      { channel: "CollabChannel", page_id: pageId, client_id: this.clientId },
      {
        connected: () => { this.onStatus(true) },
        disconnected: () => { this.onStatus(false) },
        rejected: () => { this.onStatus(false) },
        received: (data) => this._received(data)
      }
    )
  }

  _received (data) {
    if (this._destroyed || data.from === this.clientId) return
    switch (data.type) {
      case "sync": // estado completo (do servidor ao entrar, ou de um peer)
      case "update": // update incremental de um peer
        if (data.update) Y.applyUpdate(this.doc, decode(data.update), this)
        break
      case "joined": // alguém entrou: reenvia estado completo + presença
        this._perform("sync", { update: encode(Y.encodeStateAsUpdate(this.doc)) })
        this._broadcastOwnAwareness()
        break
      case "awareness":
        if (data.update) awarenessProtocol.applyAwarenessUpdate(this.awareness, decode(data.update), this)
        break
    }
  }

  _broadcastOwnAwareness () {
    if (this.awareness.getLocalState() === null) return
    this._perform("awareness", {
      update: encode(awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]))
    })
  }

  _perform (action, payload) {
    this.subscription.perform(action, payload)
  }

  _scheduleSave () {
    clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => this._save(), SAVE_DEBOUNCE_MS)
  }

  _save () {
    clearTimeout(this._saveTimer)
    this._saveTimer = null
    this._perform("save", {
      update: encode(Y.encodeStateAsUpdate(this.doc)),
      markdown: this.getMarkdown ? this.getMarkdown() : ""
    })
  }

  destroy () {
    if (this._destroyed) return
    this._destroyed = true
    if (this._saveTimer) this._save() // não perde a última edição
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy")
    this.doc.off("update", this._onDocUpdate)
    this.awareness.off("update", this._onAwarenessUpdate)
    this.awareness.destroy()
    this.subscription.unsubscribe()
  }
}

// Canal de eventos da árvore de páginas.
export function subscribePagesChannel (onChange) {
  return consumer.subscriptions.create({ channel: "PagesChannel" }, {
    received: (data) => { if (data.type === "pages-changed") onChange() }
  })
}
