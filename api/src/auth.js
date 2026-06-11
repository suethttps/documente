const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { prisma } = require('./db')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const TOKEN_TTL = '30d'
const COLORS = ['#e2483d', '#22a06b', '#0c66e4', '#8f7ee7', '#e56910', '#2898bd', '#ae4787', '#6a9a23']

const router = express.Router()

const sign = (user) => jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL })

const setCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  })
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, color: u.color })

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {}
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Nome, e-mail e senha (mínimo 6 caracteres) são obrigatórios.' })
  }
  const exists = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (exists) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' })

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: await bcrypt.hash(password, 10),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    }
  })
  const token = sign(user)
  setCookie(res, token)
  res.json({ user: publicUser(user), token })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  const user = email && await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user || !(await bcrypt.compare(password || '', user.password))) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
  }
  const token = sign(user)
  setCookie(res, token)
  res.json({ user: publicUser(user), token })
})

router.post('/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

router.patch('/me', requireAuth, async (req, res) => {
  const { name } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'Nome inválido.' })
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { name: name.trim() } })
  res.json({ user: publicUser(user) })
})

// ---------------------------------------------------------------------------
// Middleware / verificação (também usada no upgrade do WebSocket)
// ---------------------------------------------------------------------------
function tokenFromRequest (req) {
  if (req.cookies?.token) return req.cookies.token
  const auth = req.headers?.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

async function verifyToken (token) {
  if (!token) return null
  try {
    const { sub } = jwt.verify(token, JWT_SECRET)
    return await prisma.user.findUnique({ where: { id: sub } })
  } catch {
    return null
  }
}

async function requireAuth (req, res, next) {
  const user = await verifyToken(tokenFromRequest(req))
  if (!user) return res.status(401).json({ error: 'Não autenticado.' })
  req.user = user
  next()
}

module.exports = { router, requireAuth, verifyToken }
