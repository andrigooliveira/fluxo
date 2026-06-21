# Kastor — Gestão de Demandas de Marketing

Aplicação web multiusuário para gerenciar demandas, fluxos, projetos e horas
de equipes de marketing. SPA monolítico, sem build step obrigatório, com
persistência local (SQLite) e zero dependências externas em runtime além do
Node 22+.

Este README é para **desenvolvedores** que vão implementar features, corrigir
bugs ou fazer deploy. Para usuários finais, ver [`LEIA-ME.txt`](LEIA-ME.txt).

---

## Índice

1. [Quick start](#quick-start)
2. [Tech stack](#tech-stack)
3. [Estrutura do projeto](#estrutura-do-projeto)
4. [Arquitetura](#arquitetura)
5. [Modelo de dados](#modelo-de-dados)
6. [Referência da API](#referência-da-api)
7. [Frontend](#frontend)
8. [Autenticação e segurança](#autenticação-e-segurança)
9. [Persistência (SQLite)](#persistência-sqlite)
10. [Uploads e anexos](#uploads-e-anexos)
11. [E-mail (SMTP)](#e-mail-smtp)
12. [Discord webhooks](#discord-webhooks)
13. [Variáveis de ambiente](#variáveis-de-ambiente)
14. [Testes](#testes)
15. [Deploy](#deploy)
16. [Backup e recuperação](#backup-e-recuperação)
17. [Escala](#escala)
18. [Como fazer X (cookbook)](#como-fazer-x-cookbook)
19. [Convenções de código](#convenções-de-código)
20. [Limitações conhecidas e roadmap](#limitações-conhecidas-e-roadmap)

---

## Quick start

```bash
# Pré-requisito: Node.js 22.5+ (precisa do módulo node:sqlite built-in)
node --version    # esperado: v22.5+ ou v24+

# Instala dependências (só express, nodemailer, lucide)
npm install

# Sobe o servidor
npm start

# Abrir no navegador
# http://localhost:3000
# Login: admin  /  Senha: admin123  (trocar no primeiro acesso)
```

Rodar testes:

```bash
npm test    # 12 smoke tests, ~1s, usa node:test built-in
```

Sem mocha, jest, vitest, webpack, nem nada disso. Os scripts `[Função]
Iniciar.bat` e `[Função] Teste.bat` no Windows fazem o mesmo via duplo clique.

---

## Tech stack

| Camada | Tecnologia | Notas |
|---|---|---|
| Runtime | Node.js 22.5+ | Precisa de `node:sqlite` e `node:test` built-in |
| HTTP | Express 4 | Único framework de servidor |
| DB | SQLite via `node:sqlite` | Sem dep externa; WAL mode habilitado |
| Auth storage | scrypt + AES-256-GCM | Em `secure-store.js`, criptografa `data/auth.enc` |
| E-mail | Nodemailer (SMTP) | Opcional — sem SMTP nada quebra, só não envia |
| Frontend | HTML + CSS + JS vanilla | Sem framework; carregado direto, sem build |
| Ícones | Lucide (`public/vendor/lucide.min.js`) | Local, ~120KB |
| Testes | `node:test` | Built-in, sem dep |

Dependências em `package.json`: **3 produção** (express, nodemailer, lucide) +
**0 dev**. Tudo mais é built-in.

---

## Estrutura do projeto

```
.
├── server.js               # Express app — todas as rotas e lógica de negócio
├── db-store.js             # Camada de persistência SQLite
├── secure-store.js         # Credenciais (senha hash, tokens) criptografadas
├── package.json            # Scripts (start, test, build) + deps
├── package-lock.json
├── README.md               # Este arquivo (para devs)
├── LEIA-ME.txt             # Documentação para usuários finais (PT-BR)
│
├── data/                   # Tudo que persiste — não versionar
│   ├── kastor.db           # SQLite — entidades, notificações, resets
│   ├── kastor.db-wal       # WAL log do SQLite (gerado automaticamente)
│   ├── kastor.db-shm       # Shared memory do SQLite
│   ├── auth.enc            # Senhas + tokens (AES-256-GCM)
│   ├── secret.key          # Chave mestra do auth.enc (se FLUXO_SECRET não setada)
│   └── uploads/            # Anexos de demandas, avatares, imagens em comentários
│
├── public/                 # Servido como estático em /
│   ├── index.html          # SPA shell — login, app, modais, telas
│   ├── Kastor_branco.svg   # Logo (modo escuro)
│   ├── Kastor_preto.svg    # Logo (modo claro)
│   ├── css/style.css       # Estilos completos (~2600 linhas)
│   ├── js/app.js           # Frontend completo (~6000 linhas)
│   └── vendor/lucide.min.js
│
├── tests/
│   └── smoke.test.js       # 12 smoke tests cobrindo auth, persistência, headers
│
└── notes/
    └── MODULARIZATION.md   # Plano de refactor futuro do app.js
```

---

## Arquitetura

### Visão geral

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  index.html + style.css + app.js (vanilla JS, sem framework)   │ │
│  │   ├─ Router próprio (pushState, parseRoute, applyRoute)        │ │
│  │   ├─ Cache em memória: me, users, projects, flows, demands…    │ │
│  │   ├─ Auth via cookie httpOnly (kastor_session)                 │ │
│  │   └─ ⌘K palette, kanban DnD, calendar, modais, etc            │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                                  │ HTTP (cookie httpOnly)
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Node.js (server.js, Express)                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ Security mw    │  │ JSON parser    │  │ Routes /api/*          │ │
│  │ (CSP, HSTS…)   │  │ (sm/lg limits) │  │ (CRUD + funcionalidade)│ │
│  └────────────────┘  └────────────────┘  └────────────────────────┘ │
│           │                                            │              │
│           ▼                                            ▼              │
│  ┌──────────────────────────┐    ┌────────────────────────────────┐  │
│  │ secure-store.js          │    │ db-store.js                    │  │
│  │ - scrypt(pwd)            │    │ - SQLite (node:sqlite)         │  │
│  │ - AES-GCM(tokens)        │    │ - WAL mode                     │  │
│  │ - data/auth.enc          │    │ - data/kastor.db               │  │
│  └──────────────────────────┘    └────────────────────────────────┘  │
│                                            │                          │
│                                            ▼                          │
│                              ┌──────────────────────────────┐         │
│                              │ data/uploads/  (anexos)      │         │
│                              └──────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

### Por que essas escolhas

- **Sem framework de frontend**: o app foi nascendo orgânicamente. Vanilla JS
  é ágil em features e fácil de auditar. A dívida técnica está no monolito de
  `app.js` (~6000 linhas) — plano de migração em `notes/MODULARIZATION.md`.
- **SQLite, não Postgres**: a meta declarada é até 100 usuários simultâneos.
  SQLite + WAL aguenta isso tranquilamente, sem precisar provisionar e
  gerenciar um banco separado.
- **Auth com cookie httpOnly + SameSite=Lax**: JS no browser não pode ler o
  token. Mitiga a maioria dos vetores XSS.
- **Sem build step**: zero compilação pra produção. Sobe o `node server.js` e
  funciona. Esbuild está configurado mas é opcional (ver
  `notes/MODULARIZATION.md`).

### Ciclo de vida de uma request

1. **Browser** envia request com cookie `kastor_session` automaticamente
2. **Express middleware** aplica security headers (CSP, X-Frame-Options, etc)
3. **JSON parser** roteia entre `12mb` (uploads) ou `200kb` (resto)
4. **`requireAuth`** extrai token do cookie, valida em `secure-store`, anexa
   `req.user`. 401 se inválido
5. **Handler** lê/modifica o objeto `db` (cache em memória), chama
   `saveDB()` ou `store.upsert(type, entity)` pra persistir
6. **Dirty tracking** batches escritas: até 30ms depois, todas as entidades
   sujas são gravadas no SQLite numa transação
7. **Webhooks/e-mails** são disparados via `setImmediate` (não bloqueiam a
   resposta HTTP)

---

## Modelo de dados

Todas as entidades são objetos JS com `id` hex (12 chars). Persistidas no
SQLite como JSON na tabela `entities (type, id, workspace_id, data)`.

### Workspace
Espaço lógico. Usuários podem ter acesso a vários. Tudo embaixo (projeto, fluxo,
demanda, template, webhook) é escopo de UM workspace.

```js
{ id, name, color, createdAt }
```

### User
```js
{
  id, username, name, role, isAdmin: bool, active: bool,
  avatar: '/uploads/...' | null,
  email: 'foo@bar.com' | null,
  emailPrefs: { assigned, stage_assigned, mention },
  discordId: '123...' | null,
  workspaces: [wsId],       // arrays de ids
  lastSeen: ISO,             // presença
  savedViews: [...],         // legacy, não usado hoje
  createdAt
}
```

### Project
```js
{ id, workspaceId, name, client, color, avatar, active: bool, createdAt }
```

### Flow (fluxo de demanda)
Define as etapas que uma demanda atravessa.
```js
{
  id, workspaceId, projectId: id | null,  // null = geral do workspace
  name, demandType: string,
  stages: [
    { id, label, color, done: bool, responsibleId, deadlineDays }
  ],
  createdAt
}
```

### Demand
A entidade central. Vários sub-objetos viajam dentro dela.
```js
{
  id, workspaceId, projectId, flowId,
  name, description, briefing,
  ownerId, priority: 1..4,
  status: stageId,                    // etapa atual
  deadline: 'YYYY-MM-DD',             // prazo final
  stageDueDate: 'YYYY-MM-DD',         // prazo da etapa atual
  stageEnteredAt: ISO,
  completedAt: ISO | null,
  estimatedHours: number | null,
  kanbanOrder: number | null,         // ordem no kanban (float entre vizinhos)

  attachments: [ {id, kind, name, type, data, addedAt} ],
  // kind='link' → {url, name}
  // kind='file' → {data: '/uploads/...', name, type}

  comments: [
    { id, userId, text, createdAt, editedAt?, attachments: [...],
      reactions: {emoji: [userId]} }
  ],
  checklist: [ {id, text, done, byUser, at} ],
  timeEntries: [ {id, userId, stageId, hours, start, end, note, createdAt} ],
  history: [ {id, userId, action, details, at} ],
  stageHistory: [ {stageId, enteredAt, leftAt?, dueDate} ],

  // Customização por instância (vai além do fluxo padrão)
  skippedStages: [stageId],
  stageResponsibles: { stageId: userId | null },
  stageOrder: [stageId],
  stageLabels: { stageId: 'Novo nome' },

  // Recorrência
  recurrence: { enabled, pattern, weekDay, monthDay, endDate, lastGeneratedDate },

  createdAt
}
```

### Template
Demanda pré-configurada para clonagem rápida.
```js
{ id, workspaceId, name, description, projectId, flowId, estimatedHours, attachments, createdAt }
```

### Webhook
Integração com Discord/Slack/Make/n8n.
```js
{
  id, workspaceId, name, url, format: 'discord'|'json'|'slack',
  events: ['demand.created', ...],
  targetUserId: id | null,    // se setado, só dispara pra eventos relevantes ao alvo
  active: bool, lastError, createdAt
}
```

### Notification (tabela dedicada)
```js
{ id, userId, type, demandId, demandName, fromUser, stageName, commentText, read, createdAt }
```

### Password reset (tabela dedicada)
```js
{ token, userId, expiresAt, used, createdAt }
```

### Role
Função (cargo) atribuível a usuários. Apenas string label.
```js
{ id, name, createdAt }
```

---

## Referência da API

Base: `/api`. Todas as rotas (exceto `/login`, `/forgot-password`,
`/reset-password`, `/uploads` POST) exigem o cookie `kastor_session`.

### Auth

| Método | Path | Quem | Notas |
|---|---|---|---|
| POST | `/api/login` | público | Body `{username, password}`. Seta cookie httpOnly. Rate-limit 5/min/IP |
| POST | `/api/logout` | autenticado | Invalida o token + clears cookie |
| POST | `/api/forgot-password` | público | Body `{email}`. Envia e-mail de reset (se SMTP). Sempre 200 |
| POST | `/api/reset-password` | público | Body `{token, newPassword}`. Token expira em 1h |
| GET  | `/api/me` | autenticado | Devolve dados do usuário corrente |
| PUT  | `/api/me` | autenticado | Atualiza nome, role, avatar, password (current+new), discordId, email, emailPrefs |
| POST | `/api/me/ping` | autenticado | Atualiza `lastSeen`. Chamado a cada 60s pelo cliente |
| POST | `/api/me/email/test` | autenticado | Envia e-mail de teste |

### Uploads

| Método | Path | Quem | Notas |
|---|---|---|---|
| POST | `/api/uploads` | autenticado | Body `{name, data: 'data:...;base64,...'}`. Devolve `{url}`. Max 10MB |
| GET  | `/uploads/<file>` | autenticado | Serve binários (anexos, avatares) |

### CRUD por entidade

Padrão consistente:
- `GET /api/<resource>` → lista do(s) workspace(s) acessíveis
- `POST /api/<resource>` → cria
- `PUT /api/<resource>/:id` → atualiza (parcial; só campos enviados)
- `DELETE /api/<resource>/:id` → remove

| Resource | Quem cria/edita | Notas |
|---|---|---|
| `workspaces` | admin | |
| `users` | admin | password é argumento separado |
| `roles` | admin | string label |
| `templates` | qualquer | escopo do workspace |
| `projects` | qualquer | |
| `flows` | admin | tem `stages` aninhados |
| `demands` | qualquer | maior payload — ver seção abaixo |
| `webhooks` | admin | |

### Demandas (rotas adicionais)

| Método | Path | Notas |
|---|---|---|
| POST | `/api/demands/bulk` | Body `{ids: [...], op: 'setOwner'\|'setStatus'\|'setPriority'\|'delete', data}` |
| PUT  | `/api/demands/:id/skipped-stages` | Customização por instância (skip, responsável, ordem, labels) |
| POST | `/api/demands/:id/time` | Adiciona apontamento de horas |
| PUT  | `/api/demands/:id/time/:entryId` | Edita apontamento |
| DELETE | `/api/demands/:id/time/:entryId` | Remove apontamento |
| POST | `/api/demands/:id/comment` | Adiciona comentário (suporta mentions `@user` + attachments) |
| PUT  | `/api/demands/:id/comment/:cid` | Edita |
| DELETE | `/api/demands/:id/comment/:cid` | Remove |
| POST | `/api/demands/:id/comment/:cid/react` | Body `{emoji}` |
| POST | `/api/demands/:id/checklist` | Body `{text}` |
| PUT  | `/api/demands/:id/checklist/:itemId` | Body `{text?, done?}` |
| DELETE | `/api/demands/:id/checklist/:itemId` | |

### Notificações

| Método | Path | Notas |
|---|---|---|
| GET | `/api/notifications` | Últimas 100 do usuário, ordenadas desc por data |
| PUT | `/api/notifications/:id/read` | Marca uma como lida |
| PUT | `/api/notifications/read-all` | Marca todas do usuário |

### Outros

| Método | Path | Notas |
|---|---|---|
| GET | `/api/metrics/sla` | Estatísticas SLA por etapa/tipo |
| POST | `/api/webhooks/:id/test` | Dispara um payload de teste |

### Erros padrão

- `200`/`201` sucesso
- `400` request inválida (com `{error: 'descrição'}`)
- `401` não autenticado (cookie inválido/expirado)
- `403` sem permissão (não-admin tentando rota admin)
- `404` não encontrado (com `{error}`)
- `409` conflito (ex.: username duplicado)
- `413` payload muito grande
- `429` rate limit (com header `Retry-After`)
- `503` serviço indisponível (ex.: SMTP não configurado)

`/api/*` desconhecido devolve **404 JSON** (não HTML do SPA).

---

## Frontend

### SPA shell

`public/index.html` carrega:
1. Google Fonts (Inter)
2. `css/style.css`
3. `vendor/lucide.min.js` (ícones)
4. `js/app.js` no final, com `boot()` chamado automaticamente

Todas as "páginas" são `<div class="page" id="page-X">` no mesmo HTML —
`goPage(name)` só esconde/mostra com `.active`.

### Router (`app.js` topo)

URLs canônicas (todas em inglês):

| Path | Ação |
|---|---|
| `/dashboard` | dashboard |
| `/demands` | lista de demandas |
| `/my-demands` | minhas demandas |
| `/capacity` | capacidade da equipe |
| `/projects` | projetos |
| `/flows` | fluxos (admin) |
| `/templates` | templates |
| `/users` | usuários (admin) |
| `/workspaces` | workspaces (admin) |
| `/integrations` | webhooks (admin) |
| `/profile` | perfil |
| `/demands/new` | modal nova demanda |
| `/demands/<id>` | modal detalhe |
| `/demands/<id>/edit` | modal editar |
| `/projects/<id>` | modal editar |
| `/flows/<id>` | modal editar |
| `/users/<id>` | modal editar |
| `/integrations/webhooks/<id>` | modal editar |
| `/reset/<token>` | tela pública de redefinir senha |

`navPush(path)` / `navReplace(path)` escrevem na URL via History API.
`popstate` listener chama `applyRoute()` que reaplica o estado (página +
modal) silenciosamente.

### Estado global

Variáveis `let` em `app.js`:
- `me` — usuário logado
- `users`, `workspaces`, `projects`, `flows`, `demands`, `roles`, `templates`, `webhooks` — cache de listas
- `activeWs` — workspace selecionado
- `currentPage` — página visível
- `notifications` — cache das últimas 50

Tudo é **mutável global**. Isso vai ter que mudar quando modularizar (ver
`notes/MODULARIZATION.md`).

### Padrões de renderização

Templates são strings com `${esc(value)}` — escape manual. **Toda
interpolação de conteúdo de usuário deve passar por `esc()`** ou
equivalente. O server confia no frontend pra escapar.

Re-render acontece em chamadas explícitas (`renderList()`, `renderKanban()`,
etc). Sem reatividade. Mudanças locais que viraram remotas seguem o padrão
otimista:

```js
const prev = entity.field;
entity.field = newValue;       // muda local
renderList();                   // visual já reflete
try {
  const upd = await api(...);
  patchDemand(upd);
} catch (e) {
  entity.field = prev;          // rollback
  renderList();
  toast(e.message, 'error');
}
```

### Atalhos de teclado

| Tecla | Ação |
|---|---|
| `⌘/Ctrl + K` | Paleta de comandos |
| `?` | Cheatsheet de atalhos |
| `/` | Focar campo de busca |
| `n` | Nova demanda |
| `g d/l/m/c/p` | Ir para Dashboard/Lista/Mine/Capacity/Projetos |
| `Esc` | Fechar modal/painel/menu mobile |

### Modo focar (zen)

Botão no topbar esconde sidebar+topbar, salva preferência em
`localStorage['kastor-zen']`.

---

## Autenticação e segurança

### Auth flow

1. Cliente faz `POST /api/login {username, password}`
2. Server valida senha (scrypt+timing-safe) via `secure-store`
3. Gera token aleatório (24 bytes hex) com `expiresAt = now + 30d`
4. Token salvo em `data/auth.enc` (criptografado)
5. Server responde 200 + `Set-Cookie: kastor_session=<token>; HttpOnly; SameSite=Lax; Max-Age=30d`
6. Browser passa cookie automaticamente nas próximas requests
7. `requireAuth` lê o cookie, valida via `secure-store.userIdForToken`, anexa `req.user`

### Senha esquecida

`/api/forgot-password` → token aleatório em `password_resets` (TTL 1h) +
e-mail com link `/reset/<token>`. Cliente abre URL → tela de senha nova
→ `/api/reset-password` valida e troca. Sessões existentes do usuário são
invalidadas.

### Mitigations implementadas

| Vetor | Proteção |
|---|---|
| XSS rouba token | Cookie `HttpOnly` (JS não lê) |
| CSRF | `SameSite=Lax` no cookie (request cross-site não envia) |
| Clickjacking | Header `X-Frame-Options: SAMEORIGIN` |
| MIME confusion | `X-Content-Type-Options: nosniff` |
| Inline script injection | CSP define `default-src 'self'`, `script-src 'self' 'unsafe-inline'` |
| Brute force login | Rate limit 5 falhas/min/IP, com `Retry-After` |
| Timing attack na senha | `crypto.timingSafeEqual` no `verifyPassword` |
| Token de reset reutilizado | Marcado `used` na primeira validação |
| Eternal session | TTL configurável (`KASTOR_SESSION_DAYS`, padrão 30) |
| Acesso a `/uploads` sem auth | Express static atrás de `requireAuth` |

### Não implementado (assumir como TODO)

- CSP `'unsafe-inline'` no script é necessário enquanto houver `onclick=`
  inline. Resolver quando modularizar.
- 2FA não implementado.
- Audit log apenas no nível da demanda (`d.history`); não há log central.
- Não há helmet ou similar (escolha consciente — middleware caseiro
  cobre o essencial sem dep).

---

## Persistência (SQLite)

Implementada em [`db-store.js`](db-store.js). Usa `node:sqlite` (built-in
no Node 22.5+, no Node 24 estável).

### Schema

```sql
-- Entidades de domínio (workspaces, users, projects, flows, demands, roles,
-- templates, webhooks). Hot path de leitura é workspace_id, daí o índice.
CREATE TABLE entities (
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  workspace_id TEXT,    -- NULL para entidades globais (workspaces, users, roles)
  data TEXT NOT NULL,   -- JSON da entidade inteira
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (type, id)
);
CREATE INDEX idx_entities_type_ws ON entities (type, workspace_id);

-- Notificações têm escrita frequente e leitura por usuário — tabela dedicada
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,   -- JSON da notificação
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notif_user_created ON notifications (user_id, created_at DESC);

-- Tokens de reset de senha (TTL 1h, single-use)
CREATE TABLE password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- KV simples (versão de schema, flags futuras)
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT);
```

PRAGMAs aplicados:
- `journal_mode = WAL` → leituras concorrentes com escritas
- `synchronous = NORMAL` → durabilidade boa com fsync menos frequente

### API

```js
const { createStore, ENTITY_TYPES } = require('./db-store');
const store = createStore(DATA_DIR);

// CRUD de entidades
store.upsert('demands', demandObj);
store.remove('demands', id);
store.get('demands', id);
store.listByType('demands');
store.listByWorkspace('demands', wsId);

// Batch importer (migração de db.json)
store.importJson(legacyJson);

// Notificações
store.insertNotification(n);
store.listNotificationsFor(userId, limit=100);
store.markNotificationRead(id);
store.markAllNotificationsReadFor(userId);
store.trimNotificationsFor(userId, keepCount);

// Resets
store.insertReset(rec);
store.getReset(token);
store.markResetUsed(token);
store.cleanupResets();
```

### Como funciona o dirty tracking

`server.js` mantém um cache em memória `db.users`, `db.demands`, etc
(carregado no boot via `store.loadAllToCache()`). Mutações ainda manipulam
esses arrays diretamente (compat com código existente). Cada chamada a
`saveDB()` marca **todas** as entidades como sujas; `saveEntity(type, e)` /
`removeEntity(type, id)` marcam **uma**.

Um `setTimeout(30ms)` agrupa as escritas em uma única transação SQLite.
Resultado: 10 mutações em sequência viram 1 transação com 10 upserts.

### Migração automática

Se `data/db.json` (formato antigo) existir e o SQLite estiver vazio, o boot:

1. Lê o JSON, chama `store.importJson(data)`
2. Renomeia `db.json` → `db.json.migrated-<timestamp>.bak`
3. Extrai anexos/avatares em base64 dentro das entidades pra `data/uploads/`
   (`extractInlineBase64()`)

Idempotente — rodar de novo não faz nada.

---

## Uploads e anexos

### Por que arquivos em disco e não no DB

Em base64 dentro do JSON: cada 1MB de imagem vira ~1.3MB de texto. Com 50
demandas × 5 prints, o `db.json` antigo passava de 300MB. Cada save reescrevia
tudo.

Solução: arquivos binários em `data/uploads/`, referenciados por URL.

### Fluxo de upload (idealizado)

1. Cliente: `POST /api/uploads {name, data: 'data:image/png;base64,...'}`
2. Server: valida MIME e tamanho (max 10MB), decodifica base64, escreve
   `data/uploads/<uid>-<safename>`
3. Server: devolve `{url: '/uploads/<file>', name, type, size}`
4. Cliente: envia esse `url` (não mais base64) nos payloads subsequentes
   (criar demanda, atualizar avatar, etc)

### Fluxo de upload (atual, em transição)

O frontend ainda envia base64 direto nos PUTs de demand/me/projects. O
**server detecta e extrai automaticamente** (`saveUploadFromDataUri`
chamado no `sanitizeAttachments` e nos avatares). Vantagem: não quebra
nada. Desvantagem: ainda gasta banda extra na request.

Para otimizar: migrar handlers do frontend pra usar `/api/uploads` antes
de submeter o form. Procurar por `handleAvatarUpload`, `readFilesAsBase64`,
`processDroppedFiles`.

### Serve

```js
app.use('/uploads', requireAuth, express.static(UPLOADS_DIR, {
  index: false, dotfiles: 'deny'
}));
```

Acesso direto via `<img src="/uploads/...">` — o browser envia o cookie
automaticamente, server valida via `requireAuth`.

---

## E-mail (SMTP)

Implementado em `server.js` via `nodemailer`. Configuração 100% por env vars
— se não definidas, o sistema funciona sem enviar e-mails (silently).

Variáveis (todas opcionais):

| Var | Default | Notas |
|---|---|---|
| `SMTP_HOST` | — | obrigatória pra ativar |
| `SMTP_USER` | — | obrigatória |
| `SMTP_PASS` | — | obrigatória; pra Gmail, use App Password |
| `SMTP_PORT` | 587 | use 465 pra SSL puro |
| `SMTP_SECURE` | auto | `true` força SSL |
| `SMTP_FROM` | `SMTP_USER` | nome do remetente (`Kastor <noreply@x.com>`) |

Provedores conhecidos:
- **Gmail**: `smtp.gmail.com:587`, senha = App Password (2FA + Senhas de app)
- **Outlook 365**: `smtp.office365.com:587`
- **Resend**: `smtp.resend.com:587`, USER=`resend`, PASS=API key
- **Mailgun**: `smtp.mailgun.org:587`

### Eventos que disparam e-mail

Por padrão (`emailPrefs` no perfil controla):
- `assigned` → atribuído como responsável
- `stage_assigned` → virou responsável por auto-atribuição de etapa
- `mention` → mencionado em comentário com `@usuario`

E também o reset de senha (sempre).

---

## Discord webhooks

Configurados em **Integrações** (admin). Mandam embeds estilizados para
canais do Discord quando eventos acontecem.

Eventos disponíveis (ver `WEBHOOK_EVENT_LABELS` em `server.js`):
- `demand.created`, `demand.completed`, `demand.stage_changed`,
- `demand.assigned`, `demand.stage_assigned`, `demand.deadline_changed`,
- `demand.priority_changed`, `comment.added`, `comment.mention`

Cada webhook tem opcionalmente `targetUserId` — só dispara se o evento
**afetar aquele usuário** (filtrado por `eventRelevantToTarget`). Útil pra
mandar pra DM da pessoa em vez de canal do time.

### Menções no Discord

Se o usuário tem `discordId` setado no perfil, embeds incluem `<@id>` no
campo `content` + `allowed_mentions: {users: [id]}` — Discord pinga de
verdade.

### Link da demanda

URLs nas notificações usam `PUBLIC_URL` (env) se setada, ou caem para o
host da request original. Em deploy atrás de proxy, **setar `PUBLIC_URL`**
é necessário pra links funcionarem fora da rede local.

---

## Variáveis de ambiente

| Var | Default | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do server |
| `PUBLIC_URL` | host da request | URL pública (para links em e-mails/Discord) |
| `KASTOR_DATA_DIR` | `./data` | Diretório dos dados (usado em testes/prod) |
| `KASTOR_SESSION_DAYS` | `30` | TTL do token de sessão (dias) |
| `FLUXO_SECRET` | gerada e salva | Chave-mestra do `auth.enc` |
| `SMTP_HOST/USER/PASS/PORT/SECURE/FROM` | — | Configuração SMTP (opcional) |

`FLUXO_SECRET`: se ausente, server gera uma e salva em `data/secret.key`.
**Em produção**, setar pra um valor estável — se perder o `secret.key`,
ninguém consegue logar (precisaria resetar senhas todas).

---

## Testes

```bash
npm test
```

Sem dependências de teste. Usa `node:test` + `node:assert/strict` built-in.
12 smoke tests cobrindo:

- GET / serve HTML
- Headers de segurança presentes (CSP, X-Frame, etc)
- `/api/inexistente` devolve 404 JSON
- `/api/me` sem auth → 401
- Login OK → cookie httpOnly setado
- Login errado → 401
- `/api/me` com cookie → user data
- Logout invalida cookie
- Criar projeto e ler de volta (persistência)
- Upload base64 → URL + GET do arquivo
- `/uploads/*` sem auth → 401
- Rate limit: 6ª tentativa errada → 429

Cada test run usa um `tmpdir` isolado (`KASTOR_DATA_DIR=<tmp>`), server
escuta em porta aleatória (`listen(0)`). Não toca o `data/` real.

### Como adicionar um teste

Editar `tests/smoke.test.js`:

```js
test('Descrição clara em PT', async () => {
  const r = await postJson('/api/x', { ... });
  assert.equal(r.status, 200);
  assert.ok(r.body.foo);
});
```

`req(path, opts)` e `postJson(path, payload, extra)` são helpers no topo
do arquivo. `baseUrl` é injetado pelo `test.before`.

---

## Deploy

### Pré-requisitos

- Node 22.5+ na máquina/container
- Pasta `data/` em disco persistente
- Idealmente atrás de HTTPS (Caddy/Nginx/Cloudflare)

### Render / Railway

1. Conecta o repo
2. Configura env vars:
   - `FLUXO_SECRET` (gera uma 64-char hex)
   - `PUBLIC_URL` (ex: `https://kastor.minhaempresa.com`)
   - SMTP_* (opcional)
3. Build command: vazio (não precisa)
4. Start command: `npm start`
5. Anexa um disco persistente em `/app/data` (Render: Disks; Railway: Volume)
6. Healthcheck em `/` (200 quando o app subiu)

### VPS (Ubuntu/Debian)

```bash
# Instala Node 22+ via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 24

# Clona, instala
git clone <repo> /opt/kastor
cd /opt/kastor
npm install

# Env vars em /etc/systemd/system/kastor.service
[Unit]
Description=Kastor
After=network.target

[Service]
Type=simple
User=kastor
WorkingDirectory=/opt/kastor
ExecStart=/home/kastor/.nvm/versions/node/v24.x.x/bin/node server.js
Restart=always
Environment="PORT=3000"
Environment="PUBLIC_URL=https://kastor.minhaempresa.com"
Environment="FLUXO_SECRET=..."

[Install]
WantedBy=multi-user.target

# Ativa
sudo systemctl enable --now kastor
```

### Nginx (proxy reverso)

```nginx
server {
  server_name kastor.minhaempresa.com;
  listen 443 ssl http2;
  # ... ssl cert configs ...

  client_max_body_size 12m;   # bate com o limit do JSON parser

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;   # importante pra cookie Secure
  }
}
```

`X-Forwarded-Proto` é o que faz o server detectar HTTPS e setar `Secure`
no cookie.

---

## Backup e recuperação

### Backup live (sem parar o server)

```bash
sqlite3 data/kastor.db ".backup data/backup-$(date +%F-%H%M).db"
cp -r data/uploads data/uploads-backup-$(date +%F-%H%M)
cp data/auth.enc data/auth.enc.backup-$(date +%F-%H%M)
```

`.backup` do SQLite é atômico mesmo com WAL ativo. Os outros 2 são
arquivos comuns — copiar diretamente.

### Backup automatizado (cron)

```bash
# /etc/cron.daily/kastor-backup
#!/bin/sh
TS=$(date +%F)
DEST=/var/backups/kastor
mkdir -p $DEST
sqlite3 /opt/kastor/data/kastor.db ".backup $DEST/kastor-$TS.db"
tar czf $DEST/uploads-$TS.tar.gz -C /opt/kastor/data uploads
cp /opt/kastor/data/auth.enc $DEST/auth-$TS.enc
# Mantém últimos 30 dias
find $DEST -mtime +30 -delete
```

### Restauração

1. Parar o server
2. Copiar `kastor.db`, `uploads/`, `auth.enc`, `secret.key` (ou
   `FLUXO_SECRET` env) pro `data/`
3. Subir o server

`FLUXO_SECRET` precisa ser o mesmo da época do backup (ou o `secret.key`
original) — senão `auth.enc` não decifra.

---

## Escala

Limites atuais e como abordar:

| Métrica | Hoje aguenta | Estratégia se passar |
|---|---|---|
| Demandas no workspace | ~5000 sem lag | Paginar `/api/demands?ws=X&cursor=Y&limit=50` |
| Anexos por demanda | ilimitado | Sem mudança necessária (em disco) |
| Notificações por usuário | cap 500 (auto-trim) | Sem mudança |
| Usuários simultâneos | ~100 | Se subir, considerar Postgres (próximo nível) |
| Tamanho de `kastor.db` | até 1GB tranquilo | acima, considerar Postgres |
| Concurrent writes | OK no WAL single-instance | Multi-instance = Postgres |

### Quando migrar pra Postgres

Sinais:
- Múltiplas instâncias do server (load balancer)
- Necessidade de queries SQL ad-hoc pra relatórios
- > 50.000 demandas
- Backup live virou gargalo

Esforço estimado: 2-4 dias. A camada `db-store.js` é o único ponto que
muda — server.js fica intacto.

### Otimizações pendentes (em ordem de retorno)

1. Paginação `/api/demands` (frontend e backend)
2. Frontend usa `/api/uploads` direto (economia de banda)
3. Modularização do `app.js` (ver `notes/MODULARIZATION.md`)
4. Indexes específicos em `entities` pra hot queries (`owner_id`, `status`)
5. Cache de lookup de usuário por id em memória do server
6. Notificações em tempo real via WebSocket (em vez de poll de 30s)

---

## Como fazer X (cookbook)

### Adicionar um novo campo numa demanda

1. **Backend**: no PUT `/api/demands/:id` (server.js linha ~1526), aceitar
   o novo campo:
   ```js
   if (typeof b.minhaPropNova === 'string') {
     d.minhaPropNova = b.minhaPropNova;
     addHistory(d, req.user.id, 'minha_prop_changed', {value: b.minhaPropNova});
   }
   ```
2. **Frontend**: no `saveDemand()` (app.js), incluir no payload. No
   `renderDetail()`, exibir.
3. **Persistência**: não precisa mexer — o `data` JSON já comporta novos
   campos automaticamente.

### Adicionar uma nova rota

1. Em `server.js`, no grupo apropriado:
   ```js
   app.get('/api/X', requireAuth, (req, res) => {
     // req.user disponível
     res.json({ ... });
   });
   ```
2. No frontend, chamar `await api('/X')`.
3. Adicionar smoke test em `tests/smoke.test.js`.
4. Documentar acima na seção "Referência da API".

### Adicionar uma nova página

1. Em `index.html`, criar `<div class="page" id="page-X">...</div>`.
2. Em `app.js`:
   - Adicionar entrada em `PAGE_TO_PATH` no topo (`X: '/x'`)
   - Adicionar item no nav da sidebar (`<div class="nav-item" data-page="X" onclick="goPage('X')">`)
   - Implementar `function renderX()` que popula a página
   - Adicionar `case 'X': renderX(); break;` em `renderCurrent()`
3. Opcional: adicionar entrada no ⌘K (`cmdkActions()`).

### Adicionar um novo modal roteado

1. HTML do modal em `index.html` com id `<X>-modal`.
2. Função `openXModal(id?)` que popula campos e chama `openModal('X-modal')` +
   `navPush('/X/' + id || 'new')`.
3. Em `app.js`, adicionar regex em `parseRoute()` pra detectar
   `/X/<id>` → `{page, modal: 'X', op, id}`.
4. Em `applyRoute()`, chamar `openXModal(r.id)` quando `r.modal === 'X'`.
5. Adicionar `'X-modal'` em `ROUTED_MODAL_IDS`.

### Adicionar um evento de webhook

1. Em `server.js`, na função que dispara o evento, chamar:
   ```js
   fireWebhook('demand.meu_evento', {demand: d, project, user: req.user, ...});
   ```
2. Adicionar label em `WEBHOOK_EVENT_LABELS` no topo de `server.js`.
3. Adicionar cor em `DISCORD_COLORS` se quiser cor própria no embed.
4. (Opcional) Adicionar handler em `buildDiscordPayload` pra formatar o
   embed específico.

### Adicionar uma nova notificação por e-mail

1. Em `server.js`, no enum `EMAIL_EVENT_LABELS`, adicionar `meu_evento: 'Label'`.
2. Em `defaultEmailPrefs`, adicionar `{meu_evento: true}`.
3. No ponto do código que dispara, chamar `notify(targetUserId,
   'meu_evento', {...data}, triggerUserId, appBaseUrl(req))`.
4. Em `buildEmailForNotification`, adicionar case pra o tipo novo,
   compondo subject + HTML.

### Resetar a senha do admin (sem e-mail)

Se SMTP não estiver disponível e você perdeu a senha:

```bash
# Para o server
# Edita data/db.json (se ainda existir como .bak) ou usa o sqlite3:
sqlite3 data/kastor.db "SELECT id, data FROM entities WHERE type='users' AND json_extract(data, '$.username') = 'admin';"
# Pega o id, depois:
node -e "
const auth = require('./secure-store');
auth.load();
auth.setPassword('<id-do-admin>', 'nova-senha');
console.log('OK');
"
# Sobe o server
```

---

## Convenções de código

- **Sem TypeScript** (por enquanto). Usa JSDoc quando o tipo for confuso.
- **Sem ESLint** rodando. Estilo: 2 espaços, single quotes, semicolons.
- **Comentários**: em português, explicando **por quê** (não o que). Curtos.
- **Nomes**: `camelCase` em JS, `kebab-case` em IDs/classes CSS.
- **Funções globais**: `function foo()` (hoisted, viram `window.foo`). `const
  foo = () => ...` no top-level NÃO vira `window.foo` — usar `window.foo = ...`
  explicitamente se for chamado de `onclick=` inline.
- **Mutação direta**: `db.demands.push(x)`, `obj.field = y`. Sem
  imutabilidade obsessiva. Mas sempre chamar `saveEntity(type, x)` ou
  `saveDB()` depois.
- **Async**: `async/await` em endpoints. Errors via `try/catch` →
  `res.status(N).json({error})`.

---

## Limitações conhecidas e roadmap

### Limitações

- `app.js` monolítico (~6000 linhas) — dificulta navegação. Plano em
  `notes/MODULARIZATION.md`.
- Sem real-time — notificações via poll de 30s, presença via ping de 60s.
- Sem 2FA.
- Sem audit log central.
- CSP precisa `'unsafe-inline'` por causa de `onclick=` no HTML.
- Sem internacionalização — UI 100% em PT-BR.
- Mobile responsivo, mas não testado em produção.

### Próximos passos prioritários

1. **Paginação em `/api/demands`** — pré-requisito pra escala real
2. **Frontend usa `/api/uploads` direto** — economiza banda
3. **Modularização do `app.js`** — destrava velocidade de feature
4. **Endpoint `/api/health`** — pra healthchecks de produção
5. **Activity feed** — reaproveita `d.history` em uma timeline central
6. **Pagination no histórico do detalhe** — modais com 500+ entries hoje
   carregam todas

---

## Contato e ajuda

- **Bugs**: criar issue no repo (com passos pra reproduzir + payload se
  relevante)
- **Feature request**: discutir antes de implementar — design decisions
  importam mais que código
- **Dúvida arquitetural**: consultar `notes/MODULARIZATION.md` ou abrir
  discussão

Senha do admin padrão: `admin123`. **Trocar no primeiro acesso.**
