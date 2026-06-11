// Canal WebSocket simples (/events) para avisar os clientes que a árvore de
// páginas mudou — cada cliente refaz o GET /api/pages ao receber o evento.
const clients = new Set()

function addClient (ws) {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
}

function broadcast (event) {
  const msg = JSON.stringify(event)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

module.exports = { addClient, broadcast }
