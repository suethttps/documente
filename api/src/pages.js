const express = require('express')
const { prisma } = require('./db')
const { broadcast } = require('./events')
const { liveMarkdown } = require('./collab')

const router = express.Router()

const publicPage = (p) => ({
  id: p.id,
  title: p.title,
  parentId: p.parentId,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  author: p.author ? { id: p.author.id, name: p.author.name, color: p.author.color } : null
})

router.get('/', async (req, res) => {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: 'asc' },
    include: { author: true }
  })
  res.json({ pages: pages.map(publicPage) })
})

router.post('/', async (req, res) => {
  const { title = '', parentId = null } = req.body || {}
  if (parentId && !(await prisma.page.findUnique({ where: { id: parentId } }))) {
    return res.status(400).json({ error: 'Página pai não existe.' })
  }
  const page = await prisma.page.create({
    data: { title, parentId, authorId: req.user.id },
    include: { author: true }
  })
  broadcast({ type: 'pages-changed' })
  res.status(201).json({ page: publicPage(page) })
})

router.patch('/:id', async (req, res) => {
  const { title, parentId } = req.body || {}
  const data = {}
  if (title !== undefined) data.title = String(title)
  if (parentId !== undefined) data.parentId = parentId
  try {
    const page = await prisma.page.update({
      where: { id: req.params.id },
      data,
      include: { author: true }
    })
    broadcast({ type: 'pages-changed' })
    res.json({ page: publicPage(page) })
  } catch {
    res.status(404).json({ error: 'Página não encontrada.' })
  }
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params
  try {
    await prisma.$transaction(async (tx) => {
      // subpáginas sobem um nível
      const page = await tx.page.findUniqueOrThrow({ where: { id } })
      await tx.page.updateMany({ where: { parentId: id }, data: { parentId: page.parentId } })
      await tx.page.delete({ where: { id } })
    })
    broadcast({ type: 'pages-changed' })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Página não encontrada.' })
  }
})

// Exporta a página como arquivo .md (sempre com o conteúdo mais recente)
router.get('/:id/export', async (req, res) => {
  const page = await prisma.page.findUnique({ where: { id: req.params.id } })
  if (!page) return res.status(404).json({ error: 'Página não encontrada.' })

  const title = page.title || 'Sem título'
  const body = liveMarkdown(page.id, page.ydoc, page.markdown)
  const md = `# ${title}\n\n${body}`
  const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'pagina'

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${slug}.md"`)
  res.send(md)
})

module.exports = { router }
