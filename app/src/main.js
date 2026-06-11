import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { QuillBinding } from 'y-quill'
import Quill from 'quill'
import QuillCursors from 'quill-cursors'
import 'quill/dist/quill.snow.css'

Quill.register('modules/cursors', QuillCursors)

const WS_BASE = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function api (path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  if (res.status === 401) {
    location.href = '/login'
    throw new Error('Não autenticado')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Erro inesperado')
  return data
}

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id)
const treeEl = $('page-tree')
const emptyEl = $('empty-state')
const containerEl = $('page-container')
const titleEl = $('page-title')
const pageMetaEl = $('page-meta')
const presenceEl = $('presence')
const statusDot = $('status-dot')
const statusText = $('status-text')
const userNameEl = $('user-name')
const userColorEl = $('user-color')

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let user = null
let pageList = [] // [{id,title,parentId,createdAt,updatedAt,author}]
let activePageId = null
let current = null // { id, doc, provider, binding, quill }

const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('pt-BR') : ''
const getPage = (id) => pageList.find((p) => p.id === id)

function setStatus (online) {
  statusDot.classList.toggle('online', online)
  statusText.textContent = online ? 'conectado' : 'reconectando…'
}

// ---------------------------------------------------------------------------
// Páginas (REST)
// ---------------------------------------------------------------------------
async function refreshPages () {
  const { pages } = await api('/pages')
  pageList = pages
  renderTree()
  if (activePageId) {
    const page = getPage(activePageId)
    if (!page) { location.hash = ''; return }
    syncTitleFromList()
  }
}

async function createPage (parentId = null) {
  const { page } = await api('/pages', { method: 'POST', body: { parentId } })
  await refreshPages()
  location.hash = '#/page/' + page.id
  setTimeout(() => titleEl.focus(), 50)
}

async function deletePage (id) {
  const page = getPage(id)
  if (!page) return
  if (!confirm(`Excluir a página "${page.title || 'Sem título'}"? Subpáginas serão movidas para o nível acima.`)) return
  await api('/pages/' + id, { method: 'DELETE' })
  if (activePageId === id) location.hash = ''
  await refreshPages()
}

// título: salva com debounce enquanto digita
let titleTimer = null
titleEl.addEventListener('input', () => {
  const page = getPage(activePageId)
  if (!page) return
  page.title = titleEl.value
  renderTree()
  clearTimeout(titleTimer)
  titleTimer = setTimeout(() => {
    api('/pages/' + activePageId, { method: 'PATCH', body: { title: titleEl.value } }).catch(() => {})
  }, 400)
})

function syncTitleFromList () {
  const page = getPage(activePageId)
  if (!page) return
  if (document.activeElement !== titleEl && titleEl.value !== page.title) titleEl.value = page.title
  pageMetaEl.textContent =
    `Criada em ${fmtDate(page.createdAt)}${page.author ? ' por ' + page.author.name : ''}` +
    ` · Última edição ${fmtDate(page.updatedAt)}`
}

// ---------------------------------------------------------------------------
// Árvore de páginas
// ---------------------------------------------------------------------------
function renderTree () {
  const byParent = new Map()
  for (const page of pageList) {
    const list = byParent.get(page.parentId || null) || []
    list.push(page)
    byParent.set(page.parentId || null, list)
  }

  const build = (parentId) => {
    const children = byParent.get(parentId) || []
    if (!children.length) return null
    const ul = document.createElement('div')
    if (parentId) ul.className = 'tree-children'
    for (const page of children) {
      const item = document.createElement('div')
      item.className = 'tree-item' + (page.id === activePageId ? ' active' : '')
      item.addEventListener('click', () => { location.hash = '#/page/' + page.id })

      const title = document.createElement('span')
      title.className = 'title'
      title.textContent = page.title || 'Sem título'

      const actions = document.createElement('span')
      actions.className = 'actions'

      const addBtn = document.createElement('button')
      addBtn.textContent = '+'
      addBtn.title = 'Criar subpágina'
      addBtn.addEventListener('click', (e) => { e.stopPropagation(); createPage(page.id) })

      const delBtn = document.createElement('button')
      delBtn.textContent = '✕'
      delBtn.title = 'Excluir página'
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); deletePage(page.id) })

      actions.append(addBtn, delBtn)
      item.append(title, actions)
      ul.append(item)

      const sub = build(page.id)
      if (sub) ul.append(sub)
    }
    return ul
  }

  treeEl.replaceChildren(build(null) || document.createTextNode(''))
}

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------
function renderPresence (awareness) {
  const states = [...awareness.getStates().values()]
  presenceEl.replaceChildren(...states
    .filter((s) => s.user)
    .map((s) => {
      const av = document.createElement('div')
      av.className = 'presence-avatar'
      av.style.background = s.user.color
      av.textContent = (s.user.name || '?').trim().charAt(0) || '?'
      av.title = s.user.name
      return av
    }))
}

