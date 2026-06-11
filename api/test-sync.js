// Smoke test: login → 2 clientes Yjs autenticados editam a mesma página → convergem.
// Uso: node api/test-sync.js (servidor rodando na porta 4000)
const Y = require('yjs')
const { WebsocketProvider } = require('y-websocket')
const WebSocket = require('ws')

const BASE = 'http://localhost:4000'

;(async () => {
  // garante uma conta de teste e pega o token
  const creds = { name: 'Robô de Teste', email: 'teste-sync@documente.dev', password: 'senha123' }
  let res = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds)
  })
  if (res.status === 409) {
    res = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds)
    })
  }
  const { token } = await res.json()

  // cria uma página para o teste
  const pageRes = await fetch(BASE + '/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: 'Página de teste de sync' })
  })
  const { page } = await pageRes.json()
  const room = 'page-' + page.id

  const mkClient = () => {
    const doc = new Y.Doc()
    const provider = new WebsocketProvider('ws://localhost:4000/collab', room, doc, {
      WebSocket, params: { token }
    })
    return { doc, provider }
  }

  const a = mkClient()
  const b = mkClient()
  const synced = (c) => new Promise((res) => c.provider.on('sync', res))
  await Promise.all([synced(a), synced(b)])

  a.doc.getText('content').insert(0, 'Olá do cliente A. ')
  b.doc.getText('content').insert(0, 'Oi do cliente B! ')
  await new Promise((r) => setTimeout(r, 1500))

  const ta = a.doc.getText('content').toString()
  const tb = b.doc.getText('content').toString()
  console.log('A vê:', JSON.stringify(ta))
  console.log('B vê:', JSON.stringify(tb))
  const ok = ta === tb && ta.includes('cliente A') && ta.includes('cliente B')
  console.log(ok ? '✅ SYNC OK — os dois clientes convergiram' : '❌ FALHA na sincronização')

  // espera o save com debounce e confere o markdown exportado
  await new Promise((r) => setTimeout(r, 2000))
  const md = await fetch(`${BASE}/api/pages/${page.id}/export`, {
    headers: { Authorization: 'Bearer ' + token }
  }).then((r) => r.text())
  console.log('--- export .md ---')
  console.log(md)

  // limpa a página de teste
  await fetch(`${BASE}/api/pages/${page.id}`, {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
  })

  a.provider.destroy(); b.provider.destroy()
  process.exit(ok ? 0 : 1)
})()
