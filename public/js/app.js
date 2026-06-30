/* ───────────────────────────────────────────────────────────────
   KASTOR — Frontend (v3)
   Workspaces · horas · comentários com @ · etapas arrastáveis
   ─────────────────────────────────────────────────────────────── */

/* ─── ESTADO ─── */
// O token de sessão vive em um cookie httpOnly setado pelo server (kastor_session).
// O JS não tem acesso a ele — proteção contra XSS. O frontend só sabe SE está
// autenticado quando /api/me responde 200.
let me         = null;
let users      = [];
let workspaces = [];
let clients    = [];
let projects   = [];
let flows      = [];
let demands    = [];
let notifications = [];
let roles      = [];
let templates  = [];
let webhooks   = [];
let schedules  = [];
let clientTemplates = [];
let recurrings = [];
let notifPollTimer = null;

let activeWs   = localStorage.getItem('fluxo_ws') || null;

let currentPage = 'dashboard';
let editingId = null;        // demanda em edição
let detailId  = null;        // demanda no modal de detalhe
let editingProjectId = null;
let editingFlowId = null;
let editingUserId = null;
let editingWsId = null;
let editingRoleId = null;
let duplicatingFlowId = null;
let projSortKey = 'name', projSortDir = 1;
let flowSortKey = 'name', flowSortDir = 1;
let userSortKey = 'name', userSortDir = 1;
let wsSortKey = 'name', wsSortDir = 1;
let roleSortKey = 'name', roleSortDir = 1;
let tplSortKey = 'name', tplSortDir = 1;
let showArchivedProjects = false;
let showArchivedUsers = false;
let projAvatarData = null;
let demandAttachments = [];
let detailView = 'main'; // 'main' | 'history' | 'stages'
// Draft da sub-view de edição de etapas: { skipped: Set<stageId>, responsibles: {stageId: userId|null} }
let stagesEditDraft = null;
let dashFlowId = null;       // fluxo selecionado no pipeline do dashboard
let dashUserInit = false;    // dashboard já veio filtrado pro usuário ativo?
let listView = 'table';
let sortKey = 'deadline';
let sortAsc = true;
const calState = { all: new Date(), mine: new Date() };
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* ─── ROUTING — cada tela e modal tem URL própria em inglês ───
   Páginas (raiz):
     /dashboard, /demands, /my-demands, /capacity, /templates,
     /projects, /flows, /workspaces, /users, /integrations, /profile
   Modais (subrota):
     /demands/new, /demands/<id>, /demands/<id>/edit
     /projects/new, /projects/<id>
     /flows/new, /flows/<id>
     /users/new, /users/<id>
     /integrations/webhooks/new, /integrations/webhooks/<id>

   Convenção: ações do usuário (goPage, openX, closeModal) escrevem na URL via
   pushState/replaceState; o popstate handler reaplica a rota silenciosamente
   (sem reescrever a URL) pra evitar loops. */
const PAGE_TO_PATH = {
  dashboard:    '/dashboard',
  list:         '/demands',
  mine:         '/my-demands',
  capacity:     '/capacity',
  agenda:       '/agenda',
  templates:    '/templates',
  recurring:    '/recurring',
  clients:      '/clients',
  projects:     '/projects',
  flows:        '/flows',
  workspaces:   '/workspaces',
  users:        '/users',
  integrations: '/integrations',
  profile:      '/profile'
};
const PATH_TO_PAGE = Object.fromEntries(Object.entries(PAGE_TO_PATH).map(([k, v]) => [v, k]));
let _routerSilent = false;   // true durante popstate → suprime push/replace
function pageUrlFor(page)  { return PAGE_TO_PATH[page] || '/dashboard'; }
function currentPageUrl()  { return pageUrlFor(currentPage); }
function navPush(path) {
  if (_routerSilent) return;
  const target = path + location.search;
  if (location.pathname + location.search === target) return;
  history.pushState(null, '', target);
}
function navReplace(path) {
  if (_routerSilent) return;
  const target = path + location.search;
  if (location.pathname + location.search === target) return;
  history.replaceState(null, '', target);
}
function parseRoute(path) {
  const p = (path || '/').replace(/\/+$/, '') || '/';
  if (PATH_TO_PAGE[p]) return { page: PATH_TO_PAGE[p] };
  let m;
  if ((m = p.match(/^\/demands\/new$/)))                    return { page: 'list',         modal: 'demand',  op: 'new' };
  if ((m = p.match(/^\/demands\/([^/]+)\/edit$/)))          return { page: 'list',         modal: 'demand',  op: 'edit', id: m[1] };
  if ((m = p.match(/^\/demands\/([^/]+)$/)))                return { page: 'list',         modal: 'detail',  id: m[1] };
  if ((m = p.match(/^\/clients\/new$/)))                    return { page: 'clients',      modal: 'client',  op: 'new' };
  if ((m = p.match(/^\/clients\/([^/]+)\/edit$/)))          return { page: 'clients',      modal: 'client',  op: 'edit', id: m[1] };
  if ((m = p.match(/^\/clients\/([^/]+)$/)))                return { page: 'clients',      view: 'detail', id: m[1] };
  if ((m = p.match(/^\/projects\/new$/)))                   return { page: 'projects',     modal: 'project', op: 'new' };
  if ((m = p.match(/^\/projects\/([^/]+)$/)))               return { page: 'projects',     modal: 'project', op: 'edit', id: m[1] };
  if ((m = p.match(/^\/flows\/new$/)))                      return { page: 'flows',        modal: 'flow',    op: 'new' };
  if ((m = p.match(/^\/flows\/([^/]+)$/)))                  return { page: 'flows',        modal: 'flow',    op: 'edit', id: m[1] };
  if ((m = p.match(/^\/users\/new$/)))                      return { page: 'users',        modal: 'user',    op: 'new' };
  if ((m = p.match(/^\/users\/([^/]+)$/)))                  return { page: 'users',        modal: 'user',    op: 'edit', id: m[1] };
  if ((m = p.match(/^\/integrations\/webhooks\/new$/)))     return { page: 'integrations', modal: 'webhook', op: 'new' };
  if ((m = p.match(/^\/integrations\/webhooks\/([^/]+)$/))) return { page: 'integrations', modal: 'webhook', op: 'edit', id: m[1] };
  if ((m = p.match(/^\/recurring\/new$/)))                  return { page: 'recurring',    modal: 'recurring', op: 'new' };
  if ((m = p.match(/^\/recurring\/([^/]+)$/)))              return { page: 'recurring',    modal: 'recurring', op: 'edit', id: m[1] };
  return { page: 'dashboard' };
}
function applyRoute() {
  const r = parseRoute(location.pathname);
  // Todas as telas são navegáveis. Telas administrativas viram readonly pra
  // usuários comuns via .admin-only no DOM (toggle por body.user-readonly).
  _routerSilent = true;
  try {
    // 1) Página — se já estamos nela (boot inicial), força renderCurrent
    //    pra preencher os skeletons. Sem isso, dashboard fica em loading
    //    eterno até o usuário navegar e voltar.
    if (currentPage !== r.page) goPage(r.page);
    else renderCurrent();
    // 2) Fecha qualquer modal roteado aberto (modais transitórios como
    //    confirm/prompt/picker/cmdk ficam intactos).
    const ROUTED = ['detail-modal','demand-modal','project-modal','flow-modal','user-modal','webhook-modal','recurring-modal'];
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      if (ROUTED.includes(m.id)) m.classList.remove('open');
    });
    // 3) Abre o modal solicitado pela rota
    if (r.modal === 'detail' && r.id) {
      const d = demandById(r.id);
      if (d) {
        if (d.workspaceId && d.workspaceId !== activeWs) switchWorkspace(d.workspaceId);
        showDetail(r.id);
      }
    } else if (r.modal === 'demand' && r.op === 'new') {
      if (typeof openNewDemand === 'function') openNewDemand();
    } else if (r.modal === 'demand' && r.op === 'edit' && r.id) {
      detailId = r.id;
      if (typeof editCurrentDemand === 'function') editCurrentDemand();
    } else if (r.modal === 'client') {
      if (typeof openClientModal === 'function') openClientModal(r.op === 'edit' ? r.id : null);
    } else if (r.view === 'detail' && r.page === 'clients' && r.id) {
      if (typeof openClient === 'function') openClient(r.id);
    } else if (r.modal === 'project') {
      if (typeof openProjectModal === 'function') openProjectModal(r.op === 'edit' ? r.id : null);
    } else if (r.modal === 'flow' && me?.isAdmin) {
      if (typeof openFlowModal === 'function') openFlowModal(r.op === 'edit' ? r.id : null);
    } else if (r.modal === 'user' && me?.isAdmin) {
      if (typeof openUserModal === 'function') openUserModal(r.op === 'edit' ? r.id : null);
    } else if (r.modal === 'webhook' && me?.isAdmin) {
      if (typeof openWebhookModal === 'function') openWebhookModal(r.op === 'edit' ? r.id : null);
    } else if (r.modal === 'recurring') {
      if (typeof openRecurringModal === 'function') openRecurringModal(r.op === 'edit' ? r.id : null);
    }
  } finally {
    _routerSilent = false;
  }
}
window.addEventListener('popstate', applyRoute);

/* ─── PERSISTÊNCIA DE FILTROS POR TELA ───
   Cada tela com filtros salva um snapshot do estado em localStorage. Restaura
   no início do render correspondente — antes de capturar os valores atuais.
   Evita que o usuário tenha que re-aplicar filtros toda vez que volta. */
const FILTER_KEYS = {
  list:      { storage: 'kastor-filters-list',      ids: ['search-input','filter-user','filter-project','filter-flow','filter-period','filter-quick'] },
  dashboard: { storage: 'kastor-filters-dashboard', ids: ['dash-f-user','dash-f-client','dash-f-period','dash-f-type'] },
  capacity:  { storage: 'kastor-filters-capacity',  ids: ['capacity-period'] }
};
// Restore só roda na PRIMEIRA pintura após entrar na página. Renders subsequentes
// (provocados por onchange de filtro) NÃO restauram — senão a tecla que o usuário
// acabou de mexer seria sobrescrita pelo valor salvo do localStorage.
const _filtersRestored = {};
function _markFiltersDirty(page) { _filtersRestored[page] = false; }
function saveFilters(page) {
  const def = FILTER_KEYS[page]; if (!def) return;
  const snap = {};
  def.ids.forEach(id => { const el = document.getElementById(id); if (el) snap[id] = el.value; });
  try { localStorage.setItem(def.storage, JSON.stringify(snap)); } catch {}
}
function restoreFilters(page) {
  const def = FILTER_KEYS[page]; if (!def) return;
  if (_filtersRestored[page]) return;
  _filtersRestored[page] = true;
  try {
    const raw = localStorage.getItem(def.storage);
    if (!raw) return;
    const snap = JSON.parse(raw);
    def.ids.forEach(id => {
      const el = document.getElementById(id);
      // Pra <select>, .value só "cola" se o option existir. Como renderList rebuilda
      // os <option> a partir do .value atual (prevUser etc.), restaurar antes do
      // rebuild + então deixar o rebuild adicionar selected=true funciona.
      if (el && snap[id] != null) el.value = snap[id];
    });
  } catch {}
}

/* ─── API ─── */
async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin', // envia o cookie httpOnly de sessão
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { forceLogout(); throw new Error('Não autenticado'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro inesperado');
  return data;
}

/* ─── HELPERS ─── */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ─── Prioridade ─── */
const PRIORITIES = [
  { value: 1, label: 'Imediato', color: '#ef4444' },
  { value: 2, label: 'Alta',     color: '#f59e0b' },
  { value: 3, label: 'Média',    color: '#7A00FF' },
  { value: 4, label: 'Baixa',    color: '#64748b' },
];
function priorityLabel(v) { return (PRIORITIES.find(p => p.value === v) || PRIORITIES[2]).label; }
function priorityColor(v) { return (PRIORITIES.find(p => p.value === v) || PRIORITIES[2]).color; }
/* Célula compacta dos entregáveis pra tabelas: "P · A · V" com tooltip.
   Se TODOS forem zero, mostra "—". */
function qtyCell(d) {
  const p = Number(d.qtyPieces) || 0;
  const a = Number(d.qtyArts) || 0;
  const v = Number(d.qtyVariations) || 0;
  if (!p && !a && !v) return '<span class="qty-cell-empty">—</span>';
  return `<span class="qty-cell-compact" title="${p} peça${p === 1 ? '' : 's'} · ${a} arte${a === 1 ? '' : 's'} · ${v} variaç${v === 1 ? 'ão' : 'ões'}">
    <span class="qty-num">${p}</span><span class="qty-sep">·</span><span class="qty-num">${a}</span><span class="qty-sep">·</span><span class="qty-num">${v}</span>
  </span>`;
}

function priorityPill(v) {
  const p = PRIORITIES.find(x => x.value === v) || PRIORITIES[2];
  return `<span class="pill" style="color:${p.color};background:${hexDim(p.color)};font-size:10px">${p.label}</span>`;
}
/* Ordena opções de um select alfabeticamente (preserva primeira opção como placeholder) */
function sortSelectAlpha(sel) {
  if (!sel || sel.options.length < 2) return;
  const first = sel.options[0];
  const isPlaceholder = !first.value;
  const start = isPlaceholder ? 1 : 0;
  const opts = [...sel.options].slice(start);
  opts.sort((a, b) => norm(a.text).localeCompare(norm(b.text)));
  while (sel.options.length > start) sel.remove(start);
  opts.forEach(o => sel.add(o));
}

/* ─── URL helpers ─── */
function normalizeUrl(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  // Já tem protocolo: mantém
  if (/^https?:\/\//i.test(s)) return s;
  // Outros protocolos (mailto:, tel:, ftp:, etc.) — mantém como está
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  // Prepend https://
  return 'https://' + s;
}
/* Detecta URLs dentro de texto livre e converte em <a target=_blank>. Recebe string JÁ ESCAPADA. */
function linkifyEscaped(escaped) {
  // Padrão: protocolo opcional + domínio + path. Adiciona https:// se omitido.
  const re = /\b((?:https?:\/\/|www\.)[^\s<]+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:com|com\.br|net|org|io|co|app|dev|info|gov|edu|me|tv|ai|design)(?:\/[^\s<]*)?)\b/gi;
  return escaped.replace(re, m => {
    // Evita linkificar conteúdo dentro de tags já inseridas (mention spans não contém URL real, então é raro)
    const href = normalizeUrl(m);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="auto-link">${m}</a>`;
  });
}

function userById(id)    { return users.find(u => u.id === id) || null; }
function projectById(id) { return projects.find(p => p.id === id) || null; }
function flowById(id)    { return flows.find(f => f.id === id) || null; }
function wsById(id)      { return workspaces.find(w => w.id === id) || null; }

function wsProjects() { return projects.filter(p => p.workspaceId === activeWs); }
function wsClients()  { return clients.filter(c => c.workspaceId === activeWs); }
function wsFlows()    { return flows.filter(f => f.workspaceId === activeWs); }
function wsDemands()  { return demands.filter(d => d.workspaceId === activeWs); }
function wsUsers()    { return users.filter(u => u.active !== false && (u.isAdmin || (u.workspaces || []).includes(activeWs))); }
function clientById(id) { return clients.find(c => c.id === id) || null; }

function stageOf(d) {
  const f = flowById(d.flowId);
  return f ? f.stages.find(s => s.id === d.status) || null : null;
}
/* Etapas ativas para esta demanda — respeita a customização por instância:
   ordem (stageOrder), rótulos (stageLabels) e pulos (skippedStages).
   O fluxo original não muda. */
function activeStagesOf(d, flow) {
  if (!flow) flow = flowById(d.flowId);
  if (!flow) return [];
  const skipped = new Set(Array.isArray(d.skippedStages) ? d.skippedStages : []);
  const labels = (d.stageLabels && typeof d.stageLabels === 'object') ? d.stageLabels : {};
  // Aplica ordem customizada (se houver), preservando etapas novas no fim
  let ordered;
  if (Array.isArray(d.stageOrder) && d.stageOrder.length) {
    const set = new Set(d.stageOrder);
    const fromOrder = d.stageOrder.map(id => flow.stages.find(s => s.id === id)).filter(Boolean);
    const remaining = flow.stages.filter(s => !set.has(s.id));
    ordered = [...fromOrder, ...remaining];
  } else {
    ordered = flow.stages;
  }
  return ordered
    .filter(s => !skipped.has(s.id))
    .map(s => labels[s.id] ? { ...s, label: labels[s.id] } : s);
}
/* Responsável efetivo de uma etapa para uma demanda específica.
   Override por instância tem precedência sobre o padrão do fluxo. */
function effectiveStageResponsibleId(d, stage) {
  if (d && d.stageResponsibles && Object.prototype.hasOwnProperty.call(d.stageResponsibles, stage.id)) {
    return d.stageResponsibles[stage.id];
  }
  return stage.responsibleId || null;
}
function isDone(d)  { const s = stageOf(d); return !!(s && s.done); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function effDue(d)  { return d.stageDueDate || d.deadline || null; }
function isLate(d)  { const due = effDue(d); return !!due && !isDone(d) && due < todayStr(); }
function wasLate(d) { return isDone(d) && d.deadline && d.completedAt && d.completedAt.slice(0,10) > d.deadline; }
function demandType(d) { const f = flowById(d.flowId); return f ? (f.demandType || '') : ''; }

// Cria uma versão debounced de fn — útil pra inputs de busca que rebuildam
// listas grandes em cada tecla. Cancela chamadas pendentes a cada novo trigger.
function debounce(fn, ms = 150) {
  let t = null;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function fmtDate(s) {
  if (!s) return '—';
  const [y,m,d] = String(s).slice(0,10).split('-');
  return `${d}/${m}/${y}`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtHours(h) {
  const v = Math.round(Number(h || 0) * 100) / 100;
  return (Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')) + 'h';
}
function hexDim(hex) {
  const h = (hex || '#7A00FF').replace('#','');
  const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},0.15)`;
}
function statusPill(d) {
  const s = stageOf(d);
  if (!s) return '<span class="pill pill-muted">—</span>';
  return `<span class="pill" style="color:${s.color};background:${hexDim(s.color)}"><span class="pill-dot" style="background:${s.color}"></span>${esc(s.label)}</span>`;
}
function ownerName(d) { const u = userById(d.ownerId); return u ? u.name : '—'; }
function avatarHTML(u, cls = 'avatar') {
  const pClass = presenceClassFor(u);
  const fullCls = pClass ? `${cls} ${pClass}` : cls;
  if (u && u.avatar) return `<div class="${fullCls}" style="background-image:url('${u.avatar}');background-size:cover;background-position:center"></div>`;
  const initial = u ? (u.name || u.username || '?').trim().charAt(0).toUpperCase() : '?';
  const seed = u ? (u.id || u.username || u.name || '?') : '?';
  return `<div class="${fullCls}" style="background:${avatarGradient(seed)};color:#fff;border:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)">${esc(initial)}</div>`;
}
/* Classe de presença que vira um anel ao redor do avatar.
   verde = ativo nos últimos 5min, amarelo = 5-30min, sem anel a partir de 30min. */
function presenceClassFor(u) {
  if (!u || !u.lastSeen) return '';
  const t = new Date(u.lastSeen).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMin = (Date.now() - t) / 60000;
  if (diffMin < 5)  return 'presence-online';
  if (diffMin < 30) return 'presence-away';
  return '';
}
// Gera um gradiente determinístico a partir de um seed (id do usuário) — cada
// pessoa ganha sua cor consistente, mantendo bom contraste com texto branco.
// Memoizado: o resultado é puro do seed, e avatarHTML chama esta função em
// todo render (lista, kanban, calendário, comentários) — cache evita rehash.
/* Paleta curada de gradients — 16 combos elegantes que sempre ficam bons com
   texto branco. Mais bonito que HSL random (que dava matches feios em verdes
   doentios ou neons). Hash do seed → índice da paleta. */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #FF6B6B 0%, #C92A2A 100%)', // coral → vermelho
  'linear-gradient(135deg, #F8A055 0%, #D14A1F 100%)', // laranja → tijolo
  'linear-gradient(135deg, #FFB84D 0%, #B8860B 100%)', // âmbar
  'linear-gradient(135deg, #FFD93D 0%, #E07B00 100%)', // amarelo → bronze
  'linear-gradient(135deg, #8BC34A 0%, #2E7D32 100%)', // verde-claro → verde
  'linear-gradient(135deg, #4ECDC4 0%, #1B9E96 100%)', // turquesa
  'linear-gradient(135deg, #44BCD8 0%, #0277B6 100%)', // ciano → azul
  'linear-gradient(135deg, #6FA8DC 0%, #1A5490 100%)', // azul-claro → marinho
  'linear-gradient(135deg, #4A6FE3 0%, #2E3B8E 100%)', // royal blue
  'linear-gradient(135deg, #7A6BE8 0%, #3F2DA5 100%)', // indigo
  'linear-gradient(135deg, #9C6FE8 0%, #6128D7 100%)', // violeta → roxo
  'linear-gradient(135deg, #C77DFF 0%, #7A00FF 100%)', // lavanda → brand
  'linear-gradient(135deg, #E6A0E0 0%, #A93FA8 100%)', // rosa-claro → magenta
  'linear-gradient(135deg, #F472B6 0%, #BE185D 100%)', // pink
  'linear-gradient(135deg, #FB7185 0%, #9F1239 100%)', // rosé
  'linear-gradient(135deg, #94A3B8 0%, #475569 100%)'  // slate (fallback neutro)
];
const _avatarGradientCache = new Map();
function avatarGradient(seed) {
  const key = String(seed);
  const cached = _avatarGradientCache.get(key);
  if (cached) return cached;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) >>> 0;
  const result = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  _avatarGradientCache.set(key, result);
  return result;
}
function projectAvatarHTML(p, cls = 'avatar') {
  if (!p) return `<div class="${cls}">?</div>`;
  if (p.avatar) return `<div class="${cls}" style="background-image:url('${p.avatar}');background-size:cover;background-position:center"></div>`;
  const letter = (p.name || 'P').charAt(0).toUpperCase();
  return `<div class="${cls}" style="background:${hexDim(p.color)};color:${p.color}">${esc(letter)}</div>`;
}

/* ── Universal filter dropdown ──
   Mantém o <select> nativo (para compatibilidade) e renderiza um .filter-cdrop sibling com a UI padronizada.
   Opções extras:
   - userIcon: true → adiciona avatar do usuário ao lado do nome
   - projectIcon: true → adiciona avatar do projeto ao lado do nome
*/
// Cores oficiais das prioridades da demanda (usadas no dot do dropdown e
// potencialmente em badges/pills no kanban).
const PRIORITY_COLORS = {
  '1': '#EF4444', // Imediato — vermelho
  '2': '#FB7415', // Alta — laranja vivo (forte contraste com o amarelo do Média)
  '3': '#FACC15', // Média — amarelo
  '4': '#60A5FA'  // Baixa — azul claro
};
function applyPriorityDropdown(selId) {
  applyFilterDropdown(selId, { dotMap: PRIORITY_COLORS });
}

function applyFilterDropdown(selId, opts = {}) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.classList.add('filter-native-hidden');
  let wrap = sel.nextElementSibling;
  if (!wrap || !wrap.classList.contains('filter-cdrop')) {
    wrap = document.createElement('div');
    wrap.className = 'filter-cdrop';
    sel.after(wrap);
  }
  const value = sel.value;
  const options = [...sel.options].map(o => {
    const opt = { value: o.value, label: o.label };
    if (opts.userIcon && o.value) {
      const u = userById(o.value);
      if (u) opt.avatar = avatarHTML(u, 'avatar filter-cdrop-avatar');
    } else if (opts.projectIcon && o.value) {
      const p = projectById(o.value);
      if (p) opt.avatar = projectAvatarHTML(p, 'avatar filter-cdrop-avatar');
    } else if (opts.dotMap && opts.dotMap[o.value]) {
      // Bola colorida por valor (ex.: prioridades). Estilo inline pra evitar
      // proliferar classes; .filter-cdrop-dot só padroniza tamanho/forma.
      opt.avatar = `<span class="filter-cdrop-dot" style="background:${opts.dotMap[o.value]}"></span>`;
    }
    return opt;
  });
  const current = options.find(o => o.value === value) || options[0] || { value: '', label: '' };
  const filtering = !!current.value;
  wrap.classList.toggle('filtering', filtering);
  wrap.dataset.targetSel = selId;
  wrap.innerHTML = `
    <button type="button" class="filter-cdrop-trigger" onclick="toggleFilterCdrop(this.parentElement)">
      ${current.avatar || ''}
      <span class="filter-cdrop-label">${esc(current.label || '')}</span>
      <i data-lucide="chevron-down" class="ic-xs"></i>
    </button>
    <div class="filter-cdrop-menu">
      ${options.map(o => `
        <div class="filter-cdrop-item ${o.value === value ? 'active' : ''}" onclick="pickFilterCdrop('${esc(selId)}', this.dataset.v)" data-v="${esc(o.value)}">
          ${o.avatar || ''}
          <span>${esc(o.label)}</span>
        </div>`).join('')}
    </div>
  `;
}
function toggleFilterCdrop(wrap) {
  document.querySelectorAll('.filter-cdrop.open, .cdrop.open').forEach(el => { if (el !== wrap) el.classList.remove('open'); });
  wrap.classList.toggle('open');
  if (wrap.classList.contains('open')) {
    // Auto-flip pra cima quando não cabe abaixo. Mede contra o container
    // de scroll mais próximo (modal-body / modal / viewport) — só assim
    // dropdowns dentro de modais detectam o limite real, não o da janela.
    const menu = wrap.querySelector('.filter-cdrop-menu');
    if (menu) {
      wrap.classList.remove('drop-up');
      const rect = wrap.getBoundingClientRect();
      const scrollHost = wrap.closest('.modal-body') || wrap.closest('.modal') || document.documentElement;
      const hostRect = scrollHost.getBoundingClientRect ? scrollHost.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const bottomLimit = Math.min(hostRect.bottom, window.innerHeight);
      const topLimit = Math.max(hostRect.top, 0);
      const spaceBelow = bottomLimit - rect.bottom;
      const spaceAbove = rect.top - topLimit;
      const menuH = menu.scrollHeight || menu.offsetHeight || 0;
      if (spaceBelow < menuH + 12 && spaceAbove > spaceBelow) wrap.classList.add('drop-up');
    }
  }
  paintIcons();
}
function pickFilterCdrop(selId, value) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  document.querySelectorAll('.filter-cdrop.open').forEach(el => el.classList.remove('open'));
  if (![...sel.options].some(o => o.value === value)) {
    const opt = document.createElement('option');
    opt.value = value;
    sel.add(opt);
  }
  sel.value = value;
  // Atualiza imediatamente o trigger visual e a marcação .active.
  // Sem isto, o label do botão só se atualizava se algum onchange disparar
  // um re-render externo — selects estáticos (ex.: prioridade) ficavam congelados.
  const wrap = sel.nextElementSibling;
  if (wrap && wrap.classList.contains('filter-cdrop')) {
    const items = wrap.querySelectorAll('.filter-cdrop-item');
    let chosenItem = null;
    items.forEach(it => {
      const isMatch = it.dataset.v === value;
      it.classList.toggle('active', isMatch);
      if (isMatch) chosenItem = it;
    });
    const label = wrap.querySelector('.filter-cdrop-label');
    const trigger = wrap.querySelector('.filter-cdrop-trigger');
    if (chosenItem && label && trigger) {
      // Texto do item: o span que NÃO é o dot/avatar — usar o nome do option
      // do select nativo como fallback confiável.
      const opt = [...sel.options].find(o => o.value === value);
      label.textContent = opt ? opt.label : '';
      // Sincroniza a media (dot/avatar) do trigger com a do item escolhido
      const itemAvatar = chosenItem.querySelector('.filter-cdrop-avatar, .filter-cdrop-dot');
      const existingMedia = trigger.querySelector('.filter-cdrop-avatar, .filter-cdrop-dot');
      if (existingMedia) existingMedia.remove();
      if (itemAvatar) trigger.insertBefore(itemAvatar.cloneNode(true), trigger.firstChild);
    }
    wrap.classList.toggle('filtering', !!value);
  }
  let fired = false;
  if (typeof sel.onchange === 'function') {
    try { sel.onchange.call(sel, new Event('change')); fired = true; }
    catch (e) { console.error('Filter onchange error:', e); }
  }
  if (!fired) {
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
// Fecha cdrops ao clicar fora
document.addEventListener('click', ev => {
  if (!ev.target.closest('.filter-cdrop')) {
    document.querySelectorAll('.filter-cdrop.open').forEach(c => c.classList.remove('open'));
  }
});
function cellUser(u) {
  if (!u) return '—';
  return `<span class="cell-user">${avatarHTML(u)} ${esc(u.name)}</span>`;
}
// ─── EMPTY STATES com ilustração line-art ───
/* Empty states ilustrados — SVGs com viewBox 160×120, usando o accent (--accent)
   e tons de surface pra dar profundidade. Cada ilustração tem uma "cena" leve
   em vez de só um ícone monocromático. Variáveis CSS são interpoladas via
   currentColor pra fallback e style="--accent" pra cor da marca. */
const EMPTY_ICONS = {
  default: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <rect x="30" y="28" width="100" height="68" rx="8" fill="currentColor" opacity=".06" stroke="currentColor" stroke-opacity=".22" stroke-width="1.5"/>
    <path d="M30 44h100" stroke="currentColor" stroke-opacity=".22" stroke-width="1.5"/>
    <circle cx="40" cy="36" r="2" fill="var(--accent-text, #B380FF)"/>
    <circle cx="48" cy="36" r="2" fill="currentColor" opacity=".35"/>
    <circle cx="56" cy="36" r="2" fill="currentColor" opacity=".35"/>
    <rect x="44" y="56" width="48" height="6" rx="3" fill="currentColor" opacity=".22"/>
    <rect x="44" y="70" width="32" height="6" rx="3" fill="var(--accent-text, #B380FF)" opacity=".4"/>
    <rect x="44" y="84" width="20" height="4" rx="2" fill="currentColor" opacity=".18"/>
  </svg>`,
  inbox: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <path d="M36 50h88l-10 26H46z" fill="var(--accent-text, #B380FF)" opacity=".2"/>
    <path d="M30 76v14a6 6 0 006 6h88a6 6 0 006-6V76" fill="currentColor" opacity=".06" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
    <path d="M30 76l8-26h84l8 26" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M46 76h12a14 14 0 0028 0h12" stroke="var(--accent-text, #B380FF)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="80" cy="34" r="3" fill="var(--accent-text, #B380FF)" opacity=".5"/>
    <circle cx="64" cy="28" r="2" fill="currentColor" opacity=".3"/>
    <circle cx="96" cy="28" r="2" fill="currentColor" opacity=".3"/>
  </svg>`,
  search: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <circle cx="68" cy="56" r="28" fill="var(--accent-text, #B380FF)" opacity=".10"/>
    <circle cx="68" cy="56" r="28" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/>
    <path d="M90 78l18 18" stroke="var(--accent-text, #B380FF)" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M58 50h20M68 40v20" stroke="currentColor" stroke-opacity=".45" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
  calendar: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="110" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <rect x="32" y="28" width="96" height="74" rx="8" fill="currentColor" opacity=".06" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
    <path d="M32 48h96" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5"/>
    <path d="M52 20v14M108 20v14" stroke="currentColor" stroke-opacity=".5" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="42" y="58" width="14" height="10" rx="2" fill="currentColor" opacity=".18"/>
    <rect x="60" y="58" width="14" height="10" rx="2" fill="var(--accent-text, #B380FF)" opacity=".5"/>
    <rect x="78" y="58" width="14" height="10" rx="2" fill="currentColor" opacity=".18"/>
    <rect x="96" y="58" width="14" height="10" rx="2" fill="currentColor" opacity=".18"/>
    <rect x="42" y="74" width="14" height="10" rx="2" fill="currentColor" opacity=".12"/>
    <rect x="60" y="74" width="14" height="10" rx="2" fill="currentColor" opacity=".12"/>
    <rect x="78" y="74" width="14" height="10" rx="2" fill="currentColor" opacity=".12"/>
  </svg>`,
  comments: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <path d="M30 38a8 8 0 018-8h68a8 8 0 018 8v32a8 8 0 01-8 8H62l-14 12V78h-10a8 8 0 01-8-8z" fill="currentColor" opacity=".06" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
    <rect x="44" y="46" width="50" height="5" rx="2.5" fill="var(--accent-text, #B380FF)" opacity=".55"/>
    <rect x="44" y="56" width="34" height="5" rx="2.5" fill="currentColor" opacity=".22"/>
    <circle cx="106" cy="36" r="6" fill="var(--accent-text, #B380FF)" opacity=".7"/>
    <text x="106" y="40" font-size="8" font-weight="700" fill="#fff" text-anchor="middle" font-family="system-ui">1</text>
  </svg>`,
  users: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".10"/>
    <circle cx="62" cy="52" r="14" fill="var(--accent-text, #B380FF)" fill-opacity=".55"/>
    <circle cx="62" cy="52" r="14" stroke="var(--accent-text, #B380FF)" stroke-opacity=".7" stroke-width="1.5"/>
    <path d="M38 96c4-14 12-20 24-20s20 6 24 20" fill="var(--accent-text, #B380FF)" fill-opacity=".25" stroke="var(--accent-text, #B380FF)" stroke-opacity=".55" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="104" cy="50" r="10" fill="currentColor" fill-opacity=".18"/>
    <circle cx="104" cy="50" r="10" stroke="currentColor" stroke-opacity=".5" stroke-width="1.5"/>
    <path d="M92 84c2-9 8-14 16-14s14 5 18 14" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".4" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`,
  flow: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <path d="M48 60h28l16-30M48 60h28l16 30" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M104 60h22" stroke="var(--accent-text, #B380FF)" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 4"/>
    <circle cx="40" cy="60" r="10" fill="var(--accent-text, #B380FF)" opacity=".7"/>
    <circle cx="96" cy="30" r="9" fill="currentColor" opacity=".18" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/>
    <circle cx="96" cy="90" r="9" fill="currentColor" opacity=".18" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/>
    <circle cx="132" cy="60" r="10" fill="currentColor" opacity=".18" stroke="currentColor" stroke-opacity=".4" stroke-width="1.5"/>
  </svg>`,
  webhook: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="108" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <circle cx="80" cy="38" r="14" fill="var(--accent-text, #B380FF)" opacity=".25" stroke="var(--accent-text, #B380FF)" stroke-opacity=".7" stroke-width="1.5"/>
    <circle cx="46" cy="82" r="14" fill="currentColor" opacity=".10" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/>
    <circle cx="114" cy="82" r="14" fill="currentColor" opacity=".10" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/>
    <path d="M73 50l-18 20M87 50l18 20M58 82h44" stroke="currentColor" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  kanban: `<svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="80" cy="110" rx="56" ry="6" fill="currentColor" opacity=".08"/>
    <rect x="22" y="22" width="36" height="78" rx="6" fill="currentColor" opacity=".06" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
    <rect x="62" y="22" width="36" height="58" rx="6" fill="currentColor" opacity=".06" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
    <rect x="102" y="22" width="36" height="68" rx="6" fill="currentColor" opacity=".06" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
    <rect x="28" y="32" width="24" height="8" rx="2" fill="var(--accent-text, #B380FF)" opacity=".55"/>
    <rect x="28" y="46" width="24" height="8" rx="2" fill="currentColor" opacity=".18"/>
    <rect x="68" y="32" width="24" height="8" rx="2" fill="currentColor" opacity=".18"/>
    <rect x="108" y="32" width="24" height="8" rx="2" fill="currentColor" opacity=".18"/>
    <rect x="108" y="46" width="24" height="8" rx="2" fill="var(--accent-text, #B380FF)" opacity=".4"/>
  </svg>`,
};
function emptyState(title, sub, iconName) {
  const icon = EMPTY_ICONS[iconName] || EMPTY_ICONS.default;
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${esc(title)}</div>
    <div class="empty-state-sub">${esc(sub || '')}</div>
  </div>`;
}

// ─── SKELETONS ───
function skeletonMetrics(n = 4) {
  return Array.from({length: n}, () => `
    <div class="metric-card">
      <div class="skeleton skeleton-line sm" style="width:55%;margin-bottom:14px"></div>
      <div class="skeleton skeleton-line lg" style="width:42%;margin-bottom:10px"></div>
      <div class="skeleton skeleton-line xs" style="width:70%"></div>
    </div>`).join('');
}
function skeletonTableRows(cols = 7, rows = 6) {
  return Array.from({length: rows}, (_, i) => `
    <tr><td colspan="${cols}"><div class="skeleton skeleton-line" style="width:${50 + ((i * 13) % 40)}%;margin:0"></div></td></tr>
  `).join('');
}

/* ─── HOVER TOOLTIP PARA GRÁFICOS DE LINHA ──────────────────────
   Genérico: recebe um host (com SVG dentro, preserveAspectRatio="none"
   recomendado) e config com pontos no sistema de coordenadas do viewBox.
   Mostra: tooltip flutuante + linha-guia vertical + ponto destacado.

   config = {
     viewBox:  { w, h, padL, padR, padT, innerH },
     points:   [ { x, label, series: [{ y, value, color }] } ],
     lineEls:  HTMLElement (guide line dentro do SVG) — opcional
     markerEls:[HTMLElement] (1 por série, dentro do SVG) — opcional
     tooltipEl:HTMLElement absoluta dentro do host
     format:   (val, seriesIdx) => string
   } */
function attachChartHover(host, config) {
  if (!host || !config.points || !config.points.length) return;
  const tip = config.tooltipEl;
  const guide = config.lineEls;
  const markers = config.markerEls || [];
  const { w: vbW, h: vbH, padT, innerH } = config.viewBox;
  let lastIdx = -1;

  const onMove = (e) => {
    const rect = host.getBoundingClientRect();
    if (!rect.width) return;
    const localX = e.clientX - rect.left;
    const svgX = localX * vbW / rect.width;
    // Acha o ponto mais próximo
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < config.points.length; i++) {
      const d = Math.abs(config.points[i].x - svgX);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best === lastIdx) return;
    lastIdx = best;
    const p = config.points[best];
    // Posiciona guide line + markers (em SVG coords)
    if (guide) {
      guide.setAttribute('x1', p.x);
      guide.setAttribute('x2', p.x);
      guide.style.opacity = '1';
    }
    p.series.forEach((s, i) => {
      const m = markers[i];
      if (!m) return;
      m.setAttribute('cx', p.x);
      m.setAttribute('cy', s.y);
      m.style.opacity = '1';
    });
    // Posiciona tooltip (em pixel coords do host)
    if (tip) {
      const lines = p.series.map((s, i) => {
        const sw = s.color ? `<span class="chart-tip-dot" style="background:${s.color}"></span>` : '';
        return `<div class="chart-tip-row">${sw}<span class="chart-tip-label">${esc(s.name || '')}</span><span class="chart-tip-value">${esc(config.format(s.value, i))}</span></div>`;
      }).join('');
      tip.innerHTML = `<div class="chart-tip-head">${esc(p.label)}</div>${lines}`;
      const tipX = p.x * rect.width / vbW;
      // Limita pra não vazar o host
      const tipW = tip.offsetWidth || 140;
      let left = tipX + 10;
      if (left + tipW > rect.width - 8) left = tipX - tipW - 10;
      if (left < 4) left = 4;
      tip.style.left = left + 'px';
      tip.style.top = '8px';
      tip.style.opacity = '1';
    }
  };
  const onLeave = () => {
    lastIdx = -1;
    if (tip) tip.style.opacity = '0';
    if (guide) guide.style.opacity = '0';
    markers.forEach(m => m && (m.style.opacity = '0'));
  };
  host.addEventListener('mousemove', onMove);
  host.addEventListener('mouseleave', onLeave);
}

// ─── SPARKLINE (mini SVG line chart) ───
function sparkline(values, opts = {}) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const w = opts.width || 96;
  const h = opts.height || 24;
  const color = opts.color || 'var(--accent-text)';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastY = h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);
  const lastX = (values.length - 1) * step;
  const areaPath = `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
  const linePath = `M${pts.join(' L')}`;
  const gid = 'spk' + Math.random().toString(36).slice(2, 8);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" style="display:block;overflow:visible">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${areaPath}" fill="url(#${gid})"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${color}"/>
  </svg>`;
}

function toast(msg, type = 'success', action = null) {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  const msgEl = document.createElement('span');
  msgEl.className = 'toast-msg';
  msgEl.textContent = msg;
  t.appendChild(msgEl);
  let hasAction = false;
  if (action && action.label && typeof action.fn === 'function') {
    hasAction = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      try { action.fn(); } catch (err) { console.error(err); }
      t.remove();
    });
    t.appendChild(btn);
  }
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), hasAction ? 6000 : 3500);
}
/* ─── ATALHOS DE TECLADO ─── */
const KB_SHORTCUTS = [
  { keys: ['⌘/Ctrl', 'K'], label: 'Paleta de comandos (busca + ações)' },
  { keys: ['?'],       label: 'Mostrar atalhos' },
  { keys: ['/'],       label: 'Focar na busca' },
  { keys: ['n'],       label: 'Nova demanda' },
  { keys: ['g', 'd'],  label: 'Ir para Dashboard' },
  { keys: ['g', 'l'],  label: 'Ir para Demandas' },
  { keys: ['g', 'm'],  label: 'Ir para Minhas Demandas' },
  { keys: ['g', 'c'],  label: 'Ir para Capacidade' },
  { keys: ['g', 'p'],  label: 'Ir para Projetos' },
  { keys: ['Esc'],     label: 'Fechar modal/painel' },
];
let _gPressed = false;
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Ctrl/Cmd+K abre paleta de comandos a qualquer momento
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (cmdkOpen) closeCommandPalette();
      else openCommandPalette();
      return;
    }
    // Ignora se está digitando
    const t = e.target;
    const inEditable = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
    // Esc sempre — fecha popovers/cheatsheet
    if (e.key === 'Escape') {
      if (cmdkOpen) { e.preventDefault(); closeCommandPalette(); return; }
      if (hideShortcutsHelp()) { e.preventDefault(); return; }
      // demais Escs são tratados por outros listeners (modais)
      return;
    }
    if (inEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === '?') { e.preventDefault(); showShortcutsHelp(); }
    else if (k === '/') { e.preventDefault(); const s = $('search-input'); if (s) s.focus(); }
    else if (k === 'n') { e.preventDefault(); if (typeof openNewDemand === 'function') openNewDemand(); }
    else if (k === 'g') { _gPressed = true; setTimeout(() => { _gPressed = false; }, 800); }
    else if (_gPressed) {
      const go = { d: 'dashboard', l: 'list', m: 'mine', c: 'capacity', p: 'projects' }[k];
      if (go) { e.preventDefault(); _gPressed = false; goPage(go); }
    }
  });
}

/* ─── PALETA DE COMANDOS (⌘K) ───
   Modal central com input de busca. Lista ações de navegação + demandas
   do workspace ativo que casam com o termo. Navegação por teclado:
   ↑ ↓ Enter Esc. Hover do mouse também atualiza o item ativo. */
let cmdkOpen = false;
let cmdkActiveIdx = 0;
let cmdkResults = [];
function openCommandPalette() {
  let el = document.getElementById('cmdk');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cmdk';
    el.className = 'cmdk-overlay';
    el.innerHTML = `
      <div class="cmdk-card" role="dialog" aria-label="Paleta de comandos">
        <div class="cmdk-input-wrap">
          <i data-lucide="search" class="ic-sm cmdk-input-icon"></i>
          <input class="cmdk-input" id="cmdk-input" placeholder="Buscar demanda, projeto, fluxo, usuário ou ação…" autocomplete="off" spellcheck="false">
          <kbd class="cmdk-hint-kbd">Esc</kbd>
        </div>
        <div class="cmdk-results" id="cmdk-results"></div>
        <div class="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> selecionar</span>
          <span><kbd>esc</kbd> fechar</span>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', ev => { if (ev.target === el) closeCommandPalette(); });
    const input = el.querySelector('#cmdk-input');
    input.addEventListener('input', renderCommandPalette);
    input.addEventListener('keydown', cmdkOnKey);
  }
  el.querySelector('#cmdk-input').value = '';
  cmdkActiveIdx = 0;
  el.classList.add('open');
  cmdkOpen = true;
  renderCommandPalette();
  setTimeout(() => { const i = document.getElementById('cmdk-input'); if (i) i.focus(); }, 30);
}
function closeCommandPalette() {
  const el = document.getElementById('cmdk');
  if (!el) return;
  el.classList.remove('open');
  cmdkOpen = false;
}
function cmdkOnKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdkActiveIdx = Math.min(cmdkResults.length - 1, cmdkActiveIdx + 1); paintCmdkActive(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkActiveIdx = Math.max(0, cmdkActiveIdx - 1); paintCmdkActive(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const r = cmdkResults[cmdkActiveIdx];
    if (r) cmdkRun(r);
  }
}
function paintCmdkActive() {
  const items = document.querySelectorAll('#cmdk-results .cmdk-item');
  items.forEach((it, i) => it.classList.toggle('active', i === cmdkActiveIdx));
  const active = items[cmdkActiveIdx];
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
}
function cmdkRun(r) {
  closeCommandPalette();
  setTimeout(() => { try { r.run(); } catch (err) { console.error(err); } }, 60);
}
function cmdkActions() {
  const acts = [
    { icon: 'plus',         label: 'Nova demanda',                  kind: 'Ação',     run: () => typeof openNewDemand === 'function' && openNewDemand() },
    { icon: 'gauge',        label: 'Ir para Dashboard',             kind: 'Navegar',  run: () => goPage('dashboard') },
    { icon: 'list',         label: 'Ir para Demandas',              kind: 'Navegar',  run: () => goPage('list') },
    { icon: 'user',         label: 'Ir para Minhas Demandas',       kind: 'Navegar',  run: () => goPage('mine') },
    { icon: 'bar-chart-3',  label: 'Ir para Capacidade',            kind: 'Navegar',  run: () => goPage('capacity') },
    { icon: 'calendar',     label: 'Ir para Calendário (Demandas)', kind: 'Navegar',  run: () => { goPage('list'); setTimeout(() => typeof setListView === 'function' && setListView('calendar'), 50); } },
    { icon: 'kanban',       label: 'Ir para Kanban (Demandas)',     kind: 'Navegar',  run: () => { goPage('list'); setTimeout(() => typeof setListView === 'function' && setListView('kanban'), 50); } },
    { icon: 'folder',       label: 'Ir para Projetos',              kind: 'Navegar',  run: () => goPage('projects') },
    { icon: 'workflow',     label: 'Ir para Fluxos',                kind: 'Navegar',  run: () => goPage('flows') },
  ];
  acts.push({ icon: 'users',  label: 'Ir para Usuários',     kind: 'Navegar', run: () => goPage('users') });
  acts.push({ icon: 'webhook',label: 'Ir para Integrações',  kind: 'Navegar', run: () => goPage('integrations') });
  acts.push({ icon: 'sun-moon', label: 'Alternar tema (claro/escuro)', kind: 'Ação', run: () => typeof toggleTheme === 'function' && toggleTheme() });
  acts.push({ icon: 'keyboard', label: 'Mostrar atalhos de teclado',   kind: 'Ação', run: () => showShortcutsHelp() });
  return acts;
}
function renderCommandPalette() {
  const input = document.getElementById('cmdk-input');
  const out = document.getElementById('cmdk-results');
  if (!input || !out) return;
  const q = (input.value || '').trim().toLowerCase();
  const allActions = cmdkActions();
  const acts = q
    ? allActions.filter(a => a.label.toLowerCase().includes(q))
    : allActions;
  let dems = [], projs = [], flws = [], usrs = [];
  if (q) {
    dems = (Array.isArray(demands) ? demands : [])
      .filter(d => !activeWs || d.workspaceId === activeWs)
      .filter(d => d.name && d.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map(d => ({
        icon: 'square',
        label: d.name,
        kind: 'Demanda',
        sub: (projectById(d.projectId)?.name || ''),
        run: () => showDetail(d.id)
      }));
    projs = (typeof wsProjects === 'function' ? wsProjects() : [])
      .filter(p => (p.name && p.name.toLowerCase().includes(q)) || (p.client && p.client.toLowerCase().includes(q)))
      .slice(0, 5)
      .map(p => ({
        icon: 'folder',
        label: p.name,
        kind: 'Projeto',
        sub: p.client || '',
        run: () => openProjectModal(p.id)
      }));
    flws = (typeof wsFlows === 'function' ? wsFlows() : [])
      .filter(f => f.name && f.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(f => ({
        icon: 'workflow',
        label: f.name,
        kind: 'Fluxo',
        sub: f.demandType || '',
        run: () => { if (me && me.isAdmin) openFlowModal(f.id); else goPage('flows'); }
      }));
    usrs = (typeof wsUsers === 'function' ? wsUsers() : [])
      .filter(u => (u.name && u.name.toLowerCase().includes(q)) || (u.username && u.username.toLowerCase().includes(q)))
      .slice(0, 5)
      .map(u => ({
        icon: 'user',
        label: u.name,
        kind: 'Usuário',
        sub: u.role || u.username || '',
        run: () => { if (me && me.isAdmin) openUserModal(u.id); else goPage('users'); }
      }));
  }
  cmdkResults = [...acts, ...dems, ...projs, ...flws, ...usrs];
  if (cmdkActiveIdx >= cmdkResults.length) cmdkActiveIdx = Math.max(0, cmdkResults.length - 1);
  if (!cmdkResults.length) {
    out.innerHTML = `<div class="cmdk-empty">Nada encontrado${q ? ` para "${esc(q)}"` : ''}</div>`;
    return;
  }
  let html = '';
  let idx = 0;
  const renderItem = (r) => {
    const active = idx === cmdkActiveIdx ? ' active' : '';
    const sub = r.sub ? `<span class="cmdk-item-sub"> · ${esc(r.sub)}</span>` : '';
    const item = `<div class="cmdk-item${active}" data-i="${idx}">
      <i data-lucide="${r.icon}" class="ic-sm cmdk-item-icon"></i>
      <span class="cmdk-item-label">${esc(r.label)}${sub}</span>
      <span class="cmdk-item-kind">${esc(r.kind)}</span>
    </div>`;
    idx++;
    return item;
  };
  const sections = [
    { title: 'Ações & navegação', items: cmdkResults.filter(r => !['Demanda','Projeto','Fluxo','Usuário'].includes(r.kind)) },
    { title: 'Demandas',          items: cmdkResults.filter(r => r.kind === 'Demanda') },
    { title: 'Projetos',          items: cmdkResults.filter(r => r.kind === 'Projeto') },
    { title: 'Fluxos',            items: cmdkResults.filter(r => r.kind === 'Fluxo') },
    { title: 'Usuários',          items: cmdkResults.filter(r => r.kind === 'Usuário') }
  ];
  for (const sec of sections) {
    if (!sec.items.length) continue;
    html += `<div class="cmdk-section">${sec.title}</div>`;
    sec.items.forEach(r => { html += renderItem(r); });
  }
  out.innerHTML = html;
  out.querySelectorAll('.cmdk-item').forEach(it => {
    it.addEventListener('mouseenter', () => { cmdkActiveIdx = parseInt(it.dataset.i, 10); paintCmdkActive(); });
    it.addEventListener('click', () => {
      const r = cmdkResults[parseInt(it.dataset.i, 10)];
      if (r) cmdkRun(r);
    });
  });
  paintIcons();
}
function showShortcutsHelp() {
  let el = document.getElementById('shortcuts-help');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shortcuts-help';
    el.className = 'shortcuts-overlay';
    el.innerHTML = `
      <div class="shortcuts-card">
        <div class="shortcuts-head">
          <div class="shortcuts-title">Atalhos de teclado</div>
          <button class="modal-close" onclick="hideShortcutsHelp()" data-tooltip="Fechar"><i data-lucide="x" class="ic-sm"></i></button>
        </div>
        <div class="shortcuts-list">
          ${KB_SHORTCUTS.map(s => `<div class="shortcuts-row">
            <div class="shortcuts-keys">${s.keys.map(k => `<kbd>${esc(k)}</kbd>`).join('<span class="shortcuts-plus">depois</span>')}</div>
            <div class="shortcuts-label">${esc(s.label)}</div>
          </div>`).join('')}
        </div>
        <div class="shortcuts-hint">Atalhos não funcionam enquanto você digita em um campo.</div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', ev => { if (ev.target === el) hideShortcutsHelp(); });
  }
  el.classList.add('open');
  paintIcons();
}
function hideShortcutsHelp() {
  const el = document.getElementById('shortcuts-help');
  if (!el || !el.classList.contains('open')) return false;
  el.classList.remove('open');
  return true;
}

/* ─── TOOLTIPS GLOBAIS ───
   Substitui o tooltip nativo do navegador (cinza/feio) por um estilizado.
   Lê tanto data-tooltip="..." quanto title="..." (suprimindo o nativo). */
let _tooltipEl = null;
let _tooltipHover = null;
let _tooltipTimer = null;
function initTooltips() {
  if (_tooltipEl) return;
  _tooltipEl = document.createElement('div');
  _tooltipEl.className = 'tt';
  document.body.appendChild(_tooltipEl);

  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tooltip], [title]');
    if (!t || t === _tooltipHover) return;
    const text = t.getAttribute('data-tooltip') || t.getAttribute('title');
    if (!text || !text.trim()) return;
    // Suprime tooltip nativo do navegador
    if (t.hasAttribute('title')) {
      t.dataset._tt = t.getAttribute('title');
      t.removeAttribute('title');
    }
    _tooltipHover = t;
    clearTimeout(_tooltipTimer);
    _tooltipTimer = setTimeout(() => showTooltipFor(t, text), 350);
  });
  document.addEventListener('mouseout', e => {
    const t = e.target.closest('[data-tooltip], [data-_tt]');
    if (!t || t !== _tooltipHover) return;
    // Restaura title nativo se foi suprimido
    if (t.dataset._tt !== undefined) {
      t.setAttribute('title', t.dataset._tt);
      delete t.dataset._tt;
    }
    _tooltipHover = null;
    clearTimeout(_tooltipTimer);
    hideTooltip();
  });
  // Esconde em scroll/clique/blur
  window.addEventListener('scroll', hideTooltip, true);
  document.addEventListener('mousedown', hideTooltip);
}
function showTooltipFor(target, text) {
  if (!_tooltipEl) return;
  _tooltipEl.textContent = text;
  const r = target.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - 8, r.left + r.width / 2));
  let y = r.bottom + 8;
  // Se ficaria fora da viewport por baixo, mostra acima do elemento
  const flipUp = y + 36 > window.innerHeight;
  if (flipUp) y = r.top - 8;
  _tooltipEl.style.left = x + 'px';
  _tooltipEl.style.top = y + 'px';
  _tooltipEl.classList.toggle('above', flipUp);
  _tooltipEl.classList.add('open');
}
function hideTooltip() {
  if (_tooltipEl) _tooltipEl.classList.remove('open');
  clearTimeout(_tooltipTimer);
}

function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('open');
  paintIcons();
  // Auto-focus no primeiro campo editável do modal (input/textarea/select visível e habilitado).
  // Se algum open*() específico chamar .focus() depois, prevalece. Skip com data-no-autofocus.
  setTimeout(() => {
    if (!el.classList.contains('open')) return;
    if (el.dataset.noAutofocus) return;
    if (el.contains(document.activeElement) && document.activeElement !== document.body) return;
    const focusable = el.querySelector(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), ' +
      'textarea:not([disabled]):not([readonly]), ' +
      'select:not([disabled])'
    );
    if (focusable) focusable.focus();
  }, 80);
}
const ROUTED_MODAL_IDS = ['detail-modal','demand-modal','project-modal','flow-modal','user-modal','webhook-modal','client-modal'];
function closeModal(id) {
  $(id).classList.remove('open');
  // Para o poll de quase-realtime quando o detalhe é fechado
  if (id === 'detail-modal' && typeof stopDetailPoll === 'function') stopDetailPoll();
  // Limpa hashes legados (#demand-xyz)
  if (id === 'detail-modal' && location.hash.startsWith('#demand-')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  // Modais com rota própria → ao fechar reescreve URL pro destino apropriado.
  // Se ainda houver outro modal roteado por trás (ex.: editou uma demanda
  // a partir do detalhe), volta pra URL desse modal. Senão, URL da página.
  if (ROUTED_MODAL_IDS.includes(id)) {
    const stillOpen = ROUTED_MODAL_IDS.find(mid => mid !== id && document.getElementById(mid)?.classList.contains('open'));
    if (stillOpen === 'detail-modal' && detailId) navReplace('/demands/' + detailId);
    else navReplace(currentPageUrl());
  }
}

/* ── Lucide Icons ── */
function ic(name, attrs) {
  const extra = attrs ? ' ' + Object.entries(attrs).map(([k,v]) => `${k}="${esc(v)}"`).join(' ') : '';
  return `<i data-lucide="${name}"${extra}></i>`;
}
function paintIcons() {
  if (typeof window !== 'undefined' && window.lucide && lucide.createIcons) {
    try { lucide.createIcons(); } catch (e) {}
  }
}

/* ─── COLOR PICKER CUSTOM (16 swatches, design system) ─────────
   Substitui o input[type=color] nativo (que renderiza o picker do SO).
   Uso direto:
     <button type="button" class="color-swatch-trigger" style="background:#7A00FF"
             onclick="openColorPicker(this, (hex) => …)"></button>
   Pra wrapping de hidden input nativo:
     openColorPickerForInput(triggerEl, 'ws-color') — preserva oninput existente. */
const COLOR_PALETTE = [
  '#64748B', '#7A00FF', '#A855F7', '#EC4899',
  '#F43F5E', '#EF4444', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1', '#0F172A'
];
let _cpPopover = null;
let _cpActiveTrigger = null;
let _cpOnSelect = null;

function _ensureColorPickerPopover() {
  if (_cpPopover) return _cpPopover;
  _cpPopover = document.createElement('div');
  _cpPopover.className = 'color-picker-popover';
  _cpPopover.innerHTML = '<div class="color-picker-grid">' +
    COLOR_PALETTE.map(c => `<button type="button" class="color-swatch" data-color="${c}" style="background:${c}" title="${c}"><svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`).join('') +
    '</div>';
  document.body.appendChild(_cpPopover);
  _cpPopover.addEventListener('click', (e) => {
    const sw = e.target.closest('.color-swatch');
    if (!sw) return;
    const hex = sw.dataset.color;
    if (_cpOnSelect) _cpOnSelect(hex);
    closeColorPicker();
  });
  // Click outside fecha
  document.addEventListener('mousedown', (e) => {
    if (!_cpPopover.classList.contains('open')) return;
    if (_cpPopover.contains(e.target)) return;
    if (_cpActiveTrigger && _cpActiveTrigger.contains(e.target)) return;
    closeColorPicker();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _cpPopover.classList.contains('open')) closeColorPicker();
  });
  return _cpPopover;
}
function openColorPicker(triggerEl, onSelect, currentHex) {
  const pop = _ensureColorPickerPopover();
  _cpActiveTrigger = triggerEl;
  _cpOnSelect = onSelect;
  // Highlight selected
  pop.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('is-selected',
      (currentHex || '').toLowerCase() === (sw.dataset.color || '').toLowerCase());
  });
  // Posiciona embaixo do trigger
  const r = triggerEl.getBoundingClientRect();
  pop.style.visibility = 'hidden';
  pop.classList.add('open');
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
  pop.style.left = Math.max(8, left) + 'px';
  pop.style.top = Math.max(8, top) + 'px';
  pop.style.visibility = '';
  triggerEl.classList.add('is-open');
}
function closeColorPicker() {
  if (!_cpPopover) return;
  _cpPopover.classList.remove('open');
  if (_cpActiveTrigger) _cpActiveTrigger.classList.remove('is-open');
  _cpActiveTrigger = null;
  _cpOnSelect = null;
}
// Helper pra hidden input compat (preserva oninput/onchange existentes)
function openColorPickerForInput(triggerEl, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  openColorPicker(triggerEl, (hex) => {
    input.value = hex;
    triggerEl.style.background = hex;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, input.value);
}
// Quando o modal abre com cor pré-existente, sincroniza o background do trigger.
function setColorValue(inputId, hex) {
  const v = hex || '#7A00FF';
  const input = document.getElementById(inputId);
  if (input) input.value = v;
  const trigger = document.querySelector(`.color-swatch-trigger[data-color-input="${inputId}"]`);
  if (trigger) trigger.style.background = v;
}

/* ─────────── CUSTOM DATE / DATETIME PICKER ───────────
   Substitui o calendário e o seletor de hora nativos do navegador por um popup
   customizado que segue o design system. Para garantir que o picker nativo não
   apareça, os inputs <type=date> e <type=datetime-local> são convertidos para
   <type=text readonly> em tempo de execução, mantendo o formato de valor original.

   Formato do valor mantido por tipo:
     - date            → YYYY-MM-DD
     - datetime-local  → YYYY-MM-DDTHH:MM */
const FDP_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
let fdpTarget = null;        // input atualmente vinculado ao picker
let fdpMode = 'date';        // 'date' | 'datetime'
let fdpViewDate = null;      // {year, month} mostrado no calendário
let fdpYearsMode = false;
let fdpSelectedDay = null;   // {year, month, day} — só commit ao OK no modo datetime

function fdpParse(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return {
    year: +m[1], month: +m[2] - 1, day: +m[3],
    hour: m[4] !== undefined ? +m[4] : 0,
    minute: m[5] !== undefined ? +m[5] : 0
  };
}
function fdpFormatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function fdpFormatDateTime(year, month, day, hour, minute) {
  return `${fdpFormatDate(year, month, day)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function fdpFormatDisplay(value, mode) {
  // Para exibição amigável no input "text" (dd/mm/aaaa ou dd/mm/aaaa HH:MM)
  const p = fdpParse(value);
  if (!p) return '';
  const d = `${String(p.day).padStart(2, '0')}/${String(p.month + 1).padStart(2, '0')}/${p.year}`;
  if (mode === 'datetime') return `${d} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return d;
}
function fdpTodayParts() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
}
function fdpRenderGrid() {
  const grid = document.getElementById('fdp-grid');
  const title = document.querySelector('.fdp-title');
  const { year, month } = fdpViewDate;
  title.innerHTML = `${FDP_MONTHS[month]} de ${year} <i data-lucide="chevron-down" class="ic-xs"></i>`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const today = fdpTodayParts();
  // No modo datetime, a seleção é "pendente" (fdpSelectedDay) até clicar OK
  const selected = fdpMode === 'datetime' ? fdpSelectedDay : fdpParse(fdpTarget?._fdpValue || '');

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: month - 1, year: month === 0 ? year - 1 : year, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, month, year, other: false });
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    const next = new Date(last.year, last.month, last.day + 1);
    cells.push({ day: next.getDate(), month: next.getMonth(), year: next.getFullYear(), other: true });
  }

  grid.innerHTML = cells.map(c => {
    const isToday = c.day === today.day && c.month === today.month && c.year === today.year;
    const isSelected = selected && c.day === selected.day && c.month === selected.month && c.year === selected.year;
    const classes = ['fdp-day'];
    if (c.other) classes.push('other');
    if (isToday) classes.push('today');
    if (isSelected) classes.push('selected');
    return `<button type="button" class="${classes.join(' ')}" data-y="${c.year}" data-m="${c.month}" data-d="${c.day}">${c.day}</button>`;
  }).join('');
  paintIcons();
}
function fdpRenderYears() {
  const wrap = document.getElementById('fdp-years');
  const cur = fdpViewDate.year;
  const start = cur - 6, end = cur + 7;
  const today = fdpTodayParts();
  const html = [];
  for (let y = start; y <= end; y++) {
    const isCur = y === cur;
    const isToday = y === today.year;
    html.push(`<button type="button" class="fdp-year ${isCur ? 'selected' : ''} ${isToday ? 'today' : ''}" data-year="${y}">${y}</button>`);
  }
  wrap.innerHTML = html.join('');
}
function fdpToggleYears(force) {
  fdpYearsMode = force !== undefined ? force : !fdpYearsMode;
  document.getElementById('fdp-grid').style.display = fdpYearsMode ? 'none' : '';
  document.querySelector('.fdp-dow').style.display = fdpYearsMode ? 'none' : '';
  document.getElementById('fdp-years').style.display = fdpYearsMode ? '' : 'none';
  const timeBox = document.getElementById('fdp-time');
  if (timeBox) timeBox.style.display = (!fdpYearsMode && fdpMode === 'datetime') ? '' : 'none';
  if (fdpYearsMode) fdpRenderYears();
}
function fdpPositionNear(input) {
  const dp = document.getElementById('fluxo-datepicker');
  const r = input.getBoundingClientRect();
  dp.style.display = 'block';
  const dpRect = dp.getBoundingClientRect();
  const margin = 6;
  let top = r.bottom + margin + window.scrollY;
  let left = r.left + window.scrollX;
  if (r.bottom + dpRect.height + margin > window.innerHeight) {
    top = Math.max(8 + window.scrollY, r.top - dpRect.height - margin + window.scrollY);
  }
  if (left + dpRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - dpRect.width - 8);
  }
  dp.style.top = top + 'px';
  dp.style.left = left + 'px';
}
function fdpOpen(input) {
  if (input.disabled) return;
  fdpTarget = input;
  fdpMode = input.dataset.fdp === 'datetime' ? 'datetime' : 'date';
  const dp = document.getElementById('fluxo-datepicker');
  const okBtn = document.getElementById('fdp-ok');
  const timeBox = document.getElementById('fdp-time');
  // Botão OK só aparece no modo datetime (datepicker simples confirma direto ao clicar no dia)
  if (okBtn) okBtn.style.display = fdpMode === 'datetime' ? '' : 'none';
  if (timeBox) timeBox.style.display = fdpMode === 'datetime' ? '' : 'none';

  const parsed = fdpParse(input._fdpValue || '');
  const t = parsed || fdpTodayParts();
  fdpViewDate = { year: t.year, month: t.month };
  fdpSelectedDay = parsed ? { year: parsed.year, month: parsed.month, day: parsed.day } : null;
  if (fdpMode === 'datetime') {
    document.getElementById('fdp-h').value = String(t.hour).padStart(2, '0');
    document.getElementById('fdp-m').value = String(t.minute).padStart(2, '0');
  }
  fdpToggleYears(false);
  fdpRenderGrid();
  fdpPositionNear(input);
  dp.classList.add('open');
}
function fdpClose() {
  const dp = document.getElementById('fluxo-datepicker');
  dp.classList.remove('open');
  dp.style.display = 'none';
  fdpTarget = null;
}
function fdpCommit(value) {
  // Apenas atribui ISO via .value; nosso setter armazena em _fdpValue e atualiza o display
  if (!fdpTarget) return;
  fdpTarget.value = value || '';
  fdpTarget.dispatchEvent(new Event('input', { bubbles: true }));
  fdpTarget.dispatchEvent(new Event('change', { bubbles: true }));
}
function fdpClampTime(h, m) {
  h = parseInt(h, 10); m = parseInt(m, 10);
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(m)) m = 0;
  return { h: Math.max(0, Math.min(23, h)), m: Math.max(0, Math.min(59, m)) };
}
function fdpReadTime() {
  return fdpClampTime(document.getElementById('fdp-h').value, document.getElementById('fdp-m').value);
}
function fdpWriteTime(h, m) {
  document.getElementById('fdp-h').value = String(h).padStart(2, '0');
  document.getElementById('fdp-m').value = String(m).padStart(2, '0');
}
function fdpSelectDay(year, month, day) {
  if (fdpMode === 'date') {
    fdpCommit(fdpFormatDate(year, month, day));
    fdpClose();
  } else {
    fdpSelectedDay = { year, month, day };
    fdpRenderGrid();
  }
}
function fdpInitGlobal() {
  const dp = document.getElementById('fluxo-datepicker');
  if (!dp || dp.dataset.bound) return;
  dp.dataset.bound = '1';

  // Não fecha o popup com mousedowns internos
  dp.addEventListener('mousedown', e => e.stopPropagation());

  // Cliques dentro do popup
  dp.addEventListener('click', e => {
    const day = e.target.closest('.fdp-day');
    const yr  = e.target.closest('.fdp-year');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (day) { fdpSelectDay(+day.dataset.y, +day.dataset.m, +day.dataset.d); return; }
    if (yr)  { fdpViewDate.year = +yr.dataset.year; fdpToggleYears(false); fdpRenderGrid(); return; }

    if (act === 'prev') {
      if (fdpYearsMode) { fdpViewDate.year -= 14; fdpRenderYears(); }
      else { fdpViewDate.month--; if (fdpViewDate.month < 0) { fdpViewDate.month = 11; fdpViewDate.year--; } fdpRenderGrid(); }
    } else if (act === 'next') {
      if (fdpYearsMode) { fdpViewDate.year += 14; fdpRenderYears(); }
      else { fdpViewDate.month++; if (fdpViewDate.month > 11) { fdpViewDate.month = 0; fdpViewDate.year++; } fdpRenderGrid(); }
    } else if (act === 'title') {
      fdpToggleYears();
    } else if (act === 'today') {
      const t = fdpTodayParts();
      if (fdpMode === 'date') {
        fdpCommit(fdpFormatDate(t.year, t.month, t.day));
        fdpClose();
      } else {
        fdpSelectedDay = { year: t.year, month: t.month, day: t.day };
        fdpWriteTime(t.hour, t.minute);
        fdpViewDate = { year: t.year, month: t.month };
        fdpRenderGrid();
      }
    } else if (act === 'clear') {
      fdpCommit('');
      fdpClose();
    } else if (act === 'ok') {
      if (!fdpSelectedDay) {
        // Se nada foi clicado mas o usuário quer confirmar a hora com a data atual, usa hoje
        const t = fdpTodayParts();
        fdpSelectedDay = { year: t.year, month: t.month, day: t.day };
      }
      const { h, m } = fdpReadTime();
      fdpCommit(fdpFormatDateTime(fdpSelectedDay.year, fdpSelectedDay.month, fdpSelectedDay.day, h, m));
      fdpClose();
    } else if (act === 'h-up' || act === 'h-down' || act === 'm-up' || act === 'm-down') {
      let { h, m } = fdpReadTime();
      if (act === 'h-up')   h = (h + 1) % 24;
      if (act === 'h-down') h = (h + 23) % 24;
      if (act === 'm-up')   m = (m + 5) % 60;  // passos de 5 minutos
      if (act === 'm-down') m = (m + 55) % 60;
      fdpWriteTime(h, m);
    }
  });

  // Aceita digitação direta nos campos de hora/minuto
  ['fdp-h', 'fdp-m'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^0-9]/g, '').slice(0, 2);
    });
    el.addEventListener('blur', () => {
      const max = id === 'fdp-h' ? 23 : 59;
      let v = parseInt(el.value, 10);
      if (!Number.isFinite(v)) v = 0;
      el.value = String(Math.max(0, Math.min(max, v))).padStart(2, '0');
    });
  });

  // Fecha ao clicar fora ou Esc
  document.addEventListener('mousedown', e => {
    if (!fdpTarget) return;
    if (e.target === fdpTarget) return;
    if (e.target.closest('#fluxo-datepicker')) return;
    fdpClose();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && fdpTarget) fdpClose();
  });

  // Reposiciona em resize/scroll
  window.addEventListener('resize', () => { if (fdpTarget) fdpPositionNear(fdpTarget); });
  window.addEventListener('scroll', () => { if (fdpTarget) fdpPositionNear(fdpTarget); }, true);

  // Converte os inputs nativos para "text" (bloqueando definitivamente o picker do navegador)
  fdpConvertAll();
  // Reaplica conversão a inputs criados dinamicamente (modais que são re-renderizados)
  new MutationObserver(() => fdpConvertAll()).observe(document.body, { childList: true, subtree: true });

  // Abre o popup ao clicar/focar num input convertido
  document.addEventListener('mousedown', e => {
    const input = e.target.closest('input[data-fdp]');
    if (!input || input.disabled) return;
    e.preventDefault();
    input.focus();
    fdpOpen(input);
  }, true);
  document.addEventListener('focus', e => {
    const input = e.target.closest && e.target.closest('input[data-fdp]');
    if (!input || input.disabled) return;
    fdpOpen(input);
  }, true);
}

// Captura o descritor original de HTMLInputElement.prototype.value para podermos
// escrever o texto exibido sem cair no nosso próprio setter (recursão).
const FDP_NATIVE_VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

function fdpConvertAll() {
  // Converte qualquer <input type=date|datetime-local> ainda não tratado
  document.querySelectorAll('input[type="date"]:not([data-fdp]), input[type="datetime-local"]:not([data-fdp])').forEach(inp => {
    const mode = inp.type === 'datetime-local' ? 'datetime' : 'date';
    const isoVal = FDP_NATIVE_VALUE.get.call(inp); // valor original (ISO)
    inp.type = 'text';
    inp.setAttribute('readonly', 'readonly');
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('placeholder', mode === 'datetime' ? 'dd/mm/aaaa --:--' : 'dd/mm/aaaa');
    inp.dataset.fdp = mode;
    inp._fdpValue = isoVal || '';
    // Define o texto exibido (formatado) sem disparar nosso setter
    FDP_NATIVE_VALUE.set.call(inp, fdpFormatDisplay(inp._fdpValue, mode));
    // Sobrescreve .value: getter retorna ISO; setter aceita ISO e atualiza texto
    Object.defineProperty(inp, 'value', {
      configurable: true,
      get() { return this._fdpValue || ''; },
      set(v) {
        this._fdpValue = v || '';
        FDP_NATIVE_VALUE.set.call(this, fdpFormatDisplay(this._fdpValue, this.dataset.fdp));
      }
    });
  });
}

// Init no DOMReady
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fdpInitGlobal);
} else {
  fdpInitGlobal();
}

/* ── Modal de confirmação universal ── */
let _confirmResolve = null;
function showConfirm(opts) {
  const o = Object.assign({
    title: 'Confirmar ação',
    message: 'Tem certeza?',
    okLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    danger: false,
    kind: null, // 'danger' | 'warn' | 'info' | 'success' (auto: danger => 'danger')
  }, opts || {});
  $('confirm-title').textContent = o.title;
  $('confirm-message').innerHTML = o.message;
  const okBtn = $('confirm-ok-btn');
  okBtn.textContent = o.okLabel;
  okBtn.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
  // Ícone tematizado: injeta antes da mensagem se ainda não existe
  const kind = o.kind || (o.danger ? 'danger' : 'info');
  const ICONS = {
    danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    warn:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  };
  const body = document.querySelector('#confirm-modal .modal-body');
  if (body) {
    let icon = body.querySelector('.confirm-icon');
    if (icon) icon.remove();
    icon = document.createElement('div');
    icon.className = 'confirm-icon is-' + kind;
    icon.innerHTML = ICONS[kind] || ICONS.info;
    body.insertBefore(icon, body.firstChild);
  }
  okBtn.focus();
  document.querySelector('#confirm-modal .modal-title').parentElement.parentElement
    .classList.toggle('modal-danger', !!o.danger);
  openModal('confirm-modal');
  return new Promise(res => { _confirmResolve = res; });
}
function confirmAccept() { closeModal('confirm-modal'); if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; } }
function confirmCancel() { closeModal('confirm-modal'); if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; } }

/* ── Prompt universal (entrada de texto) ── */
let _promptResolve = null;
function showPrompt(opts) {
  const o = Object.assign({ title: 'Informar', message: '', placeholder: '', defaultValue: '', okLabel: 'OK' }, opts || {});
  let p = document.getElementById('prompt-modal');
  if (!p) {
    p = document.createElement('div');
    p.id = 'prompt-modal';
    p.className = 'modal-overlay';
    p.innerHTML = `<div class="modal modal-sm" data-no-outside-close="1">
      <div class="modal-header"><div class="modal-title" id="prompt-title">Informar</div><button class="modal-close" onclick="promptCancel()"><i data-lucide="x" class="ic-sm"></i></button></div>
      <div class="modal-body">
        <div id="prompt-message" style="font-size:13px;color:var(--text-dim);margin-bottom:10px"></div>
        <input class="form-control" id="prompt-input" type="text">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="promptCancel()">Cancelar</button>
        <button class="btn btn-primary" id="prompt-ok-btn" onclick="promptAccept()">OK</button>
      </div>
    </div>`;
    document.body.appendChild(p);
  }
  $('prompt-title').textContent = o.title;
  $('prompt-message').textContent = o.message;
  const inp = $('prompt-input');
  inp.placeholder = o.placeholder;
  inp.value = o.defaultValue;
  $('prompt-ok-btn').textContent = o.okLabel;
  openModal('prompt-modal');
  setTimeout(() => { inp.focus(); inp.select(); }, 80);
  inp.onkeydown = ev => { if (ev.key === 'Enter') promptAccept(); };
  return new Promise(res => { _promptResolve = res; });
}
function promptAccept() {
  const v = $('prompt-input').value.trim();
  closeModal('prompt-modal');
  if (_promptResolve) { _promptResolve(v); _promptResolve = null; }
}
function promptCancel() {
  closeModal('prompt-modal');
  if (_promptResolve) { _promptResolve(null); _promptResolve = null; }
}

/* ── Click fora do modal fecha (com proteção) ── */
function attemptCloseModal(id) {
  if (id === 'detail-modal' && hasUnsavedDetailEdits()) {
    showConfirm({
      title: 'Descartar alterações?',
      message: 'Você tem alterações pendentes não confirmadas. Se sair agora, elas serão perdidas.',
      okLabel: 'Descartar e fechar',
      danger: true
    }).then(ok => { if (ok) { discardDetailEdits(); closeModal('detail-modal'); } });
    return;
  }
  if (id === 'flow-modal' && flowModalDirty) {
    showConfirm({
      title: 'Descartar alterações?',
      message: 'Você tem alterações no fluxo que não foram salvas. Deseja sair sem salvar?',
      okLabel: 'Descartar e fechar',
      danger: true
    }).then(ok => { if (ok) { flowModalDirty = false; closeModal('flow-modal'); } });
    return;
  }
  closeModal(id);
}
document.addEventListener('click', ev => {
  const overlay = ev.target.closest('.modal-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (ev.target !== overlay) return; // clicou no fundo, não no conteúdo
  const inner = overlay.querySelector('.modal');
  if (inner && inner.dataset.noOutsideClose === '1') return;
  attemptCloseModal(overlay.id);
}, true);
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
  if (!open) return;
  const inner = open.querySelector('.modal');
  if (inner && inner.dataset.noOutsideClose === '1') return;
  attemptCloseModal(open.id);
});
document.addEventListener('click', e => {
  // fecha dropdowns customizados ao clicar fora
  document.querySelectorAll('.user-select.open').forEach(el => {
    if (!el.contains(e.target)) el.classList.remove('open');
  });
  const pop = $('mention-pop');
  if (pop && pop.classList.contains('open') && !pop.contains(e.target) && e.target.id !== 'comment-input') {
    pop.classList.remove('open');
  }
});

/* ─── SELECT DE USUÁRIO COM FOTO ─── */
function buildUserSelect(container, list, selectedId, onPick, placeholder = '— Sem responsável —') {
  container.classList.add('user-select');
  container.dataset.value = selectedId || '';
  const sorted = list.slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const sel = selectedId ? userById(selectedId) : null;
  const btnLabel = sel
    ? `${avatarHTML(sel)}<span class="user-mini"><span class="user-mini-name">${esc(sel.name)}</span>${sel.role ? `<span class="user-mini-role">${esc(sel.role)}</span>` : ''}</span>`
    : `<span style="color:var(--text-muted)">${esc(placeholder)}</span>`;
  let opts = `<div class="user-select-opt ${!selectedId ? 'sel' : ''}" data-uid="">
      <div class="avatar" style="background:var(--surface-3);color:var(--text-muted)">—</div>
      <span class="user-mini"><span class="user-mini-name" style="color:var(--text-muted)">${esc(placeholder)}</span></span>
    </div>`;
  sorted.forEach(u => {
    opts += `<div class="user-select-opt ${u.id === selectedId ? 'sel' : ''}" data-uid="${u.id}">
      ${avatarHTML(u)}
      <span class="user-mini"><span class="user-mini-name">${esc(u.name)}</span>${u.role ? `<span class="user-mini-role">${esc(u.role)}</span>` : ''}</span>
    </div>`;
  });
  container.innerHTML = `
    <button type="button" class="user-select-btn">${btnLabel}<i data-lucide="chevron-down" class="ic-xs"></i></button>
    <div class="user-select-menu">${opts}</div>`;
  container.querySelector('.user-select-btn').onclick = e => {
    e.stopPropagation();
    document.querySelectorAll('.user-select.open').forEach(el => { if (el !== container) el.classList.remove('open'); });
    container.classList.toggle('open');
    if (container.classList.contains('open')) {
      // Auto-flip pra cima quando não cabe abaixo dentro do modal/host
      container.classList.remove('drop-up');
      const menu = container.querySelector('.user-select-menu');
      if (menu) {
        const rect = container.getBoundingClientRect();
        const scrollHost = container.closest('.modal-body') || container.closest('.modal') || document.documentElement;
        const hostRect = scrollHost.getBoundingClientRect ? scrollHost.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const bottomLimit = Math.min(hostRect.bottom, window.innerHeight);
        const topLimit = Math.max(hostRect.top, 0);
        const spaceBelow = bottomLimit - rect.bottom;
        const spaceAbove = rect.top - topLimit;
        const menuH = menu.scrollHeight || menu.offsetHeight || 0;
        if (spaceBelow < menuH + 12 && spaceAbove > spaceBelow) container.classList.add('drop-up');
      }
    }
  };
  container.querySelectorAll('.user-select-opt').forEach(opt => {
    opt.onclick = () => {
      const uid = opt.dataset.uid || '';
      container.classList.remove('open');
      buildUserSelect(container, list, uid || null, onPick, placeholder);
      if (onPick) onPick(uid || null);
    };
  });
}

/* ─── AUTENTICAÇÃO ─── */
async function doLogin() {
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  $('login-error').textContent = '';
  if (!username || !password) { $('login-error').textContent = 'Informe usuário e senha.'; return; }
  try {
    const data = await api('/login', 'POST', { username, password });
    // O cookie httpOnly já foi setado pelo server. Só guardamos os dados do usuário.
    me = data.user;
    await enterApp();
  } catch (e) {
    $('login-error').textContent = e.message;
  }
}
async function doLogout() {
  try { await api('/logout', 'POST'); } catch {}
  forceLogout();
}
function forceLogout() {
  me = null;
  clearInterval(notifPollTimer);
  // Limpa qualquer resíduo do mecanismo antigo (fluxo_token em localStorage)
  try { localStorage.removeItem('fluxo_token'); } catch {}
  $('app').style.display = 'none';
  $('login-screen').style.display = 'flex';
  $('login-password').value = '';
}

/* ─── TEMA (light/dark) ─── */
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  const lbl = document.getElementById('theme-toggle-label');
  if (lbl) lbl.textContent = t === 'light' ? 'Modo claro' : 'Modo escuro';
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  // Troca os logos (sidebar + login) conforme o tema: preto sobre fundo claro, branco sobre escuro
  const logoSrc = t === 'light' ? '/Kastor_preto.svg' : '/Kastor_branco.svg';
  document.querySelectorAll('.sidebar-brand img, .login-logo img').forEach(img => {
    if (img.getAttribute('src') !== logoSrc) img.setAttribute('src', logoSrc);
  });
}
function toggleTheme() {
  const current = localStorage.getItem('kastor-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('kastor-theme', next);
  applyTheme(next);
}
// Aplica o tema o mais cedo possível — antes do app render — para evitar flash
applyTheme(localStorage.getItem('kastor-theme') || 'dark');

async function boot() {
  // Rota pré-autenticação: /reset/<token> abre a tela de reset de senha
  // (pública — sem auth nem app carregado).
  const resetMatch = location.pathname.match(/^\/reset\/([A-Za-z0-9_-]+)$/);
  if (resetMatch) { showResetScreen(resetMatch[1]); return; }
  // Sem token em localStorage agora — tenta /me direto. Se cookie httpOnly
  // estiver válido, server devolve o user; senão 401 → forceLogout.
  try {
    me = await api('/me');
    await enterApp();
  } catch { forceLogout(); }
}

/* ─── FLUXO "ESQUECI MINHA SENHA" ───
   1. Link no login chama showForgotPassword → pergunta e-mail → POST /api/forgot-password
   2. Usuário recebe e-mail com /reset/<token>
   3. Boot detecta /reset/<token> e chama showResetScreen
   4. doResetPassword troca a senha e redireciona pro login */
async function showForgotPassword() {
  const email = await showPrompt({
    title: 'Esqueci minha senha',
    message: 'Informe o e-mail cadastrado no seu perfil. Se houver conta vinculada, vamos enviar um link para definir uma nova senha.',
    placeholder: 'voce@empresa.com',
    okLabel: 'Enviar link'
  });
  if (!email || !email.trim()) return;
  try {
    await api('/forgot-password', 'POST', { email: email.trim() });
    toast('Se o e-mail estiver cadastrado, você vai receber as instruções em alguns minutos. Confira também o spam.', 'success');
  } catch (e) {
    // 503 = SMTP não configurado — vale mostrar a mensagem real do server
    toast(e.message || 'Erro ao enviar', 'error');
  }
}
let _resetToken = null;
function showResetScreen(token) {
  _resetToken = token;
  // Esconde tudo e mostra só a tela de reset
  $('login-screen').style.display = 'none';
  $('app').style.display = 'none';
  $('reset-screen').classList.add('open');
  setTimeout(() => { const i = document.getElementById('reset-new-pass'); if (i) i.focus(); }, 60);
}
async function doResetPassword() {
  const p1 = $('reset-new-pass').value;
  const p2 = $('reset-confirm-pass').value;
  const err = $('reset-error');
  err.textContent = '';
  if (!p1 || p1.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
  if (p1 !== p2) { err.textContent = 'As senhas não conferem.'; return; }
  try {
    await api('/reset-password', 'POST', { token: _resetToken, newPassword: p1 });
    // Redireciona pro login com URL limpa
    history.replaceState(null, '', '/');
    location.reload();
  } catch (e) {
    err.textContent = e.message || 'Erro ao redefinir senha.';
  }
}

async function enterApp() {
  // Mostra a UI imediatamente com skeleton — usuário não vê tela em branco
  $('login-screen').style.display = 'none';
  $('app').style.display = 'flex';
  $('app').classList.add('active');
  initTooltips();
  initKeyboardShortcuts();
  $('topbar-title').textContent = 'Dashboard';
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-dashboard'));
  if ($('metrics-grid')) $('metrics-grid').innerHTML = skeletonMetrics();
  if ($('list-table-body')) $('list-table-body').innerHTML = skeletonTableRows(9, 6);
  if ($('sidebar-uname')) $('sidebar-uname').innerHTML = '<span class="skeleton skeleton-line sm" style="display:inline-block;width:80px;height:11px;vertical-align:middle"></span>';

  await loadAll();

  renderSidebarUser();
  renderWsSwitch();
  dashUserInit = false;
  // Carrega rota inicial. Compat: links antigos #demand-<id> são migrados
  // pra /demands/<id> antes de aplicar a rota.
  const legacyHash = (location.hash || '').match(/^#demand-([A-Za-z0-9_-]+)/);
  if (legacyHash) {
    history.replaceState(null, '', '/demands/' + legacyHash[1] + location.search);
  }
  if (location.pathname === '/' || location.pathname === '/index.html') {
    goPage('dashboard');
  } else {
    applyRoute();
  }
  await fetchNotifications();
  startNotifPoll();
  startRealtimeSync(); // SSE — substitui polling agressivo de dados
  paintIcons();
}

async function loadAll() {
  const results = await Promise.all([
    api('/workspaces'), api('/users'), api('/clients'), api('/projects'),
    api('/flows'), api('/demands'), api('/roles'), api('/templates'),
    api('/webhooks').catch(() => []),
    api('/schedules').catch(() => []),
    api('/client-templates').catch(() => []),
    api('/recurrings').catch(() => [])
  ]);
  [workspaces, users, clients, projects, flows, demands, roles, templates, webhooks, schedules, clientTemplates, recurrings] = results;
  const allowed = workspaces.map(w => w.id);
  if (!activeWs || !allowed.includes(activeWs)) activeWs = allowed[0] || null;
  localStorage.setItem('fluxo_ws', activeWs || '');
}

async function fetchNotifications() {
  try { notifications = await api('/notifications'); } catch { notifications = []; }
  renderNotifBadge();
}
function startNotifPoll() {
  clearInterval(notifPollTimer);
  notifPollTimer = setInterval(fetchNotifications, 30000); // a cada 30s
}

async function refreshData() {
  await loadAll();
  renderWsSwitch();
  renderCurrent();
  fetchNotifications(); // atualiza notificações silenciosamente
}

/* ─── WORKSPACE SWITCH ─── */
function renderWsSwitch() {
  const wrap = $('ws-switch');
  wrap.classList.toggle('single', workspaces.length <= 1);
  const active = wsById(activeWs);
  const dot = $('ws-trigger-dot');
  const label = $('ws-trigger-label');
  if (dot) dot.style.background = active?.color || 'var(--accent)';
  if (label) label.textContent = active?.name || '—';
  const menu = $('ws-cdrop-menu');
  if (menu) {
    menu.innerHTML = workspaces.map(w => `
      <div class="filter-cdrop-item ${w.id === activeWs ? 'active' : ''}" onclick="switchWorkspace('${w.id}')">
        <span class="pill-dot" style="background:${w.color || 'var(--accent)'}"></span>
        <span>${esc(w.name)}</span>
      </div>`).join('');
  }
  // Atualiza a faixa de cor do workspace ativo na sidebar
  document.documentElement.style.setProperty('--current-ws-color', active?.color || 'var(--accent)');
  paintIcons();
}
function switchWorkspace(id) {
  activeWs = id;
  localStorage.setItem('fluxo_ws', id);
  dashFlowId = null;
  dashUserInit = false; // re-aplica filtro padrão do usuário no novo workspace
  // Fecha o dropdown do switcher
  const cdrop = $('ws-cdrop');
  if (cdrop) cdrop.classList.remove('open');
  renderWsSwitch();
  renderCurrent();
  toast('Workspace: ' + (wsById(id)?.name || ''), 'success');
}

/* ─── NAVEGAÇÃO ─── */
function renderSidebarUser() {
  $('sidebar-uname').textContent = me.name;
  $('sidebar-urole').textContent = me.isAdmin ? (me.role ? me.role + ' · Admin' : 'Administrador') : (me.role || 'Equipe');
  // Mantém o id="sidebar-avatar" depois da substituição — regex pega qualquer
  // combinação de classes (avatar, avatar presence-online, etc) pra não quebrar
  // se avatarHTML virar a incluir mais classes (ex.: anel de presença).
  const av = $('sidebar-avatar');
  if (av) av.outerHTML = avatarHTML(me, 'avatar').replace(/class="([^"]+)"/, 'class="$1" id="sidebar-avatar"');
  // Todas as abas visíveis pra todos. Mutação fica gated por .admin-only
  // (toggle global via classe body.user-readonly).
  document.body.classList.toggle('user-readonly', !me.isAdmin);
}

const PAGE_TITLES = {
  dashboard: 'Dashboard', list: 'Demandas', mine: 'Minhas Demandas',
  clients: 'Clientes', projects: 'Projetos', flows: 'Fluxos de Demanda',
  workspaces: 'Workspaces', users: 'Usuários', profile: 'Meu Perfil',
  capacity: 'Capacidade', templates: 'Templates', integrations: 'Integrações', agenda: 'Agenda',
  recurring: 'Recorrentes'
};
function goPage(page) {
  currentPage = page;
  // Cada entrada na página força um restoreFilters na próxima render.
  _markFiltersDirty(page);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  $('topbar-title').textContent = PAGE_TITLES[page] || '';
  renderCurrent();
  navPush(pageUrlFor(page));
  // Em mobile, fecha o menu lateral ao navegar pra uma página.
  closeSidebar();
}

/* ─── SIDEBAR MOBILE — slide-in com backdrop ───
   Em desktop a sidebar é fixa. Abaixo de ~880px ela vira off-canvas:
   o body ganha .menu-open, sidebar desliza pra dentro, backdrop intercepta clicks.
   Estado vive apenas em classList — sem persistência (sempre começa fechada). */
function toggleSidebar() {
  document.body.classList.toggle('menu-open');
}
function closeSidebar() {
  document.body.classList.remove('menu-open');
}
// Esc fecha o menu mobile quando aberto.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
    const anyModal = document.querySelector('.modal-overlay.open, #cmdk.open, #shortcuts-help.open');
    if (!anyModal) { e.preventDefault(); closeSidebar(); }
  }
});
function renderCurrent() {
  switch (currentPage) {
    case 'dashboard':  renderDashboard(); break;
    case 'list':       renderList(); renderCalendar('all'); break;
    case 'mine':       renderMine(); renderCalendar('mine'); break;
    case 'capacity':   renderCapacity(); break;
    case 'agenda':     renderAgenda(); break;
    case 'templates':  renderTemplates(); break;
    case 'recurring':  renderRecurring(); break;
    case 'integrations': renderIntegrations(); break;
    case 'clients': {
      // Decide entre grid e detalhe sem perder estado quando refreshData() roda
      // com um modal aberto (URL temporariamente em /projects/new etc).
      const path = location.pathname;
      const isOnGridUrl = path === '/clients' || path === '/clients/';
      const detailMatch = path.match(/^\/clients\/([^/]+)$/);
      const detailId = detailMatch ? detailMatch[1] : null;
      if (isOnGridUrl) {
        currentClientId = null;
        renderClients();
      } else if (detailId && clientById(detailId)) {
        currentClientId = detailId;
        $('clients-view-grid').style.display = 'none';
        $('clients-view-detail').style.display = '';
        renderClientDetail(detailId);
      } else if (currentClientId && clientById(currentClientId)) {
        // URL em outra rota (modal), preserva o detalhe que estava aberto
        $('clients-view-grid').style.display = 'none';
        $('clients-view-detail').style.display = '';
        renderClientDetail(currentClientId);
      } else {
        renderClients();
      }
      break;
    }
    case 'projects':   renderProjects(); break;
    case 'flows':      renderFlows(); break;
    case 'workspaces': renderWorkspaces(); break;
    case 'users':      renderUsers(); break;
    case 'profile':    renderProfile(); break;
  }
  paintIcons();
}

/* ─── FILTROS COMUNS ─── */
function fillSelect(sel, options, currentValue, firstLabel) {
  const prev = currentValue !== undefined ? currentValue : sel.value;
  const sorted = options.slice().sort((a, b) => norm(a.label).localeCompare(norm(b.label)));
  sel.innerHTML = `<option value="">${firstLabel}</option>` +
    sorted.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  if ([...sel.options].some(op => op.value === prev)) sel.value = prev;
}
function fillRoleSelect(selId, currentValue) {
  const sel = $(selId);
  const sorted = roles.slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  sel.innerHTML = '<option value="">— Sem função —</option>' +
    sorted.map(r => `<option value="${esc(r.name)}" ${r.name === currentValue ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
}
function matchPeriod(dateStr, period) {
  if (!period) return true;
  if (!dateStr) return false;
  const d = String(dateStr).slice(0,10);
  const now = new Date();
  const today = todayStr();
  if (period === 'today') return d === today;
  if (period === '7') {
    const lim = new Date(); lim.setDate(lim.getDate() + 7);
    return d >= today && d <= lim.toISOString().slice(0,10);
  }
  if (period === 'month') {
    const pref = today.slice(0,7);
    return d.startsWith(pref);
  }
  if (period === 'lastmonth') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const pref = `${lm.getFullYear()}-${String(lm.getMonth()+1).padStart(2,'0')}`;
    return d.startsWith(pref);
  }
  if (period === '90') {
    const lim = new Date(); lim.setDate(lim.getDate() - 90);
    return d >= lim.toISOString().slice(0,10) && d <= today;
  }
  return true;
}

/* ─── DASHBOARD ─── */
function dashDemandTypes() {
  return [...new Set(wsFlows().map(f => f.demandType).filter(Boolean))].sort();
}
function dashFilteredDemands() {
  const fu = $('dash-f-user').value;
  const fp = $('dash-f-period').value;
  const ft = $('dash-f-type').value;
  const fc = $('dash-f-client').value;
  return wsDemands().filter(d => {
    if (fu && d.ownerId !== fu) return false;
    if (!matchPeriod(effDue(d), fp)) return false;
    if (ft && demandType(d) !== ft) return false;
    if (fc) {
      const p = projectById(d.projectId);
      if (!p || p.client !== fc) return false;
    }
    return true;
  });
}
function clearDashFilters() {
  ['dash-f-user','dash-f-period','dash-f-type','dash-f-client'].forEach(id => $(id).value = '');
  renderDashboard();
}
function renderDashboard() {
  // selects de filtro (preservando seleção)
  fillSelect($('dash-f-user'), wsUsers().map(u => ({ value: u.id, label: u.name })), undefined, 'Todos os usuários');
  fillSelect($('dash-f-type'), dashDemandTypes().map(t => ({ value: t, label: t })), undefined, 'Todos os tipos');
  fillSelect($('dash-f-client'),
    [...new Set(wsProjects().map(p => p.client).filter(Boolean))].sort().map(c => ({ value: c, label: c })),
    undefined, 'Todos os clientes');

  // por padrão o dashboard abre filtrado para o usuário ativo
  if (!dashUserInit) {
    dashUserInit = true;
    if ([...$('dash-f-user').options].some(o => o.value === me.id)) $('dash-f-user').value = me.id;
  }

  // Filtros salvos da sessão anterior vencem o default acima (mas só na primeira
  // pintura do dashboard — depois disso o user já interagiu).
  restoreFilters('dashboard');

  ['dash-f-user','dash-f-period','dash-f-type','dash-f-client'].forEach(id => {
    $(id).classList.toggle('filtering', !!$(id).value);
  });

  // Estilizar os filtros como dropdowns customizados
  applyFilterDropdown('dash-f-user', { userIcon: true });
  applyFilterDropdown('dash-f-client');
  applyFilterDropdown('dash-f-period');
  applyFilterDropdown('dash-f-type');
  applyFilterDropdown('hours-f-period');

  const list = dashFilteredDemands();

  // métricas
  const open = list.filter(d => !isDone(d));
  const done = list.filter(isDone);
  const late = list.filter(isLate);
  const doneOnTime = done.filter(d => !wasLate(d));
  const punctual = done.length ? Math.round(doneOnTime.length / done.length * 100) : null;
  // Sparklines — últimos 14 dias
  const days = 14;
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const buckets = (sel) => {
    const arr = new Array(days).fill(0);
    list.forEach(d => {
      const dt = sel(d);
      if (!dt) return;
      const dd = new Date(dt); dd.setHours(0,0,0,0);
      const diff = Math.floor((today0 - dd) / 86400000);
      if (diff >= 0 && diff < days) arr[days - 1 - diff]++;
    });
    return arr;
  };
  const createdTrend = buckets(d => d.createdAt);
  const completedTrend = buckets(d => d.completedAt);
  // Acumulado para mostrar curva crescente
  const cumul = (arr) => { let s = 0; return arr.map(v => (s += v)); };
  const sparkCreated = sparkline(cumul(createdTrend), { width: 96, height: 22, color: 'var(--accent-text)' });
  const sparkOpen = sparkline(cumul(createdTrend).map((v, i) => Math.max(0, v - cumul(completedTrend)[i])), { width: 96, height: 22, color: 'var(--text-dim)' });
  const sparkDone = sparkline(cumul(completedTrend), { width: 96, height: 22, color: 'var(--success)' });

  $('metrics-grid').innerHTML = `
    <div class="metric-card metric-accent"><div class="metric-label">Demandas no filtro</div><div class="metric-value">${list.length}</div><div class="metric-sub">no workspace ${esc(wsById(activeWs)?.name || '')}</div><div class="metric-spark">${sparkCreated}</div></div>
    <div class="metric-card"><div class="metric-label">Em andamento</div><div class="metric-value">${open.length}</div><div class="metric-sub">aguardando conclusão</div><div class="metric-spark">${sparkOpen}</div></div>
    <div class="metric-card metric-success"><div class="metric-label">Concluídas</div><div class="metric-value">${done.length}</div><div class="metric-sub">${punctual === null ? 'sem histórico' : punctual + '% no prazo'}</div><div class="metric-spark">${sparkDone}</div></div>
    <div class="metric-card metric-danger"><div class="metric-label">Atrasadas</div><div class="metric-value">${late.length}</div><div class="metric-sub">prazo da etapa vencido</div></div>`;
  animateCounters($('metrics-grid'));

  renderDashChart(list);
  renderHoursBoard(list);
  saveFilters('dashboard');
}

/* Anima cada .metric-value de 0 até o número final usando easing.
   Guarda o último valor renderizado em data-last-value para só animar
   quando muda (assim filtros que mantêm o número não re-disparam). */
function animateCounters(scope) {
  if (!scope) return;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = scope.querySelectorAll('.metric-value');
  els.forEach(el => {
    const raw = (el.textContent || '').trim();
    const target = parseInt(raw.replace(/[^\d-]/g, ''), 10);
    if (!Number.isFinite(target)) return;
    if (el.dataset.lastValue === String(target)) return;
    el.dataset.lastValue = String(target);
    if (target === 0 || reduced) { el.textContent = String(target); return; }
    const duration = 650;
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(ease(t) * target);
      el.textContent = String(v);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = String(target);
    }
    requestAnimationFrame(tick);
  });
}
function setDashFlow(id) { dashFlowId = id; renderDashboard(); }

/* Estado das linhas visíveis no gráfico */
let chartVisibleLines = { total: true, open: true, done: true, late: true };
function toggleChartLine(key) {
  chartVisibleLines[key] = !chartVisibleLines[key];
  renderDashChart(dashFilteredDemands());
}

/* Gera o range de datas a partir do filtro de período */
function dashChartRange() {
  const period = $('dash-f-period').value;
  const t = new Date(); t.setHours(0,0,0,0);
  let from, to, days;
  if (period === 'today') { days = 7; from = new Date(t); from.setDate(from.getDate() - 6); to = new Date(t); }
  else if (period === '7') { days = 14; from = new Date(t); from.setDate(from.getDate() - 7); to = new Date(t); to.setDate(to.getDate() + 7); }
  else if (period === 'month') {
    from = new Date(t.getFullYear(), t.getMonth(), 1);
    to = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    days = Math.round((to - from) / 86400000) + 1;
  } else if (period === 'lastmonth') {
    from = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    to = new Date(t.getFullYear(), t.getMonth(), 0);
    days = Math.round((to - from) / 86400000) + 1;
  } else if (period === '90') { days = 90; from = new Date(t); from.setDate(from.getDate() - 89); to = new Date(t); }
  else { days = 30; from = new Date(t); from.setDate(from.getDate() - 29); to = new Date(t); }
  return { from, to, days };
}

function renderDashChart(list) {
  const { from, to, days } = dashChartRange();
  // Gera array de buckets diários
  const buckets = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i);
    buckets.push({ date: d, ymd: d.toISOString().slice(0,10), total: 0, open: 0, done: 0, late: 0 });
  }
  const todayStr = new Date().toISOString().slice(0,10);
  // Para cada demanda, conta sua presença em cada dia entre createdAt e completedAt (ou hoje)
  list.forEach(d => {
    const created = (d.createdAt || '').slice(0,10);
    const completed = d.completedAt ? d.completedAt.slice(0,10) : null;
    buckets.forEach(b => {
      if (!created || b.ymd < created) return;
      if (completed && b.ymd > completed) {
        // contabiliza concluída no dia em que foi concluída
        if (b.ymd === completed) { b.total++; b.done++; }
        return;
      }
      b.total++;
      if (completed && b.ymd === completed) b.done++;
      else {
        b.open++;
        const due = d.stageDueDate || d.deadline;
        if (due && due < b.ymd) b.late++;
      }
    });
  });

  const lines = [
    { key: 'total', label: 'Demandas no filtro', color: '#7A00FF' },
    { key: 'open',  label: 'Em andamento',       color: '#94a3b8' },
    { key: 'done',  label: 'Concluídas',         color: '#10b981' },
    { key: 'late',  label: 'Atrasadas',          color: '#ef4444' },
  ];

  // Render toggles
  $('chart-line-toggles').innerHTML = lines.map(l => `
    <label class="chart-toggle ${chartVisibleLines[l.key] ? 'active' : ''}" onclick="toggleChartLine('${l.key}')">
      <span class="chart-toggle-dot" style="background:${l.color}"></span>
      <span>${esc(l.label)}</span>
    </label>`).join('');

  const visible = lines.filter(l => chartVisibleLines[l.key]);
  if (!visible.length) {
    $('dash-chart').innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:32px;text-align:center">Selecione ao menos uma linha para visualizar</div>';
    return;
  }

  // SVG dimensions (proporção wide para preencher melhor cards largos)
  const w = 1600, h = 360, pad = { t: 20, r: 30, b: 42, l: 50 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  // Y max
  let yMax = 0;
  visible.forEach(l => { buckets.forEach(b => { if (b[l.key] > yMax) yMax = b[l.key]; }); });
  yMax = Math.max(4, Math.ceil(yMax * 1.15));
  // Gridlines em 5 níveis
  const gridSteps = 5;
  const gridLevels = [];
  for (let i = 0; i <= gridSteps; i++) gridLevels.push(Math.round(yMax * i / gridSteps));

  // X positions
  const xAt = i => pad.l + (days <= 1 ? 0 : i * innerW / (days - 1));
  const yAt = v => pad.t + innerH - (v / yMax) * innerH;

  // Linhas retas com quebras secas (sem suavização) — fidelidade exata aos dados
  const smoothPath = (pts) => {
    if (pts.length < 2) return '';
    return 'M ' + pts.map(p => `${p[0]} ${p[1]}`).join(' L ');
  };

  // Linhas + área (só se for uma linha visível, mostra área; com múltiplas fica poluído)
  const showArea = visible.length === 1;
  const pathParts = visible.map(l => {
    const pts = buckets.map((b, i) => [xAt(i), yAt(b[l.key])]);
    const path = smoothPath(pts);
    let area = '';
    if (showArea) {
      const areaPts = pts.slice();
      const last = areaPts[areaPts.length - 1], first = areaPts[0];
      const baseY = pad.t + innerH;
      area = `<path d="${smoothPath(areaPts)} L ${last[0]} ${baseY} L ${first[0]} ${baseY} Z" fill="${l.color}" fill-opacity="0.1"/>`;
    }
    const dots = pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${l.color}" opacity="0.85"/>`).join('');
    return `${area}<path d="${path}" fill="none" stroke="${l.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
  }).join('');

  // X labels (mostra 6-8 marcadores)
  const maxLabels = 8;
  const labelStep = Math.max(1, Math.ceil(days / maxLabels));
  const xLabels = buckets.map((b, i) => {
    if (i % labelStep !== 0 && i !== days - 1) return '';
    const dd = String(b.date.getDate()).padStart(2, '0');
    const mm = String(b.date.getMonth() + 1).padStart(2, '0');
    return `<text x="${xAt(i)}" y="${h - 12}" fill="var(--text-muted)" font-size="11" text-anchor="middle">${dd}/${mm}</text>`;
  }).join('');

  // Y labels + gridlines
  const yEls = gridLevels.map(v => `
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${yAt(v)}" y2="${yAt(v)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4" opacity="0.5"/>
    <text x="${pad.l - 10}" y="${yAt(v) + 4}" fill="var(--text-muted)" font-size="11" text-anchor="end">${v}</text>
  `).join('');

  // Marcadores e guide pra tooltip — invisíveis até o hover
  const markerEls = visible.map((l, i) =>
    `<circle id="dash-mk-${i}" r="5" fill="${l.color}" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" style="opacity:0;pointer-events:none"/>`
  ).join('');
  const guideEl = `<line id="dash-guide" class="chart-guide" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + innerH}" stroke="rgba(255,255,255,0.35)" stroke-width="1" vector-effect="non-scaling-stroke" style="opacity:0;pointer-events:none"/>`;

  $('dash-chart').innerHTML = `
    <div class="chart-hover-host" id="dash-chart-host" style="position:relative">
      <svg viewBox="0 0 ${w} ${h}" class="dash-chart-svg" preserveAspectRatio="none">
        ${yEls}
        ${pathParts}
        ${xLabels}
        ${guideEl}
        ${markerEls}
      </svg>
      <div class="chart-tooltip" id="dash-chart-tooltip"></div>
    </div>`;

  // Wire hover — pra cada bucket, monta uma "série" com (y, value, color) por linha visível
  const tipPoints = buckets.map((b, i) => ({
    x: xAt(i),
    label: b.date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    series: visible.map(l => ({ name: l.label, value: b[l.key], y: yAt(b[l.key]), color: l.color }))
  }));
  const host = $('dash-chart-host');
  if (host) {
    attachChartHover(host, {
      viewBox: { w, h, padL: pad.l, padR: pad.r, padT: pad.t, innerH },
      points: tipPoints,
      lineEls: $('dash-guide'),
      markerEls: visible.map((_, i) => $('dash-mk-' + i)),
      tooltipEl: $('dash-chart-tooltip'),
      format: (v) => String(v)
    });
  }
}

/* Quadro de apontamento de horas */
function renderHoursBoard(list) {
  const fu = $('dash-f-user').value;
  const hp = $('hours-f-period').value;
  // entradas de tempo das demandas filtradas; se houver filtro de usuário,
  // considera apenas as horas apontadas por ele
  const rows = [];
  list.forEach(d => (d.timeEntries || []).forEach(e => {
    if (fu && e.userId !== fu) return;
    if (hp && !matchPeriod(e.createdAt, hp)) return;
    rows.push({ demand: d, entry: e });
  }));
  const total = rows.reduce((acc, r) => acc + (Number(r.entry.hours) || 0), 0);

  // por etapa (label + cor resolvidos pelo fluxo da demanda)
  const byStage = new Map();
  rows.forEach(r => {
    const f = flowById(r.demand.flowId);
    const s = f ? f.stages.find(x => x.id === r.entry.stageId) : null;
    const key = s ? s.label : 'Outras';
    const cur = byStage.get(key) || { label: key, color: s ? s.color : '#64748B', hours: 0 };
    cur.hours += Number(r.entry.hours) || 0;
    byStage.set(key, cur);
  });
  const stages = [...byStage.values()].sort((a,b) => b.hours - a.hours);
  const maxStage = Math.max(1, ...stages.map(s => s.hours));

  // por demanda — quando há filtro de usuário, agrupa por demanda+usuário
  // para mostrar quem apontou. Caso contrário, agrupa só por demanda.
  const groupByUser = !!fu;
  const byDemand = new Map();
  rows.forEach(r => {
    const key = groupByUser ? `${r.demand.id}::${r.entry.userId || ''}` : r.demand.id;
    const cur = byDemand.get(key) || { d: r.demand, userId: r.entry.userId, hours: 0 };
    cur.hours += Number(r.entry.hours) || 0;
    byDemand.set(key, cur);
  });
  const dList = [...byDemand.values()].sort((a,b) => b.hours - a.hours);

  $('hours-board').innerHTML = `
    <div class="hours-card">
      <div class="hours-total"><span class="hours-total-value">${fmtHours(total)}</span><span class="hours-total-label">total apontado${fu ? ' por ' + esc(userById(fu)?.name || '') : ''} no filtro</span></div>
      ${stages.length ? stages.map(s => `
        <div class="hours-stage-row">
          <span class="hours-stage-name"><span class="pill-dot" style="background:${s.color}"></span>${esc(s.label)}</span>
          <span class="hours-stage-bar"><span class="hours-stage-fill" style="display:block;width:${s.hours/maxStage*100}%;background:${s.color}"></span></span>
          <span class="hours-stage-val">${fmtHours(s.hours)}</span>
        </div>`).join('') : '<div class="hours-empty">Nenhuma hora apontada nas demandas do filtro.</div>'}
    </div>
    <div class="hours-card">
      <div class="panel-title" style="margin-bottom:10px">Horas por demanda</div>
      ${dList.length ? dList.map(x => {
        const u = groupByUser ? userById(x.userId) : null;
        return `<div class="hours-demand-row">
          <span class="hours-demand-name" onclick="showDetail('${x.d.id}')">${esc(x.d.name)}</span>
          <span class="pill pill-muted" style="font-size:10px">${esc(projectById(x.d.projectId)?.name || '—')}</span>
          ${groupByUser ? `<span class="hours-demand-user">${u ? avatarHTML(u) + '<span>' + esc(u.name.split(' ')[0]) + '</span>' : '<span style="color:var(--text-muted)">—</span>'}</span>` : ''}
          <span class="hours-demand-val">${fmtHours(x.hours)}</span>
        </div>`;
      }).join('') : '<div class="hours-empty">Aponte horas dentro de uma demanda para vê-las aqui.</div>'}
    </div>`;
}

/* ─── DEMANDAS (LISTA GERAL) ─── */
function setListView(v) {
  listView = v;
  $('list-view-table').classList.toggle('active', v === 'table');
  $('list-view-kanban').classList.toggle('active', v === 'kanban');
  $('list-view-cal').classList.toggle('active', v === 'cal');
  $('list-table-view').style.display = v === 'table' ? '' : 'none';
  $('list-kanban-view').style.display = v === 'kanban' ? '' : 'none';
  $('list-cal-view').style.display = v === 'cal' ? '' : 'none';
  if (v === 'cal') renderCalendar('all');
  if (v === 'kanban') renderKanban();
}

function listFilteredDemands() {
  const q  = norm($('search-input').value.trim());
  const fu = $('filter-user').value;
  const fp = $('filter-project').value;
  const ff = $('filter-flow')?.value || '';
  const fd = $('filter-period').value;
  const fq = $('filter-quick').value;
  return wsDemands().filter(d => {
    if (q && !norm(d.name).includes(q)) return false;
    if (fu && d.ownerId !== fu) return false;
    if (fp && d.projectId !== fp) return false;
    if (ff && d.flowId !== ff) return false;
    if (!matchPeriod(effDue(d), fd)) return false;
    if (fq === 'late' && !isLate(d)) return false;
    if (fq === 'open' && isDone(d)) return false;
    if (fq === 'done' && !isDone(d)) return false;
    return true;
  });
}

function renderList() {
  // Aplica filtros salvos da sessão anterior ANTES de capturar o valor atual
  // (o rebuild dos options abaixo respeita o value setado aqui via prevUser).
  restoreFilters('list');
  // User filter with avatars
  const prevUser = $('filter-user').value;
  const userOpts = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  $('filter-user').innerHTML = '<option value="">Todos os usuários</option>' +
    userOpts.map(u => `<option value="${esc(u.id)}" ${u.id === prevUser ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  fillSelect($('filter-project'), wsProjects().map(p => ({ value: p.id, label: p.name })), undefined, 'Todos os projetos');
  fillSelect($('filter-flow'), wsFlows().map(f => ({ value: f.id, label: f.name })), undefined, 'Todos os fluxos');

  applyFilterDropdown('filter-user', { userIcon: true });
  applyFilterDropdown('filter-project', { projectIcon: true });
  applyFilterDropdown('filter-flow');
  applyFilterDropdown('filter-period');
  applyFilterDropdown('filter-quick');

  const list = listFilteredDemands().slice().sort((a,b) => {
    let va, vb;
    if (sortKey === 'name')           { va = norm(a.name); vb = norm(b.name); }
    else if (sortKey === 'project')   { va = norm(projectById(a.projectId)?.name || ''); vb = norm(projectById(b.projectId)?.name || ''); }
    else if (sortKey === 'client')    { va = norm(projectById(a.projectId)?.client || ''); vb = norm(projectById(b.projectId)?.client || ''); }
    else if (sortKey === 'type')      { va = norm(demandType(a) || ''); vb = norm(demandType(b) || ''); }
    else if (sortKey === 'status')    { const fa = flowById(a.flowId), fb = flowById(b.flowId); va = fa ? fa.stages.findIndex(s => s.id === a.status) : 0; vb = fb ? fb.stages.findIndex(s => s.id === b.status) : 0; }
    else if (sortKey === 'owner')     { va = norm(userById(a.ownerId)?.name || ''); vb = norm(userById(b.ownerId)?.name || ''); }
    else if (sortKey === 'completed') { va = a.completedAt || '9999'; vb = b.completedAt || '9999'; }
    else if (sortKey === 'priority')  { va = a.priority || 3; vb = b.priority || 3; }
    else if (sortKey === 'qty')       { va = (a.qtyArts || 0); vb = (b.qtyArts || 0); }
    else                              { va = effDue(a) || '9999'; vb = effDue(b) || '9999'; }
    return (va < vb ? -1 : va > vb ? 1 : 0) * (sortAsc ? 1 : -1);
  });

  // Limpa seleções "fantasma" (IDs que não estão mais visíveis no filtro atual).
  // Sem isso o contador mostra "5 selecionadas" e as bulk actions agem em demandas
  // que o usuário não vê — confuso. Se alguém quiser reincluir, basta marcar de novo.
  if (selectedDemandIds && selectedDemandIds.size) {
    const visibleIds = new Set(list.map(d => d.id));
    for (const id of [...selectedDemandIds]) {
      if (!visibleIds.has(id)) selectedDemandIds.delete(id);
    }
  }

  if (!list.length) {
    $('list-table-body').innerHTML = `<tr><td colspan="11">${emptyState('Nenhuma demanda encontrada', 'Ajuste a busca ou os filtros para encontrar o que procura.', 'search')}</td></tr>`;
    if (listView === 'kanban') renderKanban();
    if (listView === 'cal') renderCalendar('all');
    refreshBulkBar();
    saveFilters('list');
    return;
  }
  $('list-table-body').innerHTML = list.map(d => {
    const p = projectById(d.projectId);
    const due = effDue(d);
    const sel = selectedDemandIds.has(d.id);
    return `<tr class="demand-row ${sel ? 'selected' : ''}" data-demand-id="${d.id}" onclick="onDemandRowClick(event, '${d.id}')">
      <td class="col-bulk-check"><input type="checkbox" class="bulk-check-row" ${sel ? 'checked' : ''} onclick="event.stopPropagation();toggleDemandSelection('${d.id}', this.checked)"></td>
      <td><span class="demand-name">${esc(d.name)}</span></td>
      <td>${p ? esc(p.name) : '—'}</td>
      <td>${esc(p?.client || '—')}</td>
      <td>${esc(demandType(d) || '—')}</td>
      <td>${statusPill(d)}</td>
      <td>${cellUser(userById(d.ownerId))}</td>
      <td class="${isLate(d) ? 'deadline-late' : ''}">${fmtDate(due)}${isLate(d) ? ' <i data-lucide="alert-triangle" class="ic-sm"></i>' : ''}</td>
      <td>${priorityPill(d.priority)}</td>
      <td>${qtyCell(d)}</td>
      <td>${d.completedAt ? fmtDate(d.completedAt) : '—'}</td>
    </tr>`;
  }).join('');
  if (listView === 'kanban') renderKanban();
  if (listView === 'cal') renderCalendar('all');
  refreshBulkBar();
  saveFilters('list');
}
function sortList(key) {
  if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
  renderList();
}
// Versão debounced só pro campo de busca — evita rebuild da tabela em cada
// tecla. Cliques em selects e botões continuam usando renderList() direto.
// Exposta em window porque é chamada via oninput="…" inline no HTML, e const
// no top-level NÃO vira propriedade de window (diferente de function/var).
window.renderListDebounced = debounce(renderList, 120);

/* ─── KANBAN ─── */
/* Comparador estável para a ordem dentro de uma coluna. Demandas com
   kanbanOrder definido aparecem primeiro, ordenadas por esse valor crescente.
   As demais caem para o critério antigo (prioridade asc). */
function kanbanSort(a, b) {
  const ka = (a.kanbanOrder === null || a.kanbanOrder === undefined) ? null : Number(a.kanbanOrder);
  const kb = (b.kanbanOrder === null || b.kanbanOrder === undefined) ? null : Number(b.kanbanOrder);
  if (ka !== null && kb !== null) return ka - kb;
  if (ka !== null) return -1;
  if (kb !== null) return 1;
  return (a.priority || 3) - (b.priority || 3);
}
function renderKanban() {
  const board = $('kanban-board');
  if (!board) return;
  const flowFilter = $('filter-flow')?.value || '';
  const list = listFilteredDemands().slice().sort(kanbanSort);

  let columns;
  if (flowFilter) {
    // Modo "fluxo único": colunas = etapas do fluxo na ordem em que estão definidas
    const flow = flowById(flowFilter);
    if (!flow) {
      board.innerHTML = `<div class="kanban-empty">${emptyState('Fluxo não encontrado', 'O fluxo selecionado não está mais disponível.', 'flow')}</div>`;
      paintIcons();
      return;
    }
    columns = flow.stages.map((s, i) => ({
      label: s.label,
      color: s.color || '#7A00FF',
      done: !!s.done,
      position: i,
      items: list.filter(d => d.flowId === flow.id && d.status === s.id)
    }));
  } else {
    // Modo "todos os fluxos": agrupa por rótulo, mesclando etapas homônimas entre fluxos
    const cols = new Map();
    let order = 0;
    for (const f of wsFlows()) {
      for (const s of f.stages) {
        if (!cols.has(s.label)) {
          cols.set(s.label, { label: s.label, color: s.color || '#7A00FF', done: !!s.done, position: order++, items: [] });
        }
      }
    }
    for (const d of list) {
      const f = flowById(d.flowId); if (!f) continue;
      const s = f.stages.find(x => x.id === d.status); if (!s) continue;
      const col = cols.get(s.label);
      if (col) col.items.push(d);
    }
    columns = [...cols.values()].sort((a, b) => a.position - b.position);
  }
  if (!columns.length) {
    board.innerHTML = `<div class="kanban-empty">${emptyState('Nenhum fluxo configurado', 'Crie um fluxo de demanda para visualizar o kanban.', 'kanban')}</div>`;
    paintIcons();
    return;
  }
  board.innerHTML = columns.map(col => `
    <div class="kanban-column">
      <div class="kanban-column-head" style="border-top-color:${col.color}">
        <span class="pill-dot" style="background:${col.color}"></span>
        <span class="kanban-column-title">${esc(col.label)}</span>
        <span class="kanban-column-count">${col.items.length}</span>
      </div>
      <div class="kanban-column-body" data-stage-label="${esc(col.label)}">
        ${col.items.length ? col.items.map(d => kanbanCard(d)).join('') : '<div class="kanban-column-empty">Sem demandas</div>'}
      </div>
    </div>
  `).join('');
  setupKanbanDragDrop();
  paintIcons();
}

/* Conjunto ordenado de usuários envolvidos com uma demanda: owner primeiro,
   depois autores de comentário, autores no histórico e responsáveis por etapas
   definidos como override de instância. */
function demandCollaborators(d) {
  const seen = new Set();
  const out = [];
  const push = (uid) => {
    if (!uid || seen.has(uid)) return;
    const u = userById(uid);
    if (!u) return;
    seen.add(uid);
    out.push(u);
  };
  push(d.ownerId);
  (d.comments || []).forEach(c => push(c.userId));
  (d.history || []).forEach(h => push(h.userId));
  if (d.stageResponsibles && typeof d.stageResponsibles === 'object') {
    Object.values(d.stageResponsibles).forEach(push);
  }
  return out;
}

function kanbanCard(d) {
  const p = projectById(d.projectId);
  const owner = userById(d.ownerId);
  const due = effDue(d);
  const late = isLate(d);
  let ownerBlock;
  if (!owner) {
    ownerBlock = '<span class="kanban-card-owner-empty">Sem responsável</span>';
  } else {
    const collabs = demandCollaborators(d);
    const MAX = 3;
    const visible = collabs.slice(0, MAX);
    const more = collabs.length - visible.length;
    const tip = collabs.length > 1 ? collabs.map(u => u.name).join(', ') : owner.name;
    ownerBlock = `<div class="kanban-card-avatars" data-tooltip="${esc(tip)}">
      <span class="avatar-stack">
        ${visible.map((u, i) => `<span class="avatar-stack-item" style="z-index:${10 - i}">${avatarHTML(u, 'avatar avatar-stack-avatar')}</span>`).join('')}
        ${more > 0 ? `<span class="avatar-stack-more">+${more}</span>` : ''}
      </span>
      <span class="kanban-card-owner-name">${esc(owner.name.split(' ')[0])}</span>
    </div>`;
  }
  const dueBlock = due
    ? `<span class="kanban-card-due ${late ? 'late' : ''}"><i data-lucide="${late ? 'alert-triangle' : 'calendar'}" class="ic-xs"></i> ${esc(fmtDate(due))}</span>`
    : '';
  return `
    <div class="kanban-card" draggable="true" data-demand-id="${d.id}" onclick="showDetail('${d.id}')">
      <div class="kanban-card-top">${priorityPill(d.priority)}</div>
      <div class="kanban-card-name">${esc(d.name)}</div>
      <div class="kanban-card-meta">${esc(p?.name || '—')}${p?.client ? ` · ${esc(p.client)}` : ''}</div>
      <div class="kanban-card-foot">
        ${ownerBlock}
        ${dueBlock}
      </div>
    </div>
  `;
}

/* ─── KANBAN: DRAG & DROP com reorder + placeholder ─── */
let _kanbanDndBound = false;
let _kbPlaceholder = null;
let _kbDraggingId = null;
function _kbEnsurePlaceholder() {
  if (_kbPlaceholder) return _kbPlaceholder;
  _kbPlaceholder = document.createElement('div');
  _kbPlaceholder.className = 'kanban-drop-placeholder';
  return _kbPlaceholder;
}
function _kbRemovePlaceholder() {
  if (_kbPlaceholder && _kbPlaceholder.parentElement) _kbPlaceholder.parentElement.removeChild(_kbPlaceholder);
}
/* Para um dado mouse Y dentro de uma coluna, retorna o card antes do qual
   o placeholder deve ser inserido (ou null se ele deve ir no final). */
function _kbCardAfter(body, y) {
  const cards = [...body.querySelectorAll('.kanban-card:not(.dragging)')];
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    if (y < r.top + r.height / 2) return c;
  }
  return null;
}
function setupKanbanDragDrop() {
  if (_kanbanDndBound) return;
  const board = $('kanban-board');
  if (!board) return;
  _kanbanDndBound = true;

  // O click do showDetail é suprimido quando o mousedown vira drag (evita abrir o
  // modal logo após soltar o card).
  let suppressNextClick = false;

  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.demandId);
    e.dataTransfer.effectAllowed = 'move';
    _kbDraggingId = card.dataset.demandId;
    // setTimeout pra Chrome aplicar a opacidade só depois do snapshot do drag image
    setTimeout(() => card.classList.add('dragging'), 0);
    suppressNextClick = true;
  });
  board.addEventListener('dragend', e => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('dragging');
    board.querySelectorAll('.kanban-column-body.drag-over').forEach(el => el.classList.remove('drag-over'));
    _kbRemovePlaceholder();
    _kbDraggingId = null;
    setTimeout(() => { suppressNextClick = false; }, 50);
  });
  board.addEventListener('dragover', e => {
    const body = e.target.closest('.kanban-column-body');
    if (!body) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    body.classList.add('drag-over');
    // Esconde o estado "vazio" enquanto arrasta sobre coluna sem cards
    const empty = body.querySelector('.kanban-column-empty');
    if (empty) empty.style.display = 'none';
    // Posiciona o placeholder antes do card mais próximo abaixo do cursor
    const placeholder = _kbEnsurePlaceholder();
    const ref = _kbCardAfter(body, e.clientY);
    if (ref) body.insertBefore(placeholder, ref);
    else body.appendChild(placeholder);
  });
  board.addEventListener('dragleave', e => {
    const body = e.target.closest('.kanban-column-body');
    if (!body) return;
    if (body.contains(e.relatedTarget)) return;
    body.classList.remove('drag-over');
    const empty = body.querySelector('.kanban-column-empty');
    if (empty) empty.style.display = '';
  });
  board.addEventListener('drop', e => {
    const body = e.target.closest('.kanban-column-body');
    if (!body) return;
    e.preventDefault();
    body.classList.remove('drag-over');
    const demandId = e.dataTransfer.getData('text/plain') || _kbDraggingId;
    const stageLabel = body.dataset.stageLabel;
    if (!demandId || !stageLabel) { _kbRemovePlaceholder(); return; }
    // Calcula índice alvo baseado na posição atual do placeholder.
    // Como o card sendo arrastado ainda está no DOM (com classe .dragging),
    // descontamos quantos cards dragging aparecem ANTES do placeholder
    // pra que o índice corresponda à lista SEM o source.
    let targetIndex = -1;
    const placeholder = _kbPlaceholder;
    if (placeholder && placeholder.parentElement === body) {
      const allChildren = [...body.children].filter(c => (c.classList && c.classList.contains('kanban-card')) || c === placeholder);
      const phIdx = allChildren.indexOf(placeholder);
      const draggingBefore = allChildren.slice(0, phIdx).filter(c => c.classList && c.classList.contains('dragging')).length;
      targetIndex = phIdx - draggingBefore;
    }
    _kbRemovePlaceholder();
    const card = document.querySelector(`.kanban-card[data-demand-id="${demandId}"]`);
    const sourceColBody = card ? card.closest('.kanban-column-body') : null;
    const sameColumn = sourceColBody === body;
    if (sameColumn) {
      handleKanbanReorder(demandId, body, targetIndex);
    } else {
      moveDemandToStage(demandId, stageLabel, targetIndex);
    }
  });
  // Suprime o click que viria após o drop
  board.addEventListener('click', e => {
    if (!suppressNextClick) return;
    const card = e.target.closest('.kanban-card');
    if (card) {
      e.stopPropagation();
      e.preventDefault();
    }
    suppressNextClick = false;
  }, true);
}

/* Helper: calcula um kanbanOrder novo entre dois vizinhos da coluna alvo.
   Usado tanto na reorder dentro da mesma coluna quanto no move cross-column
   com posição específica. Espaçamento padrão de 1000 reduz reescritas. */
function computeKanbanOrder(body, demandId, targetIndex) {
  const cards = [...body.querySelectorAll('.kanban-card')].filter(c => c.dataset.demandId !== demandId);
  if (targetIndex < 0) targetIndex = cards.length;
  if (targetIndex > cards.length) targetIndex = cards.length;
  const before = cards[targetIndex - 1];
  const after = cards[targetIndex];
  const beforeDemand = before ? demandById(before.dataset.demandId) : null;
  const afterDemand = after ? demandById(after.dataset.demandId) : null;
  const bo = beforeDemand && Number.isFinite(Number(beforeDemand.kanbanOrder)) ? Number(beforeDemand.kanbanOrder) : null;
  const ao = afterDemand && Number.isFinite(Number(afterDemand.kanbanOrder)) ? Number(afterDemand.kanbanOrder) : null;
  if (bo !== null && ao !== null) return (bo + ao) / 2;
  if (bo !== null) return bo + 1000;
  if (ao !== null) return ao - 1000;
  return Date.now(); // primeira reordenação na coluna
}

/* Reordena dentro da mesma coluna. OTIMISTA: aplica mudança local e
   re-renderiza ANTES da resposta da rede. Em erro, reverte. */
async function handleKanbanReorder(demandId, body, targetIndex) {
  const d = demandById(demandId);
  if (!d) return;
  const newOrder = computeKanbanOrder(body, demandId, targetIndex);
  const prevOrder = d.kanbanOrder ?? null;
  if (prevOrder === newOrder) return;
  d.kanbanOrder = newOrder;
  renderKanban();
  try {
    const upd = await api('/demands/' + demandId, 'PUT', { kanbanOrder: newOrder });
    patchDemand(upd); // server pode ter normalizado o valor
    // re-render apenas se algo realmente divergiu do otimismo
    if ((upd.kanbanOrder ?? null) !== newOrder) renderKanban();
  } catch (err) {
    // Rollback: restaura ordem antiga e re-renderiza
    d.kanbanOrder = prevOrder;
    renderKanban();
    toast(err.message || 'Erro ao reordenar', 'error');
  }
}

/* Move pra outra etapa. OTIMISTA: status + (opcional) kanbanOrder aplicados
   localmente antes do request; revertidos em caso de erro. */
async function moveDemandToStage(demandId, stageLabel, targetIndex) {
  const d = demandById(demandId);
  if (!d) return;
  const flow = flowById(d.flowId);
  if (!flow) { toast('Fluxo não encontrado para esta demanda', 'error'); return; }
  const target = flow.stages.find(s => s.label === stageLabel);
  if (!target) {
    toast(`A etapa "${stageLabel}" não existe no fluxo "${flow.name}". Mova a demanda dentro do mesmo fluxo.`, 'error');
    return;
  }
  if (target.id === d.status) return;

  // Calcula nova posição (kanbanOrder) se o usuário soltou em local específico.
  let newOrder = null;
  if (typeof targetIndex === 'number' && targetIndex >= 0) {
    const board = document.getElementById('kanban-board');
    const body = board && board.querySelector(`.kanban-column-body[data-stage-label="${CSS.escape(stageLabel)}"]`);
    if (body) newOrder = computeKanbanOrder(body, demandId, targetIndex);
  }

  // Snapshot pra rollback
  const prevStatus       = d.status;
  const prevKanbanOrder  = d.kanbanOrder ?? null;
  const prevStageEntered = d.stageEnteredAt;
  const prevCompletedAt  = d.completedAt;

  // Aplica otimisticamente
  d.status = target.id;
  if (newOrder !== null) d.kanbanOrder = newOrder;
  d.stageEnteredAt = nowIsoLocal();
  if (target.done && !d.completedAt) d.completedAt = d.stageEnteredAt;
  else if (!target.done) d.completedAt = null;

  renderKanban();
  // Animação imediata no card que acabou de cair
  requestAnimationFrame(() => {
    const card = document.querySelector(`.kanban-card[data-demand-id="${demandId}"]`);
    if (card) {
      card.classList.add('just-landed');
      setTimeout(() => card.classList.remove('just-landed'), 700);
      const col = card.closest('.kanban-column');
      if (col) {
        col.classList.add('flash-drop');
        setTimeout(() => col.classList.remove('flash-drop'), 700);
      }
    }
  });

  const payload = { status: target.id };
  if (newOrder !== null) payload.kanbanOrder = newOrder;
  try {
    const upd = await api('/demands/' + demandId, 'PUT', payload);
    patchDemand(upd);
    // Re-render só se server retornou estado diferente do otimismo (mudou owner por
    // auto-atribuição da etapa, completou em outra etapa, etc).
    const diverged = upd.status !== target.id
                  || (upd.kanbanOrder ?? null) !== (newOrder ?? prevKanbanOrder)
                  || upd.ownerId !== d.ownerId;
    if (diverged) renderKanban();
    toast(`Movido para "${target.label}"`, 'success');
  } catch (err) {
    // Rollback
    d.status         = prevStatus;
    d.kanbanOrder    = prevKanbanOrder;
    d.stageEnteredAt = prevStageEntered;
    d.completedAt    = prevCompletedAt;
    renderKanban();
    toast(err.message || 'Erro ao mover demanda', 'error');
  }
}

// Helper local — ISO da hora atual (mesma lógica do nowISO do server, lado cliente).
function nowIsoLocal() { return new Date().toISOString(); }

/* ─── MINHAS DEMANDAS ─── */
let mineSortKey = 'deadline', mineSortAsc = true;
function myDemands() { return wsDemands().filter(d => d.ownerId === me.id); }
function renderMine() {
  const fq = $('mine-f-quick').value;
  applyFilterDropdown('mine-f-quick');
  const list = myDemands().filter(d => {
    if (fq === 'late') return isLate(d);
    if (fq === 'open') return !isDone(d);
    if (fq === 'done') return isDone(d);
    return true;
  }).sort((a,b) => {
    let va, vb;
    if (mineSortKey === 'name')        { va = norm(a.name); vb = norm(b.name); }
    else if (mineSortKey === 'project') { va = norm(projectById(a.projectId)?.name || ''); vb = norm(projectById(b.projectId)?.name || ''); }
    else if (mineSortKey === 'status')  { const fa = flowById(a.flowId), fb = flowById(b.flowId); va = fa ? fa.stages.findIndex(s => s.id === a.status) : 0; vb = fb ? fb.stages.findIndex(s => s.id === b.status) : 0; }
    else                                { va = effDue(a) || '9999'; vb = effDue(b) || '9999'; }
    return (va < vb ? -1 : va > vb ? 1 : 0) * (mineSortAsc ? 1 : -1);
  });

  $('mine-table-body').innerHTML = list.length ? list.map(d => `
    <tr class="demand-row" onclick="showDetail('${d.id}')">
      <td><span class="demand-name">${esc(d.name)}</span></td>
      <td>${esc(projectById(d.projectId)?.name || '—')}</td>
      <td>${statusPill(d)}</td>
      <td>${qtyCell(d)}</td>
      <td class="${isLate(d) ? 'deadline-late' : ''}">${fmtDate(effDue(d))}</td>
    </tr>`).join('')
    : `<tr><td colspan="5">${emptyState('Nenhuma demanda encontrada', 'Você não tem demandas neste filtro.', 'inbox')}</td></tr>`;
  // Calendário e Agenda embed ficam sempre visíveis abaixo da tabela em
  // "Minhas Demandas". Re-render junto pra refletir mudanças imediato.
  if ($('cal-mine-body')) renderCalendar('mine');
  if (typeof renderAgenda === 'function') renderAgenda();
}
function sortMine(key) {
  if (mineSortKey === key) mineSortAsc = !mineSortAsc; else { mineSortKey = key; mineSortAsc = true; }
  renderMine();
}

/* ─── CALENDÁRIOS ─── */
function calNav(which, dir) {
  calState[which].setMonth(calState[which].getMonth() + dir);
  renderCalendar(which);
}
function calToday(which) { calState[which] = new Date(); renderCalendar(which); }


/* ─── CAPACIDADE DA EQUIPE ─── */
let capacityView = 'team'; // 'team' | 'project' | 'client'
function setCapacityView(v) {
  capacityView = v;
  renderCapacity();
}

function renderCapacity() {
  restoreFilters('capacity');
  const period = $('capacity-period').value || '7';
  const today = new Date(); today.setHours(0,0,0,0);
  // Janelas:
  //   - Numérico (7/14/30): capacidade = próximos N dias, apontadas = últimos N dias.
  //   - Este mês: capacidade = mês corrente INTEIRO, apontadas = início do mês até hoje (MTD).
  let capStart, capEnd, logStart, logEnd;
  if (period === 'month') {
    capStart = new Date(today.getFullYear(), today.getMonth(), 1);
    capEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    logStart = new Date(capStart);
    logEnd   = new Date(today);
  } else {
    const days = parseInt(period, 10);
    capStart = new Date(today);
    capEnd   = new Date(today); capEnd.setDate(capEnd.getDate() + days - 1);
    logEnd   = new Date(today);
    logStart = new Date(today); logStart.setDate(logStart.getDate() - (days - 1));
  }
  const startYmd = capStart.toISOString().slice(0,10);
  const endYmd   = capEnd.toISOString().slice(0,10);
  const logStartYmd = logStart.toISOString().slice(0,10);
  const logEndYmd   = logEnd.toISOString().slice(0,10);

  // Conta dias úteis (seg–sex, exclui sáb 6 e dom 0) entre capStart e capEnd inclusive.
  // 5 dias úteis × 8h = 40h por semana cheia.
  const capPeriodDays = Math.round((capEnd - capStart) / 86400000) + 1;
  let businessDays = 0;
  for (let i = 0; i < capPeriodDays; i++) {
    const d = new Date(capStart); d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) businessDays++;
  }
  const capacityHours = businessDays * 8;

  // Atualiza estado visual dos botões de view
  ['team', 'project', 'client'].forEach(v => {
    const btn = $('capacity-view-' + v);
    if (btn) btn.classList.toggle('active', capacityView === v);
  });

  // Esconde o cabeçalho ("Capacidade da Equipe") com base no modo
  const heading = $('capacity-heading');
  if (heading) heading.textContent = capacityView === 'team' ? 'Capacidade da Equipe' : (capacityView === 'project' ? 'Horas por Projeto' : 'Horas por Cliente');

  const hint = $('capacity-hint');
  if (hint) hint.textContent = capacityView === 'team'
    ? 'Distribuição de demandas em aberto por responsável. Carga estimada com base nas demandas atribuídas e nas horas já apontadas.'
    : (capacityView === 'project'
        ? 'Total de horas apontadas em cada projeto, somando os apontamentos de todos os usuários no período.'
        : 'Total de horas apontadas para cada cliente, somando todos os projetos do cliente no período.');

  saveFilters('capacity');
  if (capacityView === 'team') return renderCapacityTeam(startYmd, endYmd, businessDays, capacityHours, logStartYmd, logEndYmd);
  if (capacityView === 'project') return renderCapacityAggregate('project', startYmd, endYmd, businessDays, capacityHours);
  return renderCapacityAggregate('client', startYmd, endYmd, businessDays, capacityHours);
}

function renderCapacityTeam(startYmd, endYmd, businessDays, capacityHours, logStartYmd, logEndYmd) {
  const wsdemands = wsDemands().filter(d => !isDone(d));
  const wsusers = wsUsers().filter(u => u.active !== false);

  // Horas apontadas: janela definida no renderCapacity (próximos/últimos N dias
  // pros períodos numéricos, ou início do mês até hoje quando "Este mês").
  const inLookback = (e) => {
    const when = ((e.start || e.createdAt || '') + '').slice(0,10);
    return when >= logStartYmd && when <= logEndYmd;
  };
  // Janela de "entregas": considera a demanda no período se:
  //   - foi CONCLUÍDA dentro da janela (completedAt no período)
  //   - OU está EM ABERTO e atribuída ao usuário (em produção agora)
  // Isso evita que o "0 0 0" apareça enquanto a demanda ainda está em execução.
  const deliveredInWindow = (d) => {
    if (d.completedAt) {
      const day = String(d.completedAt).slice(0, 10);
      return day >= logStartYmd && day <= logEndYmd;
    }
    return !isDone(d); // em aberto = conta como volume previsto
  };

  const rows = wsusers.map(u => {
    const userDemands = wsdemands.filter(d => d.ownerId === u.id);
    const inPeriod = userDemands.filter(d => {
      const due = effDue(d);
      return due && due >= startYmd && due <= endYmd;
    });
    const lateCount = userDemands.filter(d => isLate(d)).length;
    // Horas apontadas pelo usuário NOS ÚLTIMOS N dias (independente da demanda estar em aberto ou não)
    const hoursLogged = wsDemands().reduce((s, d) => {
      return s + (d.timeEntries || [])
        .filter(e => e.userId === u.id && inLookback(e))
        .reduce((a, e) => a + (Number(e.hours) || 0), 0);
    }, 0);
    // Entregáveis: soma das 3 contagens em demandas DESTE usuário (concluídas no período OU ativas).
    // Usa deliverableUserId (quem executou as artes) como prioridade; se vazio, cai pro ownerId atual.
    const deliveredDemands = wsDemands().filter(d => (d.deliverableUserId || d.ownerId) === u.id && deliveredInWindow(d));
    const totalPieces     = deliveredDemands.reduce((s, d) => s + (Number(d.qtyPieces) || 0), 0);
    const totalArts       = deliveredDemands.reduce((s, d) => s + (Number(d.qtyArts) || 0), 0);
    const totalVariations = deliveredDemands.reduce((s, d) => s + (Number(d.qtyVariations) || 0), 0);
    const estimatedLoad = userDemands.reduce((s, d) => s + (Number(d.estimatedHours) > 0 ? Number(d.estimatedHours) : 4), 0);
    // Preenchimento da barra: horas apontadas no período / capacidade do período
    const pct = capacityHours > 0 ? Math.min(150, Math.round(hoursLogged / capacityHours * 100)) : 0;
    const status = pct >= 100 ? 'overload' : pct >= 75 ? 'high' : pct >= 40 ? 'medium' : 'low';
    return { u, userDemands, inPeriod, lateCount, hoursLogged, totalPieces, totalArts, totalVariations, estimatedLoad, pct, status };
  }).sort((a, b) => {
    // 1º critério: horas apontadas (decrescente) — quem mais trabalhou no topo
    if (b.hoursLogged !== a.hoursLogged) return b.hoursLogged - a.hoursLogged;
    // 2º critério: nome do usuário em ordem alfabética (A-Z)
    return norm(a.u.name).localeCompare(norm(b.u.name));
  });

  // Totais do workspace (somatório de todas as rows) — visão global de produção
  const wsTotal = rows.reduce((acc, r) => ({
    pieces: acc.pieces + r.totalPieces,
    arts: acc.arts + r.totalArts,
    variations: acc.variations + r.totalVariations,
    hours: acc.hours + r.hoursLogged
  }), { pieces: 0, arts: 0, variations: 0, hours: 0 });

  $('capacity-list').innerHTML = `
    <div class="capacity-summary">
      <div class="capacity-summary-item"><div class="capacity-summary-label">Capacidade no período</div><div class="capacity-summary-value">${capacityHours}h</div><div class="capacity-summary-sub">${businessDays} dias úteis × 8h</div></div>
      <div class="capacity-summary-item"><div class="capacity-summary-label">Demandas em aberto</div><div class="capacity-summary-value">${wsdemands.length}</div><div class="capacity-summary-sub">no workspace ${esc(wsById(activeWs)?.name || '')}</div></div>
      <div class="capacity-summary-item"><div class="capacity-summary-label">Pessoas ativas</div><div class="capacity-summary-value">${wsusers.length}</div><div class="capacity-summary-sub">com acesso ao workspace</div></div>
    </div>
    <!-- Banner de produção total — soma de todas as pessoas no período -->
    <div class="capacity-prod-banner">
      <div class="capacity-prod-title">Produção do workspace no período</div>
      <div class="capacity-prod-stats">
        <div class="capacity-prod-stat"><span class="capacity-prod-value">${fmtHours(wsTotal.hours)}</span><span class="capacity-prod-label">horas apontadas</span></div>
        <div class="capacity-prod-divider"></div>
        <div class="capacity-prod-stat"><span class="capacity-prod-value">${wsTotal.pieces}</span><span class="capacity-prod-label">peças únicas</span></div>
        <div class="capacity-prod-stat"><span class="capacity-prod-value">${wsTotal.arts}</span><span class="capacity-prod-label">artes individuais</span></div>
        <div class="capacity-prod-stat"><span class="capacity-prod-value">${wsTotal.variations}</span><span class="capacity-prod-label">variações</span></div>
      </div>
    </div>
    <div class="capacity-rows">
    ${rows.map(r => `
      <div class="capacity-row ${r.status}">
        <div class="capacity-user">
          ${avatarHTML(r.u)}
          <div>
            <div class="capacity-user-name">${esc(r.u.name)}</div>
            <div class="capacity-user-role">${esc(r.u.role || '—')}</div>
          </div>
        </div>
        <div class="capacity-stats">
          <div class="capacity-stat"><span class="capacity-stat-value">${r.userDemands.length}</span><span class="capacity-stat-label">em aberto</span></div>
          <div class="capacity-stat"><span class="capacity-stat-value">${r.inPeriod.length}</span><span class="capacity-stat-label">no período</span></div>
          <div class="capacity-stat ${r.lateCount > 0 ? 'late' : ''}"><span class="capacity-stat-value">${r.lateCount}</span><span class="capacity-stat-label">atrasadas</span></div>
          <div class="capacity-stat"><span class="capacity-stat-value">${fmtHours(r.hoursLogged)}</span><span class="capacity-stat-label">apontadas</span></div>
          <div class="capacity-stat-divider"></div>
          <div class="capacity-stat" title="Peças únicas entregues no período"><span class="capacity-stat-value">${r.totalPieces}</span><span class="capacity-stat-label">peças</span></div>
          <div class="capacity-stat" title="Artes individuais entregues no período"><span class="capacity-stat-value">${r.totalArts}</span><span class="capacity-stat-label">artes</span></div>
          <div class="capacity-stat" title="Variações/exportações entregues no período"><span class="capacity-stat-value">${r.totalVariations}</span><span class="capacity-stat-label">variações</span></div>
        </div>
        <div class="capacity-bar-wrap">
          <div class="capacity-bar-track">
            <div class="capacity-bar-fill ${r.status}" style="width:${Math.min(100, r.pct)}%"></div>
            ${r.pct > 100 ? `<div class="capacity-bar-over" style="width:${Math.min(100, r.pct - 100)}%"></div>` : ''}
          </div>
          <div class="capacity-bar-label">${r.pct}%<span class="capacity-bar-sub"> · ${fmtHours(r.hoursLogged)} / ${capacityHours}h</span></div>
        </div>
      </div>
    `).join('')}
    </div>
  `;
  if (!rows.length) $('capacity-list').innerHTML = emptyState('Sem usuários ativos', 'Cadastre usuários e atribua-os a este workspace.', 'users');
}

function renderCapacityAggregate(kind, startYmd, endYmd, businessDays, capacityHours) {
  // Período retroativo: considera apontamentos do início do período até hoje
  // (o filtro de "próximos N dias" passa a significar "últimos N dias" para os modos de horas apontadas)
  const period = $('capacity-period').value || '7';
  const today = new Date(); today.setHours(0,0,0,0);
  let startBack;
  if (period === 'month') {
    startBack = new Date(today.getFullYear(), today.getMonth(), 1);
  } else {
    const days = parseInt(period, 10);
    startBack = new Date(today); startBack.setDate(startBack.getDate() - (days - 1));
  }
  const backStartYmd = startBack.toISOString().slice(0,10);
  const todayYmd = new Date().toISOString().slice(0,10);

  // Junta todos os apontamentos de demandas do workspace no período retroativo
  const wsdemands = wsDemands();
  const allEntries = [];
  wsdemands.forEach(d => {
    (d.timeEntries || []).forEach(e => {
      const ymd = (e.createdAt || '').slice(0, 10);
      if (ymd >= backStartYmd && ymd <= todayYmd) allEntries.push({ d, e });
    });
  });

  // Agrupa por projeto ou por cliente
  const groups = new Map();
  allEntries.forEach(({ d, e }) => {
    const proj = projectById(d.projectId);
    let key, label, sub, projects;
    if (kind === 'project') {
      key = proj?.id || '__none__';
      label = proj?.name || '— Sem projeto —';
      sub = proj?.client || '';
      projects = proj ? [proj] : [];
    } else {
      // por cliente — se projeto sem cliente, agrupa em "Sem cliente"
      key = (proj?.client || '__none__').toLowerCase();
      label = proj?.client || '— Sem cliente —';
      sub = '';
      projects = wsProjects().filter(p => (p.client || '').toLowerCase() === key);
    }
    const cur = groups.get(key) || {
      key, label, sub, projects, color: proj?.color || '#7A00FF',
      hours: 0, demands: new Set(), users: new Set(), entries: 0,
      pieces: 0, arts: 0, variations: 0
    };
    cur.hours += Number(e.hours) || 0;
    cur.demands.add(d.id);
    if (e.userId) cur.users.add(e.userId);
    cur.entries++;
    if (kind === 'client') cur.projects = projects;
    groups.set(key, cur);
  });

  // Segundo loop: soma entregáveis (peças/artes/variações) por grupo.
  // Critério = demanda concluída no período OU em aberto (mesma regra da Equipe).
  // Itera UMA vez por demanda (evita dupla-contagem que viria de iterar por entries).
  const isInWindow = (d) => {
    if (d.completedAt) {
      const day = String(d.completedAt).slice(0, 10);
      return day >= backStartYmd && day <= todayYmd;
    }
    return !isDone(d);
  };
  wsdemands.forEach(d => {
    if (!isInWindow(d)) return;
    if (!(d.qtyPieces || d.qtyArts || d.qtyVariations)) return;
    const proj = projectById(d.projectId);
    let key;
    if (kind === 'project') key = proj?.id || '__none__';
    else key = (proj?.client || '__none__').toLowerCase();
    const g = groups.get(key);
    if (!g) return; // grupo só existe se houver apontamentos — sem horas, sem linha
    g.pieces += Number(d.qtyPieces) || 0;
    g.arts += Number(d.qtyArts) || 0;
    g.variations += Number(d.qtyVariations) || 0;
  });

  const rows = [...groups.values()].sort((a, b) => b.hours - a.hours);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const maxHours = Math.max(1, ...rows.map(r => r.hours));

  // Resumo
  const summary = `
    <div class="capacity-summary">
      <div class="capacity-summary-item"><div class="capacity-summary-label">Total apontado</div><div class="capacity-summary-value">${fmtHours(totalHours)}</div><div class="capacity-summary-sub">no período (${businessDays} dias úteis)</div></div>
      <div class="capacity-summary-item"><div class="capacity-summary-label">${kind === 'project' ? 'Projetos com horas' : 'Clientes com horas'}</div><div class="capacity-summary-value">${rows.length}</div><div class="capacity-summary-sub">no workspace ${esc(wsById(activeWs)?.name || '')}</div></div>
      <div class="capacity-summary-item"><div class="capacity-summary-label">Apontamentos</div><div class="capacity-summary-value">${allEntries.length}</div><div class="capacity-summary-sub">registros no período</div></div>
    </div>`;

  if (!rows.length) {
    $('capacity-list').innerHTML = summary + emptyState(
      kind === 'project' ? 'Sem horas apontadas em projetos no período' : 'Sem horas apontadas em clientes no período',
      'Os apontamentos das demandas aparecerão aqui quando registrados.'
    );
    return;
  }

  $('capacity-list').innerHTML = summary + `
    <div class="capacity-rows">
    ${rows.map(r => {
      const pct = Math.round(r.hours / maxHours * 100);
      const share = totalHours > 0 ? Math.round(r.hours / totalHours * 100) : 0;
      return `<div class="capacity-row">
        <div class="capacity-user">
          <span class="capacity-color-dot" style="background:${r.color}"></span>
          <div>
            <div class="capacity-user-name">${esc(r.label)}</div>
            <div class="capacity-user-role">${kind === 'project' ? (r.sub ? esc(r.sub) : 'Sem cliente') : (r.projects.length + ' projeto' + (r.projects.length === 1 ? '' : 's'))}</div>
          </div>
        </div>
        <div class="capacity-stats">
          <div class="capacity-stat"><span class="capacity-stat-value">${fmtHours(r.hours)}</span><span class="capacity-stat-label">apontadas</span></div>
          <div class="capacity-stat"><span class="capacity-stat-value">${r.demands.size}</span><span class="capacity-stat-label">demanda${r.demands.size === 1 ? '' : 's'}</span></div>
          <div class="capacity-stat"><span class="capacity-stat-value">${r.users.size}</span><span class="capacity-stat-label">pessoa${r.users.size === 1 ? '' : 's'}</span></div>
          <div class="capacity-stat"><span class="capacity-stat-value">${r.entries}</span><span class="capacity-stat-label">apontamento${r.entries === 1 ? '' : 's'}</span></div>
          <div class="capacity-stat-divider"></div>
          <div class="capacity-stat" title="Peças únicas entregues no período"><span class="capacity-stat-value">${r.pieces}</span><span class="capacity-stat-label">peças</span></div>
          <div class="capacity-stat" title="Artes individuais entregues no período"><span class="capacity-stat-value">${r.arts}</span><span class="capacity-stat-label">artes</span></div>
          <div class="capacity-stat" title="Variações/exportações entregues no período"><span class="capacity-stat-value">${r.variations}</span><span class="capacity-stat-label">variações</span></div>
        </div>
        <div class="capacity-bar-wrap">
          <div class="capacity-bar-track">
            <div class="capacity-bar-fill medium" style="width:${pct}%;background:${r.color}"></div>
          </div>
          <div class="capacity-bar-label">${share}%<span class="capacity-bar-sub"> · do total apontado</span></div>
        </div>
      </div>`;
    }).join('')}
    </div>
  `;
}

function renderCalendar(which) {
  const ref = calState[which];
  const y = ref.getFullYear(), m = ref.getMonth();
  $('cal-' + which + '-title').textContent = MONTHS[m] + ' ' + y;
  const source = which === 'mine' ? myDemands() : listFilteredDemands();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < first; i++) html += '<div class="cal-day" style="visibility:hidden"></div>';
  for (let day = 1; day <= days; day++) {
    const ymd = fmtYMD(y, m, day);
    const evs = source.filter(d => effDue(d) === ymd);
    const isToday = ymd === todayStr();
    // Sábado (6) e domingo (0) recebem .weekend pra ganhar visual atenuado no CSS.
    const dow = new Date(y, m, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    html += `<div class="cal-day ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}">
      <div class="cal-day-num">${isToday ? `<span class="cal-today-pill">${day}</span>` : day}</div>
      ${evs.slice(0,4).map(d => {
        const s = stageOf(d);
        const late = isLate(d);
        const owner = userById(d.ownerId);
        const bg = late ? 'var(--danger-dim)' : hexDim(s?.color);
        const fg = late ? 'var(--danger)' : (s?.color || 'var(--text)');
        const avatarHtml = owner
          ? avatarHTML(owner, 'avatar cal-event-avatar')
          : `<span class="cal-event-dot" style="background:${fg}"></span>`;
        return `<div class="cal-event" onclick="showDetail('${d.id}')" data-tooltip="${esc(d.name)}${owner ? ' · ' + esc(owner.name) : ''}" style="background:${bg};color:${fg}">
          ${avatarHtml}
          <span class="cal-event-name">${esc(d.name)}</span>
        </div>`;
      }).join('')}
      ${evs.length > 4 ? `<div class="cal-day-more">+${evs.length - 4} mais</div>` : ''}
    </div>`;
  }
  $('cal-' + which + '-body').innerHTML = html;
}
function fmtYMD(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

/* ─── MODAL: NOVA / EDITAR DEMANDA ─── */
/* Fluxos disponíveis pra um projeto, na nova arquitetura por cliente:
   1. Fluxos exclusivos desse projetId (caso especial — fluxo amarrado a 1 projeto)
   2. Fluxos do MESMO CLIENTE do projeto (via field `client`)
   3. Fluxos "Geral" do workspace (sem cliente) — sempre disponíveis */
function flowsForProject(projectId) {
  const proj = projectById(projectId);
  const projClient = (proj?.client || '').trim().toLowerCase();
  const all = wsFlows();
  const exclusive = all.filter(f => f.projectId === projectId);
  const byClient = projClient
    ? all.filter(f => !f.projectId && (f.client || '').trim().toLowerCase() === projClient)
    : [];
  const general = all.filter(f => !f.projectId && !(f.client || '').trim());
  // Dedup mantendo ordem: exclusive > client-specific > general
  const seen = new Set();
  return [...exclusive, ...byClient, ...general].filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id); return true;
  });
}
function onDemandProjectChange() {
  const pid = $('f-project').value;
  const fl = (pid ? flowsForProject(pid) : wsFlows())
    .slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const prev = $('f-flow').value;
  $('f-flow').innerHTML = fl.map(f => `<option value="${f.id}">${esc(f.name)}${f.demandType ? ' · ' + esc(f.demandType) : ''}</option>`).join('');
  if ([...$('f-flow').options].some(o => o.value === prev)) $('f-flow').value = prev;
  syncStatusOptions();
}
function syncStatusOptions(selectedStageId) {
  const flow = flowById($('f-flow').value);
  $('f-status').innerHTML = flow
    ? flow.stages.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')
    : '';
  if (selectedStageId && flow && flow.stages.some(s => s.id === selectedStageId)) $('f-status').value = selectedStageId;
  // Auto-atribui responsável da etapa ao criar nova demanda
  if (!editingId && flow) {
    const stageId = $('f-status').value;
    const stage = flow.stages.find(s => s.id === stageId);
    const autoOwner = stage?.responsibleId || null;
    buildUserSelect($('f-owner-select'), wsUsers(), autoOwner, null);
    // Defaults herdados do fluxo: só aplica em NOVA demanda e se o usuário ainda
    // não digitou nada nos campos (não sobrescreve mudanças manuais).
    const descEl = $('f-description');
    if (descEl && !descEl.value.trim() && flow.defaultDescription) {
      descEl.value = flow.defaultDescription;
    }
    // Checklist herdado — só popula se ainda tá zerado (evita resetar edições)
    if (!demandChecklistDraft.length && Array.isArray(flow.defaultChecklist)) {
      demandChecklistDraft = flow.defaultChecklist.map(it => ({ text: String(it.text || '') }));
    }
    renderDemandChecklist();
  }
}
function onDemandStatusChange() {
  if (!editingId) {
    const flow = flowById($('f-flow').value);
    if (flow) {
      const stage = flow.stages.find(s => s.id === $('f-status').value);
      buildUserSelect($('f-owner-select'), wsUsers(), stage?.responsibleId || null, null);
    }
  }
}

/* Draft do checklist a ser criado junto com a demanda nova.
   Inicializado pelo defaultChecklist do fluxo em syncStatusOptions().
   Editável aqui — usuário pode adicionar/remover/editar texto antes de salvar. */
let demandChecklistDraft = [];
function renderDemandChecklist() {
  const wrap = $('f-checklist-list');
  const group = $('f-checklist-group');
  if (!wrap || !group) return;
  // Só exibe na criação (não em edição — checklist edita pela aba detail)
  if (editingId) { group.style.display = 'none'; return; }
  if (!demandChecklistDraft.length) {
    group.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  group.style.display = '';
  wrap.innerHTML = demandChecklistDraft.map((it, i) => `
    <div class="flow-checklist-item">
      <input class="form-control" value="${esc(it.text)}" placeholder="Item do checklist" oninput="demandChecklistDraft[${i}].text=this.value">
      <button type="button" class="icon-btn danger" title="Remover" onclick="removeDemandChecklistItem(${i})"><i data-lucide="x" class="ic-sm"></i></button>
    </div>`).join('');
  paintIcons();
}
function addDemandChecklistItem() {
  demandChecklistDraft.push({ text: '' });
  renderDemandChecklist();
  const inputs = $('f-checklist-list').querySelectorAll('input.form-control');
  if (inputs.length) inputs[inputs.length - 1].focus();
}
function removeDemandChecklistItem(i) {
  demandChecklistDraft.splice(i, 1);
  renderDemandChecklist();
}
function fillDemandSelectors(d) {
  const projs = wsProjects().filter(p => p.active !== false || (d && d.projectId === p.id))
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  $('f-project').innerHTML = '<option value="">— Selecione um projeto —</option>' +
    projs.map(p => `<option value="${p.id}">${esc(p.name)}${p.client ? ' · ' + esc(p.client) : ''}</option>`).join('');
}
function fillTemplateSelector() {
  const wsTemplates = templates.filter(t => t.workspaceId === activeWs)
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const sel = $('f-template');
  sel.innerHTML = '<option value="">— Em branco —</option>' +
    wsTemplates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  $('f-template-group').style.display = wsTemplates.length ? '' : 'none';
}
function applyDemandTemplate() {
  const tid = $('f-template').value;
  if (!tid) return;
  const t = templates.find(x => x.id === tid); if (!t) return;
  if ($('f-name').value.trim() === '') $('f-name').value = t.name || '';
  $('f-description').value = t.description || '';
  $('f-briefing').value = t.briefing || '';
  $('f-estimated').value = t.estimatedHours || '';
  $('f-priority').value = t.priority || 3;
  if (t.projectId && projects.some(p => p.id === t.projectId)) {
    $('f-project').value = t.projectId;
    onDemandProjectChange();
  }
  if (t.flowId && flows.some(f => f.id === t.flowId)) {
    $('f-flow').value = t.flowId;
    syncStatusOptions();
  }
  if (t.ownerId) buildUserSelect($('f-owner-select'), wsUsers(), t.ownerId, null);
  demandAttachments = (t.attachments || []).map(a => ({ ...a, id: 'a' + Math.random().toString(36).slice(2,10) }));
  refreshFormAttList('f-attachments-list');
  toast('Template "' + t.name + '" aplicado!');
}

function openNewDemand() {
  editingId = null;
  $('modal-title').textContent = 'Nova demanda';
  $('demand-delete-btn').style.display = 'none';
  fillDemandSelectors(null);
  fillTemplateSelector();
  $('f-template').value = '';
  $('f-name').value = ''; $('f-description').value = '';
  $('f-briefing').value = ''; $('f-deadline').value = '';
  $('f-estimated').value = ''; $('f-priority').value = '3';
  $('f-qty-pieces').value = ''; $('f-qty-arts').value = ''; $('f-qty-variations').value = '';
  fillDeliverableUserSelect('f-deliverable-user', null);
  demandChecklistDraft = [];
  renderDemandChecklist();
  $('f-rec-enabled').checked = false; $('f-rec-config').style.display = 'none';
  $('f-rec-pattern').value = 'weekly'; $('f-rec-weekday').value = '1'; $('f-rec-end').value = '';
  $('f-project').value = '';
  demandAttachments = [];
  refreshFormAttList('f-attachments-list');
  applyPriorityDropdown('f-priority');
  // Inicia o wizard no step 1 (cliente). Reset completo do estado.
  wizardState = { step: 1, clientId: null, projectId: null, flowId: null };
  wizardLastFlowApplied = null;
  wizardGoTo(1);
  openModal('demand-modal');
  navPush('/demands/new');
  setTimeout(() => setupDragDrop('#demand-modal .modal-content', 'f-attachments-list', processDroppedFiles), 60);
}
function openEditDemand(id) {
  const d = demands.find(x => x.id === id); if (!d) return;
  editingId = id;
  $('modal-title').textContent = 'Editar demanda';
  $('demand-delete-btn').style.display = '';
  fillDemandSelectors(d);
  fillTemplateSelector();
  $('f-template-group').style.display = 'none';
  // Em edição, pula o wizard — vai direto pro form (step 4) com seleção pronta
  wizardState = { step: 4, clientId: projectById(d.projectId)?.clientId || null, projectId: d.projectId, flowId: d.flowId };
  // Marca o flow como "já aplicado" pra evitar reset dos campos preenchidos pela demanda
  wizardLastFlowApplied = d.flowId;
  wizardGoTo(4);
  $('f-name').value = d.name;
  $('f-description').value = d.description || '';
  $('f-briefing').value = d.briefing || '';
  $('f-deadline').value = d.deadline || '';
  $('f-estimated').value = d.estimatedHours || '';
  $('f-priority').value = d.priority || 3;
  $('f-qty-pieces').value = d.qtyPieces || '';
  $('f-qty-arts').value = d.qtyArts || '';
  $('f-qty-variations').value = d.qtyVariations || '';
  fillDeliverableUserSelect('f-deliverable-user', d.deliverableUserId || '');
  // Em edição, o checklist é gerenciado pelo painel de detalhe (não aqui)
  demandChecklistDraft = [];
  renderDemandChecklist();
  // Recurrence
  const rec = d.recurrence;
  $('f-rec-enabled').checked = !!(rec && rec.enabled);
  $('f-rec-config').style.display = rec?.enabled ? '' : 'none';
  $('f-rec-pattern').value = rec?.pattern || 'weekly';
  $('f-rec-weekday').value = rec?.weekDay ?? 1;
  if ($('f-rec-monthday')) $('f-rec-monthday').value = rec?.monthDay || 1;
  $('f-rec-end').value = rec?.endDate || '';
  $('f-rec-weekday-g').style.display = (rec?.pattern || 'weekly') === 'weekly' ? '' : 'none';
  $('f-rec-monthday-g').style.display = rec?.pattern === 'monthly' ? '' : 'none';
  $('f-project').value = d.projectId || '';
  demandAttachments = (d.attachments || []).slice();
  refreshFormAttList('f-attachments-list');
  onDemandProjectChange();
  $('f-flow').value = d.flowId;
  syncStatusOptions(d.status);
  buildUserSelect($('f-owner-select'), wsUsers(), d.ownerId, null);
  applyPriorityDropdown('f-priority');
  openModal('demand-modal');
  navPush('/demands/' + id + '/edit');
  setTimeout(() => setupDragDrop('#demand-modal .modal-content', 'f-attachments-list', processDroppedFiles), 60);
}
async function saveDemand() {
  const recEnabled = $('f-rec-enabled').checked;
  // Lê valores brutos pra log diagnóstico — se algum vier "" ou NaN sabemos por aí
  const _rawQty = {
    p: $('f-qty-pieces')?.value,
    a: $('f-qty-arts')?.value,
    v: $('f-qty-variations')?.value
  };
  const payload = {
    name: $('f-name').value,
    description: $('f-description').value,
    projectId: $('f-project').value,
    flowId: $('f-flow').value,
    briefing: normalizeUrl($('f-briefing').value),
    deadline: $('f-deadline').value || null,
    estimatedHours: $('f-estimated').value ? Number($('f-estimated').value) : null,
    priority: Number($('f-priority').value) || 3,
    qtyPieces: Number($('f-qty-pieces').value) || 0,
    qtyArts: Number($('f-qty-arts').value) || 0,
    qtyVariations: Number($('f-qty-variations').value) || 0,
    deliverableUserId: $('f-deliverable-user')?.value || null,
    // Checklist inicial — só faz sentido em CRIAÇÃO. Em edição ignora (o user
    // edita pela aba detail). Filtra itens vazios.
    checklist: editingId ? undefined : demandChecklistDraft.filter(it => (it.text || '').trim()).map(it => ({ text: it.text.trim() })),
    status: $('f-status').value,
    ownerId: $('f-owner-select').dataset.value || null,
    attachments: demandAttachments.slice(),
    recurrence: recEnabled ? {
      enabled: true,
      pattern: $('f-rec-pattern').value,
      weekDay: parseInt($('f-rec-weekday').value, 10),
      monthDay: parseInt(($('f-rec-monthday')?.value) || '1', 10),
      endDate: $('f-rec-end').value || null
    } : { enabled: false }
  };
  console.log('[saveDemand] entregáveis raw:', _rawQty, '→ payload:', { p: payload.qtyPieces, a: payload.qtyArts, v: payload.qtyVariations });
  try {
    let result;
    if (editingId) result = await api('/demands/' + editingId, 'PUT', payload);
    else result = await api('/demands', 'POST', payload);
    console.log('[saveDemand] resposta qty:', { p: result?.qtyPieces, a: result?.qtyArts, v: result?.qtyVariations });
    const wasCreate = !editingId;
    const newId = result && result.id;
    closeModal('demand-modal');
    await refreshData();
    if (detailId && editingId === detailId) renderDetail();
    if (wasCreate && newId) {
      toast('Demanda criada!', 'success', { label: 'Abrir', fn: () => showDetail(newId) });
    } else {
      toast(editingId ? 'Demanda atualizada!' : 'Demanda criada!');
    }
  } catch (e) {
    console.error('[saveDemand] erro:', e);
    toast(e.message, 'error');
  }
}

/* ── Salvar como template ── */
async function openSaveAsTemplate() {
  if (!$('f-name').value.trim()) { toast('Preencha ao menos o nome da demanda.', 'error'); return; }
  const name = await showPrompt({
    title: 'Salvar como template',
    message: 'Dê um nome a este template:',
    defaultValue: $('f-name').value.trim(),
    placeholder: 'Ex: Carrossel Instagram - Padrão',
    okLabel: 'Salvar template'
  });
  if (!name) return;
  try {
    await api('/templates', 'POST', {
      name,
      workspaceId: activeWs,
      description: $('f-description').value,
      briefing: normalizeUrl($('f-briefing').value),
      projectId: $('f-project').value || null,
      flowId: $('f-flow').value || null,
      ownerId: $('f-owner-select').dataset.value || null,
      estimatedHours: $('f-estimated').value ? Number($('f-estimated').value) : null,
      priority: Number($('f-priority').value) || 3,
      attachments: demandAttachments.slice()
    });
    toast('Template criado!');
    await refreshData();
    fillTemplateSelector();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteDemand() {
  if (!editingId) return;
  const d = demandById(editingId);
  const ok = await showConfirm({
    title: 'Excluir demanda',
    message: `Tem certeza que deseja excluir <strong>${esc(d?.name || 'esta demanda')}</strong>?<br><br>Essa ação não pode ser desfeita.`,
    okLabel: 'Excluir definitivamente',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/demands/' + editingId, 'DELETE');
    closeModal('demand-modal');
    closeModal('detail-modal');
    detailId = null;
    toast('Demanda excluída.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteFromDetail() {
  if (!detailId) return;
  editingId = detailId;
  await deleteDemand();
}
function editCurrentDemand() {
  if (!detailId) return;
  openEditDemand(detailId);
}

/* ─── MODAL: DETALHE DA DEMANDA ─── */
function showDetail(id) {
  detailId = id;
  detailView = 'main';
  renderDetail();             // render imediato com o que tem em cache
  openModal('detail-modal');
  navPush('/demands/' + id);  // URL compartilhável
  // Atualiza com a versão fresca do server (pega anexos/comentários que outros
  // usuários adicionaram desde o último loadAll) + inicia poll periódico.
  refreshDetailDemand();
  startDetailPoll();
}
function demandById(id) { return demands.find(x => x.id === id) || null; }

/* ─── REFRESH DO MODAL DE DETALHE EM QUASE-REALTIME ───
   Polling de 15s busca a versão mais nova da demanda aberta. Permite
   que mudanças de outros usuários (anexos, comentários, etapa) apareçam
   sem precisar dar F5. Pausa enquanto o usuário está digitando pra
   não perder texto em meio a um comentário. */
let _detailPollTimer = null;
async function refreshDetailDemand() {
  if (!detailId) return;
  const modal = document.getElementById('detail-modal');
  if (!modal || !modal.classList.contains('open')) return;
  // Pula a atualização se o usuário tá digitando dentro do modal
  const active = document.activeElement;
  if (active && modal.contains(active) &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
    return;
  }
  try {
    const fresh = await api('/demands/' + detailId);
    if (!fresh || fresh.id !== detailId) return;
    const local = demandById(detailId);
    // Re-renderiza apenas se algo de fato mudou (compara via JSON.stringify rápido).
    if (!local || JSON.stringify(local) !== JSON.stringify(fresh)) {
      patchDemand(fresh);
      renderDetail();
    }
  } catch {}
}
function startDetailPoll() {
  stopDetailPoll();
  // SSE já refresca o modal em tempo real (handleSseMessage chama refreshDetailDemand).
  // Mantemos polling de fallback em janela maior caso o SSE caia silenciosamente.
  _detailPollTimer = setInterval(refreshDetailDemand, 60000);
}
function stopDetailPoll() {
  if (_detailPollTimer) { clearInterval(_detailPollTimer); _detailPollTimer = null; }
}

function renderDetail() {
  const d = demandById(detailId);
  if (!d) { closeModal('detail-modal'); return; }
  if (detailView === 'history') return renderDetailHistory(d);
  if (detailView === 'stages') return renderDetailStages(d);
  const flow = flowById(d.flowId);
  const stage = stageOf(d);
  const p = projectById(d.projectId);
  const active = activeStagesOf(d, flow);
  const idx = active.findIndex(s => s.id === d.status);
  const owner = userById(d.ownerId);
  const hasCustomization = Array.isArray(d.skippedStages) && d.skippedStages.length > 0;

  // Pipeline: círculos numerados ligados por um traço (sem labels — nome aparece no tooltip)
  const stepCount = active.length;
  const fillPct = stepCount > 1 ? (idx / (stepCount - 1)) * 100 : (idx >= 0 ? 100 : 0);
  const pipeline = flow ? `
    <div class="pipeline-bar" style="--fill:${Math.max(0, Math.min(100, fillPct))}%">
      <div class="pipeline-bar-track"></div>
      <div class="pipeline-bar-fill"></div>
      <div class="pipeline-bar-steps">
        ${active.map((s, i) => {
          const stepPct = stepCount > 1 ? (i / (stepCount - 1)) * 100 : 50;
          const state = i < idx ? 'done' : (i === idx ? 'current' : '');
          return `<div class="pipeline-bar-step ${state}" style="left:${stepPct}%" data-tooltip="${esc(s.label)}">
            <div class="pipeline-bar-dot">${i + 1}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // Apontamentos de horas
  const timeRows = (d.timeEntries || []).slice().reverse().map(e => {
    const u = userById(e.userId);
    const f2 = flowById(d.flowId);
    const st = f2 ? f2.stages.find(x => x.id === e.stageId) : null;
    const canEdit = e.userId === me.id;
    const canDel = e.userId === me.id || me.isAdmin;
    return `<div class="appt-row" id="appt-${e.id}">
      ${avatarHTML(u)}
      <span class="appt-name">${esc(u?.name || '—')}</span>
      <span class="appt-hours">${fmtHours(e.hours)}</span>
      <span class="appt-time-range">
        <span class="appt-range">${e.start ? fmtDateTime(e.start) : '—'}</span>
        <i data-lucide="arrow-right" class="ic-sm appt-arrow"></i>
        <span class="appt-range">${e.end ? fmtDateTime(e.end) : '—'}</span>
      </span>
      ${st ? `<span class="pill" style="color:${st.color};background:${hexDim(st.color)};font-size:10px">${esc(st.label)}</span>` : ''}
      <div class="appt-actions">
        ${canEdit ? `<button class="detail-icon-btn" title="Editar" onclick="startEditTimeEntry('${e.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>` : ''}
        ${canDel ? `<button class="detail-icon-btn danger" title="Remover" onclick="confirmDeleteTimeEntry('${e.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>` : ''}
      </div>
    </div>`;
  }).join('');

  // Comentários
  const comments = (d.comments || []).map(c => {
    const u = userById(c.userId);
    const canEdit = c.userId === me.id;
    const canDel = c.userId === me.id || me.isAdmin;
    let text = esc(c.text).replace(/@([a-zA-Z0-9._-]+)/g, (m, uname) => {
      const found = users.find(x => x.username.toLowerCase() === uname.toLowerCase());
      return found ? `<span class="mention">@${esc(found.username)}</span>` : m;
    });
    text = mdApply(linkifyEscaped(text));
    const atts = (c.attachments || []).map(a => {
      if (a.type && a.type.startsWith('image/')) {
        return `<div class="comment-img-wrap"><img class="comment-img" src="${a.data}" alt="${esc(a.name)}" onclick="window.open(this.src,'_blank')"></div>`;
      }
      return `<a class="comment-file" href="${a.data}" download="${esc(a.name)}" title="Baixar ${esc(a.name)}"><i data-lucide="paperclip" class="ic-sm"></i> ${esc(a.name)}</a>`;
    }).join('');
    return `<div class="comment" id="comment-${c.id}">
      <div class="comment-head">
        ${avatarHTML(u)}
        <span class="comment-author">${esc(u?.name || '—')}</span>
        <span class="comment-time">${fmtDateTime(c.createdAt)}${c.editedAt ? ' · editado' : ''}</span>
        <div class="comment-actions">
          ${canEdit ? `<button class="detail-icon-btn comment-act" title="Editar" onclick="startEditComment('${c.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>` : ''}
          ${canDel ? `<button class="detail-icon-btn danger comment-act" title="Remover" onclick="confirmDeleteComment('${c.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>` : ''}
        </div>
      </div>
      ${text ? `<div class="comment-text">${text}</div>` : ''}
      ${atts ? `<div class="comment-attachments">${atts}</div>` : ''}
      ${renderReactions(c)}
    </div>`;
  }).join('');

  const totalHours = (d.timeEntries || []).reduce((a,e) => a + (Number(e.hours) || 0), 0);

  $('detail-content').innerHTML = `
    <div class="detail-content">
      <div class="detail-head">
        <div class="detail-head-top">
          <div>
            <div class="detail-title" data-tooltip="Clique para renomear" onclick="startEditDemandTitle(this)">${esc(d.name)}</div>
            <div class="detail-head-meta">
              ${p ? `<span>${esc(p.name)}</span>` : ''}
              ${p?.client ? `<span class="meta-sep">|</span><span>${esc(p.client)}</span>` : ''}
              ${demandType(d) ? `<span class="meta-sep">|</span><span class="pill pill-muted" style="font-size:10px">${esc(demandType(d))}</span>` : ''}
            </div>
          </div>
          <div class="detail-head-actions">
            <button class="detail-icon-btn danger" title="Excluir demanda" onclick="confirmDeleteCurrentDemand()"><i data-lucide="trash-2" class="ic-sm"></i></button>
            <button class="detail-icon-btn ${hasCustomization ? 'on' : ''}" title="Etapas desta demanda" onclick="openDetailStages()"><i data-lucide="list-checks" class="ic-sm"></i></button>
            <button class="detail-icon-btn" title="Histórico" onclick="openDetailHistory()"><i data-lucide="history" class="ic-sm"></i></button>
            <span class="detail-head-divider"></span>
            <button class="detail-icon-btn" title="Fechar" onclick="attemptCloseModal('detail-modal')"><i data-lucide="x" class="ic-sm"></i></button>
          </div>
        </div>
      </div>

      <div class="detail-body">
        ${pipeline ? `<div class="detail-pipeline-wrap">${pipeline}</div>` : ''}

        <div class="detail-fields-row">
          <div class="detail-field">
            <div class="detail-field-label">Responsável</div>
            <div id="detail-owner-picker"></div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Prazo da etapa atual</div>
            <input type="date" class="form-control" id="detail-stage-due" value="${d.stageDueDate || ''}" onchange="markDetailDirty('stageDue')">
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Prazo final</div>
            <input type="date" class="form-control" id="detail-deadline" value="${d.deadline || ''}" onchange="markDetailDirty('deadline')">
          </div>
        </div>

        <div class="detail-meta-grid">
          <div class="detail-field">
            <div class="detail-field-label">Fluxo</div>
            <div class="detail-field-value">${esc(flow?.name || '—')}</div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Entrou na etapa em</div>
            <div class="detail-field-value">${fmtDateTime(d.stageEnteredAt)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Criada em</div>
            <div class="detail-field-value">${fmtDateTime(d.createdAt)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Concluída em</div>
            <div class="detail-field-value">${d.completedAt ? fmtDate(d.completedAt) : '—'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Prioridade</div>
            <div class="detail-field-value">${priorityPill(d.priority)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Horas estimadas</div>
            <div class="detail-field-value" style="display:flex;align-items:center;gap:8px">
              ${d.estimatedHours ? esc(fmtHours(d.estimatedHours)) : '<span style="color:var(--text-muted)">—</span>'}
              <button class="detail-icon-btn" title="Editar estimativa" onclick="editEstimatedInline()"><i data-lucide="pencil" class="ic-sm"></i></button>
            </div>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Horas realizadas</div>
            <div class="detail-field-value">
              ${(() => {
                const total = (d.timeEntries || []).reduce((a,e) => a + (Number(e.hours)||0), 0);
                if (!d.estimatedHours) return total > 0 ? esc(fmtHours(total)) : '<span style="color:var(--text-muted)">—</span>';
                const pct = Math.round(total / d.estimatedHours * 100);
                const cls = pct > 100 ? 'deadline-late' : '';
                return `<span class="${cls}">${esc(fmtHours(total))} <span style="color:var(--text-muted);font-size:11px">(${pct}%)</span></span>`;
              })()}
            </div>
          </div>
        </div>

        <!-- Entregáveis no detalhe — botão Salvar explícito (não confia em onchange) -->
        <div class="detail-section-block">
          <div class="detail-section-title">Entregáveis</div>
          <div class="qty-grid">
            <div class="qty-cell">
              <input class="form-control" id="detail-qty-pieces" type="number" min="0" step="1" value="${d.qtyPieces || ''}" placeholder="0">
              <span class="qty-cell-label">Peças <span class="qty-cell-hint" title="Peças únicas. Ex.: 1 criativo + 1 carrossel = 2">?</span></span>
            </div>
            <div class="qty-cell">
              <input class="form-control" id="detail-qty-arts" type="number" min="0" step="1" value="${d.qtyArts || ''}" placeholder="0">
              <span class="qty-cell-label">Artes <span class="qty-cell-hint" title="Total de artes individuais. Ex.: 1 criativo + carrossel de 3 telas = 4 artes">?</span></span>
            </div>
            <div class="qty-cell">
              <input class="form-control" id="detail-qty-variations" type="number" min="0" step="1" value="${d.qtyVariations || ''}" placeholder="0">
              <span class="qty-cell-label">Variações <span class="qty-cell-hint" title="Exportações/formatos. Ex.: 1 criativo em 3 formatos = 3 variações">?</span></span>
            </div>
          </div>
          <div class="detail-deliverable-attr">
            <label class="form-label" style="margin:0">Atribuir a <span class="qty-cell-hint" title="Quem realmente executou estas artes. Se vazio, conta pro responsável atual da demanda (que pode estar em outra etapa do fluxo).">?</span></label>
            <select class="form-control" id="detail-deliverable-user" style="max-width:280px"></select>
            <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="saveDeliverablesDetail()"><i data-lucide="save" class="ic-sm"></i> Salvar entregáveis</button>
          </div>
        </div>

        <div class="detail-section-block">
          <div class="field-head">
            <div class="field-label">Briefing</div>
            <button class="detail-icon-btn" title="Editar briefing" onclick="editBriefingInline()"><i data-lucide="pencil" class="ic-sm"></i></button>
          </div>
          <div id="detail-briefing-view">
            ${d.briefing ? `<a class="detail-briefing-link" href="${esc(normalizeUrl(d.briefing))}" target="_blank" rel="noopener noreferrer">${esc(d.briefing)}</a>` : '<span style="color:var(--text-muted)">Sem briefing cadastrado</span>'}
          </div>
          <div class="field-label" style="margin-top:18px">Descrição</div>
          <div id="detail-description-view">
            ${d.description ? `<div class="detail-description md-body">${mdRender(d.description)}</div>` : '<span style="color:var(--text-muted)">Sem descrição cadastrada</span>'}
          </div>
        </div>

        <div class="detail-section-block">
          <div class="field-head">
            <div class="field-label">Arquivos da Demanda</div>
            <div style="display:flex;gap:4px">
              <input type="file" id="detail-att-file-input" multiple style="display:none" onchange="handleDetailAttachmentFiles(event)">
              <button class="detail-icon-btn" title="Anexar arquivo" onclick="$('detail-att-file-input').click()"><i data-lucide="paperclip" class="ic-sm"></i></button>
              <input type="file" id="detail-att-img-input" accept="image/*" multiple style="display:none" onchange="handleDetailAttachmentImages(event)">
              <button class="detail-icon-btn" title="Anexar imagem" onclick="$('detail-att-img-input').click()"><i data-lucide="image" class="ic-sm"></i></button>
              <button class="detail-icon-btn" title="Adicionar link" onclick="addDetailAttachmentLink()"><i data-lucide="link" class="ic-sm"></i></button>
            </div>
          </div>
          <div class="demand-att-list" id="detail-attachments-list">${renderDemandAttList(d.attachments || [], true)}</div>
        </div>

        ${d.recurrence?.enabled ? `<div class="detail-section-block" style="padding:12px 18px;display:flex;align-items:center;gap:10px">
          <i data-lucide="repeat" class="ic-sm" style="color:var(--accent-text)"></i>
          <span style="font-size:12px;color:var(--text-dim)">Demanda recorrente · <strong>${esc({daily:'Diariamente',weekly:'Semanalmente',monthly:'Mensalmente'}[d.recurrence.pattern] || d.recurrence.pattern)}</strong>${d.recurrence.lastGeneratedDate ? ' · Última geração: ' + fmtDate(d.recurrence.lastGeneratedDate) : ''}</span>
        </div>` : ''}

        ${renderChecklist(d)}

        <div class="detail-section-heading">Comentários</div>
        <div class="comment-list">${comments || '<div class="hours-empty">Nenhum comentário ainda. Use @ para marcar alguém da equipe.</div>'}</div>
        <div class="comment-compose">
          <textarea class="form-control" id="comment-input" placeholder="Digite seu comentário — você pode colar (Ctrl+V) ou arrastar imagens aqui" oninput="mentionWatch(this)" onkeydown="mentionKeys(event)"></textarea>
          <div class="mention-pop" id="mention-pop"></div>
          <div class="comment-compose-bar">
            <div class="comment-attach-btns">
              <input type="file" id="comment-file-input" multiple style="display:none" onchange="handleCommentFiles(event)">
              <button class="detail-icon-btn" onclick="$('comment-file-input').click()" title="Anexar arquivo"><i data-lucide="paperclip" class="ic-sm"></i></button>
              <input type="file" id="comment-img-input" accept="image/*" multiple style="display:none" onchange="handleCommentImages(event)">
              <button class="detail-icon-btn" onclick="$('comment-img-input').click()" title="Anexar imagem"><i data-lucide="image" class="ic-sm"></i></button>
            </div>
            <button class="btn btn-primary btn-sm" onclick="sendComment()">Enviar comentário</button>
          </div>
          <div class="comment-pending-files" id="comment-pending-files"></div>
        </div>

        <div class="detail-section-divider"></div>

        <div class="detail-section-heading">
          <span>Apontamentos de Horas</span>
          ${totalHours > 0 ? `<span class="detail-section-heading-total">Total · ${fmtHours(totalHours)}</span>` : ''}
        </div>
        <div class="time-list">${timeRows || '<div class="hours-empty">Nenhuma hora apontada ainda.</div>'}</div>
      </div>
    </div>`;

  // Footer sticky: apontamento (início, término, horas) | separador | etapa
  $('detail-footer').innerHTML = `
    <div class="detail-footer-section">
      <div class="detail-footer-group">
        <div class="detail-footer-label">Início</div>
        <input class="form-control footer-date" id="time-start" type="datetime-local">
      </div>
      <div class="detail-footer-group">
        <div class="detail-footer-label">Término</div>
        <input class="form-control footer-date" id="time-end" type="datetime-local" onchange="autoHours()">
      </div>
      <div class="detail-footer-group" style="flex:0 0 auto">
        <div class="detail-footer-label">Horas</div>
        <div class="hours-input-group">
          <input class="form-control" id="time-hours" type="number" min="0" step="0.25" placeholder="0">
          <button class="btn hours-timer-btn" id="timer-toggle-btn" onclick="toggleTimer()" title="Cronômetro"><i data-lucide="play" class="ic-sm"></i></button>
          <button class="btn btn-primary hours-add-btn" onclick="addTimeEntry()" title="Apontar horas"><i data-lucide="plus" class="ic-sm"></i></button>
        </div>
        <div class="timer-display" id="timer-display" style="display:none"><span id="timer-clock">00:00:00</span></div>
      </div>
    </div>
    <div class="detail-footer-sep"></div>
    <div class="detail-footer-section detail-footer-stage">
      <div class="detail-footer-group" style="flex:1;min-width:0">
        <div class="detail-footer-label">Etapa</div>
        <div class="detail-footer-stage-controls">
          <button class="detail-footer-arrow" ${idx <= 0 ? 'disabled' : ''} onclick="moveStage(-1)" title="Etapa anterior"><i data-lucide="chevron-left"></i></button>
          <div id="detail-stage-picker" style="flex:1"></div>
          <button class="detail-footer-arrow primary" ${!flow || idx < 0 || idx >= active.length - 1 ? 'disabled' : ''} onclick="moveStage(1)" title="Avançar etapa"><i data-lucide="chevron-right"></i></button>
        </div>
      </div>
    </div>
  `;

  // Owner picker (custom dropdown com avatar)
  buildOwnerPicker(d, owner);
  // Stage picker (custom dropdown)
  buildStagePicker(d, flow);
  // Restaura estado do cronômetro
  refreshTimerUI();
  if (getTimer(detailId).running) ensureTimerInterval();

  detailDirty = {};
  // Popula select de "atribuir entregáveis a" — só agora que o DOM tá renderizado
  fillDeliverableUserSelect('detail-deliverable-user', d.deliverableUserId || '');
  paintIcons();
  // Garante que datetime-local inputs recém-renderizados usem o picker customizado
  if (typeof fdpConvertAll === 'function') fdpConvertAll();
  // Drag-and-drop de arquivos no modal de detalhe
  setupDragDrop('#detail-modal .detail-content', 'detail-attachments-list', processDroppedFiles);
  // Paste + drag-and-drop de imagens direto no compositor de comentários
  setupCommentComposer();
}

/* Owner picker — dropdown customizado com avatar do responsável atual */
function buildOwnerPicker(d, owner) {
  const list = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const el = $('detail-owner-picker');
  const ownerLabel = owner
    ? `${avatarHTML(owner)}<span class="owner-name">${esc(owner.name)}</span>`
    : `<span class="avatar" style="background:var(--surface-3);color:var(--text-muted)">?</span><span class="owner-name" style="color:var(--text-muted)">Sem responsável</span>`;
  el.innerHTML = `
    <div class="cdrop" id="owner-cdrop">
      <div class="owner-picker" onclick="toggleCdrop('owner-cdrop', event)">
        ${ownerLabel}
        <span class="caret"><i data-lucide="chevron-down" class="ic-sm"></i></span>
      </div>
      <div class="cdrop-menu">
        <div class="cdrop-item ${!d.ownerId ? 'active' : ''}" onclick="changeOwner(null)">
          <span class="avatar" style="background:var(--surface-3);color:var(--text-muted)">?</span>
          <span>Sem responsável</span>
        </div>
        ${list.map(u => `
          <div class="cdrop-item ${u.id === d.ownerId ? 'active' : ''}" onclick="changeOwner('${u.id}')">
            ${avatarHTML(u)}
            <span>${esc(u.name)}${u.role ? ' · ' + esc(u.role) : ''}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

/* Stage picker para o footer */
function buildStagePicker(d, flow) {
  const el = $('detail-stage-picker');
  if (!flow) { el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Sem fluxo</span>'; return; }
  const cur = flow.stages.find(s => s.id === d.status);
  const stages = activeStagesOf(d, flow);
  el.innerHTML = `
    <div class="cdrop" id="stage-cdrop">
      <div class="cdrop-trigger" onclick="toggleCdrop('stage-cdrop', event)">
        ${cur ? `<span class="cdrop-dot" style="background:${cur.color}"></span>` : ''}
        <span class="cdrop-label">${esc(cur?.label || 'Selecionar etapa')}</span>
        <span class="cdrop-caret"><i data-lucide="chevron-down" class="ic-xs"></i></span>
      </div>
      <div class="cdrop-menu">
        ${stages.map(s => `
          <div class="cdrop-item ${s.id === d.status ? 'active' : ''}" onclick="pickStage('${s.id}')">
            <span class="cdrop-dot" style="background:${s.color}"></span>
            <span>${esc(s.label)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function toggleCdrop(id, ev) {
  if (ev) ev.stopPropagation();
  // fecha todos
  document.querySelectorAll('.cdrop.open').forEach(c => { if (c.id !== id) c.classList.remove('open'); });
  const c = document.getElementById(id);
  if (c) c.classList.toggle('open');
}
document.addEventListener('click', ev => {
  if (!ev.target.closest('.cdrop')) {
    document.querySelectorAll('.cdrop.open').forEach(c => c.classList.remove('open'));
  }
});

/* Stage change via picker */
async function pickStage(stageId) {
  const d = demandById(detailId); if (!d || stageId === d.status) {
    document.querySelectorAll('.cdrop.open').forEach(c => c.classList.remove('open'));
    return;
  }
  document.querySelectorAll('.cdrop.open').forEach(c => c.classList.remove('open'));
  try {
    const upd = await api('/demands/' + d.id, 'PUT', { status: stageId });
    patchDemand(upd);
    toast('Etapa atualizada!');
    renderDetail();
    renderCurrent();
    fetchNotifications();
  } catch (e) { toast(e.message, 'error'); }
}

/* Dirty state tracking — campos de data salvos manualmente */
let detailDirty = {};
function markDetailDirty(key) { detailDirty[key] = true; renderDetailDirtyBadge(); }
function hasUnsavedDetailEdits() {
  if (Object.keys(detailDirty).length > 0) return true;
  const ci = document.getElementById('comment-input');
  if (ci && ci.value.trim()) return true;
  if (typeof pendingAttachments !== 'undefined' && pendingAttachments && pendingAttachments.length) return true;
  // Verifica se há comentários em edição inline
  if (document.getElementById('edit-comment-text')) return true;
  return false;
}
function discardDetailEdits() { detailDirty = {}; }
/* ── HISTÓRICO DA DEMANDA ── */
function openDetailHistory() {
  detailView = 'history';
  renderDetail();
}
function backToDetailMain() {
  detailView = 'main';
  stagesEditDraft = null;
  renderDetail();
}

/* ── EDITOR DE ETAPAS (por instância da demanda) ──
   Permite (a) ativar/desativar etapas e (b) sobrescrever o responsável padrão da etapa
   APENAS nesta demanda. O fluxo original permanece intacto. */
function openDetailStages() {
  const d = demandById(detailId); if (!d) return;
  const flow = flowById(d.flowId);
  // Ordem inicial: usa a custom existente + qualquer etapa nova do fluxo no fim
  let initialOrder = [];
  if (flow) {
    const customOrder = Array.isArray(d.stageOrder) ? d.stageOrder.filter(id => flow.stages.some(s => s.id === id)) : [];
    const set = new Set(customOrder);
    const remaining = flow.stages.filter(s => !set.has(s.id)).map(s => s.id);
    initialOrder = [...customOrder, ...remaining];
  }
  stagesEditDraft = {
    skipped: new Set(Array.isArray(d.skippedStages) ? d.skippedStages : []),
    responsibles: { ...(d.stageResponsibles && typeof d.stageResponsibles === 'object' ? d.stageResponsibles : {}) },
    labels: { ...(d.stageLabels && typeof d.stageLabels === 'object' ? d.stageLabels : {}) },
    order: initialOrder,
  };
  detailView = 'stages';
  renderDetail();
}
function toggleStageDraft(stageId) {
  if (!stagesEditDraft) return;
  if (stagesEditDraft.skipped.has(stageId)) stagesEditDraft.skipped.delete(stageId);
  else stagesEditDraft.skipped.add(stageId);
  renderDetail();
}
function setStageResponsibleDraft(stageId, value) {
  if (!stagesEditDraft) return;
  // value: '' = sem responsável (null override) · '__default__' = remove override · userId = override
  if (value === '__default__') {
    delete stagesEditDraft.responsibles[stageId];
  } else if (value === '') {
    stagesEditDraft.responsibles[stageId] = null;
  } else {
    stagesEditDraft.responsibles[stageId] = value;
  }
  renderDetail();
}
function setStageLabelDraft(stageId, value) {
  if (!stagesEditDraft) return;
  const d = demandById(detailId); if (!d) return;
  const flow = flowById(d.flowId); if (!flow) return;
  const orig = flow.stages.find(s => s.id === stageId);
  if (!orig) return;
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed === orig.label) delete stagesEditDraft.labels[stageId];
  else stagesEditDraft.labels[stageId] = trimmed.slice(0, 80);
  // Atualiza estado do botão Salvar sem perder foco do input
  refreshStagesEditButtons(d);
}
function refreshStagesEditButtons(d) {
  const dirty = isStagesDraftDirty(d);
  const empty = !stagesEditDraft || (
    stagesEditDraft.skipped.size === 0 &&
    Object.keys(stagesEditDraft.responsibles).length === 0 &&
    Object.keys(stagesEditDraft.labels).length === 0 &&
    !isStagesOrderCustomized(d)
  );
  const saveBtn = document.getElementById('stages-edit-save');
  const resetBtn = document.getElementById('stages-edit-reset');
  if (saveBtn) saveBtn.disabled = !dirty;
  if (resetBtn) resetBtn.disabled = empty;
}
function isStagesOrderCustomized(d) {
  if (!stagesEditDraft) return false;
  const flow = flowById(d.flowId); if (!flow) return false;
  const flowOrder = flow.stages.map(s => s.id);
  if (stagesEditDraft.order.length !== flowOrder.length) return true;
  return stagesEditDraft.order.some((id, i) => flowOrder[i] !== id);
}
function resetStagesDraft() {
  if (!stagesEditDraft) return;
  const d = demandById(detailId);
  const flow = d ? flowById(d.flowId) : null;
  stagesEditDraft = {
    skipped: new Set(),
    responsibles: {},
    labels: {},
    order: flow ? flow.stages.map(s => s.id) : [],
  };
  renderDetail();
}
async function saveStagesDraft() {
  if (!stagesEditDraft) return;
  const d = demandById(detailId); if (!d) return;
  try {
    const upd = await api('/demands/' + d.id + '/skipped-stages', 'PUT', {
      skippedStages: [...stagesEditDraft.skipped],
      stageResponsibles: stagesEditDraft.responsibles,
      stageOrder: stagesEditDraft.order,
      stageLabels: stagesEditDraft.labels,
    });
    patchDemand(upd);
    stagesEditDraft = null;
    detailView = 'main';
    toast('Etapas desta demanda atualizadas!');
    renderDetail();
    renderCurrent();
  } catch (e) { toast(e.message, 'error'); }
}
function isStagesDraftDirty(d) {
  if (!stagesEditDraft) return false;
  // skippedStages
  const origSkip = new Set(d.skippedStages || []);
  if (origSkip.size !== stagesEditDraft.skipped.size) return true;
  for (const id of stagesEditDraft.skipped) if (!origSkip.has(id)) return true;
  // responsibles
  const origResp = (d.stageResponsibles && typeof d.stageResponsibles === 'object') ? d.stageResponsibles : {};
  const respKeys = new Set([...Object.keys(origResp), ...Object.keys(stagesEditDraft.responsibles)]);
  for (const k of respKeys) {
    if ((origResp[k] ?? null) !== (stagesEditDraft.responsibles[k] ?? null)) return true;
    if (!Object.prototype.hasOwnProperty.call(origResp, k) !== !Object.prototype.hasOwnProperty.call(stagesEditDraft.responsibles, k)) return true;
  }
  // labels
  const origLabels = (d.stageLabels && typeof d.stageLabels === 'object') ? d.stageLabels : {};
  const labelKeys = new Set([...Object.keys(origLabels), ...Object.keys(stagesEditDraft.labels)]);
  for (const k of labelKeys) {
    if ((origLabels[k] || null) !== (stagesEditDraft.labels[k] || null)) return true;
  }
  // order (compare against saved order, or against flow if no saved order)
  const origOrder = Array.isArray(d.stageOrder) && d.stageOrder.length ? d.stageOrder
    : (flowById(d.flowId)?.stages.map(s => s.id) || []);
  if (origOrder.length !== stagesEditDraft.order.length) return true;
  if (stagesEditDraft.order.some((id, i) => origOrder[i] !== id)) return true;
  return false;
}

/* Drag & drop para reordenar etapas no editor por instância */
let stagesDragIdx = null;
function stagesDragStart(e, i) {
  stagesDragIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}
function stagesDragOver(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function stagesDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function stagesDrop(e, i) {
  e.preventDefault();
  if (!stagesEditDraft || stagesDragIdx === null || stagesDragIdx === i) {
    stagesDragIdx = null;
    document.querySelectorAll('.stages-edit-row').forEach(r => r.classList.remove('dragging','drag-over'));
    return;
  }
  const [moved] = stagesEditDraft.order.splice(stagesDragIdx, 1);
  stagesEditDraft.order.splice(i, 0, moved);
  stagesDragIdx = null;
  renderDetail();
}
function stagesDragEnd() {
  stagesDragIdx = null;
  document.querySelectorAll('.stages-edit-row').forEach(r => r.classList.remove('dragging','drag-over'));
}
function renderDetailStages(d) {
  const flow = flowById(d.flowId);
  // Garante draft inicializado (caso entre direto pelo deep link, por ex.)
  if (!stagesEditDraft) {
    const init = flow ? flow.stages.map(s => s.id) : [];
    stagesEditDraft = { skipped: new Set(d.skippedStages || []), responsibles: { ...(d.stageResponsibles || {}) }, labels: { ...(d.stageLabels || {}) }, order: init };
  }
  const draft = stagesEditDraft;
  const dirty = isStagesDraftDirty(d);
  const empty = draft.skipped.size === 0 && Object.keys(draft.responsibles).length === 0 && Object.keys(draft.labels).length === 0 && !isStagesOrderCustomized(d);
  const sortedUsers = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

  // Itera na ordem do draft, resolvendo cada ID na lista de etapas do fluxo
  const rowsList = flow ? draft.order.map(id => flow.stages.find(s => s.id === id)).filter(Boolean) : [];

  $('detail-content').innerHTML = `
    <div class="detail-content">
      <div class="detail-head">
        <div class="detail-head-top">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="btn btn-ghost btn-sm" onclick="backToDetailMain()" style="display:inline-flex;align-items:center;gap:6px">
              <i data-lucide="arrow-left" class="ic-sm"></i> Voltar
            </button>
            <div>
              <div class="detail-title">Etapas desta demanda</div>
              <div class="detail-head-meta">
                <span>${esc(d.name)}</span>
                ${flow ? `<span class="meta-sep">|</span><span>Fluxo: ${esc(flow.name)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="detail-head-actions">
            <button id="stages-edit-reset" class="btn btn-ghost btn-sm" onclick="resetStagesDraft()" ${empty ? 'disabled' : ''}>Restaurar padrões</button>
            <button id="stages-edit-save" class="btn btn-primary btn-sm" onclick="saveStagesDraft()" ${!dirty ? 'disabled' : ''}>Salvar</button>
            <button class="detail-icon-btn" title="Fechar" onclick="attemptCloseModal('detail-modal')"><i data-lucide="x" class="ic-sm"></i></button>
          </div>
        </div>
      </div>
      <div class="detail-body">
        <div class="stages-edit-hint">
          Arraste pela alça à esquerda para reordenar, edite o nome direto no campo e troque
          o responsável no dropdown. As alterações afetam <strong>apenas esta demanda</strong> —
          o fluxo original <strong>${esc(flow?.name || '—')}</strong> continua intacto.
        </div>
        ${flow ? `<div class="stages-edit-list">${rowsList.map((s, i) => {
          const isCurrent = s.id === d.status;
          const isOn = !draft.skipped.has(s.id);
          const hasRespOverride = Object.prototype.hasOwnProperty.call(draft.responsibles, s.id);
          const currentResp = hasRespOverride ? draft.responsibles[s.id] : (s.responsibleId || null);
          const defaultUser = s.responsibleId ? userById(s.responsibleId) : null;
          const defaultLabel = defaultUser ? `Padrão do fluxo: ${defaultUser.name}` : 'Padrão do fluxo: sem responsável';
          const selectId = `stages-resp-${s.id}`;
          const currentLabel = draft.labels[s.id] || s.label;
          const hasLabelOverride = !!draft.labels[s.id];
          const lockedReason = isCurrent ? 'Etapa atual — mude antes para desativar' : '';
          return `<div class="stages-edit-row ${isOn ? 'on' : 'off'} ${isCurrent ? 'locked' : ''}"
                       draggable="true"
                       ondragstart="stagesDragStart(event, ${i})"
                       ondragover="stagesDragOver(event, ${i})"
                       ondragleave="stagesDragLeave(event)"
                       ondrop="stagesDrop(event, ${i})"
                       ondragend="stagesDragEnd()"
                       ${lockedReason ? `title="${esc(lockedReason)}"` : ''}>
            <div class="stages-edit-grip" title="Arraste para reordenar"><i data-lucide="grip-vertical" class="ic-sm"></i></div>
            <input type="checkbox" ${isOn ? 'checked' : ''} ${isCurrent ? 'disabled' : ''} onchange="toggleStageDraft('${s.id}')">
            <span class="stages-edit-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="pill-dot" style="background:${s.color}"></span>
            <input class="form-control stages-edit-label-input" value="${esc(currentLabel)}" placeholder="${esc(s.label)}" oninput="setStageLabelDraft('${s.id}', this.value)" maxlength="80">
            <div class="stages-edit-badges">
              ${s.done ? '<span class="pill pill-success" style="font-size:9px">Conclusão</span>' : ''}
              ${isCurrent ? '<span class="pill" style="font-size:9px;background:var(--accent-dim);color:var(--accent-text)">Atual</span>' : ''}
              ${!isOn && !isCurrent ? '<span class="pill pill-muted" style="font-size:9px">Desativada</span>' : ''}
              ${hasLabelOverride ? '<span class="pill" style="font-size:9px;background:var(--accent-dim);color:var(--accent-text)">Renomeada</span>' : ''}
              ${hasRespOverride ? '<span class="pill" style="font-size:9px;background:var(--accent-dim);color:var(--accent-text)">Resp. customizado</span>' : ''}
            </div>
            <div class="stages-edit-resp-wrap">
              <select id="${selectId}" class="form-control" onchange="setStageResponsibleDraft('${s.id}', this.value)">
                <option value="__default__" ${!hasRespOverride ? 'selected' : ''}>${esc(defaultLabel)}</option>
                <option value="" ${hasRespOverride && currentResp === null ? 'selected' : ''}>— Sem responsável —</option>
                ${sortedUsers.map(u => `<option value="${u.id}" ${currentResp === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
              </select>
            </div>
          </div>`;
        }).join('')}</div>` : '<div class="hours-empty">Esta demanda não tem fluxo associado.</div>'}
      </div>
    </div>`;
  paintIcons();
  // Aplica dropdowns com avatar nos selects de responsável
  if (flow) {
    rowsList.forEach(s => applyFilterDropdown(`stages-resp-${s.id}`, { userIcon: true }));
  }
}

/* ── RECORRÊNCIA ── */
function onRecurrenceToggle() {
  const enabled = $('detail-rec-enabled').checked;
  $('detail-rec-config').style.display = enabled ? 'block' : 'none';
}
function onRecurrencePatternChange() {
  const p = $('detail-rec-pattern').value;
  $('detail-rec-weekday-group').style.display = p === 'weekly' ? '' : 'none';
  $('detail-rec-monthday-group').style.display = p === 'monthly' ? '' : 'none';
}
/* Popula <select> de "atribuir entregáveis a" — usuários ativos do workspace +
   opção vazia (= cai pro responsável atual da demanda). */
function fillDeliverableUserSelect(selId, currentValue) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const list = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  sel.innerHTML = '<option value="">— Responsável atual da demanda —</option>' +
    list.map(u => `<option value="${u.id}" ${u.id === currentValue ? 'selected' : ''}>${esc(u.name)}${u.role ? ' · ' + esc(u.role) : ''}</option>`).join('');
}

/* Salva os 3 campos de entregáveis + usuário atribuído (do detail) via botão explícito. */
async function saveDeliverablesDetail() {
  if (!detailId) return;
  const payload = {
    qtyPieces: Number($('detail-qty-pieces')?.value) || 0,
    qtyArts: Number($('detail-qty-arts')?.value) || 0,
    qtyVariations: Number($('detail-qty-variations')?.value) || 0,
    deliverableUserId: $('detail-deliverable-user')?.value || null
  };
  console.log('[saveDeliverables] payload:', payload);
  try {
    const upd = await api('/demands/' + detailId, 'PUT', payload);
    console.log('[saveDeliverables] resposta:', { p: upd.qtyPieces, a: upd.qtyArts, v: upd.qtyVariations, by: upd.deliverableUserId });
    patchDemand(upd);
    toast('Entregáveis atualizados!');
    renderDetail();
  } catch (e) {
    console.error('[saveDeliverables] erro:', e);
    toast(e.message || 'Erro ao salvar entregáveis', 'error');
  }
}

async function editEstimatedInline() {
  const d = demandById(detailId); if (!d) return;
  const val = await showPrompt({
    title: 'Horas estimadas',
    message: 'Quantas horas estima para concluir esta demanda?',
    defaultValue: d.estimatedHours ? String(d.estimatedHours) : '',
    placeholder: 'Ex: 4',
    okLabel: 'Salvar'
  });
  if (val === null) return;
  const num = val.trim() === '' ? null : Number(val);
  try {
    const upd = await api('/demands/' + detailId, 'PUT', { estimatedHours: num });
    patchDemand(upd);
    toast('Estimativa atualizada!');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}

async function saveRecurrence() {
  const enabled = $('detail-rec-enabled').checked;
  const recurrence = enabled ? {
    enabled: true,
    pattern: $('detail-rec-pattern').value,
    weekDay: parseInt($('detail-rec-weekday').value, 10),
    monthDay: parseInt($('detail-rec-monthday').value, 10),
    startDate: $('detail-rec-start').value || null,
    endDate: $('detail-rec-end').value || null
  } : { enabled: false };
  try {
    const upd = await api('/demands/' + detailId, 'PUT', { recurrence });
    patchDemand(upd);
    toast(enabled ? 'Recorrência ativada!' : 'Recorrência desativada.');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}

function describeHistory(h, d) {
  const u = userById(h.userId);
  const uname = u?.name || 'Usuário';
  const dt = h.details || {};
  const flow = flowById(d.flowId);
  const stageLabel = sid => {
    if (!flow) return sid;
    const s = flow.stages.find(x => x.id === sid);
    return s ? s.label : 'etapa removida';
  };
  switch (h.action) {
    case 'created':            return `criou a demanda <strong>${esc(dt.demandName || d.name)}</strong>`;
    case 'renamed':            return `renomeou de <strong>${esc(dt.from || '')}</strong> para <strong>${esc(dt.to || '')}</strong>`;
    case 'owner_set': {
      const target = userById(dt.ownerId);
      return `atribuiu o responsável <strong>${esc(target?.name || '—')}</strong>`;
    }
    case 'owner_changed': {
      const from = userById(dt.fromId), to = userById(dt.toId);
      if (!from && to) return `definiu o responsável como <strong>${esc(to.name)}</strong>`;
      if (from && !to) return `removeu o responsável (era <strong>${esc(from.name)}</strong>)`;
      return `alterou o responsável de <strong>${esc(from?.name || '—')}</strong> para <strong>${esc(to?.name || '—')}</strong>`;
    }
    case 'owner_auto_assigned': {
      const to = userById(dt.toId);
      return `responsável atribuído automaticamente: <strong>${esc(to?.name || '—')}</strong>`;
    }
    case 'project_changed':    return `alterou o projeto da demanda`;
    case 'description_changed':return `alterou a descrição`;
    case 'briefing_changed':   return `alterou o link do briefing`;
    case 'deadline_changed':   return `alterou o prazo final${dt.to ? ' para <strong>' + esc(fmtDate(dt.to)) + '</strong>' : ' (removido)'}`;
    case 'stage_due_changed':  return `alterou o prazo da etapa${dt.to ? ' para <strong>' + esc(fmtDate(dt.to)) + '</strong>' : ' (removido)'}`;
    case 'flow_changed':       return `alterou o fluxo da demanda`;
    case 'stage_changed':      return `avançou da etapa <strong>${esc(stageLabel(dt.fromId))}</strong> para <strong>${esc(stageLabel(dt.toId))}</strong>`;
    case 'attachment_added':   return `anexou ${dt.kind === 'link' ? 'um link' : 'um arquivo'}: <strong>${esc(dt.name || '')}</strong>`;
    case 'attachment_removed': return `removeu o anexo <strong>${esc(dt.name || '')}</strong>`;
    case 'comment_added':      return `comentou${dt.preview ? ': <em>"' + esc(dt.preview) + (dt.preview.length >= 80 ? '…' : '') + '"</em>' : ''}`;
    case 'comment_edited':     return `editou um comentário`;
    case 'comment_removed':    return `removeu um comentário`;
    case 'time_added':         return `apontou <strong>${esc(fmtHours(dt.hours))}</strong> de trabalho${dt.stageId ? ' em <strong>' + esc(stageLabel(dt.stageId)) + '</strong>' : ''}`;
    case 'time_edited':        return `editou apontamento (agora <strong>${esc(fmtHours(dt.hours))}</strong>)`;
    case 'time_removed':       return `removeu um apontamento de <strong>${esc(fmtHours(dt.hours))}</strong>`;
    case 'estimated_hours_changed': return `alterou a estimativa de horas${dt.to ? ' para <strong>' + esc(fmtHours(dt.to)) + '</strong>' : ' (removida)'}`;
    case 'priority_changed':    return `alterou a prioridade de <strong>${esc(priorityLabel(dt.from))}</strong> para <strong>${esc(priorityLabel(dt.to))}</strong>`;
    case 'recurrence_enabled': return `ativou a recorrência (<strong>${esc(dt.pattern || '')}</strong>)`;
    case 'recurrence_disabled':return `desativou a recorrência`;
    case 'recurrence_changed': return `alterou a configuração de recorrência`;
    case 'created_from_recurrence': return `gerou esta demanda automaticamente pela recorrência`;
    case 'checklist_added':    return `adicionou item ao checklist: <em>"${esc((dt.text || '').slice(0, 60))}${(dt.text || '').length > 60 ? '…' : ''}"</em>`;
    case 'checklist_edited':   return `editou um item do checklist`;
    case 'checklist_removed':  return `removeu item do checklist: <em>"${esc((dt.text || '').slice(0, 60))}${(dt.text || '').length > 60 ? '…' : ''}"</em>`;
    case 'checklist_checked':  return `concluiu item do checklist: <em>"${esc((dt.text || '').slice(0, 60))}${(dt.text || '').length > 60 ? '…' : ''}"</em>`;
    case 'checklist_unchecked':return `desmarcou item do checklist`;
    case 'stages_customized': {
      const flow = flowById(d.flowId);
      const lookup = id => flow?.stages.find(s => s.id === id)?.label || '(removida)';
      const added = (h.detail?.added || []).map(lookup);
      const removed = (h.detail?.removed || []).map(lookup);
      const respChanges = h.detail?.responsibles || [];
      const labelChanges = h.detail?.labelChanges || [];
      const orderChanged = !!h.detail?.orderChanged;
      const parts = [];
      if (added.length) parts.push(`desativou: <em>${esc(added.join(', '))}</em>`);
      if (removed.length) parts.push(`reativou: <em>${esc(removed.join(', '))}</em>`);
      if (orderChanged) parts.push('reordenou etapas');
      if (labelChanges.length) {
        const names = labelChanges.map(c => `${esc(lookup(c.stageId))} → <em>${esc(c.to || lookup(c.stageId))}</em>`);
        parts.push(`renomeou: ${names.join(', ')}`);
      }
      if (respChanges.length) {
        const respDesc = respChanges.map(c => {
          const stageName = lookup(c.stageId);
          const userName = c.to ? (userById(c.to)?.name || '(usuário)') : (c.to === null ? 'sem responsável' : 'padrão do fluxo');
          return `${esc(stageName)} → <em>${esc(userName)}</em>`;
        });
        parts.push(`responsáveis: ${respDesc.join(', ')}`);
      }
      return `customizou etapas — ${parts.length ? parts.join(' · ') : 'sem mudanças visíveis'}`;
    }
    default:                   return esc(h.action);
  }
}
function renderDetailHistory(d) {
  const p = projectById(d.projectId);
  const history = (d.history || []).slice().reverse();
  $('detail-content').innerHTML = `
    <div class="detail-content">
      <div class="detail-head">
        <div class="detail-head-top">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="btn btn-ghost btn-sm" onclick="backToDetailMain()" style="display:inline-flex;align-items:center;gap:6px">
              <i data-lucide="arrow-left" class="ic-sm"></i> Voltar
            </button>
            <div>
              <div class="detail-title">Histórico da demanda</div>
              <div class="detail-head-meta">
                <span>${esc(d.name)}</span>
                ${p ? `<span class="meta-sep">|</span><span>${esc(p.name)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="detail-head-actions">
            <button class="detail-icon-btn" title="Fechar" onclick="attemptCloseModal('detail-modal')"><i data-lucide="x" class="ic-sm"></i></button>
          </div>
        </div>
      </div>
      <div class="detail-body">
        ${history.length ? `<div class="history-list">${history.map(h => {
          const u = userById(h.userId);
          return `<div class="history-item">
            ${avatarHTML(u)}
            <div class="history-body">
              <div class="history-text"><strong>${esc(u?.name || 'Usuário')}</strong> ${describeHistory(h, d)}</div>
              <div class="history-time">${esc(fmtDateTime(h.at))}</div>
            </div>
          </div>`;
        }).join('')}</div>` : '<div class="hours-empty">Nenhum registro no histórico ainda.</div>'}
      </div>
    </div>`;
  $('detail-footer').innerHTML = '';
  paintIcons();
}

function renderDetailDirtyBadge() {
  // Adiciona um botão flutuante de salvar próximo aos campos editados
  const existing = document.getElementById('detail-save-pending');
  if (Object.keys(detailDirty).length === 0) { if (existing) existing.remove(); return; }
  if (existing) return;
  const bar = document.createElement('div');
  bar.id = 'detail-save-pending';
  bar.style.cssText = 'position:sticky;top:80px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:var(--radius-sm);padding:10px 14px;display:flex;align-items:center;gap:12px;margin-bottom:18px;font-size:12px;color:var(--accent-text);font-weight:600;z-index:1';
  bar.innerHTML = `
    <span><i data-lucide="alert-triangle" class="ic-sm"></i> Alterações pendentes</span>
    <button class="btn btn-primary btn-sm" onclick="commitDetailEdits()" style="margin-left:auto">Salvar</button>
    <button class="btn btn-ghost btn-sm" onclick="cancelDetailEdits()">Descartar</button>`;
  const body = document.querySelector('.detail-body');
  if (body) body.insertBefore(bar, body.firstChild);
}
async function commitDetailEdits() {
  const d = demandById(detailId); if (!d) return;
  const payload = {};
  if (detailDirty.stageDue) payload.stageDueDate = $('detail-stage-due').value || null;
  if (detailDirty.deadline) payload.deadline = $('detail-deadline').value || null;
  try {
    const upd = await api('/demands/' + d.id, 'PUT', payload);
    patchDemand(upd);
    detailDirty = {};
    toast('Alterações salvas!');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}
function cancelDetailEdits() {
  detailDirty = {};
  renderDetail();
}

/* Briefing/descrição inline edit
   Auto-save: dispara em blur ou após ~1s parado de digitar. Salva silenciosamente
   (sem re-render) pra não perder cursor/foco. Indicador minimalista mostra o
   estado: "Salvando…" → "Salvo" → fade. Botão "Concluir" só esconde o editor. */
function editBriefingInline() {
  const d = demandById(detailId); if (!d) return;
  const bView = $('detail-briefing-view');
  const dView = $('detail-description-view');
  bView.innerHTML = `<input class="form-control" id="edit-briefing" type="url" value="${esc(d.briefing || '')}" placeholder="https://...">`;
  dView.innerHTML = `<textarea class="form-control" id="edit-description" rows="5" placeholder="Detalhes da demanda...">${esc(d.description || '')}</textarea>
    <div class="inline-edit-foot">
      <span class="inline-edit-status" id="edit-desc-status"></span>
      <button class="btn btn-ghost btn-sm" onclick="renderDetail()">Concluir</button>
    </div>`;
  const briefingInput = $('edit-briefing');
  const descTextarea = $('edit-description');
  if (briefingInput) {
    briefingInput.addEventListener('input', autoSaveBriefingDebounced);
    briefingInput.addEventListener('blur', autoSaveBriefing);
  }
  if (descTextarea) {
    descTextarea.addEventListener('input', autoSaveBriefingDebounced);
    descTextarea.addEventListener('blur', autoSaveBriefing);
  }
}
async function autoSaveBriefing() {
  const d = demandById(detailId); if (!d) return;
  const briefingEl = document.getElementById('edit-briefing');
  const descEl = document.getElementById('edit-description');
  if (!briefingEl && !descEl) return; // editor fechado
  const newBrief = briefingEl ? normalizeUrl(briefingEl.value) : d.briefing;
  const newDesc  = descEl ? descEl.value.trim() : d.description;
  if (newBrief === (d.briefing || '') && newDesc === (d.description || '')) return;
  setInlineEditStatus('Salvando…');
  try {
    const upd = await api('/demands/' + d.id, 'PUT', { briefing: newBrief, description: newDesc });
    patchDemand(upd);
    setInlineEditStatus('Salvo', 'ok');
  } catch (e) {
    setInlineEditStatus('Erro ao salvar', 'err');
  }
}
const autoSaveBriefingDebounced = debounce(autoSaveBriefing, 1000);
function setInlineEditStatus(text, kind) {
  const el = document.getElementById('edit-desc-status');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'inline-edit-status' + (kind ? ' ' + kind : '');
  if (kind === 'ok') {
    clearTimeout(setInlineEditStatus._t);
    setInlineEditStatus._t = setTimeout(() => {
      const cur = document.getElementById('edit-desc-status');
      if (cur && cur.textContent === text) { cur.textContent = ''; cur.className = 'inline-edit-status'; }
    }, 1800);
  }
}
// Mantida pra compat se algum onclick antigo ainda chamar
async function saveBriefingInline() { await autoSaveBriefing(); renderDetail(); }

/* Confirmações */
async function confirmDeleteCurrentDemand() {
  const d = demandById(detailId); if (!d) return;
  const ok = await showConfirm({
    title: 'Excluir demanda',
    message: `Tem certeza que deseja excluir <strong>${esc(d.name)}</strong>?<br><br>Essa ação não pode ser desfeita. Todos os comentários, apontamentos e histórico serão perdidos.`,
    okLabel: 'Excluir definitivamente',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/demands/' + d.id, 'DELETE');
    closeModal('detail-modal');
    detailId = null;
    toast('Demanda excluída.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function confirmDeleteComment(cid) {
  const ok = await showConfirm({
    title: 'Excluir comentário',
    message: 'Esta ação não pode ser desfeita. Deseja remover este comentário?',
    okLabel: 'Excluir',
    danger: true
  });
  if (ok) deleteComment(cid);
}
async function confirmDeleteTimeEntry(eid) {
  const ok = await showConfirm({
    title: 'Excluir apontamento',
    message: 'Tem certeza que deseja remover este apontamento de horas?',
    okLabel: 'Excluir',
    danger: true
  });
  if (ok) deleteTimeEntry(eid);
}

/* ─── Anexos de Demanda (arquivos, imagens, links) ─── */
function renderDemandAttList(list, withDelete) {
  if (!list || !list.length) return '<div class="hours-empty" style="text-align:left">Nenhum arquivo anexado.</div>';
  return list.map((a, i) => {
    if (a.kind === 'link') {
      const href = esc(normalizeUrl(a.url || a.name));
      return `<div class="demand-att-item" data-id="${esc(a.id)}">
        <i data-lucide="link" class="ic-sm" style="color:var(--accent-text)"></i>
        <a href="${href}" target="_blank" rel="noopener noreferrer" class="demand-att-name">${esc(a.name || a.url)}</a>
        ${withDelete ? `<button class="detail-icon-btn danger" title="Remover" onclick="removeDetailAttachment('${esc(a.id)}')"><i data-lucide="x" class="ic-sm"></i></button>` : `<button class="detail-icon-btn danger" title="Remover" onclick="removeFormAttachment('${esc(a.id)}', 'f-attachments-list')"><i data-lucide="x" class="ic-sm"></i></button>`}
      </div>`;
    }
    const isImg = (a.type || '').startsWith('image/');
    const icon = isImg ? 'image' : 'file';
    return `<div class="demand-att-item" data-id="${esc(a.id)}">
      ${isImg ? `<img src="${a.data}" class="demand-att-thumb" onclick="window.open(this.src,'_blank')">` : `<i data-lucide="${icon}" class="ic-sm" style="color:var(--accent-text)"></i>`}
      <a href="${a.data}" download="${esc(a.name)}" class="demand-att-name">${esc(a.name)}</a>
      ${withDelete ? `<button class="detail-icon-btn danger" title="Remover" onclick="removeDetailAttachment('${esc(a.id)}')"><i data-lucide="x" class="ic-sm"></i></button>` : `<button class="detail-icon-btn danger" title="Remover" onclick="removeFormAttachment('${esc(a.id)}', 'f-attachments-list')"><i data-lucide="x" class="ic-sm"></i></button>`}
    </div>`;
  }).join('');
}
function genAttId() { return 'a' + Math.random().toString(36).slice(2,10); }

/* Form attachments (modal de nova demanda) — usa demandAttachments */
function refreshFormAttList(listId) {
  $(listId).innerHTML = renderDemandAttList(demandAttachments, false);
  paintIcons();
}
function readDemandFiles(files, isImage, listId) {
  [...files].forEach(file => {
    if (file.size > 5 * 1024 * 1024) { toast('Arquivo "' + file.name + '" excede 5 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const finish = (data, type) => {
        demandAttachments.push({ id: genAttId(), kind: 'file', name: file.name, type, data });
        refreshFormAttList(listId);
      };
      if (isImage) {
        const img = new Image();
        img.onload = () => {
          const max = 1200;
          let w = img.width, h = img.height;
          if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          finish(canvas.toDataURL('image/jpeg', 0.85), 'image/jpeg');
        };
        img.src = e.target.result;
      } else finish(e.target.result, file.type);
    };
    reader.readAsDataURL(file);
  });
}
function handleDemandAttachmentFiles(ev, listId) { readDemandFiles(ev.target.files, false, listId); ev.target.value = ''; }
function handleDemandAttachmentImages(ev, listId) { readDemandFiles(ev.target.files, true, listId); ev.target.value = ''; }
async function addDemandAttachmentLink(listId) {
  const url = await showPrompt({ title: 'Adicionar link', message: 'Cole o link abaixo:', placeholder: 'https://...' });
  if (!url) return;
  const normalized = normalizeUrl(url);
  demandAttachments.push({ id: genAttId(), kind: 'link', name: url.trim(), url: normalized });
  refreshFormAttList(listId);
}
function removeFormAttachment(id, listId) {
  demandAttachments = demandAttachments.filter(a => a.id !== id);
  refreshFormAttList(listId);
}

/* Detail attachments — operam direto na demanda via API */
async function handleDetailAttachmentFiles(ev) {
  const d = demandById(detailId); if (!d) return;
  for (const file of ev.target.files) {
    if (file.size > 5 * 1024 * 1024) { toast('Arquivo "' + file.name + '" excede 5 MB.', 'error'); continue; }
    await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async e => {
        const newAtts = (d.attachments || []).concat({ id: genAttId(), kind: 'file', name: file.name, type: file.type, data: e.target.result });
        try {
          const upd = await api('/demands/' + d.id, 'PUT', { attachments: newAtts });
          patchDemand(upd);
        } catch (err) { toast(err.message, 'error'); }
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }
  ev.target.value = '';
  renderDetail();
  toast('Anexo adicionado!');
}
async function handleDetailAttachmentImages(ev) {
  const d = demandById(detailId); if (!d) return;
  for (const file of ev.target.files) {
    if (file.size > 5 * 1024 * 1024) { toast('Arquivo "' + file.name + '" excede 5 MB.', 'error'); continue; }
    await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = async () => {
          const max = 1200;
          let w = img.width, h = img.height;
          if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const data = canvas.toDataURL('image/jpeg', 0.85);
          const newAtts = (d.attachments || []).concat({ id: genAttId(), kind: 'file', name: file.name, type: 'image/jpeg', data });
          try {
            const upd = await api('/demands/' + d.id, 'PUT', { attachments: newAtts });
            patchDemand(upd);
          } catch (err) { toast(err.message, 'error'); }
          resolve();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  ev.target.value = '';
  renderDetail();
  toast('Imagem adicionada!');
}
async function addDetailAttachmentLink() {
  const d = demandById(detailId); if (!d) return;
  const url = await showPrompt({ title: 'Adicionar link', message: 'Cole o link abaixo:', placeholder: 'https://...' });
  if (!url) return;
  const newAtts = (d.attachments || []).concat({ id: genAttId(), kind: 'link', name: url.trim(), url: normalizeUrl(url) });
  try {
    const upd = await api('/demands/' + d.id, 'PUT', { attachments: newAtts });
    patchDemand(upd);
    toast('Link adicionado!');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}
async function removeDetailAttachment(id) {
  const d = demandById(detailId); if (!d) return;
  const ok = await showConfirm({ title: 'Remover anexo', message: 'Tem certeza que deseja remover este anexo?', okLabel: 'Remover', danger: true });
  if (!ok) return;
  try {
    const upd = await api('/demands/' + d.id, 'PUT', { attachments: (d.attachments || []).filter(a => a.id !== id) });
    patchDemand(upd);
    toast('Anexo removido.', 'warn');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}

async function changeOwner(uid) {
  document.querySelectorAll('.cdrop.open').forEach(c => c.classList.remove('open'));
  try {
    const d = await api('/demands/' + detailId, 'PUT', { ownerId: uid });
    patchDemand(d);
    toast('Responsável atualizado!');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}
function patchDemand(d) {
  const i = demands.findIndex(x => x.id === d.id);
  if (i >= 0) demands[i] = d; else demands.push(d);
}

/* ─── Edição inline do título da demanda ───
   Click no <div class="detail-title"> dispara isto: troca por <input>,
   commit no blur ou Enter, cancela no Esc. */
function startEditDemandTitle(el) {
  if (!el || el.querySelector('input')) return;
  const d = demandById(detailId);
  if (!d) return;
  const current = d.name;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'detail-title-input';
  input.value = current;
  input.maxLength = 200;
  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const next = (input.value || '').trim();
    if (!save || !next || next === current) {
      el.textContent = current;
      return;
    }
    try {
      const upd = await api('/demands/' + d.id, 'PUT', { name: next });
      patchDemand(upd);
      el.textContent = next;
      if (typeof renderList === 'function') renderList();
      const kb = document.getElementById('kanban-board');
      if (kb && typeof renderKanban === 'function') renderKanban();
      toast('Demanda renomeada!');
    } catch (err) {
      toast(err.message || 'Erro ao renomear', 'error');
      el.textContent = current;
    }
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

async function moveStage(dir) {
  const d = demandById(detailId); if (!d) return;
  const flow = flowById(d.flowId); if (!flow) return;
  const active = activeStagesOf(d, flow);
  const idx = active.findIndex(s => s.id === d.status);
  const next = active[idx + dir];
  if (!next) return;
  try {
    const upd = await api('/demands/' + d.id, 'PUT', { status: next.id });
    patchDemand(upd);
    toast(dir > 0 ? 'Etapa avançada: ' + next.label : 'Etapa retrocedida: ' + next.label);
    renderDetail();
    renderCurrent();
    fetchNotifications();
  } catch (e) { toast(e.message, 'error'); }
}
/* ── CRONÔMETRO DE APONTAMENTO ──
   Estado por demanda. Persiste a hora de início e o acumulado mesmo que o modal
   re-renderize. O cronômetro corre via setInterval atualizando o display. */
let timerState = {}; // { [demandId]: { running, startedAt, accumulatedMs, beginAt } }
let timerInterval = null;

function getTimer(demandId) {
  if (!timerState[demandId]) {
    timerState[demandId] = { running: false, accumulatedMs: 0, beginAt: null, startedAt: null };
  }
  return timerState[demandId];
}
function formatTimerClock(ms) {
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function timerElapsedMs(t) {
  let ms = t.accumulatedMs;
  if (t.running && t.beginAt) ms += Date.now() - t.beginAt;
  return ms;
}
function refreshTimerUI() {
  const t = detailId ? getTimer(detailId) : null;
  const display = $('timer-display');
  const clock = $('timer-clock');
  const btn = $('timer-toggle-btn');
  if (!display || !clock || !btn || !t) return;
  const elapsed = timerElapsedMs(t);
  // Mostra o display se houver tempo acumulado ou estiver correndo
  display.style.display = (t.running || elapsed > 0) ? '' : 'none';
  clock.textContent = formatTimerClock(elapsed);
  // Botão alterna entre play e pause
  btn.classList.toggle('running', t.running);
  btn.innerHTML = t.running ? '<i data-lucide="pause" class="ic-sm"></i>' : '<i data-lucide="play" class="ic-sm"></i>';
  btn.title = t.running ? 'Pausar cronômetro' : 'Iniciar cronômetro';
  paintIcons();
}
function tickTimer() {
  const t = detailId ? getTimer(detailId) : null;
  if (!t || !t.running) return;
  const clock = $('timer-clock');
  if (clock) clock.textContent = formatTimerClock(timerElapsedMs(t));
}
function ensureTimerInterval() {
  if (timerInterval) return;
  timerInterval = setInterval(tickTimer, 1000);
}
function toggleTimer() {
  const d = demandById(detailId); if (!d) return;
  const t = getTimer(detailId);
  if (t.running) {
    // Pausar: acumula o tempo decorrido
    t.accumulatedMs += Date.now() - t.beginAt;
    t.running = false;
    t.beginAt = null;
    // Preenche o campo de horas com o acumulado (em horas decimais)
    const hours = Math.round((t.accumulatedMs / 3600000) * 100) / 100;
    if (hours > 0) $('time-hours').value = hours;
    // Preenche término = agora; início = agora - acumulado (se ainda não preenchido)
    const now = new Date();
    const toLocal = dt => {
      const off = dt.getTimezoneOffset();
      return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
    };
    if (!$('time-end').value) $('time-end').value = toLocal(now);
    if (!$('time-start').value && t.startedAt) $('time-start').value = toLocal(new Date(t.startedAt));
    toast('Cronômetro pausado · ' + formatTimerClock(t.accumulatedMs));
  } else {
    // Iniciar/retomar
    t.running = true;
    t.beginAt = Date.now();
    if (!t.startedAt) t.startedAt = Date.now();
    ensureTimerInterval();
    toast('Cronômetro iniciado');
  }
  refreshTimerUI();
}
function resetTimer(demandId) {
  if (timerState[demandId]) delete timerState[demandId];
}

/* Converte um valor exibido (dd/mm/aaaa HH:MM ou ISO) para ISO datetime-local */
function toIsoDateTime(v) {
  if (!v) return null;
  v = String(v).trim();
  // Já está em ISO
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v.slice(0, 16);
  // Formato display: dd/mm/aaaa HH:MM
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`;
  // Formato display sem hora
  const md = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (md) return `${md[3]}-${md[2]}-${md[1]}T00:00`;
  return null;
}

/* Apontamento de horas */
function autoHours() {
  const s = toIsoDateTime($('time-start').value);
  const e = toIsoDateTime($('time-end').value);
  if (s && e && !$('time-hours').value) {
    const diff = (new Date(e) - new Date(s)) / 3600000;
    if (diff > 0) $('time-hours').value = Math.round(diff * 100) / 100;
  }
}
async function addTimeEntry() {
  const d = demandById(detailId); if (!d) return;
  let hours = Number($('time-hours').value);
  const start = toIsoDateTime($('time-start').value);
  const end = toIsoDateTime($('time-end').value);
  if (!(hours > 0) && start && end) {
    const diff = (new Date(end) - new Date(start)) / 3600000;
    if (diff > 0) hours = Math.round(diff * 100) / 100;
  }
  if (!(hours > 0)) { toast('Informe as horas ou um início e término válidos.', 'error'); return; }
  try {
    const upd = await api('/demands/' + d.id + '/time', 'POST', { hours, start, end });
    patchDemand(upd);
    resetTimer(d.id);
    toast('Horas apontadas!');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteTimeEntry(entryId) {
  try {
    const upd = await api('/demands/' + detailId + '/time/' + entryId, 'DELETE');
    patchDemand(upd);
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}

function startEditTimeEntry(eid) {
  const d = demandById(detailId); if (!d) return;
  const e = (d.timeEntries || []).find(x => x.id === eid); if (!e) return;
  const el = document.getElementById('appt-' + eid); if (!el) return;
  const toLocal = iso => {
    if (!iso) return '';
    const dt = new Date(iso);
    const off = dt.getTimezoneOffset();
    return new Date(dt.getTime() - off * 60000).toISOString().slice(0,16);
  };
  el.outerHTML = `<div class="appt-row appt-edit" id="appt-${eid}">
    <div class="form-group" style="margin:0;flex:1;min-width:120px">
      <label class="form-label">Horas</label>
      <input class="form-control" id="ae-hours" type="number" min="0" step="0.25" value="${e.hours}">
    </div>
    <div class="form-group" style="margin:0;flex:2;min-width:160px">
      <label class="form-label">Início</label>
      <input class="form-control" id="ae-start" type="datetime-local" value="${toLocal(e.start)}">
    </div>
    <div class="form-group" style="margin:0;flex:2;min-width:160px">
      <label class="form-label">Término</label>
      <input class="form-control" id="ae-end" type="datetime-local" value="${toLocal(e.end)}">
    </div>
    <div style="display:flex;gap:6px;align-items:end;padding-bottom:4px">
      <button class="btn btn-ghost btn-sm" onclick="renderDetail()">Cancelar</button>
      <button class="btn btn-primary btn-sm" onclick="saveEditTimeEntry('${eid}')">Salvar</button>
    </div>
  </div>`;
  paintIcons();
  if (typeof fdpConvertAll === 'function') fdpConvertAll();
  $('ae-hours').focus();
}
async function saveEditTimeEntry(eid) {
  let hours = Number($('ae-hours').value);
  const start = toIsoDateTime($('ae-start').value);
  const end = toIsoDateTime($('ae-end').value);
  if (!(hours > 0) && start && end) {
    const diff = (new Date(end) - new Date(start)) / 3600000;
    if (diff > 0) hours = Math.round(diff * 100) / 100;
  }
  if (!(hours > 0)) { toast('Informe as horas ou início/término válidos.', 'error'); return; }
  try {
    const upd = await api('/demands/' + detailId + '/time/' + eid, 'PUT', { hours, start, end });
    patchDemand(upd);
    toast('Apontamento atualizado!');
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}

/* Comentários com @menção */
let mentionIdx = -1;
function mentionCandidates(term) {
  const t = norm(term);
  return wsUsers().filter(u => norm(u.username).startsWith(t) || norm(u.name).includes(t)).slice(0, 6);
}
function mentionContext(ta) {
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const m = before.match(/@([a-zA-Z0-9._-]*)$/);
  return m ? { term: m[1], start: pos - m[0].length, pos } : null;
}
function mentionWatch(ta) {
  const ctx = mentionContext(ta);
  const pop = $('mention-pop');
  if (!ctx) { pop.classList.remove('open'); return; }
  const list = mentionCandidates(ctx.term);
  if (!list.length) { pop.classList.remove('open'); return; }
  mentionIdx = 0;
  pop.innerHTML = list.map((u, i) => `
    <div class="mention-opt ${i === 0 ? 'active' : ''}" data-uname="${esc(u.username)}" onclick="pickMention('${esc(u.username)}')">
      ${avatarHTML(u)} <span class="user-mini"><span class="user-mini-name">${esc(u.name)}</span><span class="user-mini-role">@${esc(u.username)}</span></span>
    </div>`).join('');
  pop.classList.add('open');
  pop.style.bottom = (ta.offsetHeight + 6) + 'px';
  pop.style.left = '0';
}
function mentionKeys(e) {
  const pop = $('mention-pop');
  if (!pop.classList.contains('open')) return;
  const opts = [...pop.querySelectorAll('.mention-opt')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    mentionIdx = (mentionIdx + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
    opts.forEach((o, i) => o.classList.toggle('active', i === mentionIdx));
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    pickMention(opts[mentionIdx]?.dataset.uname);
  } else if (e.key === 'Escape') {
    pop.classList.remove('open');
  }
}
function pickMention(uname) {
  if (!uname) return;
  const ta = $('comment-input');
  const ctx = mentionContext(ta);
  if (!ctx) return;
  ta.value = ta.value.slice(0, ctx.start) + '@' + uname + ' ' + ta.value.slice(ctx.pos);
  $('mention-pop').classList.remove('open');
  ta.focus();
}
async function sendComment() {
  const text = $('comment-input').value.trim();
  if (!text && !pendingAttachments.length) return;
  try {
    const upd = await api('/demands/' + detailId + '/comment', 'POST', { text, attachments: pendingAttachments });
    pendingAttachments = [];
    patchDemand(upd);
    renderDetail();
    toast('Comentário enviado!');
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteComment(cid) {
  try {
    const upd = await api('/demands/' + detailId + '/comment/' + cid, 'DELETE');
    patchDemand(upd);
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}

/* Anexos de comentário */
let pendingAttachments = [];
function renderPendingFiles() {
  const el = $('comment-pending-files');
  if (!el) return;
  el.innerHTML = pendingAttachments.map((a, i) => {
    const preview = a.type.startsWith('image/')
      ? `<img src="${a.data}" class="pending-thumb">`
      : '<i data-lucide="file" class="ic-sm"></i>';
    return `<span class="pending-file">${preview} ${esc(a.name)} <button class="icon-btn danger" onclick="removePending(${i})" title="Remover"><i data-lucide="x" class="ic-sm"></i></button></span>`;
  }).join('');
}
function removePending(i) { pendingAttachments.splice(i, 1); renderPendingFiles(); }
function readFilesAsBase64(files, isImage) {
  [...files].forEach(file => {
    if (file.size > 5 * 1024 * 1024) { toast('Arquivo "' + file.name + '" excede 5 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      if (isImage) {
        // Redimensiona imagens grandes
        const img = new Image();
        img.onload = () => {
          const max = 1200;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const data = canvas.toDataURL('image/jpeg', 0.85);
          pendingAttachments.push({ name: file.name, type: file.type, data });
          renderPendingFiles();
        };
        img.src = e.target.result;
      } else {
        pendingAttachments.push({ name: file.name, type: file.type, data: e.target.result });
        renderPendingFiles();
      }
    };
    reader.readAsDataURL(file);
  });
}
function handleCommentFiles(ev) { readFilesAsBase64(ev.target.files, false); ev.target.value = ''; }
function handleCommentImages(ev) { readFilesAsBase64(ev.target.files, true); ev.target.value = ''; }

/* Paste (Ctrl+V) e drag-and-drop direto no compositor de comentário.
   Reaproveita readFilesAsBase64 → pendingAttachments → renderPendingFiles.
   stopPropagation evita conflito com o setupDragDrop do modal de demanda. */
function setupCommentComposer() {
  const ta = $('comment-input');
  const compose = ta?.closest('.comment-compose');
  if (!ta || !compose) return;

  ta.addEventListener('paste', e => {
    const items = e.clipboardData?.items || [];
    const imageFiles = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (!imageFiles.length) return; // sem imagem: deixa o paste de texto normal
    e.preventDefault();
    readFilesAsBase64(imageFiles, true);
    toast(imageFiles.length === 1 ? 'Imagem colada!' : `${imageFiles.length} imagens coladas!`);
  });

  let dragDepth = 0;
  compose.addEventListener('dragenter', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth++;
    compose.classList.add('drag-over');
  });
  compose.addEventListener('dragover', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  });
  compose.addEventListener('dragleave', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) compose.classList.remove('drag-over');
  });
  compose.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    compose.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const imgs = files.filter(f => f.type.startsWith('image/'));
    const others = files.filter(f => !f.type.startsWith('image/'));
    if (imgs.length) readFilesAsBase64(imgs, true);
    if (others.length) readFilesAsBase64(others, false);
    const total = files.length;
    toast(`${total} arquivo${total === 1 ? '' : 's'} adicionado${total === 1 ? '' : 's'} ao comentário`);
  });
}

/* Edição de comentário */
function startEditComment(cid) {
  const d = demandById(detailId); if (!d) return;
  const c = d.comments.find(x => x.id === cid); if (!c) return;
  const el = document.getElementById('comment-' + cid);
  if (!el) return;
  const atts = (c.attachments || []).map((a, i) => {
    const preview = a.type && a.type.startsWith('image/') ? `<img src="${a.data}" class="pending-thumb">` : '<i data-lucide="file" class="ic-sm"></i>';
    return `<span class="pending-file">${preview} ${esc(a.name)} <button class="icon-btn danger" onclick="removeEditAtt('${cid}', ${i})" title="Remover"><i data-lucide="x" class="ic-sm"></i></button></span>`;
  }).join('');
  el.innerHTML = `
    <textarea class="form-control" id="edit-comment-text" rows="3">${esc(c.text)}</textarea>
    <div class="comment-pending-files" id="edit-comment-files">${atts}</div>
    <div class="comment-compose-bar" style="margin-top:8px">
      <div class="comment-attach-btns">
        <input type="file" id="edit-file-input" multiple style="display:none" onchange="handleEditFiles(event,'${cid}')">
        <button class="btn btn-ghost btn-sm" onclick="$('edit-file-input').click()"><i data-lucide="paperclip" class="ic-sm"></i></button>
        <input type="file" id="edit-img-input" accept="image/*" multiple style="display:none" onchange="handleEditImages(event,'${cid}')">
        <button class="btn btn-ghost btn-sm" onclick="$('edit-img-input').click()"><i data-lucide="image" class="ic-sm"></i></button>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="renderDetail()">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="saveEditComment('${cid}')">Salvar</button>
      </div>
    </div>`;
  el.dataset.editAtts = JSON.stringify(c.attachments || []);
  $('edit-comment-text').focus();
}
function removeEditAtt(cid, idx) {
  const el = document.getElementById('comment-' + cid);
  const atts = JSON.parse(el.dataset.editAtts || '[]');
  atts.splice(idx, 1);
  el.dataset.editAtts = JSON.stringify(atts);
  const container = $('edit-comment-files');
  container.innerHTML = atts.map((a, i) => {
    const preview = a.type && a.type.startsWith('image/') ? `<img src="${a.data}" class="pending-thumb">` : '<i data-lucide="file" class="ic-sm"></i>';
    return `<span class="pending-file">${preview} ${esc(a.name)} <button class="icon-btn danger" onclick="removeEditAtt('${cid}', ${i})"><i data-lucide="x" class="ic-sm"></i></button></span>`;
  }).join('');
}
function handleEditFiles(ev, cid) {
  const el = document.getElementById('comment-' + cid);
  [...ev.target.files].forEach(file => {
    if (file.size > 5 * 1024 * 1024) { toast('"' + file.name + '" excede 5 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const atts = JSON.parse(el.dataset.editAtts || '[]');
      atts.push({ name: file.name, type: file.type, data: e.target.result });
      el.dataset.editAtts = JSON.stringify(atts);
      removeEditAtt(cid, -1); // re-render (splice -1 doesn't remove)
      // Actually re-render properly
      const container = $('edit-comment-files');
      container.innerHTML = atts.map((a, i) => {
        const preview = a.type && a.type.startsWith('image/') ? `<img src="${a.data}" class="pending-thumb">` : '<i data-lucide="file" class="ic-sm"></i>';
        return `<span class="pending-file">${preview} ${esc(a.name)} <button class="icon-btn danger" onclick="removeEditAtt('${cid}', ${i})"><i data-lucide="x" class="ic-sm"></i></button></span>`;
      }).join('');
    };
    reader.readAsDataURL(file);
  });
  ev.target.value = '';
}
function handleEditImages(ev, cid) {
  const el = document.getElementById('comment-' + cid);
  [...ev.target.files].forEach(file => {
    if (file.size > 5 * 1024 * 1024) { toast('"' + file.name + '" excede 5 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        let w = img.width, h = img.height;
        if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL('image/jpeg', 0.85);
        const atts = JSON.parse(el.dataset.editAtts || '[]');
        atts.push({ name: file.name, type: file.type, data });
        el.dataset.editAtts = JSON.stringify(atts);
        const container = $('edit-comment-files');
        container.innerHTML = atts.map((a, i) => {
          const preview = a.type && a.type.startsWith('image/') ? `<img src="${a.data}" class="pending-thumb">` : '<i data-lucide="file" class="ic-sm"></i>';
          return `<span class="pending-file">${preview} ${esc(a.name)} <button class="icon-btn danger" onclick="removeEditAtt('${cid}', ${i})"><i data-lucide="x" class="ic-sm"></i></button></span>`;
        }).join('');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  ev.target.value = '';
}
async function saveEditComment(cid) {
  const el = document.getElementById('comment-' + cid);
  const text = $('edit-comment-text').value.trim();
  const attachments = JSON.parse(el.dataset.editAtts || '[]');
  if (!text && !attachments.length) { toast('O comentário não pode ficar vazio.', 'error'); return; }
  try {
    const upd = await api('/demands/' + detailId + '/comment/' + cid, 'PUT', { text, attachments });
    patchDemand(upd);
    renderDetail();
    toast('Comentário atualizado!');
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── PROJETOS ─── */
function renderProjects() {
  // Populate filters
  const allP = wsProjects();
  const clients = [...new Set(allP.map(p => p.client).filter(Boolean))].sort();
  const cSel = $('proj-f-client');
  const cPrev = cSel.value;
  cSel.innerHTML = '<option value="">Todos os clientes</option>' + clients.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if ([...cSel.options].some(o => o.value === cPrev)) cSel.value = cPrev;

  applyFilterDropdown('proj-f-client');
  applyFilterDropdown('proj-f-status');

  // Apply filters
  const q = norm($('proj-search').value);
  const fc = $('proj-f-client').value;
  const fs = $('proj-f-status').value;
  let list = allP.filter(p => {
    if (q && !norm(p.name).includes(q) && !norm(p.client).includes(q)) return false;
    if (fc && p.client !== fc) return false;
    if (fs === 'active' && p.active === false) return false;
    if (fs === 'archived' && p.active !== false) return false;
    if (!fs && !showArchivedProjects && p.active === false) return false;
    return true;
  });

  // Sort
  list.sort((a, b) => {
    let va, vb;
    if (projSortKey === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
    else if (projSortKey === 'client') { va = (a.client || '').toLowerCase(); vb = (b.client || '').toLowerCase(); }
    else if (projSortKey === 'demands') { va = wsDemands().filter(d => d.projectId === a.id).length; vb = wsDemands().filter(d => d.projectId === b.id).length; }
    else if (projSortKey === 'flow') {
      const fa = wsFlows().find(f => f.projectId === a.id);
      const fb = wsFlows().find(f => f.projectId === b.id);
      va = norm(fa?.name || ''); vb = norm(fb?.name || '');
    }
    else if (projSortKey === 'status') { va = a.active !== false ? 0 : 1; vb = b.active !== false ? 0 : 1; }
    else { va = a.name; vb = b.name; }
    return va < vb ? -projSortDir : va > vb ? projSortDir : 0;
  });

  const archivedCount = allP.filter(p => p.active === false).length;
  $('proj-archive-toggle').textContent = showArchivedProjects ? 'Ocultar arquivados' : `Ver arquivados (${archivedCount})`;
  $('proj-archive-toggle').style.display = archivedCount || showArchivedProjects ? '' : 'none';

  $('projects-table-body').innerHTML = list.length ? list.map(p => {
    const count = wsDemands().filter(d => d.projectId === p.id).length;
    const exclusive = wsFlows().filter(f => f.projectId === p.id);
    const pAvatar = p.avatar
      ? `<img src="${p.avatar}" class="avatar" style="width:28px;height:28px;border-radius:6px">`
      : `<span class="avatar" style="width:28px;height:28px;font-size:11px;border-radius:6px;background:${hexDim(p.color)};color:${p.color}">${esc(p.name.charAt(0))}</span>`;
    const actions = me.isAdmin ? `
      <div class="row-actions">
        <button class="detail-icon-btn" title="Editar" onclick="openProjectModal('${p.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
        <button class="detail-icon-btn" title="Duplicar" onclick="duplicateProject('${p.id}')"><i data-lucide="copy" class="ic-sm"></i></button>
        ${p.active !== false ? `<button class="detail-icon-btn" title="Arquivar" onclick="archiveProject('${p.id}')"><i data-lucide="archive" class="ic-sm"></i></button>` : `<button class="detail-icon-btn" title="Restaurar" onclick="archiveProject('${p.id}')"><i data-lucide="archive-restore" class="ic-sm"></i></button>`}
        <button class="detail-icon-btn danger" title="Excluir" onclick="confirmDeleteProject('${p.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
      </div>
    ` : '';
    return `<tr class="row-hover-actions" style="${p.active === false ? 'opacity:.55' : ''}">
      <td><div style="display:flex;align-items:center;gap:8px">${pAvatar}<span style="font-weight:600">${esc(p.name)}</span></div></td>
      <td>${esc(p.client || '—')}</td>
      <td>${exclusive.length ? exclusive.map(f => `<span class="pill pill-muted" style="font-size:10px">${esc(f.name)}</span>`).join(' ') : '<span style="color:var(--text-muted);font-size:12px">Fluxos gerais</span>'}</td>
      <td>${count}</td>
      <td>${p.active !== false ? '<span class="pill pill-success">Ativo</span>' : '<span class="pill pill-muted">Arquivado</span>'}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6">${emptyState('Nenhum projeto encontrado', 'Ajuste os filtros ou crie um novo projeto.', 'inbox')}</td></tr>`;
}
function sortProjects(key) {
  if (projSortKey === key) projSortDir *= -1;
  else { projSortKey = key; projSortDir = 1; }
  renderProjects();
}
function toggleArchivedProjects() {
  showArchivedProjects = !showArchivedProjects;
  $('proj-f-status').value = '';
  renderProjects();
}
async function archiveProject(id) {
  const p = projectById(id); if (!p) return;
  const action = p.active !== false ? 'Arquivar' : 'Restaurar';
  try {
    await api('/projects/' + id, 'PUT', { active: p.active === false });
    toast(p.active === false ? 'Projeto restaurado.' : 'Projeto arquivado.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function confirmDeleteProject(id) {
  const p = projectById(id); if (!p) return;
  const linkedDemands = wsDemands().filter(d => d.projectId === id).length;
  const linkedFlows = wsFlows().filter(f => f.projectId === id).length;
  const ok = await showConfirm({
    title: 'Excluir projeto definitivamente',
    message: `Excluir <strong>${esc(p.name)}</strong> permanentemente?<br><br>${linkedDemands ? `Esta ação removerá também <strong>${linkedDemands}</strong> demanda(s) vinculada(s).<br>` : ''}${linkedFlows ? `${linkedFlows} fluxo(s) exclusivo(s) também serão removidos.<br>` : ''}<br><strong>Esta ação não pode ser desfeita.</strong>`,
    okLabel: 'Excluir definitivamente',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/projects/' + id + '?force=1', 'DELETE');
    toast('Projeto excluído definitivamente.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
function removeProjectAvatar() {
  projAvatarData = null;
  refreshProjectAvatarPreview();
}
function handleProjectAvatar(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const img = new Image();
  img.onload = () => {
    const s = 256;
    const canvas = document.createElement('canvas');
    canvas.width = s; canvas.height = s;
    const min = Math.min(img.width, img.height);
    const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
    canvas.getContext('2d').drawImage(img, sx, sy, min, min, 0, 0, s, s);
    projAvatarData = canvas.toDataURL('image/jpeg', 0.85);
    refreshProjectAvatarPreview();
  };
  img.src = URL.createObjectURL(file);
  ev.target.value = '';
}
let projectModalClientId = null; // cliente associado nesta abertura do modal
async function openProjectModal(id, presetClientId) {
  editingProjectId = id || null;
  $('project-modal-title').textContent = id ? 'Editar Projeto' : 'Novo Projeto';
  const p = id ? projectById(id) : null;

  // Cliente obrigatório: vem do projeto em edição ou do preset (tela do cliente).
  // Sem qualquer contexto, redireciona pra Clientes em vez de abrir sem destino.
  projectModalClientId = p?.clientId || presetClientId || null;
  if (!projectModalClientId) {
    toast('Selecione um cliente pra adicionar um projeto.', 'warn');
    goPage('clients');
    return;
  }
  // Cliente do preset/projeto pode estar stale (frontend não sincronizado com backend).
  // Faz um refresh on-demand antes de abrir pra evitar erro "Cliente inválido" no save.
  if (!clientById(projectModalClientId)) {
    try { clients = await api('/clients'); } catch {}
    if (!clientById(projectModalClientId)) {
      toast('Cliente não encontrado. Selecione um cliente da lista.', 'error');
      projectModalClientId = null;
      goPage('clients');
      return;
    }
  }

  $('p-name').value = p?.name || '';
  setColorValue('p-color', p?.color || '#7A00FF');
  $('p-drive-files').value = p?.driveFiles || '';
  $('p-brand-assets').value = p?.brandAssets || '';
  $('p-guidelines').value = p?.guidelines || '';

  // Footer: edit mostra Excluir + toggle Estado; new esconde os dois
  $('p-delete-btn').style.display = p ? '' : 'none';
  $('p-status-group').style.display = p ? '' : 'none';
  projectModalStatusActive = p ? (p.active !== false) : true;
  refreshProjectStatusUI();

  projAvatarData = p?.avatar || null;
  refreshProjectAvatarPreview();

  openModal('project-modal');
  navPush(id ? '/projects/' + id : '/projects/new');
}

function refreshProjectAvatarPreview() {
  const el = $('p-avatar-preview');
  if (!el) return;
  if (projAvatarData) {
    el.style.backgroundImage = `url('${projAvatarData}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.innerHTML = '';
    el.style.background = `url('${projAvatarData}') center/cover no-repeat`;
    $('p-avatar-remove').style.display = '';
  } else {
    el.style.backgroundImage = '';
    el.style.background = '';
    el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Sem foto</span>';
    $('p-avatar-remove').style.display = 'none';
  }
}

let projectModalStatusActive = true;
function setProjectModalStatus(active) {
  projectModalStatusActive = active;
  refreshProjectStatusUI();
}
function refreshProjectStatusUI() {
  document.querySelectorAll('.client-status-pick[data-pval]').forEach(b => {
    b.classList.toggle('active', (b.dataset.pval === 'active') === projectModalStatusActive);
  });
}

function openProjectDeleteConfirm() {
  if (!editingProjectId) return;
  const p = projectById(editingProjectId);
  if (!p) return;
  const linkedDemands = wsDemands().filter(d => d.projectId === p.id).length;
  const linkedFlows = wsFlows().filter(f => f.projectId === p.id).length;
  $('project-delete-title').textContent = `Excluir "${p.name}"?`;
  $('project-delete-confirm-text').innerHTML = `Para confirmar, digite <strong>${esc(p.name)}</strong> abaixo:`;
  const w = $('project-delete-warning');
  const warns = [];
  if (linkedDemands) warns.push(`<strong>${linkedDemands}</strong> demanda(s) vinculada(s) também serão removidas.`);
  if (linkedFlows) warns.push(`<strong>${linkedFlows}</strong> fluxo(s) exclusivo(s) também serão removidos.`);
  w.innerHTML = warns.join('<br>');
  $('project-delete-input').value = '';
  updateProjectDeleteBtnState();
  openModal('project-delete-modal');
}
function updateProjectDeleteBtnState() {
  const p = editingProjectId ? projectById(editingProjectId) : null;
  const ok = !!(p && $('project-delete-input').value.trim() === p.name);
  $('project-delete-confirm-btn').disabled = !ok;
}
async function confirmDeleteProjectTyped() {
  if (!editingProjectId) return;
  const id = editingProjectId;
  try {
    await api('/projects/' + id + '?force=1', 'DELETE');
    closeModal('project-delete-modal');
    closeModal('project-modal');
    toast('Projeto excluído.', 'warn');
    const ctxClientId = currentClientId;
    await refreshData();
    if (ctxClientId) renderClientDetail(ctxClientId);
  } catch (e) { toast(e.message, 'error'); }
}

async function saveProject() {
  const clientId = projectModalClientId;
  if (!clientId) { toast('Cliente não definido.', 'error'); return; }
  const payload = {
    name: $('p-name').value,
    clientId,
    color: $('p-color').value,
    active: editingProjectId ? projectModalStatusActive : true,
    avatar: projAvatarData,
    driveFiles: $('p-drive-files').value,
    brandAssets: $('p-brand-assets').value,
    guidelines: $('p-guidelines').value
  };
  try {
    if (editingProjectId) await api('/projects/' + editingProjectId, 'PUT', payload);
    else await api('/projects', 'POST', payload);
    closeModal('project-modal');
    toast(editingProjectId ? 'Projeto atualizado!' : 'Projeto criado!');
    const ctxClientId = currentClientId;
    // Restaura URL antes do refresh (o modal trocou pra /projects/...)
    if (ctxClientId) navPush('/clients/' + ctxClientId);
    await refreshData();
  } catch (e) {
    // Cliente inválido: cache local pode estar desatualizado. Sincroniza e instrui.
    if (e.message && e.message.toLowerCase().includes('cliente inválido')) {
      console.warn('[saveProject] clientId rejeitado pelo backend:', clientId, 'payload:', payload);
      try { clients = await api('/clients'); } catch {}
      toast('Cliente foi alterado em outro lugar. Recarregue a página (Ctrl+F5) e tente de novo.', 'error');
    } else {
      toast(e.message, 'error');
    }
  }
}
async function duplicateProject(id) {
  try {
    await api('/projects/' + id + '/duplicate', 'POST', {});
    toast('Projeto duplicado! Os fluxos exclusivos foram copiados junto.');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── FLUXOS (admin) ─── */
/* ─── FLUXOS — Nova arquitetura: clientes → fluxos por cliente ─── */
let currentClientView = null;       // cliente sendo visualizado em fluxos-view-detail (string ou '__general__')
let clientFlowSortKey = 'name';
let clientFlowSortDir = 1;

/* Helper: agrupa fluxos por cliente usando a entidade Client (clientId).
   Fluxos sem clientId ficam no grupo '__general__'. O `client` (string)
   é usado como fallback durante a migração. */
function flowGroupsByClient() {
  const allF = wsFlows();
  const groups = new Map();
  for (const f of allF) {
    let key, label;
    if (f.clientId) {
      const c = clientById(f.clientId);
      key = c ? c.id : '__general__';
      label = c ? c.name : 'Geral';
    } else if (f.client && f.client.trim()) {
      // Fallback: tenta achar a entidade pelo nome (string legado)
      const c = wsClients().find(x => (x.name || '').toLowerCase() === f.client.trim().toLowerCase());
      key = c ? c.id : '__general__';
      label = c ? c.name : f.client.trim();
    } else {
      key = '__general__';
      label = 'Geral';
    }
    if (!groups.has(key)) groups.set(key, { client: key, label, flows: [] });
    groups.get(key).flows.push(f);
  }
  return [...groups.values()];
}

function renderFlows() {
  // Reseta pra view de clientes ao entrar na página
  $('flows-view-clients').style.display = '';
  $('flows-view-detail').style.display = 'none';
  currentClientView = null;

  // Constrói cards a partir de TODOS os clientes ativos do workspace,
  // não só dos que já têm fluxos. Quem ainda não tem fluxo aparece com
  // contagem 0, pronto pra criar o primeiro. Mais 1 card "Geral" pra
  // fluxos workspace-wide (sem clientId).
  const allF = wsFlows();
  const allC = wsClients().filter(c => c.active !== false);
  const groups = [];
  // Card "Geral" — fluxos sem clientId
  const generalFlows = allF.filter(f => !f.clientId);
  groups.push({ key: '__general__', label: 'Geral', color: null, avatar: null, flows: generalFlows });
  // Um card por cliente cadastrado
  for (const c of allC) {
    const cFlows = allF.filter(f => f.clientId === c.id);
    groups.push({ key: c.id, label: c.name, color: c.color, avatar: c.avatar, flows: cFlows });
  }

  // Popula select de filtro com clientes cadastrados (não os derivados de fluxos)
  const fcSel = $('flow-f-client');
  if (fcSel) {
    const prev = fcSel.value;
    const opts = allC.slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)))
      .map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    fcSel.innerHTML = '<option value="">Todos os clientes</option>' + opts;
    if ([...fcSel.options].some(o => o.value === prev)) fcSel.value = prev;
    applyFilterDropdown('flow-f-client');
  }

  // Filtra busca + cliente
  const q = norm(($('flow-search').value || '').trim());
  const fc = fcSel ? fcSel.value : '';
  let list = groups.filter(g => {
    if (q && !norm(g.label).includes(q)) return false;
    if (fc && g.key !== fc) return false;
    return true;
  });

  // Sort: "Geral" sempre primeiro, depois alfabético
  list.sort((a, b) => {
    if (a.key === '__general__') return -1;
    if (b.key === '__general__') return 1;
    return norm(a.label).localeCompare(norm(b.label));
  });

  const grid = $('flow-clients-grid');
  if (!list.length) {
    grid.innerHTML = emptyState('Nenhum cliente encontrado',
      'Cadastre um cliente na aba "Clientes" pra começar.', 'flow');
    paintIcons();
    return;
  }

  grid.innerHTML = list.map(g => {
    let avatarHtml;
    if (g.key === '__general__') {
      avatarHtml = `<div class="flow-card-avatar" style="background:var(--surface-3);color:var(--text-dim)"><i data-lucide="layers" class="ic-sm"></i></div>`;
    } else if (g.avatar) {
      avatarHtml = `<div class="flow-card-avatar" style="background-image:url('${g.avatar}');background-size:cover;background-position:center"></div>`;
    } else {
      const color = g.color || '#7A00FF';
      const letter = g.label.charAt(0).toUpperCase();
      avatarHtml = `<div class="flow-card-avatar" style="background:${hexDim(color)};color:${color}">${esc(letter)}</div>`;
    }
    const subLabel = g.flows.length === 0 ? 'Sem fluxos · clique pra criar' : `${g.flows.length} fluxo${g.flows.length === 1 ? '' : 's'}`;
    return `<div class="flow-card" onclick="openClientFlows('${esc(g.key).replace(/'/g, "\\'")}')">
      ${avatarHtml}
      <div class="flow-card-name">${esc(g.label)}</div>
      <div class="flow-card-sub">${esc(subLabel)}</div>
    </div>`;
  }).join('');
  paintIcons();
}

/* Abre a view de fluxos de um cliente específico */
function openClientFlows(client) {
  currentClientView = client;
  $('flows-view-clients').style.display = 'none';
  $('flows-view-detail').style.display = '';
  // Reset filtros da subview
  const ds = $('flow-detail-search'); if (ds) ds.value = '';
  const dt = $('flow-detail-type'); if (dt) dt.value = '';
  renderClientFlows(client);
}
function closeClientFlows() {
  currentClientView = null;
  $('flows-view-clients').style.display = '';
  $('flows-view-detail').style.display = 'none';
  renderFlows();
}
function setClientFlowSort(key) {
  if (clientFlowSortKey === key) clientFlowSortDir *= -1;
  else { clientFlowSortKey = key; clientFlowSortDir = 1; }
  document.querySelectorAll('.flow-sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === key));
  renderClientFlows(currentClientView);
}

function renderClientFlows(client) {
  if (!client) return;
  // `client` aqui é o id do Client entity (ou '__general__'). Pega fluxos por clientId.
  const allF = wsFlows();
  let flows, label;
  if (client === '__general__') {
    flows = allF.filter(f => !f.clientId);
    label = 'Geral';
  } else {
    const c = clientById(client);
    if (!c) { closeClientFlows(); return; }
    flows = allF.filter(f => f.clientId === client);
    label = c.name;
  }

  // Breadcrumb
  const bc = $('flow-detail-breadcrumb');
  if (bc) {
    bc.innerHTML = `<span style="color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;font-size:11px">Fluxos de demanda · </span><span>${esc(label)}</span>`;
  }

  // Popula select de tipo
  const types = [...new Set(flows.map(f => f.demandType).filter(Boolean))].sort();
  const dt = $('flow-detail-type');
  if (dt) {
    const prev = dt.value;
    dt.innerHTML = '<option value="">Todos os tipos</option>' + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    if ([...dt.options].some(o => o.value === prev)) dt.value = prev;
    applyFilterDropdown('flow-detail-type');
  }

  // Filtra
  const q = norm(($('flow-detail-search').value || '').trim());
  const ft = dt ? dt.value : '';
  let list = flows.filter(f => {
    if (q && !norm(f.name).includes(q)) return false;
    if (ft && f.demandType !== ft) return false;
    return true;
  });

  // Sort
  list.sort((a, b) => {
    let va, vb;
    if (clientFlowSortKey === 'type') { va = norm(a.demandType || ''); vb = norm(b.demandType || ''); }
    else if (clientFlowSortKey === 'modified') {
      // Sem campo updatedAt explícito — usa createdAt como proxy (mais recente primeiro)
      va = a.createdAt || ''; vb = b.createdAt || '';
      return (vb < va ? -1 : vb > va ? 1 : 0) * clientFlowSortDir;
    }
    else { va = norm(a.name); vb = norm(b.name); }
    return (va < vb ? -1 : va > vb ? 1 : 0) * clientFlowSortDir;
  });

  const grid = $('flow-detail-grid');
  if (!list.length) {
    grid.innerHTML = emptyState('Nenhum fluxo neste cliente',
      'Clique em "Novo Fluxo" pra criar o primeiro.', 'flow');
    paintIcons();
    return;
  }

  grid.innerHTML = list.map(f => {
    const count = demands.filter(d => d.flowId === f.id).length;
    const iconHtml = f.icon
      ? `<div class="flow-card-icon" style="background-image:url('${f.icon}');background-size:cover;background-position:center"></div>`
      : `<div class="flow-card-icon flow-card-icon--placeholder"><i data-lucide="workflow" class="ic-sm"></i></div>`;
    const adminActions = me.isAdmin ? `<div class="flow-card-actions" onclick="event.stopPropagation()">
        <button class="detail-icon-btn" title="Duplicar" onclick="openDuplicateFlow('${f.id}')"><i data-lucide="copy" class="ic-xs"></i></button>
        <button class="detail-icon-btn danger" title="Excluir" onclick="deleteFlow('${f.id}')"><i data-lucide="trash-2" class="ic-xs"></i></button>
      </div>` : '';
    const clickAttr = me.isAdmin ? `onclick="openFlowModal('${f.id}')"` : 'style="cursor:default"';
    return `<div class="flow-card flow-card-flow" ${clickAttr}>
      ${iconHtml}
      ${adminActions}
      <div class="flow-card-name">${esc(f.name)}</div>
      <div class="flow-card-sub">${esc(f.demandType || 'Sem tipo')} · ${count} demanda${count === 1 ? '' : 's'}</div>
    </div>`;
  }).join('');
  paintIcons();
}

/* Versão do openFlowModal que pré-preenche o cliente — usada do botão da subview.
   `clientKey` agora é o ID do Client (ou '__general__' pra fluxo workspace-wide). */
function openFlowModalForClient(clientKey) {
  openFlowModal(null, clientKey === '__general__' ? null : clientKey);
}

/* Compat — sortFlowsBy não é mais usado mas mantido pra evitar quebra */
function sortFlowsBy() { /* legacy — substituído por setClientFlowSort */ }

/* Editor de fluxo com etapas arrastáveis */
let stageRows = [];
let dragIdx = null;

let flowModalDirty = false;
let flowIconData = null;  // data URI/URL do ícone selecionado pra esse modal
let flowModalClientId = null; // ID do Client em contexto (null = Geral / workspace-wide)
function openFlowModal(id, presetClientId) {
  editingFlowId = id || null;
  flowModalDirty = false;
  const isNew = !id;
  const f = id ? flowById(id) : null;
  // Contexto: edição usa o clientId do fluxo (fallback no nome legado);
  // nova usa o preset (subview do cliente). Sempre id de Client entity.
  if (f) {
    if (f.clientId) flowModalClientId = f.clientId;
    else if (f.client) {
      const c = wsClients().find(x => (x.name || '').toLowerCase() === (f.client || '').toLowerCase());
      flowModalClientId = c ? c.id : null;
    } else flowModalClientId = null;
  } else {
    flowModalClientId = presetClientId || null;
  }
  $('flow-modal-title').textContent = isNew ? 'Novo fluxo' : 'Editar fluxo';
  const clientEntity = flowModalClientId ? clientById(flowModalClientId) : null;
  $('flow-modal-subtitle').textContent = clientEntity ? clientEntity.name : 'Geral · disponível pra todos os clientes';

  $('fl-name').value = f?.name || '';
  $('fl-type').value = f?.demandType || '';
  $('flowtypes-datalist').innerHTML = [...new Set(flows.map(x => x.demandType).filter(Boolean))]
    .map(t => `<option value="${esc(t)}">`).join('');

  // Project picker fica escondido por padrão. Útil só pra fluxos exclusivos
  // de um projeto específico — caso raro, atalho via console se necessário.
  $('fl-project-group').style.display = 'none';
  $('fl-project').innerHTML = '<option value="">— Todos os projetos do cliente —</option>' +
    wsProjects().slice().sort((a,b) => norm(a.name).localeCompare(norm(b.name))).map(p => `<option value="${p.id}" ${f && f.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  // Ícone customizado: edição carrega o existente; nova fica vazio
  flowIconData = f?.icon || null;
  refreshFlowIconPreview();

  // Toggle "Aplicar a todos os projetos": só faz sentido pra nova criação em
  // contexto de cliente — duplica o fluxo pra cada projeto desse cliente.
  const applyWrap = $('fl-apply-toggle-wrap');
  const applyAvailable = isNew && !!flowModalClientId;
  applyWrap.style.display = applyAvailable ? '' : 'none';
  $('fl-apply-all').checked = false;

  stageRows = f
    ? f.stages.map(s => ({ roleFilter: null, responsibleRole: null, ...s }))
    : [
        { id: null, label: 'Backlog',   color: '#64748B', done: false, roleFilter: null, responsibleId: null, responsibleRole: null, deadlineDays: null },
        { id: null, label: 'Execução',  color: '#7A00FF', done: false, roleFilter: null, responsibleId: null, responsibleRole: null, deadlineDays: 3 },
        { id: null, label: 'Concluída', color: '#22D3A5', done: true,  roleFilter: null, responsibleId: null, responsibleRole: null, deadlineDays: null }
      ];
  renderStageRows();
  // Defaults aplicados a novas demandas deste fluxo
  $('fl-default-desc').value = f?.defaultDescription || '';
  flowDefaultChecklist = Array.isArray(f?.defaultChecklist)
    ? f.defaultChecklist.map(it => ({ text: String(it.text || '') }))
    : [];
  renderFlowChecklist();
  openModal('flow-modal');
  navPush(id ? '/flows/' + id : '/flows/new');
}

/* Checklist padrão do fluxo — array editável de { text } */
let flowDefaultChecklist = [];
function renderFlowChecklist() {
  const wrap = $('fl-default-checklist');
  if (!wrap) return;
  if (!flowDefaultChecklist.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Nenhum item ainda. Clique em "Adicionar item".</div>';
  } else {
    wrap.innerHTML = flowDefaultChecklist.map((it, i) => `
      <div class="flow-checklist-item">
        <input class="form-control" value="${esc(it.text)}" placeholder="Ex.: Revisar gramática" oninput="flowDefaultChecklist[${i}].text=this.value;flowModalDirty=true">
        <button type="button" class="icon-btn danger" title="Remover" onclick="removeFlowChecklistItem(${i})"><i data-lucide="x" class="ic-sm"></i></button>
      </div>`).join('');
  }
  paintIcons();
}
function addFlowChecklistItem() {
  flowDefaultChecklist.push({ text: '' });
  flowModalDirty = true;
  renderFlowChecklist();
  // Foca no input recém-criado
  const inputs = $('fl-default-checklist').querySelectorAll('input.form-control');
  if (inputs.length) inputs[inputs.length - 1].focus();
}
function removeFlowChecklistItem(i) {
  flowDefaultChecklist.splice(i, 1);
  flowModalDirty = true;
  renderFlowChecklist();
}

/* ── Ícone customizado do fluxo ── */
function refreshFlowIconPreview() {
  const el = $('fl-icon-preview');
  if (!el) return;
  if (flowIconData) {
    el.innerHTML = '';
    el.style.backgroundImage = `url('${flowIconData}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.classList.add('has-icon');
  } else {
    el.style.backgroundImage = '';
    el.classList.remove('has-icon');
    el.innerHTML = '<span class="flow-icon-label">ícone</span>';
  }
}
function handleFlowIconUpload(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Imagem excede 2MB.', 'error'); ev.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    flowIconData = e.target.result;
    refreshFlowIconPreview();
    flowModalDirty = true;
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}

function renderStageRows() {
  // Mantém referência aos campos pra construir os dropdowns.
  // Convenção de dados: cada stage guarda `roleFilter` (qual função foi
  // escolhida) e UMA destas duas formas de responsável:
  //   - responsibleId: id de usuário específico
  //   - useClientDefault: true → resolver via client.roleAssignments[roleFilter]
  // Persistimos como responsibleRole = roleFilter quando useClientDefault=true
  // (compatível com o backend resolveStageOwner).
  const allUsers = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const allRoles = (roles || []).slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const hasClient = !!flowModalClientId;

  $('stage-list').innerHTML = stageRows.map((s, i) => {
    // Reconstrói o estado de UI a partir do que veio do backend
    const roleFilter = s.roleFilter || s.responsibleRole || '';
    const useDefault = !!s.responsibleRole && !s.responsibleId;
    const userId = s.responsibleId || '';

    // Função dropdown
    const fnOpts = `<option value="">— Sem função —</option>` +
      allRoles.map(r => `<option value="${esc(r.name)}" ${r.name === roleFilter ? 'selected' : ''}>${esc(r.name)}</option>`).join('');

    // Responsável dropdown — filtrado pela função selecionada
    let respHtml = '<option value="">— Sem responsável —</option>';
    if (roleFilter) {
      const filteredUsers = allUsers.filter(u => (u.role || '') === roleFilter);
      if (hasClient) {
        respHtml += `<option value="__client_default__" ${useDefault ? 'selected' : ''}>Padrão do cliente</option>`;
      }
      respHtml += filteredUsers.map(u =>
        `<option value="${u.id}" ${u.id === userId ? 'selected' : ''}>${esc(u.name)}</option>`
      ).join('');
    } else {
      // Sem função selecionada: mostra todos os usuários (libera assign direto)
      respHtml += allUsers.map(u =>
        `<option value="${u.id}" ${u.id === userId ? 'selected' : ''}>${esc(u.name)}</option>`
      ).join('');
    }

    return `<div class="stage-row" draggable="true" data-idx="${i}"
         ondragstart="stageDragStart(event,${i})" ondragover="stageDragOver(event,${i})"
         ondragleave="stageDragLeave(event)" ondrop="stageDrop(event,${i})" ondragend="stageDragEnd()">
      <div class="stage-grip" title="Arraste para reordenar"><i data-lucide="grip-vertical" class="ic-sm"></i></div>
      <button type="button" class="color-swatch-trigger stage-color" style="background:${s.color}" onclick="openColorPicker(this, (c) => { stageRows[${i}].color = c; this.style.background = c; flowModalDirty = true; }, stageRows[${i}].color)" title="Cor da etapa"></button>
      <input class="form-control" value="${esc(s.label)}" placeholder="Nome da etapa" oninput="stageRows[${i}].label=this.value">
      <select id="stage-role-${i}" class="form-control stage-role" title="Função desta etapa" onchange="setStageRoleFilter(${i}, this.value)">${fnOpts}</select>
      <select id="stage-resp-${i}" class="form-control stage-resp" title="Responsável padrão da etapa" onchange="setStageResponsible(${i}, this.value)">${respHtml}</select>
      <div class="stage-days-wrap"><span class="stage-mini-label">Prazo (dias)</span><input class="form-control" type="number" min="1" placeholder="—" value="${s.deadlineDays || ''}" oninput="stageRows[${i}].deadlineDays=this.value?Number(this.value):null"></div>
      <label class="stage-done-toggle"><input type="checkbox" ${s.done ? 'checked' : ''} onchange="stageRows[${i}].done=this.checked"> Conclui</label>
      <div class="stage-actions">
        <button class="icon-btn" title="Duplicar etapa" onclick="duplicateStageRow(${i})"><i data-lucide="copy" class="ic-sm"></i></button>
        <button class="icon-btn danger" title="Remover etapa" onclick="removeStageRow(${i})"><i data-lucide="x" class="ic-sm"></i></button>
      </div>
    </div>`;
  }).join('');
  // Dropdown customizado com avatar nos usuários (responsável). O de função
  // fica como select nativo — não tem avatar pra exibir.
  stageRows.forEach((_, i) => applyFilterDropdown(`stage-resp-${i}`, { userIcon: true }));
  paintIcons();
}

function setStageRoleFilter(i, value) {
  if (!stageRows[i]) return;
  stageRows[i].roleFilter = value || null;
  // Troca de função invalida o usuário escolhido (a menos que ele tenha essa função).
  if (stageRows[i].responsibleId) {
    const u = userById(stageRows[i].responsibleId);
    if (!u || (u.role || '') !== value) {
      stageRows[i].responsibleId = null;
      stageRows[i].responsibleRole = null;
    }
  }
  // Se "Padrão do cliente" estava marcado, atualiza pra apontar pra nova função
  if (stageRows[i].responsibleRole) {
    stageRows[i].responsibleRole = value || null;
  }
  renderStageRows(); // re-render imediato pra atualizar o dropdown de responsável
}

function setStageResponsible(i, value) {
  if (!stageRows[i]) return;
  if (!value) {
    stageRows[i].responsibleId = null;
    stageRows[i].responsibleRole = null;
  } else if (value === '__client_default__') {
    stageRows[i].responsibleRole = stageRows[i].roleFilter || null;
    stageRows[i].responsibleId = null;
  } else {
    stageRows[i].responsibleId = value;
    stageRows[i].responsibleRole = null;
    // Auto-define a função baseada no usuário escolhido (consistência visual)
    if (!stageRows[i].roleFilter) {
      const u = userById(value);
      if (u && u.role) stageRows[i].roleFilter = u.role;
    }
  }
  // Re-render pra o trigger do .filter-cdrop refletir a escolha imediatamente
  // (sem isso, a label visível só atualiza no próximo render).
  renderStageRows();
}

function duplicateStageRow(i) {
  if (!stageRows[i]) return;
  const copy = { ...stageRows[i], id: null, label: (stageRows[i].label || '') + ' (cópia)' };
  stageRows.splice(i + 1, 0, copy);
  renderStageRows();
}
function addStageRow() {
  stageRows.push({ id: null, label: '', color: '#7A00FF', done: false, roleFilter: null, responsibleId: null, responsibleRole: null, deadlineDays: null });
  renderStageRows();
  const inputs = $('stage-list').querySelectorAll('.stage-row input.form-control');
  if (inputs.length) inputs[inputs.length - 1].focus();
}
function removeStageRow(i) {
  stageRows.splice(i, 1);
  renderStageRows();
}
function stageDragStart(e, i) {
  dragIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}
function stageDragOver(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function stageDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function stageDrop(e, i) {
  e.preventDefault();
  if (dragIdx === null || dragIdx === i) { renderStageRows(); return; }
  const [moved] = stageRows.splice(dragIdx, 1);
  stageRows.splice(i, 0, moved);
  dragIdx = null;
  renderStageRows();
}
function stageDragEnd() {
  dragIdx = null;
  document.querySelectorAll('.stage-row').forEach(r => r.classList.remove('dragging','drag-over'));
}

async function saveFlow() {
  const isNew = !editingFlowId;
  const applyAll = isNew && !!flowModalClientId && $('fl-apply-all') && $('fl-apply-all').checked;
  const clientEntity = flowModalClientId ? clientById(flowModalClientId) : null;
  const payload = {
    name: $('fl-name').value,
    demandType: $('fl-type').value,
    projectId: $('fl-project').value || null,
    workspaceId: activeWs,
    clientId: flowModalClientId || null,
    client: clientEntity ? clientEntity.name : null, // mantém legado em sincronia
    icon: flowIconData || null,
    stages: stageRows,
    applyToAll: applyAll,
    defaultDescription: $('fl-default-desc')?.value || '',
    defaultChecklist: flowDefaultChecklist.filter(it => (it.text || '').trim()).map(it => ({ text: it.text.trim() }))
  };
  try {
    const r = editingFlowId
      ? await api('/flows/' + editingFlowId, 'PUT', payload)
      : await api('/flows', 'POST', payload);
    closeModal('flow-modal');
    flowModalDirty = false;
    if (applyAll && r && r.count) {
      toast(`Fluxo aplicado a ${r.count} projeto${r.count === 1 ? '' : 's'} do cliente "${clientEntity?.name || ''}"!`);
    } else {
      toast(editingFlowId ? 'Fluxo atualizado!' : 'Fluxo criado!');
    }
    await refreshData();
    if (currentClientView) renderClientFlows(currentClientView);
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteFlow(id) {
  const f = flowById(id);
  const ok = await showConfirm({
    title: 'Excluir fluxo',
    message: `Excluir o fluxo <strong>${esc(f?.name || '')}</strong>?<br><br>Essa ação não pode ser desfeita.`,
    okLabel: 'Excluir',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/flows/' + id, 'DELETE');
    toast('Fluxo excluído.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
function openDuplicateFlow(id) {
  duplicatingFlowId = id;
  $('dup-project').innerHTML = '<option value="">— Manter como fluxo geral —</option>' +
    wsProjects().slice().sort((a,b) => norm(a.name).localeCompare(norm(b.name))).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  openModal('dupflow-modal');
}
async function confirmDuplicateFlow() {
  try {
    await api('/flows/' + duplicatingFlowId + '/duplicate', 'POST', { projectId: $('dup-project').value || null });
    closeModal('dupflow-modal');
    toast('Fluxo duplicado!');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── WORKSPACES (admin) ─── */
function renderWorkspaces() {
  const sorted = workspaces.slice().sort((a, b) => {
    let va, vb;
    const nProjA = projects.filter(p => p.workspaceId === a.id).length;
    const nProjB = projects.filter(p => p.workspaceId === b.id).length;
    const nUsersA = users.filter(u => u.active !== false && (u.isAdmin || (u.workspaces || []).includes(a.id))).length;
    const nUsersB = users.filter(u => u.active !== false && (u.isAdmin || (u.workspaces || []).includes(b.id))).length;
    if (wsSortKey === 'projects') { va = nProjA; vb = nProjB; }
    else if (wsSortKey === 'members') { va = nUsersA; vb = nUsersB; }
    else { va = norm(a.name); vb = norm(b.name); }
    return (va < vb ? -1 : va > vb ? 1 : 0) * wsSortDir;
  });
  $('ws-table-body').innerHTML = sorted.map(w => {
    const nProj = projects.filter(p => p.workspaceId === w.id).length;
    const nUsers = users.filter(u => u.active !== false && (u.isAdmin || (u.workspaces || []).includes(w.id))).length;
    const actions = me.isAdmin ? `<div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openWsModal('${w.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="deleteWs('${w.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>` : '';
    return `<tr class="row-hover-actions">
      <td><span class="pill" style="color:${w.color || '#7A00FF'};background:${hexDim(w.color)}"><span class="pill-dot" style="background:${w.color || '#7A00FF'}"></span>${esc(w.name)}</span></td>
      <td>${nProj}</td>
      <td>${nUsers}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}
function sortWsBy(key) {
  if (wsSortKey === key) wsSortDir *= -1;
  else { wsSortKey = key; wsSortDir = 1; }
  renderWorkspaces();
}
function openWsModal(id) {
  editingWsId = id || null;
  $('ws-modal-title').textContent = id ? 'Editar Workspace' : 'Novo Workspace';
  const w = id ? wsById(id) : null;
  $('ws-name').value = w?.name || '';
  setColorValue('ws-color', w?.color || '#7A00FF');
  openModal('ws-modal');
}
async function saveWs() {
  const payload = { name: $('ws-name').value, color: $('ws-color').value };
  try {
    if (editingWsId) await api('/workspaces/' + editingWsId, 'PUT', payload);
    else await api('/workspaces', 'POST', payload);
    closeModal('ws-modal');
    toast(editingWsId ? 'Workspace atualizado!' : 'Workspace criado! Libere o acesso da equipe na aba Usuários.');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteWs(id) {
  const w = wsById(id);
  const ok = await showConfirm({
    title: 'Excluir workspace',
    message: `Excluir o workspace <strong>${esc(w?.name || '')}</strong>?<br><br>Todos os projetos, fluxos e demandas dele serão removidos. <strong>Essa ação não pode ser desfeita.</strong>`,
    okLabel: 'Excluir definitivamente',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/workspaces/' + id, 'DELETE');
    if (activeWs === id) { activeWs = null; }
    toast('Workspace excluído.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── USUÁRIOS (admin) ─── */
function renderUsers() {
  const activeUsers = users.filter(u => u.active !== false);
  const archivedUsers = users.filter(u => u.active === false);
  const displayList = (showArchivedUsers ? users : activeUsers).slice().sort((a, b) => {
    let va, vb;
    if (userSortKey === 'name')     { va = norm(a.name); vb = norm(b.name); }
    else if (userSortKey === 'username') { va = norm(a.username); vb = norm(b.username); }
    else if (userSortKey === 'role')     { va = norm(a.role || ''); vb = norm(b.role || ''); }
    else if (userSortKey === 'ws')       { va = (a.workspaces || []).length; vb = (b.workspaces || []).length; }
    else if (userSortKey === 'admin')    { va = a.isAdmin ? 0 : 1; vb = b.isAdmin ? 0 : 1; }
    else if (userSortKey === 'active')   { va = a.active !== false ? 0 : 1; vb = b.active !== false ? 0 : 1; }
    else { va = norm(a.name); vb = norm(b.name); }
    return (va < vb ? -1 : va > vb ? 1 : 0) * userSortDir;
  });

  $('user-archive-toggle').textContent = showArchivedUsers ? 'Ocultar desativados' : `Ver desativados (${archivedUsers.length})`;
  $('user-archive-toggle').style.display = archivedUsers.length || showArchivedUsers ? '' : 'none';

  $('users-table-body').innerHTML = displayList.map(u => {
    const wsNames = u.isAdmin
      ? '<span style="color:var(--text-muted);font-size:12px">Todos (admin)</span>'
      : (u.workspaces || []).map(id => wsById(id)).filter(Boolean).map(w => `<span class="pill pill-muted" style="font-size:10px">${esc(w.name)}</span>`).join(' ') || '—';
    return `<tr class="row-hover-actions" style="${u.active === false ? 'opacity:.55' : ''}">
      <td>${cellUser(u)}</td>
      <td style="color:var(--text-dim)">${esc(u.username)}</td>
      <td>${esc(u.role || '—')}</td>
      <td>${wsNames}</td>
      <td>${u.isAdmin ? '<span class="pill pill-admin">Admin</span>' : '<span class="pill pill-muted">Equipe</span>'}</td>
      <td>${u.active !== false ? '<span class="pill pill-success">Ativo</span>' : '<span class="pill pill-muted">Desativado</span>'}</td>
      <td>${me.isAdmin ? `<div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openUserModal('${u.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          ${u.id !== me.id ? (u.active !== false
            ? `<button class="detail-icon-btn danger" title="Desativar" onclick="toggleUser('${u.id}')"><i data-lucide="user-x" class="ic-sm"></i></button>`
            : `<button class="detail-icon-btn" title="Reativar" onclick="toggleUser('${u.id}')"><i data-lucide="user-check" class="ic-sm"></i></button>`
          ) : ''}
        </div>` : ''}</td>
    </tr>`;
  }).join('');
  renderRoles();
}
function toggleArchivedUsers() {
  showArchivedUsers = !showArchivedUsers;
  renderUsers();
}
function sortUsersBy(key) {
  if (userSortKey === key) userSortDir *= -1;
  else { userSortKey = key; userSortDir = 1; }
  renderUsers();
}
function renderRoles() {
  const sorted = roles.slice().sort((a, b) => {
    const ca = users.filter(u => u.role === a.name && u.active !== false).length;
    const cb = users.filter(u => u.role === b.name && u.active !== false).length;
    let va, vb;
    if (roleSortKey === 'count') { va = ca; vb = cb; }
    else { va = norm(a.name); vb = norm(b.name); }
    return (va < vb ? -1 : va > vb ? 1 : 0) * roleSortDir;
  });
  $('roles-table-body').innerHTML = sorted.length ? sorted.map(r => {
    const count = users.filter(u => u.role === r.name && u.active !== false).length;
    const actions = me.isAdmin ? `<div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openRoleModal('${r.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="deleteRole('${r.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>` : '';
    return `<tr class="row-hover-actions">
      <td><strong>${esc(r.name)}</strong></td>
      <td>${count} ${count === 1 ? 'usuário' : 'usuários'}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="3">${emptyState('Nenhuma função cadastrada', 'Adicione funções para organizar a equipe.', 'users')}</td></tr>`;
}
function sortRolesBy(key) {
  if (roleSortKey === key) roleSortDir *= -1;
  else { roleSortKey = key; roleSortDir = 1; }
  renderRoles();
}
function openRoleModal(id) {
  editingRoleId = id || null;
  $('role-modal-title').textContent = id ? 'Editar Função' : 'Nova Função';
  const r = id ? roles.find(x => x.id === id) : null;
  $('role-name').value = r?.name || '';
  openModal('role-modal');
  setTimeout(() => $('role-name').focus(), 60);
}

/* ─── TEMPLATES ─── */

/* ─── INTEGRAÇÕES / WEBHOOKS ─── */
const WEBHOOK_EVENT_LABELS = {
  'demand.created': 'Demanda criada',
  'demand.completed': 'Demanda concluída',
  'demand.stage_changed': 'Etapa avançada',
  'demand.assigned': 'Responsável alterado manualmente',
  'demand.stage_assigned': 'Responsável atribuído pela etapa',
  'demand.deadline_changed': 'Prazo alterado',
  'demand.priority_changed': 'Prioridade alterada',
  'comment.added': 'Comentário adicionado',
  'comment.mention': 'Menção em comentário',
  'checklist.completed': 'Item de checklist concluído',
};
let editingWhId = null;
async function renderIntegrations() {
  try {
    webhooks = await api('/webhooks');
  } catch (e) { /* ignore */ }
  const wsHooks = webhooks.filter(h => h.workspaceId === activeWs);
  $('webhooks-table-body').innerHTML = wsHooks.length ? wsHooks.map(h => {
    const eventChips = (h.events || []).slice(0, 3).map(e => `<span class="pill pill-muted" style="font-size:9px">${esc(WEBHOOK_EVENT_LABELS[e] || e)}</span>`).join(' ');
    const moreCount = (h.events || []).length - 3;
    const statusPill = !h.active
      ? '<span class="pill pill-muted">Pausado</span>'
      : (h.lastError ? `<span class="pill" style="color:var(--danger);background:var(--danger-dim)">Erro</span>` : '<span class="pill pill-success">Ativo</span>');
    const target = h.targetUserId ? userById(h.targetUserId) : null;
    const targetChip = target
      ? `<div style="margin-top:4px"><span class="pill" style="font-size:9px;color:var(--accent-text);background:var(--accent-dim)">Alvo: ${esc(target.name)}</span>${target.discordId ? '' : '<span class="pill" style="font-size:9px;color:var(--danger);background:var(--danger-dim);margin-left:4px" title="Esse usuário ainda não vinculou o ID do Discord">sem ID</span>'}</div>`
      : '';
    return `<tr class="row-hover-actions">
      <td><strong>${esc(h.name)}</strong>${targetChip}${h.lastTriggered ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">Último envio: ${esc(fmtDateTime(h.lastTriggered))}</div>` : ''}</td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:11px;color:var(--text-dim)" title="${esc(h.url)}">${esc(h.url)}</td>
      <td>${h.format === 'discord' ? '<span class="pill" style="color:#5865f2;background:rgba(88,101,242,0.15);font-size:10px">Discord</span>' : '<span class="pill pill-muted" style="font-size:10px">Raw JSON</span>'}</td>
      <td>${eventChips}${moreCount > 0 ? `<span class="pill pill-muted" style="font-size:9px">+${moreCount}</span>` : ''}</td>
      <td>${statusPill}${h.lastError ? `<div style="font-size:10px;color:var(--danger);margin-top:2px">${esc(h.lastError.slice(0, 50))}</div>` : ''}</td>
      <td>${me.isAdmin ? `<div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openWebhookModal('${h.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          <button class="detail-icon-btn" title="Enviar teste" onclick="testWebhookById('${h.id}')"><i data-lucide="send" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="confirmDeleteWebhook('${h.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="6">${emptyState('Nenhuma integração cadastrada', 'Adicione um webhook para receber eventos das demandas em ferramentas externas como Discord, Slack, Make ou n8n.', 'webhook')}</td></tr>`;
  paintIcons();
}
function openWebhookModal(id) {
  editingWhId = id || null;
  $('webhook-modal-title').textContent = id ? 'Editar Integração' : 'Nova Integração';
  const h = id ? webhooks.find(x => x.id === id) : null;
  $('wh-name').value = h?.name || '';
  $('wh-url').value = h?.url || '';
  $('wh-format').value = h?.format || 'discord';
  $('wh-active').value = h?.active === false ? 'false' : 'true';
  $('wh-test-btn').style.display = id ? '' : 'none';
  const targetSel = $('wh-target-user');
  const usersForWs = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  targetSel.innerHTML = '<option value="">— Todos os usuários (sem filtro) —</option>' +
    usersForWs.map(u => `<option value="${u.id}">${esc(u.name)}${u.discordId ? '' : ' (sem ID do Discord)'}</option>`).join('');
  targetSel.value = h?.targetUserId || '';
  const events = h?.events || ['demand.created', 'demand.completed', 'demand.stage_changed'];
  $('wh-events').innerHTML = Object.entries(WEBHOOK_EVENT_LABELS).map(([k, label]) => `
    <label class="wh-event-row">
      <input type="checkbox" value="${k}" ${events.includes(k) ? 'checked' : ''}>
      <span>${esc(label)}</span>
    </label>
  `).join('');
  openModal('webhook-modal');
  navPush(id ? '/integrations/webhooks/' + id : '/integrations/webhooks/new');
  setTimeout(() => $('wh-name').focus(), 60);
}
async function saveWebhook() {
  const events = [...document.querySelectorAll('#wh-events input:checked')].map(i => i.value);
  const payload = {
    workspaceId: activeWs,
    name: $('wh-name').value,
    url: $('wh-url').value,
    format: $('wh-format').value,
    active: $('wh-active').value === 'true',
    events,
    targetUserId: $('wh-target-user').value || null
  };
  try {
    if (editingWhId) await api('/webhooks/' + editingWhId, 'PUT', payload);
    else await api('/webhooks', 'POST', payload);
    closeModal('webhook-modal');
    toast(editingWhId ? 'Integração atualizada!' : 'Integração criada!');
    webhooks = await api('/webhooks');
    renderIntegrations();
  } catch (e) { toast(e.message, 'error'); }
}
async function testWebhook() {
  if (!editingWhId) return;
  await testWebhookById(editingWhId);
}
async function testWebhookById(id) {
  try {
    await api('/webhooks/' + id + '/test', 'POST');
    toast('Teste enviado com sucesso!');
    webhooks = await api('/webhooks');
    renderIntegrations();
  } catch (e) { toast(e.message, 'error'); }
}
async function confirmDeleteWebhook(id) {
  const h = webhooks.find(x => x.id === id); if (!h) return;
  const ok = await showConfirm({
    title: 'Excluir integração',
    message: `Excluir o webhook <strong>${esc(h.name)}</strong>?<br><br>Os eventos das demandas deixarão de ser enviados para este endpoint.`,
    okLabel: 'Excluir', danger: true
  });
  if (!ok) return;
  try {
    await api('/webhooks/' + id, 'DELETE');
    toast('Integração excluída.', 'warn');
    webhooks = await api('/webhooks');
    renderIntegrations();
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── CHECKLIST INTERNO NA DEMANDA ─── */
async function addChecklistItem() {
  const input = $('checklist-input');
  const text = (input?.value || '').trim();
  if (!text) { input?.focus(); return; }
  try {
    const upd = await api('/demands/' + detailId + '/checklist', 'POST', { text });
    patchDemand(upd);
    input.value = '';
    renderDetail();
    setTimeout(() => $('checklist-input')?.focus(), 60);
  } catch (e) { toast(e.message, 'error'); }
}
async function toggleChecklistItem(itemId, done) {
  try {
    const upd = await api('/demands/' + detailId + '/checklist/' + itemId, 'PUT', { done });
    patchDemand(upd);
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}
async function removeChecklistItem(itemId) {
  try {
    const upd = await api('/demands/' + detailId + '/checklist/' + itemId, 'DELETE');
    patchDemand(upd);
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
}
function renderChecklist(d) {
  const items = d.checklist || [];
  const done = items.filter(i => i.done).length;
  const pct = items.length ? Math.round(done / items.length * 100) : 0;
  return `
    <div class="detail-section-block">
      <div class="field-head">
        <div class="field-label">
          <i data-lucide="check-square" class="ic-sm" style="vertical-align:middle"></i>
          Checklist
          ${items.length ? `<span style="margin-left:8px;font-size:11px;color:var(--text-muted);font-weight:500">${done}/${items.length}</span>` : ''}
        </div>
      </div>
      ${items.length ? `<div class="checklist-bar"><div class="checklist-bar-fill" style="width:${pct}%"></div></div>` : ''}
      <div class="checklist-list">
        ${items.map(it => {
          const author = userById(it.doneBy);
          return `<div class="checklist-item ${it.done ? 'done' : ''}">
            <button type="button" class="checklist-check" onclick="toggleChecklistItem('${it.id}', ${!it.done})" title="${it.done ? 'Desmarcar' : 'Marcar como concluído'}">
              ${it.done ? '<i data-lucide="check" class="ic-sm"></i>' : ''}
            </button>
            <span class="checklist-text">${esc(it.text)}</span>
            ${it.done && author ? `<span class="checklist-meta">por ${esc(author.name.split(' ')[0])} · ${esc(fmtDate(it.doneAt))}</span>` : ''}
            <button type="button" class="detail-icon-btn checklist-del" onclick="removeChecklistItem('${it.id}')" title="Remover"><i data-lucide="x" class="ic-xs"></i></button>
          </div>`;
        }).join('')}
      </div>
      <div class="checklist-add">
        <input class="form-control" id="checklist-input" placeholder="Adicionar item ao checklist…" onkeydown="if(event.key==='Enter'){event.preventDefault();addChecklistItem()}">
        <button class="btn btn-ghost btn-sm" onclick="addChecklistItem()"><i data-lucide="plus" class="ic-sm"></i> Adicionar</button>
      </div>
    </div>
  `;
}

/* ─── REAÇÕES EM COMENTÁRIOS ─── */
const REACTION_EMOJIS = ['👍', '❤️', '👀', '✅', '🎉'];
async function toggleReaction(commentId, emoji) {
  try {
    const upd = await api('/demands/' + detailId + '/comment/' + commentId + '/react', 'POST', { emoji });
    patchDemand(upd);
    renderDetail();
  } catch (e) { toast(e.message, 'error'); }
  // Fecha qualquer picker aberto
  document.querySelectorAll('.reaction-picker.open').forEach(p => p.classList.remove('open'));
}
function toggleReactionPicker(commentId) {
  const picker = document.getElementById('rxp-' + commentId);
  if (!picker) return;
  const wasOpen = picker.classList.contains('open');
  document.querySelectorAll('.reaction-picker.open').forEach(p => p.classList.remove('open'));
  if (!wasOpen) {
    picker.classList.add('open');
    // Fecha ao clicar fora
    setTimeout(() => {
      const handler = (e) => {
        if (!e.target.closest('.reaction-picker-wrap')) {
          picker.classList.remove('open');
          document.removeEventListener('mousedown', handler);
        }
      };
      document.addEventListener('mousedown', handler);
    }, 50);
  }
}
function renderReactions(c) {
  const reactions = c.reactions || {};
  const keys = Object.keys(reactions).filter(k => (reactions[k] || []).length > 0);
  const myId = me?.id;
  const chips = keys.map(emoji => {
    const userIds = reactions[emoji] || [];
    const mine = userIds.includes(myId);
    const names = userIds.map(id => userById(id)?.name || '?').join(', ');
    return `<button type="button" class="reaction-chip ${mine ? 'mine' : ''}" onclick="toggleReaction('${c.id}', '${emoji}')" title="${esc(names)}">
      <span class="reaction-emoji">${emoji}</span>
      <span class="reaction-count">${userIds.length}</span>
    </button>`;
  }).join('');
  const pickerOpts = REACTION_EMOJIS.map(e => `<button type="button" class="reaction-opt" onclick="toggleReaction('${c.id}', '${e}')">${e}</button>`).join('');
  return `<div class="reactions-row">
    ${chips}
    <div class="reaction-picker-wrap">
      <button type="button" class="reaction-add" onclick="toggleReactionPicker('${c.id}')" title="Adicionar reação"><i data-lucide="smile-plus" class="ic-xs"></i></button>
      <div class="reaction-picker" id="rxp-${c.id}">${pickerOpts}</div>
    </div>
  </div>`;
}

/* ─── DRAG AND DROP DE ANEXOS ─── */
let dragCounter = 0;
function setupDragDrop(containerSelector, targetListId, callback) {
  // callback recebe os arquivos e adiciona aos anexos
  const setup = (el) => {
    if (el.dataset.dndBound) return;
    el.dataset.dndBound = '1';
    el.addEventListener('dragenter', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      dragCounter++;
      el.classList.add('drag-over');
    });
    el.addEventListener('dragover', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('dragleave', e => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        el.classList.remove('drag-over');
      }
    });
    el.addEventListener('drop', async e => {
      e.preventDefault();
      dragCounter = 0;
      el.classList.remove('drag-over');
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      await callback(files, targetListId);
    });
  };
  document.querySelectorAll(containerSelector).forEach(setup);
}

async function processDroppedFiles(files, listElementId) {
  // Converte cada arquivo em base64 e adiciona à lista global
  for (const file of files) {
    const limit = 10 * 1024 * 1024;
    if (file.size > limit) { toast(`${file.name}: arquivo muito grande (máx 10MB)`, 'error'); continue; }
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    demandAttachments.push({
      id: 'a' + Math.random().toString(36).slice(2,10),
      kind: 'file',
      name: file.name,
      type: file.type || 'application/octet-stream',
      data: String(dataUrl)
    });
  }
  if (listElementId === 'detail-attachments-list') {
    // Modal de detalhe: salva direto via PUT
    const d = demandById(detailId); if (!d) return;
    const newAtts = [...(d.attachments || []), ...demandAttachments.filter(a => !(d.attachments || []).find(x => x.id === a.id))];
    try {
      const upd = await api('/demands/' + d.id, 'PUT', { attachments: newAtts });
      patchDemand(upd);
      demandAttachments = [];
      renderDetail();
      toast('Arquivo anexado!');
    } catch (e) { toast(e.message, 'error'); }
  } else {
    refreshFormAttList(listElementId);
    toast(`${files.length} arquivo${files.length === 1 ? '' : 's'} adicionado${files.length === 1 ? '' : 's'}`);
  }
}

/* ─── DEMANDAS RECORRENTES (mensais) ───
   Painel separado pra moldes que viram demandas mensalmente. Não auto-gera —
   o usuário escolhe o mês e clica em "Gerar" por linha ou em bulk.
   Estado de geração vive no próprio recurring (generations[{ym,demandId}]). */
let editingRecurringId = null;
let recurringChecklistDraft = [];

function currentYm() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function ymLabel(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  return MONTHS[m - 1] + '/' + y;
}
function recurringGenerationFor(r, ym) {
  return (r.generations || []).find(g => g.ym === ym) || null;
}

// Persistência: lembra quais grupos o usuário fechou
const _recCollapsed = new Set(JSON.parse(localStorage.getItem('kastor-rec-collapsed') || '[]'));
function _persistRecCollapsed() {
  try { localStorage.setItem('kastor-rec-collapsed', JSON.stringify([..._recCollapsed])); } catch {}
}
function toggleRecGroup(key) {
  if (_recCollapsed.has(key)) _recCollapsed.delete(key);
  else _recCollapsed.add(key);
  _persistRecCollapsed();
  // Toggle visual sem re-render
  const el = document.querySelector(`.rec-group[data-key="${CSS.escape(key)}"]`);
  if (el) el.classList.toggle('is-collapsed');
}

function renderRecurring() {
  // Garante mês default no input
  const ymInput = $('rec-ym');
  if (ymInput && !ymInput.value) ymInput.value = currentYm();
  const ym = ymInput?.value || currentYm();

  // Popula filtros
  const wsClients = clients.filter(c => c.workspaceId === activeWs && c.active !== false);
  const wsProjects = projects.filter(p => p.workspaceId === activeWs && p.active !== false);
  const wsUsersList = wsUsers();
  fillSelect($('rec-f-client'), wsClients.map(c => ({ value: c.id, label: c.name })), undefined, 'Todos os clientes');
  fillSelect($('rec-f-project'), wsProjects.map(p => ({ value: p.id, label: p.name })), undefined, 'Todos os projetos');
  fillSelect($('rec-f-role'), roles.map(r => ({ value: r.id, label: r.name })), undefined, 'Todas as funções');
  fillSelect($('rec-f-user'), wsUsersList.map(u => ({ value: u.id, label: u.name })), undefined, 'Todos os responsáveis');

  const fClient = $('rec-f-client').value;
  const fProject = $('rec-f-project').value;
  const fRole = $('rec-f-role').value;
  const fUser = $('rec-f-user').value;
  const groupBy = $('rec-group-by').value || 'client';

  const list = recurrings
    .filter(r => r.workspaceId === activeWs)
    .filter(r => !fClient || r.clientId === fClient)
    .filter(r => !fProject || r.projectId === fProject)
    .filter(r => !fRole || r.roleId === fRole)
    .filter(r => !fUser || r.ownerId === fUser)
    .slice()
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

  const wrap = $('recurring-todo-wrap');
  wrap.className = 'rec-todo-wrap';
  if (!list.length) {
    wrap.innerHTML = emptyState(
      'Nenhuma recorrente cadastrada',
      'Crie um molde mensal de demanda — depois é só marcar o checkbox no mês desejado.',
      'default'
    );
    paintIcons();
    return;
  }

  // Agrupa
  const groupKeyFor = (r) => {
    if (groupBy === 'client')  return r.clientId  || '__none__';
    if (groupBy === 'project') return r.projectId || '__none__';
    if (groupBy === 'role')    return r.roleId    || '__none__';
    if (groupBy === 'owner')   return r.ownerId   || '__none__';
    return '__none__';
  };
  const groupLabelFor = (key) => {
    if (key === '__none__') {
      if (groupBy === 'role')  return 'Sem função';
      if (groupBy === 'owner') return 'Sem responsável';
      return 'Sem grupo';
    }
    if (groupBy === 'client')  return clientById(key)?.name  || 'Cliente removido';
    if (groupBy === 'project') return projectById(key)?.name || 'Projeto removido';
    if (groupBy === 'role')    return roles.find(x => x.id === key)?.name || 'Função removida';
    if (groupBy === 'owner')   return userById(key)?.name    || 'Usuário removido';
    return '';
  };
  const groups = new Map();
  for (const r of list) {
    const k = groupKeyFor(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => norm(groupLabelFor(a)).localeCompare(norm(groupLabelFor(b))));

  wrap.innerHTML = sortedKeys.map(key => {
    const items = groups.get(key);
    const label = groupLabelFor(key);
    const pending = items.filter(r => r.active !== false && !recurringGenerationFor(r, ym)).length;
    const total = items.filter(r => r.active !== false).length;
    const done = total - pending;
    const groupKey = groupBy + ':' + key;
    const isCollapsed = _recCollapsed.has(groupKey);
    // Quick-add pre-fill: passa o context do grupo (cliente/projeto/etc) pro modal
    const quickAddArgs = JSON.stringify({ [groupBy === 'client' ? 'clientId' : groupBy === 'project' ? 'projectId' : groupBy === 'role' ? 'roleId' : 'ownerId']: key === '__none__' ? null : key });
    let countClass = '';
    if (total > 0 && pending === 0) countClass = 'all-done';
    else if (pending > 0)            countClass = 'has-pending';
    const countLabel = total > 0 ? `${done}/${total}` : `${items.length}`;

    const itemsHtml = items.map(r => {
      const inactive = r.active === false;
      const gen = recurringGenerationFor(r, ym);
      const d = gen ? demandById(gen.demandId) : null;
      const isDone = !!gen && !!d;
      const orphaned = !!gen && !d;

      const p = r.projectId ? projectById(r.projectId) : null;
      const f = r.flowId ? flowById(r.flowId) : null;
      const role = r.roleId ? roles.find(x => x.id === r.roleId) : null;
      const owner = r.ownerId ? userById(r.ownerId) : null;

      // Meta chips — pula o que já é o critério do grupo (evita repetir)
      const metaChips = [];
      if (groupBy !== 'project' && p) metaChips.push(`<span class="rec-meta-chip"><i data-lucide="folder" class="ic-xs"></i> ${esc(p.name)}</span>`);
      if (f)                          metaChips.push(`<span class="rec-meta-chip"><i data-lucide="workflow" class="ic-xs"></i> ${esc(f.name)}</span>`);
      if (groupBy !== 'role' && role) metaChips.push(`<span class="rec-meta-chip"><i data-lucide="user-cog" class="ic-xs"></i> ${esc(role.name)}</span>`);
      if (groupBy !== 'owner' && owner) metaChips.push(`<span class="rec-meta-chip"><i data-lucide="user" class="ic-xs"></i> ${esc(owner.name)}</span>`);
      if (r.dayOfMonth) metaChips.push(`<span class="rec-meta-chip"><i data-lucide="calendar" class="ic-xs"></i> Dia ${r.dayOfMonth}</span>`);
      if (inactive) metaChips.push(`<span class="rec-meta-chip" style="color:var(--text-dim)">Inativo</span>`);
      if (isDone) {
        metaChips.push(`<a href="#" onclick="event.preventDefault();event.stopPropagation();showDetail('${gen.demandId}')">✓ Gerada · abrir demanda</a>`);
      } else if (orphaned) {
        metaChips.push(`<span class="rec-meta-chip" style="color:var(--text-dim)">Demanda anterior excluída — clique pra regerar</span>`);
      }

      const checkTitle = inactive
        ? 'Inativo — edite pra reativar'
        : isDone
          ? 'Já gerada neste mês — abrir demanda'
          : `Marcar como gerada em ${ymLabel(ym)}`;
      const checkOnClick = inactive
        ? ''
        : isDone
          ? `showDetail('${gen.demandId}')`
          : `generateRecurring('${r.id}')`;

      return `<div class="rec-item ${inactive ? 'is-inactive' : ''} ${isDone ? 'is-done' : ''}">
        <button class="rec-check ${isDone ? 'is-done' : ''}" ${inactive ? 'disabled' : ''} title="${esc(checkTitle)}" onclick="${checkOnClick}">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="rec-item-body" onclick="openRecurringModal('${r.id}')" style="cursor:pointer">
          <div class="rec-item-name">${esc(r.name)}</div>
          ${metaChips.length ? `<div class="rec-item-meta">${metaChips.join('<span class="rec-meta-sep">·</span>')}</div>` : ''}
        </div>
        <div class="rec-item-actions">
          <button class="detail-icon-btn" title="Editar" onclick="event.stopPropagation();openRecurringModal('${r.id}')"><i data-lucide="edit-3" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="event.stopPropagation();confirmDeleteRecurring('${r.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>
      </div>`;
    }).join('') || `<div class="rec-empty-group">Nenhuma recorrente neste grupo.</div>`;

    return `<div class="rec-group ${isCollapsed ? 'is-collapsed' : ''}" data-key="${esc(groupKey)}">
      <div class="rec-group-head" onclick="toggleRecGroup('${esc(groupKey)}')">
        <i data-lucide="chevron-down" class="ic-sm rec-group-chevron"></i>
        <div class="rec-group-title">${esc(label)}</div>
        <span class="rec-group-count ${countClass}">${countLabel}</span>
      </div>
      <div class="rec-group-body">
        ${itemsHtml}
        <div class="rec-quick-add" onclick='openRecurringModalPrefilled(${esc(quickAddArgs)})'>
          <i data-lucide="plus" class="ic-sm"></i>
          <span>Adicionar recorrente em ${esc(label)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  paintIcons();
}

// Abre modal já com um campo pré-preenchido (vindo do contexto do grupo)
function openRecurringModalPrefilled(ctx) {
  openRecurringModal(null);
  setTimeout(() => {
    try {
      if (ctx && typeof ctx === 'object') {
        if (ctx.clientId)  { $('rec-client').value = ctx.clientId; onRecurringClientChange(); }
        if (ctx.projectId) {
          // Se vier projeto, descobre o cliente dele e seleciona ambos
          const p = projectById(ctx.projectId);
          if (p && p.clientId) { $('rec-client').value = p.clientId; onRecurringClientChange(); }
          $('rec-project').value = ctx.projectId;
          onRecurringProjectChange();
        }
        if (ctx.roleId)    $('rec-role').value = ctx.roleId;
        if (ctx.ownerId)   $('rec-owner').value = ctx.ownerId;
      }
    } catch {}
  }, 80);
}

function openRecurringModal(id) {
  editingRecurringId = id || null;
  $('recurring-modal-title').textContent = id ? 'Editar Recorrente' : 'Nova Recorrente';
  $('rec-delete-btn').style.display = id ? '' : 'none';

  // Popula selects base (cliente/projeto/fluxo/função/responsável)
  const wsClientList = clients.filter(c => c.workspaceId === activeWs && c.active !== false)
    .slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  $('rec-client').innerHTML = '<option value="">— Selecione —</option>' +
    wsClientList.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  // Function options já vêm fixas no HTML como "Sem função"; preenche roles
  $('rec-role').innerHTML = '<option value="">— Sem função —</option>' +
    roles.slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)))
      .map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  // Responsável: usuários do workspace
  const wsUsersList = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  $('rec-owner').innerHTML = '<option value="">— Sem responsável fixo —</option>' +
    wsUsersList.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  $('rec-deliverable-user').innerHTML = '<option value="">— Responsável atual —</option>' +
    wsUsersList.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');

  if (id) {
    const r = recurrings.find(x => x.id === id);
    if (!r) return toast('Recorrente não encontrado', 'error');
    $('rec-name').value = r.name || '';
    $('rec-client').value = r.clientId || '';
    onRecurringClientChange(); // popula projetos
    $('rec-project').value = r.projectId || '';
    onRecurringProjectChange(); // popula fluxos
    $('rec-flow').value = r.flowId || '';
    $('rec-role').value = r.roleId || '';
    $('rec-owner').value = r.ownerId || '';
    $('rec-dom').value = r.dayOfMonth || '';
    $('rec-desc').value = r.description || '';
    $('rec-briefing').value = r.briefing || '';
    $('rec-qty-pieces').value = r.qtyPieces || '';
    $('rec-qty-arts').value = r.qtyArts || '';
    $('rec-qty-variations').value = r.qtyVariations || '';
    $('rec-deliverable-user').value = r.deliverableUserId || '';
    $('rec-priority').value = r.priority || 3;
    $('rec-active').checked = r.active !== false;
    recurringChecklistDraft = (r.defaultChecklist || []).map(it => ({ text: String(it.text || '') }));
  } else {
    // Reset pra criação
    $('rec-name').value = '';
    $('rec-client').value = '';
    onRecurringClientChange();
    $('rec-flow').innerHTML = '<option value="">— Selecione um projeto primeiro —</option>';
    $('rec-role').value = '';
    $('rec-owner').value = '';
    $('rec-dom').value = '';
    $('rec-desc').value = '';
    $('rec-briefing').value = '';
    $('rec-qty-pieces').value = '';
    $('rec-qty-arts').value = '';
    $('rec-qty-variations').value = '';
    $('rec-deliverable-user').value = '';
    $('rec-priority').value = '3';
    $('rec-active').checked = true;
    recurringChecklistDraft = [];
  }
  renderRecurringChecklist();
  openModal('recurring-modal');
  navPush(id ? '/recurring/' + id : '/recurring/new');
  setTimeout(() => $('rec-name').focus(), 60);
}

function onRecurringClientChange() {
  const cid = $('rec-client').value;
  const wsProjs = projects.filter(p => p.workspaceId === activeWs && p.active !== false)
    .filter(p => !cid || p.clientId === cid)
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  $('rec-project').innerHTML = '<option value="">— Selecione um projeto —</option>' +
    wsProjs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('rec-flow').innerHTML = '<option value="">— Selecione um projeto primeiro —</option>';
}
function onRecurringProjectChange() {
  const pid = $('rec-project').value;
  if (!pid) { $('rec-flow').innerHTML = '<option value="">— Selecione um projeto primeiro —</option>'; return; }
  const fl = flowsForProject(pid).slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  $('rec-flow').innerHTML = fl.length
    ? fl.map(f => `<option value="${f.id}">${esc(f.name)}${f.demandType ? ' · ' + esc(f.demandType) : ''}</option>`).join('')
    : '<option value="">— Nenhum fluxo disponível —</option>';
}

function renderRecurringChecklist() {
  const wrap = $('rec-checklist-list');
  if (!wrap) return;
  wrap.innerHTML = recurringChecklistDraft.map((it, i) => `
    <div class="flow-checklist-item">
      <input class="form-control" value="${esc(it.text)}" placeholder="Item do checklist" oninput="recurringChecklistDraft[${i}].text=this.value">
      <button type="button" class="icon-btn danger" title="Remover" onclick="removeRecurringChecklistItem(${i})"><i data-lucide="x" class="ic-sm"></i></button>
    </div>`).join('');
  paintIcons();
}
function addRecurringChecklistItem() {
  recurringChecklistDraft.push({ text: '' });
  renderRecurringChecklist();
  const inputs = $('rec-checklist-list').querySelectorAll('input.form-control');
  if (inputs.length) inputs[inputs.length - 1].focus();
}
function removeRecurringChecklistItem(i) {
  recurringChecklistDraft.splice(i, 1);
  renderRecurringChecklist();
}

async function saveRecurring() {
  const name = $('rec-name').value.trim();
  if (!name) return toast('Nome é obrigatório', 'error');
  const projectId = $('rec-project').value;
  if (!projectId) return toast('Selecione um projeto', 'error');
  const flowId = $('rec-flow').value;
  if (!flowId) return toast('Selecione um fluxo', 'error');
  const body = {
    name,
    clientId: $('rec-client').value || null,
    projectId,
    flowId,
    roleId: $('rec-role').value || null,
    ownerId: $('rec-owner').value || null,
    deliverableUserId: $('rec-deliverable-user').value || null,
    description: $('rec-desc').value || '',
    briefing: $('rec-briefing').value || '',
    priority: Number($('rec-priority').value) || 3,
    qtyPieces: Number($('rec-qty-pieces').value) || 0,
    qtyArts: Number($('rec-qty-arts').value) || 0,
    qtyVariations: Number($('rec-qty-variations').value) || 0,
    dayOfMonth: $('rec-dom').value ? Number($('rec-dom').value) : null,
    active: $('rec-active').checked,
    defaultChecklist: recurringChecklistDraft.filter(it => (it.text || '').trim()).map(it => ({ text: it.text.trim() }))
  };
  try {
    if (editingRecurringId) await api('/recurrings/' + editingRecurringId, 'PUT', body);
    else await api('/recurrings', 'POST', body);
    closeModal('recurring-modal');
    navPush('/recurring');
    toast(editingRecurringId ? 'Recorrente atualizada!' : 'Recorrente criada!');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteRecurring() {
  if (!editingRecurringId) return;
  const r = recurrings.find(x => x.id === editingRecurringId);
  if (!r) return;
  const ok = await showConfirm({
    title: 'Excluir recorrente',
    message: `Excluir o molde <strong>${esc(r.name)}</strong>?<br><br>As demandas já geradas <strong>não</strong> serão removidas.`,
    okLabel: 'Excluir',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/recurrings/' + editingRecurringId, 'DELETE');
    closeModal('recurring-modal');
    navPush('/recurring');
    toast('Recorrente excluída.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function confirmDeleteRecurring(id) {
  const r = recurrings.find(x => x.id === id); if (!r) return;
  const ok = await showConfirm({
    title: 'Excluir recorrente',
    message: `Excluir o molde <strong>${esc(r.name)}</strong>?<br><br>As demandas já geradas <strong>não</strong> serão removidas.`,
    okLabel: 'Excluir',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/recurrings/' + id, 'DELETE');
    toast('Recorrente excluída.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

async function generateRecurring(id) {
  const r = recurrings.find(x => x.id === id);
  if (!r) return;
  const ym = $('rec-ym').value || currentYm();
  const existing = recurringGenerationFor(r, ym);
  if (existing) {
    const ok = await showConfirm({
      title: 'Regerar demanda do mês',
      message: `Já existe uma demanda gerada em <strong>${ymLabel(ym)}</strong> para "<strong>${esc(r.name)}</strong>".<br><br>A demanda anterior continua existindo. Deseja criar outra?`,
      okLabel: 'Regerar'
    });
    if (!ok) return;
    // Backend só re-gera se a demanda foi excluída — então só prossigo se existing.demandId não existe mais
    if (demandById(existing.demandId)) return toast('Demanda já existe — abra pelo link na tabela.', 'warn');
  }
  try {
    const res = await api('/recurrings/' + id + '/generate', 'POST', { ym });
    toast(res.alreadyGenerated ? 'Demanda já existia.' : 'Demanda gerada!');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

async function generateAllRecurringPending() {
  const ym = $('rec-ym').value || currentYm();
  const fClient = $('rec-f-client').value;
  const fProject = $('rec-f-project').value;
  const fRole = $('rec-f-role').value;
  const fUser = $('rec-f-user').value;
  const pending = recurrings
    .filter(r => r.workspaceId === activeWs && r.active !== false)
    .filter(r => !fClient || r.clientId === fClient)
    .filter(r => !fProject || r.projectId === fProject)
    .filter(r => !fRole || r.roleId === fRole)
    .filter(r => !fUser || r.ownerId === fUser)
    .filter(r => !recurringGenerationFor(r, ym));
  if (!pending.length) return toast('Nenhuma recorrente pendente neste mês.', 'warn');
  const ok = await showConfirm({
    title: 'Gerar todas pendentes',
    message: `Serão geradas <strong>${pending.length}</strong> demanda(s) referentes a <strong>${ymLabel(ym)}</strong>.<br><br>Continuar?`,
    okLabel: 'Gerar todas'
  });
  if (!ok) return;
  let ok_count = 0, errs = 0;
  for (const r of pending) {
    try { await api('/recurrings/' + r.id + '/generate', 'POST', { ym }); ok_count++; }
    catch { errs++; }
  }
  toast(`${ok_count} demanda(s) geradas${errs ? `, ${errs} falha(s)` : ''}.`, errs ? 'warn' : 'success');
  await refreshData();
}

function renderTemplates() {
  const list = templates.filter(t => t.workspaceId === activeWs).slice().sort((a, b) => {
    let va, vb;
    if (tplSortKey === 'project') { va = norm(projectById(a.projectId)?.name || ''); vb = norm(projectById(b.projectId)?.name || ''); }
    else if (tplSortKey === 'flow') { va = norm(flowById(a.flowId)?.name || ''); vb = norm(flowById(b.flowId)?.name || ''); }
    else if (tplSortKey === 'hours') { va = a.estimatedHours || 0; vb = b.estimatedHours || 0; }
    else { va = norm(a.name); vb = norm(b.name); }
    return (va < vb ? -1 : va > vb ? 1 : 0) * tplSortDir;
  });
  $('templates-table-body').innerHTML = list.length ? list.map(t => {
    const p = t.projectId ? projectById(t.projectId) : null;
    const f = t.flowId ? flowById(t.flowId) : null;
    return `<tr class="row-hover-actions">
      <td><strong>${esc(t.name)}</strong>${t.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(t.description.slice(0, 80))}${t.description.length > 80 ? '…' : ''}</div>` : ''}</td>
      <td>${p ? esc(p.name) : '<span style="color:var(--text-muted)">— Qualquer —</span>'}</td>
      <td>${f ? esc(f.name) : '<span style="color:var(--text-muted)">— Qualquer —</span>'}</td>
      <td>${t.estimatedHours ? fmtHours(t.estimatedHours) : '—'}</td>
      <td>
        <div class="row-actions">
          <button class="detail-icon-btn" title="Criar demanda a partir deste template" onclick="useTemplate('${t.id}')"><i data-lucide="plus" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="confirmDeleteTemplate('${t.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="5">${emptyState('Nenhum template cadastrado', 'Crie um template a partir da área de criação de demanda usando o botão "Salvar como template".', 'default')}</td></tr>`;
}
function useTemplate(tid) {
  openNewDemand();
  setTimeout(() => {
    $('f-template').value = tid;
    applyDemandTemplate();
  }, 100);
}
function sortTplBy(key) {
  if (tplSortKey === key) tplSortDir *= -1;
  else { tplSortKey = key; tplSortDir = 1; }
  renderTemplates();
}
async function confirmDeleteTemplate(id) {
  const t = templates.find(x => x.id === id); if (!t) return;
  const ok = await showConfirm({
    title: 'Excluir template',
    message: `Excluir o template <strong>${esc(t.name)}</strong>?<br><br>Esta ação não pode ser desfeita.`,
    okLabel: 'Excluir',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/templates/' + id, 'DELETE');
    toast('Template excluído.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

async function saveRole() {
  const name = $('role-name').value.trim();
  if (!name) { toast('Informe o nome da função.', 'error'); return; }
  try {
    if (editingRoleId) await api('/roles/' + editingRoleId, 'PUT', { name });
    else await api('/roles', 'POST', { name });
    closeModal('role-modal');
    toast(editingRoleId ? 'Função atualizada!' : 'Função criada!');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteRole(id) {
  const r = roles.find(x => x.id === id);
  if (!r) return;
  const ok = await showConfirm({
    title: 'Excluir função',
    message: `Excluir a função <strong>${esc(r.name)}</strong>?<br><br>Os usuários que a possuem ficarão sem função definida.`,
    okLabel: 'Excluir',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/roles/' + id, 'DELETE');
    toast('Função excluída.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
function openUserModal(id) {
  editingUserId = id || null;
  $('user-modal-title').textContent = id ? 'Editar Usuário' : 'Cadastrar Usuário';
  const u = id ? userById(id) : null;
  $('u-name').value = u?.name || '';
  fillRoleSelect('u-role', u?.role || '');
  $('u-username').value = u?.username || '';
  $('u-username').disabled = !!id;
  $('u-username-group').style.opacity = id ? .55 : 1;
  $('u-password').value = '';
  $('u-password-label').textContent = id ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial *';
  $('u-email').value = u?.email || '';
  $('u-discord-id').value = u?.discordId || '';
  $('u-admin').checked = !!u?.isAdmin;
  const selected = u ? (u.workspaces || []) : [activeWs];
  $('u-workspaces').innerHTML = workspaces.map(w => `
    <label class="ws-chip-check ${selected.includes(w.id) ? 'on' : ''}">
      <input type="checkbox" value="${w.id}" ${selected.includes(w.id) ? 'checked' : ''}
             onchange="this.parentElement.classList.toggle('on', this.checked)">
      <span class="pill-dot" style="background:${w.color || '#7A00FF'}"></span>${esc(w.name)}
    </label>`).join('');
  openModal('user-modal');
  navPush(id ? '/users/' + id : '/users/new');
}
async function saveUser() {
  const wsSel = [...$('u-workspaces').querySelectorAll('input:checked')].map(i => i.value);
  const payload = {
    name: $('u-name').value, role: $('u-role').value,
    isAdmin: $('u-admin').checked, workspaces: wsSel,
    discordId: ($('u-discord-id').value || '').trim() || null,
    email: ($('u-email').value || '').trim() || null
  };
  const pass = $('u-password').value;
  try {
    if (editingUserId) {
      if (pass) payload.password = pass;
      await api('/users/' + editingUserId, 'PUT', payload);
    } else {
      payload.username = $('u-username').value;
      payload.password = pass;
      await api('/users', 'POST', payload);
    }
    closeModal('user-modal');
    toast(editingUserId ? 'Usuário atualizado!' : 'Usuário criado! Envie o acesso para a pessoa.');
    await refreshData();
    if (editingUserId === me.id) { me = await api('/me'); renderSidebarUser(); }
  } catch (e) { toast(e.message, 'error'); }
}
async function resetUserPassword(id) {
  const pass = prompt('Nova senha para ' + (userById(id)?.name || 'o usuário') + ' (mín. 6 caracteres):');
  if (!pass) return;
  try {
    await api('/users/' + id, 'PUT', { password: pass });
    toast('Senha redefinida. Envie a nova senha para a pessoa.');
  } catch (e) { toast(e.message, 'error'); }
}
async function toggleUser(id) {
  const u = userById(id); if (!u) return;
  try {
    await api('/users/' + id, 'PUT', { active: u.active === false });
    toast(u.active === false ? 'Usuário reativado.' : 'Usuário desativado.', 'warn');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── PERFIL ─── */
function renderProfile() {
  $('profile-name-display').textContent = me.name;
  $('profile-role-display').textContent = me.isAdmin ? (me.role ? me.role + ' · Administrador' : 'Administrador') : (me.role || 'Equipe');
  $('profile-username-display').textContent = '@' + me.username;
  $('profile-f-name').value = me.name;
  $('profile-f-username').value = me.username;
  $('profile-f-discord-id').value = me.discordId || '';
  $('profile-f-email').value = me.email || '';
  const prefs = me.emailPrefs || { assigned: true, stage_assigned: true, mention: true };
  $('profile-pref-assigned').checked = prefs.assigned !== false;
  $('profile-pref-stage_assigned').checked = prefs.stage_assigned !== false;
  $('profile-pref-mention').checked = prefs.mention !== false;
  $('profile-email-smtp-warning').style.display = me._smtpEnabled === false ? '' : 'none';
  fillRoleSelect('profile-f-role', me.role || '');
  // Mesma lógica do sidebar: regex aguenta classes extras (presence-online, etc).
  const profAv = $('profile-avatar');
  if (profAv) profAv.outerHTML = avatarHTML(me, 'avatar avatar-lg').replace(/class="([^"]+)"/, 'class="$1" id="profile-avatar"');
  $('avatar-remove-btn').style.display = me.avatar ? '' : 'none';
}
async function saveEmailSettings() {
  const email = ($('profile-f-email').value || '').trim();
  const emailPrefs = {
    assigned: $('profile-pref-assigned').checked,
    stage_assigned: $('profile-pref-stage_assigned').checked,
    mention: $('profile-pref-mention').checked,
  };
  try {
    me = await api('/me', 'PUT', { email: email || null, emailPrefs });
    toast('Preferências de e-mail salvas!');
    renderProfile();
  } catch (e) { toast(e.message, 'error'); }
}
async function sendEmailTest() {
  const currentEmail = ($('profile-f-email').value || '').trim();
  if (currentEmail && currentEmail !== me.email) {
    // Salva o e-mail antes de testar pra evitar testar contra o e-mail antigo
    try { me = await api('/me', 'PUT', { email: currentEmail }); } catch (e) { toast(e.message, 'error'); return; }
  }
  if (!me.email) { toast('Cadastre um e-mail antes de testar.', 'error'); return; }
  try {
    await api('/me/email/test', 'POST');
    toast('E-mail de teste enviado para ' + me.email);
  } catch (e) { toast(e.message, 'error'); }
}
async function saveProfile() {
  try {
    me = await api('/me', 'PUT', { name: $('profile-f-name').value, role: $('profile-f-role').value, username: $('profile-f-username').value });
    toast('Perfil atualizado!');
    renderSidebarUser(); renderProfile();
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function saveDiscordId() {
  const raw = ($('profile-f-discord-id').value || '').trim();
  try {
    me = await api('/me', 'PUT', { discordId: raw || null });
    toast(raw ? 'ID do Discord vinculado!' : 'ID do Discord removido.');
    renderProfile();
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function changePassword() {
  const currentPassword = $('profile-f-pass-current').value;
  const newPassword = $('profile-f-pass-new').value;
  if (!currentPassword || !newPassword) { toast('Preencha a senha atual e a nova senha.', 'error'); return; }
  try {
    me = await api('/me', 'PUT', { currentPassword, newPassword });
    $('profile-f-pass-current').value = ''; $('profile-f-pass-new').value = '';
    toast('Senha alterada com sucesso!');
  } catch (e) { toast(e.message, 'error'); }
}
function handleAvatarUpload(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = e => { img.src = e.target.result; };
  img.onload = async () => {
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const min = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    try {
      me = await api('/me', 'PUT', { avatar: data });
      toast('Foto de perfil atualizada!');
      renderSidebarUser(); renderProfile();
    } catch (e2) { toast(e2.message, 'error'); }
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}
async function removeAvatar() {
  try {
    me = await api('/me', 'PUT', { avatar: null });
    toast('Foto removida.', 'warn');
    renderSidebarUser(); renderProfile();
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── NOTIFICAÇÕES ─── */
let _lastNotifUnread = 0;
function renderNotifBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const badge = $('notif-badge');
  const bell = document.querySelector('.notif-bell');
  if (badge) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = unread > 0 ? '' : 'none';
    badge.classList.toggle('has-unread', unread > 0);
  }
  if (bell) {
    bell.classList.toggle('has-unread', unread > 0);
    // Pulse + pop quando o contador AUMENTA (notificação nova chegou)
    if (unread > _lastNotifUnread && _lastNotifUnread !== 0) {
      bell.classList.remove('pulse');
      void bell.offsetWidth; // força reflow para reaplicar a animação
      bell.classList.add('pulse');
      if (badge) {
        badge.classList.remove('pop');
        void badge.offsetWidth;
        badge.classList.add('pop');
      }
    }
  }
  _lastNotifUnread = unread;
}

function toggleNotifPanel() {
  const panel = $('notif-panel');
  const isOpen = panel.classList.toggle('open');
  if (isOpen) renderNotifList();
}

function notifMessage(n) {
  const from = userById(n.fromUser);
  const fromName = from ? from.name : 'Alguém';
  switch (n.type) {
    case 'assigned':
      return `<strong>${esc(fromName)}</strong> atribuiu a demanda <strong>${esc(n.demandName)}</strong> para você${n.stageName ? ' na etapa ' + esc(n.stageName) : ''}`;
    case 'stage_assigned':
      return `A demanda <strong>${esc(n.demandName)}</strong> avançou para a etapa <strong>${esc(n.stageName || '—')}</strong> e foi atribuída a você`;
    case 'mention':
      return `<strong>${esc(fromName)}</strong> mencionou você em <strong>${esc(n.demandName)}</strong>` +
        (n.commentText ? `<div class="notif-comment">${esc(n.commentText)}</div>` : '');
    default:
      return `Notificação sobre <strong>${esc(n.demandName)}</strong>`;
  }
}

function renderNotifList() {
  const list = notifications.slice(0, 50);
  if (!list.length) {
    $('notif-list').innerHTML = '<div class="notif-empty">Nenhuma notificação por enquanto.</div>';
    return;
  }
  $('notif-list').innerHTML = list.map(n => `
    <div class="notif-item ${n.read ? 'read' : 'unread'}" onclick="openNotif('${n.id}', '${n.demandId || ''}')">
      <div class="notif-dot-wrap">${!n.read ? '<span class="notif-dot"></span>' : ''}</div>
      <div class="notif-body">
        <div class="notif-text">${notifMessage(n)}</div>
        <div class="notif-time">${fmtDateTime(n.createdAt)}</div>
      </div>
    </div>`).join('');
}

async function openNotif(notifId, demandId) {
  // marca como lido
  const n = notifications.find(x => x.id === notifId);
  if (n && !n.read) {
    n.read = true;
    api('/notifications/' + notifId + '/read', 'PUT').catch(() => {});
    renderNotifBadge();
  }
  // fecha painel e abre a demanda
  $('notif-panel').classList.remove('open');
  if (demandId && demands.find(d => d.id === demandId)) {
    showDetail(demandId);
  } else if (demandId) {
    // demanda pode estar em outro workspace; recarrega dados
    await refreshData();
    if (demands.find(d => d.id === demandId)) showDetail(demandId);
    else toast('Demanda não encontrada (pode ter sido excluída ou estar em outro workspace).', 'warn');
  }
}

async function markAllRead() {
  try {
    await api('/notifications/read-all', 'PUT');
    notifications.forEach(n => { n.read = true; });
    renderNotifBadge();
    renderNotifList();
  } catch (e) { toast(e.message, 'error'); }
}

// Fecha o painel ao clicar fora
document.addEventListener('click', e => {
  const wrap = document.querySelector('.notif-wrap');
  if (wrap && !wrap.contains(e.target)) {
    $('notif-panel').classList.remove('open');
  }
});

/* ─── BULK ACTIONS — seleção múltipla de demandas na lista ─── */
let selectedDemandIds = new Set();
function onDemandRowClick(ev, id) {
  // Click no checkbox NÃO abre o detalhe (handled por event.stopPropagation no input).
  // Click em qualquer outra parte da row abre normalmente.
  showDetail(id);
}
function toggleDemandSelection(id, checked) {
  if (checked) selectedDemandIds.add(id);
  else selectedDemandIds.delete(id);
  // Atualiza visual da row sem re-render total
  const row = document.querySelector(`.demand-row[data-demand-id="${id}"]`);
  if (row) row.classList.toggle('selected', checked);
  refreshBulkBar();
}
function toggleBulkSelectAll(checked) {
  const rows = document.querySelectorAll('#list-table-body .demand-row');
  rows.forEach(r => {
    const id = r.dataset.demandId;
    if (!id) return;
    if (checked) selectedDemandIds.add(id);
    else selectedDemandIds.delete(id);
    r.classList.toggle('selected', checked);
    const cb = r.querySelector('.bulk-check-row');
    if (cb) cb.checked = checked;
  });
  refreshBulkBar();
}
function clearBulkSelection() {
  selectedDemandIds.clear();
  document.querySelectorAll('.demand-row.selected').forEach(r => r.classList.remove('selected'));
  document.querySelectorAll('.bulk-check-row').forEach(c => c.checked = false);
  const all = $('bulk-check-all'); if (all) all.checked = false;
  refreshBulkBar();
}
function refreshBulkBar() {
  const bar = $('bulk-actions-bar');
  const count = $('bulk-count');
  const checkAll = $('bulk-check-all');
  if (!bar) return;
  const n = selectedDemandIds.size;
  bar.classList.toggle('open', n > 0);
  if (count) count.textContent = `${n} ${n === 1 ? 'selecionada' : 'selecionadas'}`;
  // Sincroniza o "select all" com a seleção atual
  if (checkAll) {
    const rows = document.querySelectorAll('#list-table-body .demand-row');
    const visibleIds = [...rows].map(r => r.dataset.demandId).filter(Boolean);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedDemandIds.has(id));
    checkAll.checked = allSelected;
    checkAll.indeterminate = n > 0 && !allSelected;
  }
}

async function bulkRun(op, data, confirmMsg) {
  const ids = [...selectedDemandIds];
  if (!ids.length) return;
  if (confirmMsg) {
    const ok = await showConfirm({
      title: op === 'delete' ? 'Confirmar exclusão' : 'Confirmar ação',
      message: confirmMsg,
      okLabel: op === 'delete' ? 'Excluir' : 'Aplicar',
      danger: op === 'delete'
    });
    if (!ok) return;
  }
  try {
    const r = await api('/demands/bulk', 'POST', { ids, op, data });
    clearBulkSelection();
    await refreshData();
    const skippedMsg = r.skipped ? ` · ${r.skipped} ignorada${r.skipped === 1 ? '' : 's'}` : '';
    toast(`${r.updated} demanda${r.updated === 1 ? '' : 's'} atualizada${r.updated === 1 ? '' : 's'}${skippedMsg}`);
  } catch (e) {
    toast(e.message || 'Erro ao aplicar ação em lote', 'error');
  }
}
function openBulkOwnerPicker() {
  if (!selectedDemandIds.size) return;
  const opts = [{ value: '', label: '— sem responsável —' }, ...wsUsers().map(u => ({ value: u.id, label: u.name }))];
  showCustomPicker('Alterar responsável', 'Selecione o novo responsável:', opts, (val) => bulkRun('setOwner', { ownerId: val || null }));
}
function openBulkPriorityPicker() {
  if (!selectedDemandIds.size) return;
  const opts = [
    { value: '1', label: 'Crítica' },
    { value: '2', label: 'Alta' },
    { value: '3', label: 'Normal' },
    { value: '4', label: 'Baixa' }
  ];
  showCustomPicker('Alterar prioridade', 'Selecione a nova prioridade:', opts, (val) => bulkRun('setPriority', { priority: Number(val) }));
}
function openBulkStagePicker() {
  if (!selectedDemandIds.size) return;
  // Coleta labels de etapas dos fluxos das demandas selecionadas (intersection)
  const ids = [...selectedDemandIds];
  const flowsOfSel = [...new Set(ids.map(id => demandById(id)?.flowId).filter(Boolean))];
  if (!flowsOfSel.length) { toast('Demandas sem fluxo válido.', 'error'); return; }
  const stagesByFlow = flowsOfSel.map(fid => new Set((flowById(fid)?.stages || []).map(s => s.label)));
  // Interseção: labels presentes em TODOS os fluxos
  const common = [...stagesByFlow[0]].filter(lbl => stagesByFlow.every(s => s.has(lbl)));
  if (!common.length) {
    toast('As demandas selecionadas usam fluxos sem etapas em comum.', 'error');
    return;
  }
  const opts = common.map(lbl => ({ value: lbl, label: lbl }));
  showCustomPicker('Mover para etapa', 'Selecione a etapa alvo:', opts, (val) => bulkRun('setStatus', { stageLabel: val, status: 'by-label' }));
}
function bulkDelete() {
  if (!selectedDemandIds.size) return;
  const n = selectedDemandIds.size;
  bulkRun('delete', null, `Excluir definitivamente ${n} demanda${n === 1 ? '' : 's'}? Esta ação não pode ser desfeita.`);
}

/* Picker dedicado — lista de botões. Reconstrói o conteúdo a cada chamada. */
function showCustomPicker(title, message, options, onPick) {
  let p = document.getElementById('picker-modal');
  if (!p) {
    p = document.createElement('div');
    p.id = 'picker-modal';
    p.className = 'modal-overlay';
    p.innerHTML = `<div class="modal modal-sm">
      <div class="modal-header">
        <div class="modal-title" id="picker-title">Escolher</div>
        <button class="modal-close" onclick="closeModal('picker-modal')"><i data-lucide="x" class="ic-sm"></i></button>
      </div>
      <div class="modal-body">
        <div id="picker-message" style="font-size:13px;color:var(--text-dim);margin-bottom:12px"></div>
        <div class="picker-list" id="picker-list"></div>
      </div>
    </div>`;
    document.body.appendChild(p);
  }
  $('picker-title').textContent = title;
  $('picker-message').textContent = message;
  $('picker-list').innerHTML = options.map(o => `<button type="button" class="picker-item" data-val="${esc(String(o.value))}">${esc(o.label)}</button>`).join('');
  $('picker-list').querySelectorAll('.picker-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.val;
      closeModal('picker-modal');
      onPick(v);
    });
  });
  openModal('picker-modal');
}

/* ─── MARKDOWN LEVE ───
   Aceita uma string JÁ ESCAPADA (esc() aplicado antes) e processa:
   **bold**, *italic*, `code`, listas com - no início da linha, ## heading
   e quebras de parágrafo (linha vazia). Links já vêm prontos por linkifyEscaped. */
function mdApply(escaped) {
  if (!escaped) return '';
  let s = escaped;
  // Code inline `texto` — capturado antes pra não confundir com asteriscos
  s = s.replace(/`([^`\n]+?)`/g, '<code class="md-code">$1</code>');
  // Bold **texto**
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  // Italic *texto* — depois do bold pra não interferir
  s = s.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // Listas: linhas começando com "- " viram <li>; agrupa contíguas em <ul>
  s = s.replace(/(^|\n)((?:- [^\n]+(?:\n|$))+)/g, (_m, pre, block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^- /, '').trim()).map(t => `<li>${t}</li>`).join('');
    return `${pre}<ul class="md-list">${items}</ul>`;
  });
  return s;
}
// Renderiza uma string CRUA (não-escapada) aplicando esc + linkify + markdown.
function mdRender(raw) {
  if (raw == null) return '';
  const escaped = esc(String(raw));
  return mdApply(linkifyEscaped(escaped));
}

/* ─── PRESENÇA — ping a cada minuto + refresh leve da lista de usuários ─── */
let _presencePingTimer = null;
async function pingPresence() {
  try {
    const r = await api('/me/ping', 'POST', {});
    if (r && r.lastSeen && me) me.lastSeen = r.lastSeen;
    // Atualiza lastSeen dos demais usuários — necessário pra dot deles
    try {
      const freshUsers = await api('/users');
      if (Array.isArray(freshUsers)) users = freshUsers;
    } catch {}
  } catch {}
}
function startPresence() {
  if (_presencePingTimer) clearInterval(_presencePingTimer);
  pingPresence();
  _presencePingTimer = setInterval(pingPresence, 60000); // 1 min
}

/* ─── MODO ZEN (FOCAR) ─── */
function isZenMode() { return document.body.classList.contains('zen-mode'); }
function toggleZenMode() {
  const on = !isZenMode();
  document.body.classList.toggle('zen-mode', on);
  localStorage.setItem('kastor-zen', on ? '1' : '0');
  const btn = $('zen-toggle-btn');
  if (btn) {
    btn.setAttribute('title', on ? 'Sair do modo focar (Esc)' : 'Modo focar (esconde sidebar e topbar)');
    btn.innerHTML = on
      ? '<i data-lucide="minimize-2" class="ic-sm"></i>'
      : '<i data-lucide="maximize-2" class="ic-sm"></i>';
    paintIcons();
  }
  // Garante botão flutuante de saída
  let exit = document.getElementById('zen-exit-floating');
  if (on && !exit) {
    exit = document.createElement('button');
    exit.id = 'zen-exit-floating';
    exit.className = 'zen-exit-floating';
    exit.setAttribute('data-tooltip', 'Sair do modo focar (Esc)');
    exit.innerHTML = '<i data-lucide="minimize-2" class="ic-sm"></i>';
    exit.onclick = toggleZenMode;
    document.body.appendChild(exit);
    paintIcons();
  } else if (!on && exit) {
    exit.remove();
  }
}
function applyZenFromStorage() {
  if (localStorage.getItem('kastor-zen') === '1') toggleZenMode();
}

// Ganchos no boot — aplicar zen guardado + iniciar presence depois do me carregar.
// Como boot() já roda no fim do arquivo, expomos via window e chamamos no enterApp.
const _origEnterApp = enterApp;
enterApp = async function patchedEnterApp() {
  await _origEnterApp.apply(this, arguments);
  applyZenFromStorage();
  startPresence();
};

/* Esc também sai do modo zen (além de fechar modal/painel) */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isZenMode()) {
    // Só sai se não há modal/popover aberto que vai capturar Esc primeiro
    const anyModal = document.querySelector('.modal-overlay.open, #cmdk.open, #shortcuts-help.open');
    if (!anyModal) { e.preventDefault(); toggleZenMode(); }
  }
});

/* ─── CLIENTES — Página, detalhe e modais ─── */
let currentClientId = null;
let clientStatusFilter = 'all'; // 'all' | 'active' | 'archived'
let currentClientPeriod = '90';
let editingClientId = null;
let clientAvatarData = null;
let clientModalStatusActive = true;

function setClientStatusFilter(s) {
  clientStatusFilter = s;
  document.querySelectorAll('.client-status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === s));
  renderClients();
}

function renderClients() {
  // Reseta pra view de grid. currentClientId já é tratado pelo dispatcher
  // em renderCurrent('clients').
  $('clients-view-grid').style.display = '';
  $('clients-view-detail').style.display = 'none';

  // Popula select de workspace
  const fwSel = $('client-f-ws');
  if (fwSel) {
    const prev = fwSel.value;
    const accessibleWs = workspaces.filter(w => me.isAdmin || (me.workspaces || []).includes(w.id));
    fwSel.innerHTML = '<option value="">Todos os workspaces</option>' +
      accessibleWs.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
    if ([...fwSel.options].some(o => o.value === prev)) fwSel.value = prev;
    applyFilterDropdown('client-f-ws');
  }

  // Filtra
  const q = norm(($('client-search').value || '').trim());
  const fw = fwSel ? fwSel.value : '';
  let list = clients.filter(c => {
    if (me.isAdmin === false && !(me.workspaces || []).includes(c.workspaceId)) return false;
    if (q && !norm(c.name).includes(q)) return false;
    if (fw && c.workspaceId !== fw) return false;
    if (clientStatusFilter === 'active' && c.active === false) return false;
    if (clientStatusFilter === 'archived' && c.active !== false) return false;
    return true;
  });

  // Sort: ativos primeiro, depois alfabético
  list.sort((a, b) => {
    const aa = a.active !== false, ba = b.active !== false;
    if (aa !== ba) return aa ? -1 : 1;
    return norm(a.name).localeCompare(norm(b.name));
  });

  const grid = $('clients-grid');
  if (!list.length) {
    grid.innerHTML = emptyState('Nenhum cliente encontrado', 'Crie seu primeiro cliente clicando em "Novo Cliente".', 'users');
    paintIcons();
    return;
  }

  grid.innerHTML = list.map(c => {
    let avatarHtml;
    if (c.avatar) {
      avatarHtml = `<div class="client-card-avatar" style="background-image:url('${c.avatar}');background-size:cover;background-position:center"></div>`;
    } else {
      const letter = (c.name || 'C').charAt(0).toUpperCase();
      avatarHtml = `<div class="client-card-avatar" style="background:${hexDim(c.color || '#7A00FF')};color:${c.color || '#7A00FF'}">${esc(letter)}</div>`;
    }
    const ws = wsById(c.workspaceId);
    const projCount = projects.filter(p => p.clientId === c.id).length;
    const statusBadge = c.active === false
      ? '<span class="client-card-status client-card-status--archived">Arquivado</span>'
      : '<span class="client-card-status client-card-status--active">Ativo</span>';
    return `<div class="flow-card client-card ${c.active === false ? 'is-archived' : ''}" onclick="openClient('${c.id}')">
      ${avatarHtml}
      <div class="flow-card-name">${esc(c.name)}</div>
      <div class="flow-card-sub">${esc(ws?.name || '—')}</div>
      <div class="flow-card-sub" style="font-size:11px;color:var(--text-muted)">${projCount} projeto${projCount === 1 ? '' : 's'}</div>
      ${statusBadge}
    </div>`;
  }).join('');
  paintIcons();
}

function openClient(id) {
  const c = clientById(id);
  if (!c) { toast('Cliente não encontrado', 'error'); renderClients(); return; }
  currentClientId = id;
  $('clients-view-grid').style.display = 'none';
  $('clients-view-detail').style.display = '';
  renderClientDetail(id);
  navPush('/clients/' + id);
}
function closeClientDetail() {
  currentClientId = null;
  $('clients-view-grid').style.display = '';
  $('clients-view-detail').style.display = 'none';
  navPush('/clients');
  renderClients();
}

function renderClientDetail(id) {
  const c = clientById(id);
  if (!c) return;

  // Breadcrumb
  const bc = $('client-detail-breadcrumb');
  if (bc) {
    bc.innerHTML = `<span style="color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;font-size:11px">Clientes cadastrados · </span><span>${esc(c.name)}</span>`;
  }

  // PROJETOS
  const projs = projects.filter(p => p.clientId === id);
  const projGrid = $('client-detail-projects');
  if (!projs.length) {
    projGrid.innerHTML = `<div style="grid-column:1/-1">${emptyState('Nenhum projeto', 'Crie o primeiro projeto deste cliente.', 'inbox')}</div>`;
  } else {
    projGrid.innerHTML = projs.map(p => {
      const statusLabel = p.active === false ? 'Arquivado' : 'Ativo';
      const statusClass = p.active === false ? 'client-card-status--archived' : 'client-card-status--active';
      const avatar = p.avatar
        ? `<div class="client-card-avatar" style="background-image:url('${p.avatar}');background-size:cover;background-position:center"></div>`
        : `<div class="client-card-avatar" style="background:${hexDim(p.color || '#7A00FF')};color:${p.color || '#7A00FF'}">${esc((p.name || 'P').charAt(0).toUpperCase())}</div>`;
      return `<div class="flow-card" onclick="openProjectModal('${p.id}')">
        ${avatar}
        <div class="flow-card-name">${esc(p.name)}</div>
        <div class="flow-card-sub">${esc(statusLabel)}</div>
      </div>`;
    }).join('');
  }

  // PESSOAS — uma linha por função cadastrada, com select de usuário padrão pro cliente.
  // Persiste em c.roleAssignments: { [roleName]: userId | null }.
  const peopleEl = $('client-detail-people');
  const allRoles = (roles || []).slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const assigns = c.roleAssignments || {};
  // Usuários candidatos pra cada função: filtra por workspace acessível + função
  const wsUsers = users.filter(u =>
    (u.workspaces || []).includes(c.workspaceId) || u.isAdmin
  );
  if (!allRoles.length) {
    peopleEl.innerHTML = `<div class="client-people-empty">Nenhuma função cadastrada. Crie funções em <a href="#" onclick="event.preventDefault(); goPage('users');">Usuários</a> para definir responsáveis padrão por cliente.</div>`;
  } else {
    peopleEl.innerHTML = allRoles.map(role => {
      const candidates = wsUsers.filter(u => (u.role || '') === role.name);
      const currentUid = assigns[role.name] || '';
      const opts = [`<option value="">— Sem responsável padrão —</option>`]
        .concat(candidates.map(u => `<option value="${u.id}" ${u.id === currentUid ? 'selected' : ''}>${esc(u.name)}</option>`))
        .join('');
      const currentUser = currentUid ? userById(currentUid) : null;
      const previewAvatar = currentUser ? avatarHTML(currentUser, 'avatar') : `<div class="avatar" style="background:var(--surface-2);color:var(--text-muted);display:flex;align-items:center;justify-content:center"><i data-lucide="user" class="ic-sm"></i></div>`;
      return `<div class="client-person-row">
        <div class="client-person-role">${esc(role.name)}</div>
        <div class="client-person-name">${previewAvatar}</div>
        <select class="form-control" onchange="setClientRoleAssignment('${id}', '${esc(role.name).replace(/'/g, "\\'")}', this.value)" ${candidates.length ? '' : 'disabled'}>
          ${candidates.length ? opts : `<option value="">Sem usuários nesta função</option>`}
        </select>
      </div>`;
    }).join('');
  }

  // TEMPO DEDICADO
  renderClientTimeBlock(id);
  paintIcons();
}

function setClientTimePeriod(p) {
  currentClientPeriod = p;
  document.querySelectorAll('.client-time-period').forEach(b => b.classList.toggle('active', b.dataset.period === p));
  if (currentClientId) renderClientTimeBlock(currentClientId);
}

async function setClientRoleAssignment(clientId, roleName, userId) {
  const c = clientById(clientId);
  if (!c) return;
  const next = Object.assign({}, c.roleAssignments || {});
  next[roleName] = userId || null;
  try {
    await api('/clients/' + clientId, 'PUT', { roleAssignments: next });
    // Atualiza cache local sem refetch completo (mudança trivial)
    c.roleAssignments = next;
    renderClientDetail(clientId);
    toast('Responsável padrão atualizado.');
  } catch (e) { toast(e.message, 'error'); }
}

function renderClientTimeBlock(clientId) {
  const projs = projects.filter(p => p.clientId === clientId);
  const projIds = new Set(projs.map(p => p.id));
  // Filtra time entries
  const today0 = new Date(); today0.setHours(0,0,0,0);
  let fromYmd = null;
  if (currentClientPeriod !== 'all') {
    const days = parseInt(currentClientPeriod, 10) || 90;
    const from = new Date(today0); from.setDate(from.getDate() - (days - 1));
    fromYmd = from.toISOString().slice(0,10);
  }
  const inRange = (e) => {
    if (!fromYmd) return true;
    const when = ((e.start || e.createdAt || '') + '').slice(0,10);
    return when >= fromYmd;
  };
  let totalHours = 0;
  const byUser = new Map();
  const byDay = new Map();
  demands.forEach(d => {
    if (!projIds.has(d.projectId)) return;
    (d.timeEntries || []).forEach(e => {
      if (!inRange(e)) return;
      const h = Number(e.hours) || 0;
      totalHours += h;
      if (e.userId) byUser.set(e.userId, (byUser.get(e.userId) || 0) + h);
      const day = ((e.start || e.createdAt || '') + '').slice(0,10);
      if (day) byDay.set(day, (byDay.get(day) || 0) + h);
    });
  });

  $('client-time-value').textContent = fmtHours(totalHours);

  // Lista de usuários — ordenado por horas (decrescente) + barra de progresso
  const days = currentClientPeriod === 'all' ? 30 : parseInt(currentClientPeriod, 10);
  let businessDays = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today0); d.setDate(d.getDate() - i);
    if (d.getDay() !== 0 && d.getDay() !== 6) businessDays++;
  }
  const capacity = businessDays * 8;
  const rows = [...byUser.entries()]
    .map(([uid, h]) => ({ u: userById(uid), hours: h }))
    .filter(r => r.u)
    .sort((a, b) => b.hours - a.hours);
  const rowsEl = $('client-time-rows');
  if (!rows.length) {
    rowsEl.innerHTML = `<div class="client-people-empty">Ninguém apontou horas nos projetos deste cliente no período selecionado.</div>`;
  } else {
    rowsEl.innerHTML = rows.map(r => {
      const pct = capacity > 0 ? Math.min(150, Math.round((r.hours / capacity) * 100)) : 0;
      const status = pct >= 100 ? 'overload' : pct >= 75 ? 'high' : pct >= 40 ? 'medium' : 'low';
      return `<div class="client-time-row">
        <div class="client-time-user">
          ${avatarHTML(r.u, 'avatar')}
          <div>
            <div class="client-time-user-name">${esc(r.u.name)}</div>
            <div class="client-time-user-role">${esc(r.u.role || '—')}</div>
          </div>
        </div>
        <div class="client-time-meta">
          <span class="client-time-pct">${pct}%</span>
          <span class="client-time-hh">${fmtHours(r.hours)} / ${capacity}h</span>
        </div>
        <div class="capacity-bar-track" style="flex:1;max-width:none">
          <div class="capacity-bar-fill ${status}" style="width:${Math.min(100, pct)}%"></div>
        </div>
      </div>`;
    }).join('');
  }

  // Chart: linha de horas por dia (últimos N dias)
  const chartEl = $('client-time-chart');
  if (chartEl) {
    const buckets = [];
    const dayCount = currentClientPeriod === 'all' ? 30 : Math.min(90, parseInt(currentClientPeriod, 10) || 30);
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(today0); d.setDate(d.getDate() - i);
      const ymd = d.toISOString().slice(0,10);
      buckets.push({ ymd, hours: byDay.get(ymd) || 0, day: d });
    }
    const max = Math.max(1, ...buckets.map(b => b.hours));
    const w = 760, h = 180, padL = 30, padR = 16, padT = 14, padB = 22;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const xStep = innerW / Math.max(1, buckets.length - 1);
    const points = buckets.map((b, i) => [padL + i * xStep, padT + innerH - (b.hours / max) * innerH]);
    const linePath = points.length ? 'M ' + points.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ') : '';
    const areaPath = points.length ? `${linePath} L ${points[points.length-1][0].toFixed(1)} ${padT + innerH} L ${points[0][0].toFixed(1)} ${padT + innerH} Z` : '';
    const peak = Math.ceil(max);
    chartEl.innerHTML = `<div class="client-chart-wrap">
      <div class="client-chart-head">
        <div class="client-chart-title">Horas</div>
        <div class="client-chart-value">${fmtHours(totalHours)} <span class="client-chart-delta">no período</span></div>
      </div>
      <div class="chart-hover-host" id="cli-chart-host">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:200px;display:block">
          <defs>
            <linearGradient id="clientHoursGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#3CE3A0" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#3CE3A0" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <g stroke="rgba(255,255,255,0.05)" stroke-width="1" vector-effect="non-scaling-stroke">
            <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}"/>
            <line x1="${padL}" y1="${padT + innerH/2}" x2="${w - padR}" y2="${padT + innerH/2}"/>
            <line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}"/>
          </g>
          <g fill="var(--text-muted)" font-size="11" font-family="'JetBrains Mono', monospace">
            <text x="${padL - 6}" y="${padT + 4}" text-anchor="end">${peak}h</text>
            <text x="${padL - 6}" y="${padT + innerH/2 + 4}" text-anchor="end">${Math.round(peak/2)}h</text>
            <text x="${padL - 6}" y="${padT + innerH + 4}" text-anchor="end">0</text>
          </g>
          ${areaPath ? `<path d="${areaPath}" fill="url(#clientHoursGrad)"/>` : ''}
          ${linePath ? `<path d="${linePath}" fill="none" stroke="#3CE3A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}
          <line id="cli-chart-guide" class="chart-guide" x1="0" y1="${padT}" x2="0" y2="${padT + innerH}" stroke="rgba(255,255,255,0.35)" stroke-width="1" vector-effect="non-scaling-stroke" style="opacity:0;pointer-events:none"/>
          <circle id="cli-chart-marker" r="4" fill="#3CE3A0" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="opacity:0;pointer-events:none"/>
        </svg>
        <div class="chart-tooltip" id="cli-chart-tooltip"></div>
      </div>
    </div>`;
    // Wire hover
    const host = $('cli-chart-host');
    if (host && points.length) {
      const tipPoints = buckets.map((b, i) => ({
        x: points[i][0], label: new Date(b.ymd + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        series: [{ name: 'Horas', value: b.hours, y: points[i][1], color: '#3CE3A0' }]
      }));
      attachChartHover(host, {
        viewBox: { w, h, padL, padR, padT, innerH },
        points: tipPoints,
        lineEls: $('cli-chart-guide'),
        markerEls: [$('cli-chart-marker')],
        tooltipEl: $('cli-chart-tooltip'),
        format: (v) => v > 0 ? fmtHours(v) : '0h'
      });
    }
  }
}

/* ─── MODAL: NOVO/EDITAR CLIENTE ─── */
function openClientModal(id) {
  editingClientId = id || null;
  const c = id ? clientById(id) : null;
  const isNew = !c;
  $('client-modal-title').textContent = isNew ? 'Novo Cliente' : 'Editar Cliente';
  $('c-name').value = c?.name || '';
  $('c-segment').value = c?.segment || '';
  $('c-drive-files').value = c?.driveFiles || '';
  $('c-brand-assets').value = c?.brandAssets || '';
  $('c-guidelines').value = c?.guidelines || '';
  setColorValue('c-color', c?.color || '#7A00FF');
  // Workspace
  const wsSel = $('c-workspace');
  const accessibleWs = workspaces.filter(w => me.isAdmin || (me.workspaces || []).includes(w.id));
  wsSel.innerHTML = accessibleWs.map(w =>
    `<option value="${w.id}" ${(c ? c.workspaceId : activeWs) === w.id ? 'selected' : ''}>${esc(w.name)}</option>`
  ).join('');
  // Avatar
  clientAvatarData = c?.avatar || null;
  refreshClientAvatarPreview();
  // Datalist de segmentos existentes
  const segs = [...new Set(clients.map(x => x.segment).filter(Boolean))].sort();
  $('client-segments-datalist').innerHTML = segs.map(s => `<option value="${esc(s)}">`).join('');
  // Footer: edit mostra status toggle + excluir + salvar como modelo
  $('c-foot-left').style.display = '';
  $('c-delete-btn').style.display = isNew ? 'none' : '';
  $('c-status-group').style.display = isNew ? 'none' : '';
  $('c-save-template-btn').style.display = isNew ? 'none' : '';
  if (c) {
    clientModalStatusActive = c.active !== false;
    refreshClientStatusUI();
  }
  // Onboarding: dropdown de modelos só no Novo
  const tplBar = $('c-template-bar');
  const tplSel = $('c-template');
  if (isNew && tplSel && tplBar) {
    const wsId = activeWs;
    const myTpls = (clientTemplates || []).filter(t => t.workspaceId === wsId);
    if (myTpls.length) {
      tplBar.style.display = '';
      tplSel.innerHTML = `<option value="">— Em branco —</option>` +
        myTpls.map(t => {
          const nProj = (t.projects || []).length;
          const nFlow = (t.projects || []).reduce((s, p) => s + (p.flows || []).length, 0);
          return `<option value="${t.id}">${esc(t.name)} (${nProj} projeto${nProj === 1 ? '' : 's'} · ${nFlow} fluxo${nFlow === 1 ? '' : 's'})</option>`;
        }).join('');
      tplSel.value = '';
    } else {
      tplBar.style.display = 'none';
    }
  } else if (tplBar) {
    tplBar.style.display = 'none';
  }
  openModal('client-modal');
  navPush(isNew ? '/clients/new' : '/clients/' + id + '/edit');
}
function openClientModalEdit() {
  if (currentClientId) openClientModal(currentClientId);
}
function refreshClientAvatarPreview() {
  const el = $('c-avatar-preview');
  if (!el) return;
  if (clientAvatarData) {
    el.style.backgroundImage = `url('${clientAvatarData}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.innerHTML = '';
    $('c-avatar-remove').style.display = '';
  } else {
    el.style.backgroundImage = '';
    el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Sem foto</span>';
    $('c-avatar-remove').style.display = 'none';
  }
}
function handleClientAvatarUpload(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Imagem excede 5MB.', 'error'); ev.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => { clientAvatarData = e.target.result; refreshClientAvatarPreview(); };
  reader.readAsDataURL(file);
  ev.target.value = '';
}
function removeClientAvatar() {
  clientAvatarData = null;
  refreshClientAvatarPreview();
}
function setClientModalStatus(active) {
  clientModalStatusActive = active;
  refreshClientStatusUI();
}
function refreshClientStatusUI() {
  document.querySelectorAll('.client-status-pick').forEach(b => {
    b.classList.toggle('active', (b.dataset.val === 'active') === clientModalStatusActive);
  });
}
async function saveClient() {
  const name = ($('c-name').value || '').trim();
  if (!name) { toast('Nome do cliente é obrigatório.', 'error'); return; }
  // Modo "novo a partir de modelo" — usa endpoint dedicado que cria projetos+fluxos junto
  const templateId = !editingClientId && $('c-template') ? $('c-template').value : '';
  if (templateId) {
    try {
      const r = await api('/clients/from-template', 'POST', {
        templateId, name, workspaceId: $('c-workspace').value
      });
      closeModal('client-modal');
      toast(`Cliente criado a partir do modelo (${r.counts.projects} projeto${r.counts.projects === 1 ? '' : 's'}, ${r.counts.flows} fluxo${r.counts.flows === 1 ? '' : 's'}).`);
      await refreshData();
      return;
    } catch (e) {
      toast(e.message || 'Erro ao aplicar modelo', 'error');
      return;
    }
  }
  const payload = {
    name,
    workspaceId: $('c-workspace').value,
    color: $('c-color').value,
    segment: $('c-segment').value,
    driveFiles: $('c-drive-files').value,
    brandAssets: $('c-brand-assets').value,
    guidelines: $('c-guidelines').value,
    avatar: clientAvatarData
  };
  if (editingClientId) payload.active = clientModalStatusActive;
  try {
    const r = editingClientId
      ? await api('/clients/' + editingClientId, 'PUT', payload)
      : await api('/clients', 'POST', payload);
    closeModal('client-modal');
    toast(editingClientId ? 'Cliente atualizado!' : 'Cliente criado!');
    // Se estava na tela de detalhe (URL /clients/<id>/edit), volta pro detalhe
    if (currentClientId) navPush('/clients/' + currentClientId);
    await refreshData();
  } catch (e) {
    toast(e.message || 'Erro ao salvar cliente', 'error');
  }
}

/* Salvar cliente atual como modelo — abre confirm que pede o nome */
function openSaveClientTemplate() {
  if (!editingClientId) return;
  const c = clientById(editingClientId);
  if (!c) return;
  const projs = projects.filter(p => p.clientId === c.id && p.active !== false);
  const flowsCount = projs.reduce((sum, p) => sum + flows.filter(f => f.projectId === p.id).length, 0);
  $('c-tpl-save-summary').innerHTML = `Vai salvar <strong>${esc(c.name)}</strong> como modelo: <strong>${projs.length}</strong> projeto${projs.length === 1 ? '' : 's'} e <strong>${flowsCount}</strong> fluxo${flowsCount === 1 ? '' : 's'} ativos. Demandas, agendamentos e atribuições NÃO vão pro modelo.`;
  $('c-tpl-save-name').value = `Modelo: ${c.name}`;
  openModal('client-template-save-modal');
  setTimeout(() => $('c-tpl-save-name').focus(), 60);
}
async function confirmSaveClientTemplate() {
  const name = ($('c-tpl-save-name').value || '').trim();
  if (!name) { toast('Dê um nome ao modelo.', 'error'); return; }
  try {
    await api('/client-templates', 'POST', { sourceClientId: editingClientId, name });
    clientTemplates = await api('/client-templates');
    closeModal('client-template-save-modal');
    toast('Modelo salvo. Disponível ao criar um novo cliente.');
  } catch (e) {
    toast(e.message || 'Erro ao salvar modelo', 'error');
  }
}

/* Exclusão com confirmação (digite o nome) */
function openClientDeleteConfirm() {
  if (!editingClientId) return;
  const c = clientById(editingClientId);
  if (!c) return;
  $('client-delete-title').textContent = `Excluir ${c.name}?`;
  $('client-delete-confirm-text').innerHTML = `Para confirmar, digite <strong>${esc(c.name)}</strong> abaixo:`;
  $('client-delete-input').value = '';
  $('client-delete-input').placeholder = c.name;
  $('client-delete-confirm-btn').disabled = true;
  $('client-delete-warning').textContent = '';
  // Aviso se tem projetos vinculados
  const linked = projects.filter(p => p.clientId === c.id).length;
  if (linked > 0) {
    $('client-delete-warning').textContent = `⚠ Este cliente tem ${linked} projeto(s) vinculado(s). Exclua ou mova os projetos antes.`;
  }
  openModal('client-delete-modal');
}
function updateClientDeleteBtnState() {
  if (!editingClientId) return;
  const c = clientById(editingClientId);
  const typed = ($('client-delete-input').value || '').trim();
  const linked = projects.filter(p => p.clientId === c.id).length;
  $('client-delete-confirm-btn').disabled = !(c && typed === c.name && linked === 0);
}
async function confirmDeleteClient() {
  if (!editingClientId) return;
  try {
    await api('/clients/' + editingClientId, 'DELETE');
    closeModal('client-delete-modal');
    closeModal('client-modal');
    editingClientId = null;
    toast('Cliente excluído.', 'warn');
    await refreshData();
    closeClientDetail();
  } catch (e) {
    toast(e.message || 'Erro ao excluir', 'error');
  }
}

/* Atalho: abrir modal de projeto já com o cliente atual pré-selecionado */
function openProjectModalForCurrentClient() {
  if (typeof openProjectModal === 'function') openProjectModal(null, currentClientId);
}

/* ─── AGENDA ────────────────────────────────────────────────────
   Planejamento semanal por usuário. Bloco = (userId, demandId, date,
   startMin, endMin). Grid renderizado como CSS Grid + blocos absolutos
   posicionados nas colunas de dia via `grid-column`. */
const AGENDA_DAY_START_MIN = 9 * 60;   // 09:00
const AGENDA_DAY_END_MIN   = 18 * 60;  // 18:00
const AGENDA_SLOT_MIN      = 15;       // 15min por linha (granularidade fina)
const AGENDA_SLOT_PX       = 22;       // px por slot — tabela alta o suficiente sem virar 2 telas
const AGENDA_LUNCH_MIN     = 12 * 60;  // 12:00–13:00 destacado
let agendaUserId = null;          // usuário filtrado (default = me)
let agendaWeekStart = null;       // segunda da semana atual visualizada
let agendaWeeks = 2;              // 1 ou 2 semanas lado a lado
let editingScheduleId = null;     // id do bloco sendo editado no modal
let _agendaDrag = null;           // estado interno de drag

function agendaWeekStartFor(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const dow = x.getDay(); // 0=dom, 1=seg...
  const diff = (dow === 0 ? -6 : 1 - dow);
  x.setDate(x.getDate() + diff);
  return x;
}
function agendaYmd(d) {
  return d.toISOString().slice(0, 10);
}
function agendaMinsToHHMM(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function agendaHHMMtoMins(s) {
  const [h, m] = (s || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function agendaInit() {
  if (!agendaUserId) agendaUserId = me?.id || null;
  if (!agendaWeekStart) agendaWeekStart = agendaWeekStartFor(new Date());
}
function agendaPrevWeek() {
  agendaWeekStart.setDate(agendaWeekStart.getDate() - 7);
  renderAgenda();
}
function agendaNextWeek() {
  agendaWeekStart.setDate(agendaWeekStart.getDate() + 7);
  renderAgenda();
}
function agendaThisWeek() {
  agendaWeekStart = agendaWeekStartFor(new Date());
  renderAgenda();
}
function setAgendaView(n) {
  agendaWeeks = n === 1 ? 1 : 2;
  document.querySelectorAll('.agenda-view-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.view) === agendaWeeks));
  renderAgenda();
}
function onAgendaUserChange() {
  agendaUserId = $('agenda-user').value || null;
  renderAgenda();
}

/* Lista de dias úteis (seg-sex) no período visualizado */
function agendaDays() {
  agendaInit();
  const days = [];
  const totalDays = 7 * agendaWeeks;
  const base = new Date(agendaWeekStart);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    days.push(d);
  }
  return days;
}

/* Layout das colunas: insere uma "coluna gap" entre semanas 1 e 2 na view de 2.
   Retorna {cols, gridTemplate, dayColsCount} — cada `col` tem
   { type:'day'|'gap', gridCol:number, day?:Date, dayIdx?:number }. */
function agendaColumnsLayout() {
  const days = agendaDays();
  const cols = [];
  const tmpl = ['60px']; // coluna de tempo (HORÁRIO)
  let gridCol = 2;
  days.forEach((d, i) => {
    // Antes do 6º dia (segunda da semana 2) insere a divisória
    if (agendaWeeks === 2 && i === 5) {
      cols.push({ type: 'gap', gridCol });
      tmpl.push('14px');
      gridCol++;
    }
    cols.push({ type: 'day', day: d, dayIdx: i, gridCol });
    tmpl.push('minmax(110px, 1fr)');
    gridCol++;
  });
  return { cols, gridTemplate: tmpl.join(' '), days };
}

function renderAgenda() {
  agendaInit();
  // Popula select de usuários (só na página standalone /agenda)
  const sel = $('agenda-user');
  if (sel) {
    const wsU = wsUsers().slice().sort((a,b) => norm(a.name).localeCompare(norm(b.name)));
    sel.innerHTML = wsU.map(u =>
      `<option value="${u.id}" ${u.id === agendaUserId ? 'selected' : ''}>${esc(u.name)}${u.id === me.id ? ' (você)' : ''}</option>`
    ).join('');
    if (!sel.value && wsU[0]) { agendaUserId = wsU[0].id; sel.value = agendaUserId; }
  }
  // Renderiza nos dois alvos possíveis — standalone (Agenda) e embed (Minhas Demandas)
  renderAgendaInto('agenda-grid-wrap', 'agenda-week-label', agendaUserId);
  renderAgendaInto('mine-agenda-grid-wrap', 'mine-agenda-week-label', me?.id || null);
}

function renderAgendaInto(wrapId, weekLabelId, userId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return; // página não montada nesse momento
  const days = agendaDays();
  const first = days[0], last = days[days.length - 1];
  const wkLabel = document.getElementById(weekLabelId);
  if (wkLabel && first && last) {
    const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    wkLabel.textContent = `${fmt(first)} → ${fmt(last)}`;
  }
  if (!userId) { wrap.innerHTML = '<div class="agenda-empty">Sem usuário pra exibir.</div>'; return; }
  buildAgendaGrid(wrap, userId, days);
}

function buildAgendaGrid(wrap, agendaUserIdLocal, days) {
  if (!agendaUserIdLocal) { wrap.innerHTML = '<div class="agenda-empty">Selecione um usuário pra ver a agenda.</div>'; return; }

  const slotsPerDay = Math.ceil((AGENDA_DAY_END_MIN - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN);
  const rows = slotsPerDay;
  const layout = agendaColumnsLayout();
  const dayCols = layout.cols.filter(c => c.type === 'day');

  const grid = document.createElement('div');
  grid.className = 'agenda-grid';
  grid.style.gridTemplateColumns = layout.gridTemplate;
  grid.style.gridTemplateRows = `auto repeat(${rows}, ${AGENDA_SLOT_PX}px)`;
  grid.style.width = '100%';
  // O grid carrega o userId alvo no dataset pra que handlers de drag/click
  // (que podem ser de qualquer instância: standalone OU embed em Minhas Demandas)
  // saibam pra quem agendar/editar — sem depender da variável global agendaUserId.
  grid.dataset.userId = agendaUserIdLocal;

  // Canto (0,0)
  const corner = document.createElement('div');
  corner.className = 'agenda-corner';
  corner.style.gridRow = '1 / 2';
  corner.style.gridColumn = '1 / 2';
  grid.appendChild(corner);

  const todayYmd = agendaYmd(new Date());
  // Headers da linha 1 — itera sobre todas as colunas (day + gap)
  layout.cols.forEach(c => {
    if (c.type === 'gap') {
      const gapHead = document.createElement('div');
      gapHead.className = 'agenda-cell is-day-header is-week-gap';
      gapHead.style.gridRow = '1 / 2';
      gapHead.style.gridColumn = `${c.gridCol} / ${c.gridCol + 1}`;
      grid.appendChild(gapHead);
      return;
    }
    const d = c.day;
    const head = document.createElement('div');
    head.className = 'agenda-cell is-day-header';
    if (agendaYmd(d) === todayYmd) head.classList.add('is-today');
    const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
    const dayDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const dayMin = schedules
      .filter(s => s.userId === agendaUserIdLocal && s.date === agendaYmd(d))
      .reduce((sum, s) => sum + (s.endMin - s.startMin), 0);
    const dayHours = dayMin / 60;
    const capacityH = 8;
    let capClass = '';
    if (dayHours > capacityH) capClass = 'over';
    else if (dayHours > capacityH * 0.85) capClass = 'high';
    const capLabel = `${dayHours.toFixed(1).replace('.', ',')}h / ${capacityH}h`;
    head.innerHTML = `<span>${esc(dayName)}</span><span class="day-date">${esc(dayDate)}</span><span class="day-cap ${capClass}">${esc(capLabel)}</span>`;
    head.style.gridRow = '1 / 2';
    head.style.gridColumn = `${c.gridCol} / ${c.gridCol + 1}`;
    grid.appendChild(head);
  });

  // Linhas de horário + células. Granularidade 15min, mas só o :00 mostra label.
  // Marcação fina: :30 ganha linha mais clara, demais ficam sutis.
  for (let r = 0; r < rows; r++) {
    const min = AGENDA_DAY_START_MIN + r * AGENDA_SLOT_MIN;
    const onHour = (min % 60) === 0;
    const onHalf = (min % 60) === 30;
    const t = document.createElement('div');
    t.className = 'agenda-cell is-time';
    if (onHour) t.textContent = agendaMinsToHHMM(min);
    t.style.gridRow = `${r + 2} / ${r + 3}`;
    t.style.gridColumn = '1 / 2';
    grid.appendChild(t);

    layout.cols.forEach(c => {
      const cell = document.createElement('div');
      cell.className = 'agenda-cell';
      if (c.type === 'gap') cell.classList.add('is-week-gap');
      if (onHour) cell.classList.add('is-hour'); else if (onHalf) cell.classList.add('is-half-hour');
      if (min >= AGENDA_LUNCH_MIN && min < AGENDA_LUNCH_MIN + 60) cell.classList.add('is-lunch');
      cell.style.gridRow = `${r + 2} / ${r + 3}`;
      cell.style.gridColumn = `${c.gridCol} / ${c.gridCol + 1}`;
      if (c.type === 'day') {
        cell.dataset.date = agendaYmd(c.day);
        cell.dataset.min = String(min);
        cell.addEventListener('mousedown', onAgendaCellMouseDown);
      }
      grid.appendChild(cell);
    });
  }

  // Blocos por cima — grid-column EXPLÍCITO (start / end) é obrigatório
  // pra item position:absolute respeitar a coluna. Sem isso, o item se
  // estende até o fim do grid.
  const userBlocks = schedules.filter(s => s.userId === agendaUserIdLocal);
  userBlocks.forEach(s => {
    const dayCol = dayCols.find(c => agendaYmd(c.day) === s.date);
    if (!dayCol) return;
    const startRow = Math.max(0, Math.floor((s.startMin - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN));
    const endRow = Math.min(rows, Math.ceil((s.endMin - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN));
    if (endRow <= startRow) return;
    const demand = demands.find(x => x.id === s.demandId);
    const project = demand ? projects.find(p => p.id === demand.projectId) : null;
    const client = project && project.clientId ? clients.find(c => c.id === project.clientId) : null;
    const color = project?.color || '#7A00FF';
    const block = document.createElement('div');
    block.className = 'agenda-block';
    block.dataset.scheduleId = s.id;
    block.style.gridRow = `${startRow + 2} / ${endRow + 2}`;
    block.style.gridColumn = `${dayCol.gridCol} / ${dayCol.gridCol + 1}`;
    block.style.background = color;
    const projName = project ? project.name : '';
    const clientName = client ? client.name : '';
    const demandName = demand ? demand.name : '(demanda removida)';
    const canEdit = !!(me && (me.isAdmin || s.userId === me.id));
    const actions = canEdit ? `
      <div class="agenda-block-actions">
        <button class="agenda-block-action" title="Editar" data-action="edit"><i data-lucide="pencil" class="ic-xs"></i></button>
        <button class="agenda-block-action danger" title="Excluir" data-action="delete"><i data-lucide="x" class="ic-xs"></i></button>
      </div>` : '';
    // Linha de cliente · projeto (ou só um deles se faltar)
    const meta = [clientName, projName].filter(Boolean).join(' · ');
    block.innerHTML = `
      ${actions}
      <div class="agenda-block-name">${esc(demandName)}</div>
      ${meta ? `<div class="agenda-block-project">${esc(meta)}</div>` : ''}
      ${canEdit ? '<div class="agenda-block-resize" data-resize="1"></div>' : ''}`;
    block.addEventListener('mousedown', (e) => {
      // Cliques nos botões de ação não disparam drag — tratados via click
      if (e.target.closest('[data-action]')) return;
      onAgendaBlockMouseDown(e, s, canEdit);
    });
    block.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        if (actionBtn.dataset.action === 'edit') openScheduleModal(s.id);
        else if (actionBtn.dataset.action === 'delete') confirmDeleteSchedule(s.id);
        return;
      }
      if (!_agendaDrag || !_agendaDrag.moved) {
        if (demand) showDetail(demand.id);
      }
    });
    grid.appendChild(block);
  });

  wrap.innerHTML = '';
  wrap.appendChild(grid);
  paintIcons();
}

async function confirmDeleteSchedule(id) {
  const ok = await showConfirm({
    title: 'Excluir bloco',
    message: 'Remover esse bloco da agenda?',
    okLabel: 'Excluir',
    danger: true
  });
  if (!ok) return;
  try {
    await api('/schedules/' + id, 'DELETE');
    schedules = await api('/schedules');
    renderAgenda();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteScheduleFromModal() {
  if (!editingScheduleId) return;
  try {
    await api('/schedules/' + editingScheduleId, 'DELETE');
    schedules = await api('/schedules');
    closeModal('schedule-modal');
    renderAgenda();
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Drag-to-create ──
   mousedown numa célula vazia, mousemove pinta ghost, mouseup abre modal. */
function onAgendaCellMouseDown(e) {
  if (e.button !== 0) return;
  const cell = e.currentTarget;
  const grid = cell.closest('.agenda-grid');
  const targetUserId = grid?.dataset.userId || agendaUserId;
  if (me && !me.isAdmin && targetUserId !== me.id) return;
  e.preventDefault();
  const date = cell.dataset.date;
  const startMin = Number(cell.dataset.min);
  _agendaDrag = { mode: 'create', date, startRow: startMin, endRow: startMin + AGENDA_SLOT_MIN, ghost: null, moved: false, targetUserId, grid };
  document.addEventListener('mousemove', onAgendaCreateMove);
  document.addEventListener('mouseup', onAgendaCreateUp, { once: true });
  const ghost = document.createElement('div');
  ghost.className = 'agenda-ghost';
  ghost.style.gridColumn = cell.style.gridColumn;
  ghost.style.gridRow = cell.style.gridRow;
  grid.appendChild(ghost);
  _agendaDrag.ghost = ghost;
  _agendaDrag.ghostCol = cell.style.gridColumn;
}
function onAgendaCreateMove(e) {
  if (!_agendaDrag || _agendaDrag.mode !== 'create') return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return;
  const cell = el.classList && el.classList.contains('agenda-cell') ? el : el.closest('.agenda-cell');
  if (!cell || !cell.dataset.min || cell.dataset.date !== _agendaDrag.date) return;
  _agendaDrag.moved = true;
  const cur = Number(cell.dataset.min) + AGENDA_SLOT_MIN;
  _agendaDrag.endRow = Math.max(_agendaDrag.startRow + AGENDA_SLOT_MIN, cur);
  const startRowIdx = Math.floor((_agendaDrag.startRow - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN) + 2;
  const endRowIdx = Math.ceil((_agendaDrag.endRow - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN) + 2;
  _agendaDrag.ghost.style.gridRow = `${startRowIdx} / ${endRowIdx}`;
}
function onAgendaCreateUp() {
  document.removeEventListener('mousemove', onAgendaCreateMove);
  if (_agendaDrag && _agendaDrag.ghost && _agendaDrag.ghost.parentNode) {
    _agendaDrag.ghost.parentNode.removeChild(_agendaDrag.ghost);
  }
  if (_agendaDrag) {
    openScheduleModal(null, { date: _agendaDrag.date, startMin: _agendaDrag.startRow, endMin: _agendaDrag.endRow, userId: _agendaDrag.targetUserId || agendaUserId });
  }
  _agendaDrag = null;
}

/* ── Drag-to-move + drag-to-resize ──
   mousedown num bloco existente → ou move (corpo) ou resize (borda inferior).
   Em move: ghost segue cursor e ancora em cell mais próxima.
   Em resize: ajusta só o endMin. */
function onAgendaBlockMouseDown(e, schedule, canEdit) {
  if (!canEdit) return;
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const isResize = !!(e.target.dataset && e.target.dataset.resize);
  const block = e.currentTarget;
  _agendaDrag = {
    mode: isResize ? 'resize' : 'move',
    scheduleId: schedule.id,
    origDate: schedule.date,
    origStart: schedule.startMin,
    origEnd: schedule.endMin,
    block,
    moved: false
  };
  block.classList.add('dragging');
  document.addEventListener('mousemove', onAgendaBlockMove);
  document.addEventListener('mouseup', onAgendaBlockUp, { once: true });
}
function onAgendaBlockMove(e) {
  if (!_agendaDrag) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return;
  const cell = el.classList && el.classList.contains('agenda-cell') ? el : el.closest('.agenda-cell');
  if (!cell || !cell.dataset.min || !cell.dataset.date) return; // ignora células de gap
  const min = Number(cell.dataset.min);
  if (_agendaDrag.mode === 'move') {
    const duration = _agendaDrag.origEnd - _agendaDrag.origStart;
    _agendaDrag.newDate = cell.dataset.date;
    _agendaDrag.newStart = min;
    _agendaDrag.newEnd = Math.min(AGENDA_DAY_END_MIN, min + duration);
    _agendaDrag.moved = true;
    // Preview no grid usando os mesmos grid-lines da célula alvo
    const startRowIdx = Math.floor((_agendaDrag.newStart - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN) + 2;
    const endRowIdx = Math.ceil((_agendaDrag.newEnd - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN) + 2;
    _agendaDrag.block.style.gridRow = `${startRowIdx} / ${endRowIdx}`;
    _agendaDrag.block.style.gridColumn = cell.style.gridColumn;
  } else { // resize
    const newEnd = Math.max(_agendaDrag.origStart + AGENDA_SLOT_MIN, min + AGENDA_SLOT_MIN);
    if (newEnd === _agendaDrag.newEnd) return;
    _agendaDrag.newEnd = Math.min(AGENDA_DAY_END_MIN, newEnd);
    _agendaDrag.moved = true;
    const startRowIdx = Math.floor((_agendaDrag.origStart - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN) + 2;
    const endRowIdx = Math.ceil((_agendaDrag.newEnd - AGENDA_DAY_START_MIN) / AGENDA_SLOT_MIN) + 2;
    _agendaDrag.block.style.gridRow = `${startRowIdx} / ${endRowIdx}`;
  }
}
async function onAgendaBlockUp() {
  document.removeEventListener('mousemove', onAgendaBlockMove);
  if (!_agendaDrag) return;
  const drag = _agendaDrag;
  drag.block.classList.remove('dragging');
  _agendaDrag = null;
  if (!drag.moved) return; // click puro, deixa o click handler abrir o detalhe
  const payload = {};
  if (drag.mode === 'move') {
    payload.date = drag.newDate;
    payload.startMin = drag.newStart;
    payload.endMin = drag.newEnd;
  } else {
    payload.endMin = drag.newEnd;
  }
  console.log('[agenda drag]', drag.mode, 'schedule:', drag.scheduleId, 'payload:', payload);
  try {
    await api('/schedules/' + drag.scheduleId, 'PUT', payload);
    schedules = await api('/schedules'); // refetch sempre — fonte da verdade é o backend
    renderAgenda();
  } catch (e) {
    console.error('[agenda drag] PUT falhou:', e);
    toast(e.message || 'Erro ao mover/redimensionar', 'error');
    renderAgenda();
  }
}

/* ── Modal de agendar/editar bloco ── */
let _schedulePresetUserId = null; // userId do contexto de criação
function openScheduleModal(id, preset) {
  editingScheduleId = id || null;
  _schedulePresetUserId = preset?.userId || null;
  const s = id ? schedules.find(x => x.id === id) : null;
  $('schedule-modal-title').textContent = s ? 'Editar bloco' : 'Agendar bloco';
  // Popula select de demandas — SÓ demandas atribuídas ao usuário selecionado,
  // ativas no workspace acessível. Em modo edição, mantém a demanda atual
  // mesmo que não esteja mais atribuída a esse user.
  const sel = $('sch-demand');
  const wsId = activeWs;
  const ownerUid = s ? s.userId : (preset?.userId || agendaUserId);
  let list = demands
    .filter(d => d.workspaceId === wsId)
    .filter(d => d.ownerId === ownerUid)
    .sort((a,b) => norm(a.name).localeCompare(norm(b.name)));
  // Se editando e a demanda atual não está mais no usuário, força ela na lista
  if (s && !list.some(d => d.id === s.demandId)) {
    const cur = demands.find(d => d.id === s.demandId);
    if (cur) list.unshift(cur);
  }
  const currentDemandId = s ? s.demandId : '';
  if (!list.length) {
    sel.innerHTML = '<option value="">— Esse usuário não tem demandas atribuídas —</option>';
  } else {
    sel.innerHTML = '<option value="">— Selecione uma demanda —</option>' + list.map(d => {
      const p = projects.find(pp => pp.id === d.projectId);
      const c = p && p.clientId ? clients.find(cc => cc.id === p.clientId) : null;
      const meta = [c?.name, p?.name].filter(Boolean).join(' · ');
      const lbl = meta ? `${d.name} — ${meta}` : d.name;
      return `<option value="${d.id}" ${d.id === currentDemandId ? 'selected' : ''}>${esc(lbl)}</option>`;
    }).join('');
  }
  const date = (s ? s.date : preset?.date) || agendaYmd(new Date());
  const startMin = s ? s.startMin : (preset?.startMin || AGENDA_DAY_START_MIN);
  const endMin = s ? s.endMin : (preset?.endMin || (startMin + 60));
  $('sch-date').value = date;
  $('sch-start').value = agendaMinsToHHMM(startMin);
  $('sch-end').value = agendaMinsToHHMM(endMin);
  // "Quando" texto amigável
  const userName = userById(s ? s.userId : (preset?.userId || agendaUserId))?.name || '—';
  $('sch-when').textContent = `Para ${userName}`;
  $('sch-delete-btn').style.display = s ? '' : 'none';
  openModal('schedule-modal');
}
async function saveSchedule() {
  const demandId = $('sch-demand').value;
  if (!demandId) { toast('Selecione uma demanda.', 'error'); return; }
  const date = $('sch-date').value;
  const startMin = agendaHHMMtoMins($('sch-start').value);
  const endMin = agendaHHMMtoMins($('sch-end').value);
  if (endMin <= startMin) { toast('Horário final precisa ser depois do início.', 'error'); return; }
  const payload = { demandId, date, startMin, endMin };
  // Pra criar (não-edição), respeita o usuário do contexto: o `_schedulePresetUserId`
  // é setado pelo openScheduleModal a partir do preset (drag em qualquer instância).
  if (!editingScheduleId) payload.userId = _schedulePresetUserId || agendaUserId;
  console.log('[saveSchedule] payload:', payload, 'editingId:', editingScheduleId);
  try {
    if (editingScheduleId) {
      await api('/schedules/' + editingScheduleId, 'PUT', payload);
    } else {
      await api('/schedules', 'POST', payload);
    }
    // Refetch do servidor — garante que o frontend mostra exatamente o que está
    // persistido (sem depender de splice/push manual no array local).
    schedules = await api('/schedules');
    closeModal('schedule-modal');
    renderAgenda();
  } catch (e) {
    console.error('[saveSchedule] falhou:', e);
    toast(e.message || 'Erro ao salvar', 'error');
  }
}

/* ─── REAL-TIME SYNC (Server-Sent Events) ───────────────────────
   EventSource conecta em /api/stream e recebe eventos sempre que
   outro usuário muda algo no workspace acessível. Cada evento dispara
   refetch da entidade afetada + re-render da página corrente.
   Reconexão automática é nativa do EventSource — só tratamos o
   fechamento explícito (logout).
   Debounce: várias mudanças em rajada (ex.: bulk) viram 1 refetch. */
let sseConnection = null;
let _sseRefetchPending = new Set();
let _sseRefetchTimer = null;

function startRealtimeSync() {
  if (sseConnection) return; // já conectado
  try {
    sseConnection = new EventSource('/api/stream');
    sseConnection.addEventListener('message', onSseMessage);
    sseConnection.addEventListener('error', () => {
      // Browser tenta reconectar sozinho. Só logamos pra debug.
      console.debug('[sse] error / reconnecting...');
    });
  } catch (e) {
    console.warn('[sse] não foi possível conectar:', e);
  }
}

function stopRealtimeSync() {
  if (!sseConnection) return;
  sseConnection.close();
  sseConnection = null;
}

function onSseMessage(ev) {
  let data; try { data = JSON.parse(ev.data); } catch { return; }
  if (!data || !data.entity) return;
  // Coalesce: várias mudanças em janela curta viram 1 refetch
  _sseRefetchPending.add(data.entity);
  clearTimeout(_sseRefetchTimer);
  _sseRefetchTimer = setTimeout(flushSseRefetch, 250);
}

async function flushSseRefetch() {
  const pending = [..._sseRefetchPending];
  _sseRefetchPending.clear();
  const tasks = [];
  for (const entity of pending) {
    if (entity === 'demand')   tasks.push(api('/demands').then(d => { demands = d; }).catch(()=>{}));
    if (entity === 'schedule') tasks.push(api('/schedules').then(s => { schedules = s; }).catch(()=>{}));
    if (entity === 'client')   tasks.push(api('/clients').then(c => { clients = c; }).catch(()=>{}));
    if (entity === 'project')  tasks.push(api('/projects').then(p => { projects = p; }).catch(()=>{}));
    if (entity === 'flow')     tasks.push(api('/flows').then(f => { flows = f; }).catch(()=>{}));
    if (entity === 'recurring') tasks.push(api('/recurrings').then(r => { recurrings = r; }).catch(()=>{}));
  }
  await Promise.all(tasks);
  // Re-render só o que afeta a página atual — barato e correto
  renderCurrent();
  // Se modal de detalhe da demanda está aberto, refresca também
  if (pending.includes('demand') && detailId && document.getElementById('detail-modal')?.classList.contains('open')) {
    refreshDetailDemand();
  }
}

/* ─── TOOLTIPS CUSTOMIZADOS ──────────────────────────────────
   Substitui o tooltip nativo do browser (que vem de title="") por uma camada
   estilizada com fade-in. Funciona pra QUALQUER elemento com title= no DOM,
   inclusive os adicionados dinamicamente. Suprime o nativo movendo o atributo
   pra data-ktip e removendo title em hover. */
(function setupCustomTooltips() {
  const tipEl = document.createElement('div');
  tipEl.className = 'k-tooltip';
  document.body.appendChild(tipEl);
  let showTimer = null;
  let activeTarget = null;

  function getTipText(el) {
    return el.getAttribute('data-ktip') || el.getAttribute('title') || '';
  }

  function positionTip(el) {
    const r = el.getBoundingClientRect();
    tipEl.style.left = (r.left + r.width / 2) + 'px';
    tipEl.style.top = r.top + 'px';
  }

  function showFor(el) {
    const text = getTipText(el);
    if (!text) return;
    // Move title pra data-ktip pra suprimir o nativo
    if (el.hasAttribute('title')) {
      el.setAttribute('data-ktip', el.getAttribute('title'));
      el.removeAttribute('title');
    }
    tipEl.textContent = text;
    positionTip(el);
    tipEl.classList.add('show');
  }
  function hide() {
    tipEl.classList.remove('show');
    activeTarget = null;
  }

  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[title], [data-ktip]');
    if (!t || t === activeTarget) return;
    // Ignora pickers complexos onde o título é parte da UX (ex.: nada por enquanto)
    activeTarget = t;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showFor(t), 280); // delay tipo macOS
  }, true);
  document.addEventListener('mouseout', (e) => {
    const t = e.target.closest('[title], [data-ktip]');
    if (!t) return;
    clearTimeout(showTimer);
    if (t === activeTarget) hide();
  }, true);
  document.addEventListener('scroll', () => { clearTimeout(showTimer); hide(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearTimeout(showTimer); hide(); } });
})();

/* ─── LOADING STATE EM BOTÕES ─────────────────────────────────
   Helper: chame com um event ou um button + asyncFn. Aplica .is-loading
   (CSS já tem regra com spinner) e disabled enquanto roda, restaura no fim. */
async function withLoading(eventOrBtn, asyncFn) {
  const btn = (eventOrBtn && eventOrBtn.currentTarget) || (eventOrBtn instanceof Element ? eventOrBtn : null);
  if (!btn) return asyncFn();
  btn.disabled = true;
  btn.classList.add('is-loading');
  try { return await asyncFn(); }
  finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

/* ─── WIZARD DA NOVA DEMANDA ─────────────────────────────────────
   4 steps: Cliente → Projeto → Fluxo → Form. Click 1x seleciona um card,
   click duplo avança. Footer mostra Voltar/Avançar (steps 1-3) ou
   Voltar/Salvar como template/Criar demanda (step 4). Editar pula direto
   pro step 4 com seleção pré-preenchida. */
let wizardState = { step: 1, clientId: null, projectId: null, flowId: null };
// Último fluxo cujos defaults (descrição + checklist) já foram aplicados no form.
// Permite re-aplicar quando o usuário troca de fluxo no wizard sem perder edições
// quando ele volta e re-seleciona o MESMO fluxo.
let wizardLastFlowApplied = null;

function wizardGoTo(n) {
  wizardState.step = n;
  // Mostra só o step ativo
  [1, 2, 3, 4].forEach(s => {
    const el = document.getElementById('dw-step-' + s);
    if (el) el.style.display = (s === n ? '' : 'none');
  });
  // Footer dinâmico
  const back = $('dw-back-btn');
  const next = $('dw-next-btn');
  const create = $('dw-create-btn');
  const tpl = $('save-as-template-btn');
  // Voltar: oculto no step 1 (na criação) e em modo edição (não tem wizard).
  if (back) back.style.display = (n > 1 && !editingId) ? '' : 'none';
  if (next) next.style.display = (n < 4) ? '' : 'none';
  if (create) create.style.display = (n === 4) ? '' : 'none';
  if (create) create.textContent = editingId ? 'Salvar Demanda' : 'Criar demanda';
  if (tpl) tpl.style.display = (n === 4) ? '' : 'none';
  // Render do step ativo
  if (n === 1) renderWizardClients();
  else if (n === 2) renderWizardProjects();
  else if (n === 3) renderWizardFlows();
  else if (n === 4) renderWizardStep4();
  updateWizardNextEnabled();
  paintIcons();
}

function wizardBack() {
  if (wizardState.step <= 1) return;
  wizardGoTo(wizardState.step - 1);
}
function wizardNext() {
  if (wizardState.step < 4) wizardGoTo(wizardState.step + 1);
}
function updateWizardNextEnabled() {
  const btn = $('dw-next-btn');
  if (!btn) return;
  let ok = false;
  if (wizardState.step === 1) ok = !!wizardState.clientId;
  else if (wizardState.step === 2) ok = !!wizardState.projectId;
  else if (wizardState.step === 3) ok = !!wizardState.flowId;
  btn.disabled = !ok;
}

/* Renderizadores dos 3 grids de seleção. Card click = seleciona; dblclick = avança. */
function _wizardCardHandlers(el, onSelect) {
  el.addEventListener('click', () => onSelect(false));
  el.addEventListener('dblclick', () => onSelect(true));
}

function renderWizardClients() {
  const wrap = $('dw-clients-grid');
  if (!wrap) return;
  const q = norm(($('dw-client-search')?.value || '').trim());
  const list = clients
    .filter(c => (me.isAdmin || (me.workspaces || []).includes(c.workspaceId)))
    .filter(c => c.active !== false)
    .filter(c => !q || norm(c.name).includes(q))
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  if (!list.length) {
    wrap.innerHTML = emptyState('Nenhum cliente cadastrado', 'Crie clientes em "Clientes" antes de criar uma demanda.', 'users');
    return;
  }
  wrap.innerHTML = '';
  list.forEach(c => {
    const card = document.createElement('div');
    card.className = 'wizard-card' + (wizardState.clientId === c.id ? ' is-selected' : '');
    const avatar = c.avatar
      ? `<div class="wizard-card-avatar" style="background-image:url('${c.avatar}');background-size:cover;background-position:center"></div>`
      : `<div class="wizard-card-avatar" style="background:${hexDim(c.color || '#7A00FF')};color:${c.color || '#7A00FF'}">${esc((c.name || 'C').charAt(0).toUpperCase())}</div>`;
    card.innerHTML = `${avatar}<div class="wizard-card-name">${esc(c.name)}</div>`;
    _wizardCardHandlers(card, (advance) => {
      wizardState.clientId = c.id;
      // Limpa downstream se mudou a seleção
      wizardState.projectId = null; wizardState.flowId = null;
      renderWizardClients();
      updateWizardNextEnabled();
      if (advance) wizardNext();
    });
    wrap.appendChild(card);
  });
}

function renderWizardProjects() {
  const wrap = $('dw-projects-grid');
  if (!wrap) return;
  const q = norm(($('dw-project-search')?.value || '').trim());
  const cid = wizardState.clientId;
  const list = projects
    .filter(p => p.clientId === cid && p.active !== false)
    .filter(p => !q || norm(p.name).includes(q))
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  if (!list.length) {
    wrap.innerHTML = emptyState('Nenhum projeto ativo', 'Esse cliente não tem projetos ativos. Crie um pelo painel do cliente.', 'inbox');
    return;
  }
  wrap.innerHTML = '';
  list.forEach(p => {
    const card = document.createElement('div');
    card.className = 'wizard-card' + (wizardState.projectId === p.id ? ' is-selected' : '');
    const avatar = p.avatar
      ? `<div class="wizard-card-avatar" style="background-image:url('${p.avatar}');background-size:cover;background-position:center"></div>`
      : `<div class="wizard-card-avatar" style="background:${hexDim(p.color || '#7A00FF')};color:${p.color || '#7A00FF'}">${esc((p.name || 'P').charAt(0).toUpperCase())}</div>`;
    card.innerHTML = `${avatar}<div class="wizard-card-name">${esc(p.name)}</div>`;
    _wizardCardHandlers(card, (advance) => {
      wizardState.projectId = p.id;
      wizardState.flowId = null;
      renderWizardProjects();
      updateWizardNextEnabled();
      if (advance) wizardNext();
    });
    wrap.appendChild(card);
  });
}

function renderWizardFlows() {
  const wrap = $('dw-flows-grid');
  if (!wrap) return;
  const q = norm(($('dw-flow-search')?.value || '').trim());
  const typeFilter = $('dw-flow-type')?.value || '';
  const pid = wizardState.projectId;
  const allFlows = flowsForProject(pid);
  // Popula filtro de tipo
  const types = [...new Set(allFlows.map(f => f.demandType).filter(Boolean))].sort();
  const tSel = $('dw-flow-type');
  if (tSel) {
    const cur = tSel.value;
    tSel.innerHTML = '<option value="">Todos os tipos</option>' + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    if (types.includes(cur)) tSel.value = cur;
  }
  const list = allFlows
    .filter(f => !typeFilter || f.demandType === typeFilter)
    .filter(f => !q || norm(f.name).includes(q))
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  if (!list.length) {
    wrap.innerHTML = emptyState('Nenhum fluxo disponível', 'Esse projeto não tem fluxos. Crie um pelo painel do cliente.', 'flow');
    return;
  }
  wrap.innerHTML = '';
  list.forEach(f => {
    const card = document.createElement('div');
    card.className = 'wizard-card' + (wizardState.flowId === f.id ? ' is-selected' : '');
    const iconHtml = f.icon
      ? `<div class="wizard-card-avatar" style="background-image:url('${f.icon}');background-size:cover;background-position:center"></div>`
      : `<div class="wizard-card-avatar wizard-card-avatar--icon"><i data-lucide="workflow" class="ic-sm"></i></div>`;
    const sub = f.demandType ? `<div class="wizard-card-sub">${esc(f.demandType)}</div>` : '';
    card.innerHTML = `${iconHtml}<div class="wizard-card-name">${esc(f.name)}</div>${sub}`;
    _wizardCardHandlers(card, (advance) => {
      wizardState.flowId = f.id;
      renderWizardFlows();
      updateWizardNextEnabled();
      if (advance) wizardNext();
    });
    wrap.appendChild(card);
  });
  paintIcons();
}

/* Step 4 — popula o form atual a partir do state do wizard. */
function renderWizardStep4() {
  const cid = wizardState.clientId;
  const pid = wizardState.projectId;
  const fid = wizardState.flowId;
  // Breadcrumb visual
  const c = cid ? clientById(cid) : null;
  const p = pid ? projectById(pid) : null;
  const f = fid ? flowById(fid) : null;
  const bc = $('dw-breadcrumb');
  if (bc) {
    bc.innerHTML = [c?.name, p?.name, f?.name].filter(Boolean).map(s => esc(s)).join(' <span style="opacity:.45">›</span> ');
  }
  // Sincroniza os selects ocultos (compat com o resto do código)
  if (pid) $('f-project').value = pid;
  // Trocou de fluxo desde a última aplicação? Reseta defaults (descrição + checklist)
  // para que o novo fluxo herde seus próprios valores em syncStatusOptions().
  // Só aplica em criação — edição mantém os campos da demanda existente.
  if (!editingId && fid && fid !== wizardLastFlowApplied) {
    $('f-description').value = '';
    demandChecklistDraft = [];
    renderDemandChecklist();
    wizardLastFlowApplied = fid;
  }
  // onDemandProjectChange popula f-flow options; se já tiver, força o nosso
  if (pid) {
    onDemandProjectChange();
    if (fid) {
      $('f-flow').value = fid;
      syncStatusOptions(editingId ? demandById(editingId)?.status : undefined);
    }
  }
  // Sincroniza responsável (se edição) — já feito pelo openEditDemand;
  // na criação, syncStatusOptions já chama buildUserSelect com auto-owner.
  if (!editingId) {
    // Foca o nome
    setTimeout(() => $('f-name').focus(), 60);
  }
}

/* ─── START ─── */
boot();