// ---------------------------------------------------------------------------
// Abrir / fechar página
// ---------------------------------------------------------------------------
function closeCurrent () {
  if (!current) return
  current.binding.destroy()
  current.provider.destroy()
  current.doc.destroy()
  current = null
  $('editor').replaceChildren()
  document.querySelectorAll('.ql-toolbar').forEach((el) => el.remove())
}

function openPage (id) {
  closeCurrent()
  activePageId = id
  const page = getPage(id)
  if (!page) {
    emptyEl.hidden = false
    containerEl.hidden = true
    activePageId = null
    renderTree()
    return
  }

  emptyEl.hidden = true
  containerEl.hidden = false
  syncTitleFromList()

  const doc = new Y.Doc()
  const provider = new WebsocketProvider(WS_BASE + '/collab', 'page-' + id, doc)
  provider.awareness.setLocalStateField('user', { name: user.name, color: user.color })

  const quill = new Quill('#editor', {
    theme: 'snow',
    placeholder: 'Escreva algo incrível…',
    modules: {
      cursors: true,
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
        ['blockquote', 'code-block', 'link', 'image'],
        ['clean']
      ],
      history: { userOnly: true } // ctrl+z não desfaz edições dos outros
    }
  })

  const binding = new QuillBinding(doc.getText('content'), quill, provider.awareness)

  provider.awareness.on('change', () => renderPresence(provider.awareness))
  renderPresence(provider.awareness)
  provider.on('status', ({ status }) => setStatus(status === 'connected'))

  current = { id, doc, provider, binding, quill }
  renderTree()
}

// ---------------------------------------------------------------------------
// Eventos em tempo real da árvore (renomeio/criação/exclusão por colegas)
// ---------------------------------------------------------------------------
function connectEvents () {
  const ws = new WebSocket(WS_BASE + '/events')
  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data)
      if (event.type === 'pages-changed') refreshPages()
    } catch {}
  }
  ws.onclose = () => setTimeout(connectEvents, 2000)
}

// ---------------------------------------------------------------------------
// Roteamento por hash
// ---------------------------------------------------------------------------
function route () {
  const match = location.hash.match(/^#\/page\/(.+)$/)
  if (match) {
    openPage(match[1])
  } else {
    closeCurrent()
    activePageId = null
    emptyEl.hidden = false
    containerEl.hidden = true
    presenceEl.replaceChildren()
    renderTree()
  }
}

// ---------------------------------------------------------------------------
// Topbar: nome, logout, export
// ---------------------------------------------------------------------------
userNameEl.addEventListener('change', async () => {
  const name = userNameEl.value.trim()
  if (!name) { userNameEl.value = user.name; return }
  const data = await api('/auth/me', { method: 'PATCH', body: { name } })
  user = data.user
  if (current) current.provider.awareness.setLocalStateField('user', { name: user.name, color: user.color })
})

$('logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
  location.href = '/login'
})

$('export-md-btn').addEventListener('click', () => {
  if (activePageId) window.open('/api/pages/' + activePageId + '/export', '_blank')
})

$('new-page-btn').addEventListener('click', () => createPage(null))
window.addEventListener('hashchange', route)

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
;(async () => {
  const me = await api('/auth/me') // redireciona para /login se 401
  user = me.user
  userNameEl.value = user.name
  userColorEl.style.background = user.color

  await refreshPages()
  connectEvents()
  setStatus(true)
  route()
})()
