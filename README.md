# documente

Sistema de documentação colaborativa em tempo real, estilo Confluence: contas com login, páginas hierárquicas, edição simultânea via WebSocket (Yjs/CRDT) e exportação em Markdown.

**Monolito Ruby on Rails 8** — um único app serve a landing page, autenticação, API JSON, WebSocket (ActionCable) e o editor. Sem Node no deploy: o JavaScript vai por importmap + bundles vendorados.

## Stack

| Camada      | Tecnologia                                              |
|-------------|---------------------------------------------------------|
| Backend     | Rails 8.1 (Ruby 3.4), SQLite por padrão                 |
| Tempo real  | ActionCable (Solid Cable em produção) + Yjs (CRDT)      |
| Autenticação| `rails generate authentication` (sessões + bcrypt)      |
| Frontend    | Importmap + Propshaft, Quill 2, y-quill, quill-cursors  |
| Deploy      | Kamal + Docker (gerados pelo `rails new`) + Thruster    |

## Como rodar

```bash
bundle install
bin/rails db:prepare   # cria o banco e roda as migrations
bin/rails server       # http://localhost:3000
```

- `/` — landing page (parallax ✨)
- `/login` — entrar / criar conta
- `/app` — editor colaborativo (exige login)

## Estrutura

```
app/
├── models/            user.rb (nome+cor), page.rb (árvore + ydoc + markdown), session.rb
├── controllers/       sessions, registrations, passwords, profiles, pages (JSON), home, editor
├── channels/
│   ├── collab_channel.rb   — sync Yjs: relay de updates (base64) + persistência
│   └── pages_channel.rb    — broadcast "pages-changed" para a árvore ao vivo
├── views/
│   ├── home/index.html.erb — landing com parallax/reveal/tilt
│   ├── sessions/new        — login + criar conta (abas)
│   └── editor/show         — editor (Quill + Yjs)
├── javascript/
│   ├── editor.js           — app do editor
│   ├── editor/provider.js  — CableProvider: Yjs sobre ActionCable
│   └── landing.js          — parallax, tilt 3D e reveal-on-scroll
└── assets/
    ├── javascripts/quill-2.0.3.js   — build UMD do Quill (vendorado)
    └── stylesheets/                  — landing.css, editor.css, quill.snow.css

vendor/javascript/editor-deps.js — bundle ESM único: yjs + y-quill +
                                   y-protocols/awareness + quill-cursors +
                                   quill-delta-to-markdown
```

## Tempo real (como funciona)

- **CollabChannel** (`page_id`): o servidor é um *relay* — retransmite updates Yjs (base64) entre os clientes da mesma página. Como CRDTs são idempotentes/comutativos, quem entra recebe o snapshot do banco + o estado completo reenviado pelos peers, e tudo converge.
- **Persistência**: cada cliente salva (debounce de 1s) o snapshot CRDT (`pages.ydoc`) e o conteúdo convertido em **Markdown** (`pages.markdown`).
- **PagesChannel**: qualquer mudança em página dispara `pages-changed`; os clientes recarregam a árvore.
- Conexões WebSocket são autenticadas pelo cookie de sessão no `connect` — sem login, conexão recusada.

## Markdown

- Cada página guarda o conteúdo em duas formas: snapshot CRDT (fonte da verdade da colaboração) e Markdown (legível/pesquisável).
- **⬇ Exportar .md** no editor (ou `GET /pages/:id/export`) baixa a página como arquivo Markdown.

## Banco de dados

Padrão: **SQLite** (zero configuração — e é o caminho recomendado pelo Rails 8 até escala considerável). Para PostgreSQL/MySQL, ajuste `config/database.yml` e o `Gemfile` (`gem "pg"`), depois `bin/rails db:prepare`.

```bash
bin/rails db:prepare      # cria/migra
bin/rails db:migrate      # só migra
bin/rails console         # console
bin/rails dbconsole       # SQL direto
```

## Deploy (Kamal)

O `rails new` já gerou `Dockerfile` e `config/deploy.yml`. Para subir num servidor com Docker:

1. Edite `config/deploy.yml` (servidor, domínio, registry).
2. Configure `KAMAL_REGISTRY_PASSWORD` e `RAILS_MASTER_KEY` em `.kamal/secrets`.
3. `bin/kamal setup` (primeira vez) ou `bin/kamal deploy`.

TLS automático via Let's Encrypt (proxy do Kamal) — necessário para cookies seguros e WSS.

## Regenerar o bundle JS do editor (opcional)

Só é preciso se quiser atualizar as libs do editor (requer Node apenas nessa hora):

```bash
mkdir /tmp/depbundle && cd /tmp/depbundle
npm i yjs y-quill y-protocols quill-cursors quill-delta-to-markdown esbuild
cat > entry.js <<'EOF'
export * as Y from "yjs"
export { QuillBinding } from "y-quill"
export * as awarenessProtocol from "y-protocols/awareness"
export { default as QuillCursors } from "quill-cursors"
export { deltaToMarkdown } from "quill-delta-to-markdown"
EOF
npx esbuild entry.js --bundle --format=esm --minify --outfile=editor-deps.js
cp editor-deps.js <repo>/vendor/javascript/editor-deps.js
```
