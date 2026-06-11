require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const http = require('http')
const path = require('path')
const express = require('express')
const cookieParser = require('cookie-parser')
const WebSocket = require('ws')

const { router: authRouter, requireAuth, verifyToken } = require('./auth')
const { router: pagesRouter } = require('./pages')
const { handleCollabConnection } = require('./collab')
const events = require('./events')

const PORT = process.env.PORT || 3000
const APP_DIR = path.join(__dirname, '../../app/public')

const app = express()
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

// API
app.use('/api/auth', authRouter)
app.use('/api/pages', requireAuth, pagesRouter)

// Frontend: LP em /, login em /login, editor em /app
app.use(express.static(APP_DIR))
app.get('/login', (_req, res) => res.sendFile(path.join(APP_DIR, 'login.html')))
app.get('/app', (_req, res) => res.sendFile(path.join(APP_DIR, 'app.html')))

const server = http.createServer(app)
const wss = new WebSocket.Server({ noServer: true })

// ---------------------------------------------------------------------------
// WebSocket autenticado:
//   /collab/<sala>  → sincronização Yjs (conteúdo das páginas)
//   /events         → notificações de mudança na árvore de páginas
// ---------------------------------------------------------------------------
function parseCookies (header = '') {
  return Object.fromEntries(
    header.split(';').map((c) => {
      const i = c.indexOf('=')
      return i === -1 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())]
    })
  )
}

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  const token = url.searchParams.get('token') || parseCookies(req.headers.cookie).token
  const user = await verifyToken(token)
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (conn) => {
    if (url.pathname === '/events') {
      events.addClient(conn)
    } else if (url.pathname.startsWith('/collab/')) {
      handleCollabConnection(conn, req, decodeURIComponent(url.pathname.slice('/collab/'.length)))
    } else {
      conn.close()
    }
  })
})

server.listen(PORT, () => {
  console.log(`documente rodando em http://localhost:${PORT}`)
})
