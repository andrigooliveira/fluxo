# Modularização do app.js

> Status: **planejada, não implementada**. Este doc explica por que e como fazer.

## Situação atual

`public/js/app.js` tem ~6000 linhas em um único arquivo. Funciona, mas:
- Difícil de navegar
- Sem code splitting → o bundle inteiro é baixado mesmo em rotas que usam só uma parte
- Sem tree-shaking
- Estado mutável compartilhado entre seções via `let` globais

## Por que não fizemos um split simples já

A primeira tentativa óbvia — **quebrar em vários `<script src="">` carregados em sequência** — esbarra em dois obstáculos:

1. **`let`/`const` no top-level NÃO viram propriedades de `window`** (diferente de `var` e `function`). Hoje temos coisas como `let me`, `let users`, `let demands`, `let currentPage`, `let activeWs`, `let _filtersRestored`, etc. Se um segundo arquivo tenta `me.x`, dá `ReferenceError` — cada `<script>` tem escopo de script próprio.

2. **Inline `onclick="goPage('list')"` em 87+ pontos do HTML** precisam que as funções sejam visíveis em `window`. Hoje funcionam porque `function declaração()` no top-level vira `window.declaração`. Em ES modules isso **não acontece** — funções de módulo são privadas por padrão.

## Os 3 caminhos viáveis (escolher um)

### A. Bundler (esbuild) + ES modules ✅ recomendado

```js
// src/state.js
export let me = null;
export function setMe(v) { me = v; }

// src/router.js
import { setMe } from './state.js';
export function navPush(path) { ... }

// src/main.js
import { navPush } from './router.js';
window.navPush = navPush; // expor pro HTML inline
```

Build: `esbuild src/main.js --bundle --minify --outfile=public/js/app.js`

**Prós:** padrão moderno, tree-shaking, minificação, type-check futuro fácil.
**Contras:** precisa `npm install esbuild` (1 dep, ~10MB), passo extra no deploy.

### B. IIFE explícita + `window.state` compartilhado

Sem build step. Cada arquivo é `<script src>` separado, mas:

```js
// state.js — define o objeto compartilhado
window.appState = { me: null, users: [], demands: [] };

// presence.js — encapsula em IIFE, lê/escreve via appState
(function() {
  async function pingPresence() {
    const r = await api('/me/ping', 'POST', {});
    if (r && r.lastSeen && appState.me) appState.me.lastSeen = r.lastSeen;
  }
  window.startPresence = function() { ... };
})();
```

**Prós:** sem deps, sem build.
**Contras:** boilerplate em todo arquivo, refactor invasivo (todo `me` vira `appState.me`), perdemos checagem do bundler.

### C. Converter `let` → `var` (truque pré-ES2015)

`var me` no top-level **vira** `window.me`. Cada arquivo enxerga. Inline onclick funciona.

```js
// app-state.js
var me = null;
var users = [];

// app-list.js (outro <script>)
function renderList() { return users.filter(...); }
```

**Prós:** mudança mínima — só `let` → `var`.
**Contras:** `var` é hoisted (todos os pitfalls clássicos), não pega redeclaração acidental, sem `const` real, código foge das convenções modernas.

## Recomendação

Caminho **A**: setup de esbuild + ES modules. É o único que escala. Plano:

1. `npm install --save-dev esbuild` (já tem `"build"` script provisionado em package.json)
2. Criar `src/` com módulos lógicos:
   - `state.js` (estado global + acessors)
   - `api.js` (fetch wrapper)
   - `router.js` (URLs)
   - `auth.js` (login/logout/me)
   - `pages/dashboard.js`, `pages/list.js`, `pages/kanban.js`, etc
   - `modals/demand.js`, `modals/project.js`, etc
   - `cmdk.js`, `presence.js`, `notifications.js`, `mobile.js`, `zen.js`
   - `main.js` (orquestra boot + expõe handlers globais pro HTML inline)
3. Migrar gradualmente — cada PR move 1-2 seções, mantendo o bundle final equivalente
4. No fim, deletar app.js, ajustar `<script>` em index.html

Estimativa: 8-16h de trabalho focado, com risco médio (cada migração precisa rodar os smoke tests).

## Por que não foi feito agora

Em uma sprint sozinha sem tempo dedicado, fazer parcialmente quebra mais do que ajuda — os arquivos extraídos ficam coabitando convenções diferentes do resto. Melhor reservar uma janela específica.

## Próximos passos pragmáticos sugeridos

Sem refactor estrutural, ganhos imediatos possíveis:
- Adicionar **JSDoc** nas funções pesadas (`renderList`, `renderKanban`, `applyRoute`) — IDE feedback
- Extrair **constantes** (z-indexes, labels, intervalos) para um bloco no topo
- Trocar `console.log` de debug por nada (ou um `if (DEBUG)`)
- Audit de `innerHTML` pra garantir que todo valor dinâmico passou por `esc()`
