# documente

Sistema de documentação colaborativa em tempo real, estilo Confluence: contas com login, páginas hierárquicas, edição simultânea via WebSocket e exportação em Markdown.

## Estrutura (monorepo npm workspaces)

```
documente/
├── api/   — Express + WebSocket (Yjs) + Prisma + autenticação JWT
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.js   — servidor HTTP/WS, rotas e upgrade autenticado
│       ├── auth.js    — registro, login, JWT (cookie httpOnly + Bearer)
│       ├── pages.js   — CRUD de páginas + export .md
│       ├── collab.js  — sync Yjs + persistência (CRDT + Markdown) no banco
│       └── events.js  — broadcast de mudanças na árvore de páginas
└── app/   — frontend
    ├── public/
    │   ├── index.html — landing page
    │   ├── login.html — login / criar conta
    │   └── app.html   — editor colaborativo
    └── src/main.js    — app do editor (Quill + Yjs)
```

## Como rodar

```bash
npm install
npm run db:push   # cria/atualiza o banco (SQLite por padrão)
npm run dev       # build do frontend + inicia o servidor
```

Abra http://localhost:4000 (porta configurável em `api/.env`):

- `/` — landing page
- `/login` — entrar / criar conta
- `/app` — editor (exige login)

## Escolhendo o banco de dados (Prisma)

Padrão: **SQLite** (zero configuração, arquivo `api/prisma/dev.db`). Para trocar:

1. Em `api/prisma/schema.prisma`, mude `provider = "sqlite"` para `"postgresql"` ou `"mysql"`.
2. Em `api/.env`, ajuste a `DATABASE_URL` (exemplos em `api/.env.example`).
3. Rode `npm run db:push`.

`npm run db:studio` abre o Prisma Studio para inspecionar os dados.

## Markdown

- A cada edição, o conteúdo é salvo no banco em duas formas: snapshot CRDT (coluna `ydoc`, fonte da verdade da colaboração) e **Markdown** (coluna `markdown`, legível/pesquisável).
- O botão **⬇ Exportar .md** no editor (ou `GET /api/pages/:id/export`) baixa a página como arquivo Markdown sempre com o conteúdo mais recente.

## Autenticação

- Registro e login com e-mail/senha (hash bcrypt).
- Sessão via JWT em cookie `httpOnly` (30 dias); a API também aceita `Authorization: Bearer <token>`.
- As conexões WebSocket (conteúdo e eventos) são autenticadas no upgrade — sem token válido, conexão recusada (401).

## Tempo real

- **Yjs (CRDT)**: edições simultâneas convergem sem conflito; cursores remotos com nome/cor de cada usuário; Ctrl+Z desfaz só as próprias edições.
- Árvore de páginas sincronizada entre clientes via canal `/events`.

## Scripts

| Comando             | Descrição                                       |
|---------------------|-------------------------------------------------|
| `npm run dev`       | build do app + start da api                     |
| `npm run build`     | gera `app/public/bundle.js` / `bundle.css`      |
| `npm start`         | inicia a api (serve também o frontend)          |
| `npm run db:push`   | aplica o schema Prisma no banco                 |
| `npm run db:studio` | abre o Prisma Studio                            |
| `node api/test-sync.js` | smoke test: login + 2 clientes convergindo + export .md |

## Produção

- Defina `JWT_SECRET` forte em `api/.env`.
- Use PostgreSQL/MySQL (acima) para múltiplas instâncias/backup.
- Sirva atrás de HTTPS (o cookie e o WSS dependem disso para segurança real).
