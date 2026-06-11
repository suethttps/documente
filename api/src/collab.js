// Sincronização Yjs via WebSocket (/collab/page-<id>) com persistência no
// banco via Prisma: snapshot CRDT (bytes) + conteúdo convertido para Markdown.
const Y = require('yjs')
const { setupWSConnection, setPersistence, docs } = require('y-websocket/bin/utils')
const { deltaToMarkdown } = require('quill-delta-to-markdown')
const { prisma } = require('./db')
const { broadcast } = require('./events')

const SAVE_DEBOUNCE_MS = 1000
const saveTimers = new Map()

const pageIdFromDoc = (docName) => docName.startsWith('page-') ? docName.slice(5) : null

function toMarkdown (ydoc) {
  try {
    return deltaToMarkdown(ydoc.getText('content').toDelta())
  } catch {
    return ''
  }
}

async function saveDoc (docName, ydoc) {
  const pageId = pageIdFromDoc(docName)
  if (!pageId) return
  const data = {
    ydoc: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
    markdown: toMarkdown(ydoc)
  }
  try {
    await prisma.page.update({ where: { id: pageId }, data })
    broadcast({ type: 'pages-changed' }) // updatedAt mudou
  } catch {
    // página excluída enquanto o doc ainda estava aberto — ignora
  }
}

function scheduleSave (docName, ydoc) {
  clearTimeout(saveTimers.get(docName))
  saveTimers.set(docName, setTimeout(() => {
    saveTimers.delete(docName)
    saveDoc(docName, ydoc)
  }, SAVE_DEBOUNCE_MS))
}

setPersistence({
  bindState: async (docName, ydoc) => {
    const pageId = pageIdFromDoc(docName)
    if (pageId) {
      const page = await prisma.page.findUnique({ where: { id: pageId }, select: { ydoc: true } })
      if (page?.ydoc?.length) Y.applyUpdate(ydoc, page.ydoc)
    }
    ydoc.on('update', () => scheduleSave(docName, ydoc))
  },
  writeState: async (docName, ydoc) => {
    clearTimeout(saveTimers.get(docName))
    saveTimers.delete(docName)
    await saveDoc(docName, ydoc)
  }
})

function handleCollabConnection (conn, req, docName) {
  setupWSConnection(conn, req, { docName })
}

// Markdown sempre fresco: usa o doc em memória se houver sessão aberta,
// senão reconstrói a partir do snapshot salvo no banco.
function liveMarkdown (pageId, storedBytes, storedMarkdown) {
  const docName = 'page-' + pageId
  if (docs.has(docName)) return toMarkdown(docs.get(docName))
  if (storedBytes?.length) {
    const tmp = new Y.Doc()
    Y.applyUpdate(tmp, storedBytes)
    const md = toMarkdown(tmp)
    tmp.destroy()
    return md
  }
  return storedMarkdown || ''
}

module.exports = { handleCollabConnection, liveMarkdown }
