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
let projects   = [];
let flows      = [];
let demands    = [];
let notifications = [];
let roles      = [];
let templates  = [];
let webhooks   = [];
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
  templates:    '/templates',
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
  if ((m = p.match(/^\/projects\/new$/)))                   return { page: 'projects',     modal: 'project', op: 'new' };
  if ((m = p.match(/^\/projects\/([^/]+)$/)))               return { page: 'projects',     modal: 'project', op: 'edit', id: m[1] };
  if ((m = p.match(/^\/flows\/new$/)))                      return { page: 'flows',        modal: 'flow',    op: 'new' };
  if ((m = p.match(/^\/flows\/([^/]+)$/)))                  return { page: 'flows',        modal: 'flow',    op: 'edit', id: m[1] };
  if ((m = p.match(/^\/users\/new$/)))                      return { page: 'users',        modal: 'user',    op: 'new' };
  if ((m = p.match(/^\/users\/([^/]+)$/)))                  return { page: 'users',        modal: 'user',    op: 'edit', id: m[1] };
  if ((m = p.match(/^\/integrations\/webhooks\/new$/)))     return { page: 'integrations', modal: 'webhook', op: 'new' };
  if ((m = p.match(/^\/integrations\/webhooks\/([^/]+)$/))) return { page: 'integrations', modal: 'webhook', op: 'edit', id: m[1] };
  return { page: 'dashboard' };
}
function applyRoute() {
  let r = parseRoute(location.pathname);
  // Bloqueia rotas admin-only para não-admins, redirecionando pro dashboard.
  const adminOnly = ['flows', 'users', 'workspaces', 'integrations'];
  if (adminOnly.includes(r.page) && me && !me.isAdmin) {
    history.replaceState(null, '', '/dashboard' + location.search);
    r = { page: 'dashboard' };
  }
  _routerSilent = true;
  try {
    // 1) Página — se já estamos nela (boot inicial), força renderCurrent
    //    pra preencher os skeletons. Sem isso, dashboard fica em loading
    //    eterno até o usuário navegar e voltar.
    if (currentPage !== r.page) goPage(r.page);
    else renderCurrent();
    // 2) Fecha qualquer modal roteado aberto (modais transitórios como
    //    confirm/prompt/picker/cmdk ficam intactos).
    const ROUTED = ['detail-modal','demand-modal','project-modal','flow-modal','user-modal','webhook-modal'];
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
    } else if (r.modal === 'project') {
      if (typeof openProjectModal === 'function') openProjectModal(r.op === 'edit' ? r.id : null);
    } else if (r.modal === 'flow') {
      if (typeof openFlowModal === 'function') openFlowModal(r.op === 'edit' ? r.id : null);
    } else if (r.modal === 'user') {
      if (typeof openUserModal === 'function') openUserModal(r.op === 'edit' ? r.id : null);
    } else if (r.modal === 'webhook') {
      if (typeof openWebhookModal === 'function') openWebhookModal(r.op === 'edit' ? r.id : null);
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
function wsFlows()    { return flows.filter(f => f.workspaceId === activeWs); }
function wsDemands()  { return demands.filter(d => d.workspaceId === activeWs); }
function wsUsers()    { return users.filter(u => u.active !== false && (u.isAdmin || (u.workspaces || []).includes(activeWs))); }

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
const _avatarGradientCache = new Map();
function avatarGradient(seed) {
  const key = String(seed);
  const cached = _avatarGradientCache.get(key);
  if (cached) return cached;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 30 + (h >> 8) % 25) % 360;
  const result = `linear-gradient(135deg, hsl(${hue1} 62% 50%), hsl(${hue2} 68% 42%))`;
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
  paintIcons();
}
function pickFilterCdrop(selId, value) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  // Fecha qualquer dropdown aberto
  document.querySelectorAll('.filter-cdrop.open').forEach(el => el.classList.remove('open'));
  // Garante que a opção exista no select (cria se necessário, para valores dinâmicos)
  if (![...sel.options].some(o => o.value === value)) {
    const opt = document.createElement('option');
    opt.value = value;
    sel.add(opt);
  }
  sel.value = value;
  // Dispara o handler de change de forma confiável.
  // Tenta o onchange inline primeiro; se não houver, faz dispatch.
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
const EMPTY_ICONS = {
  default: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="22" width="68" height="56" rx="6"/>
    <path d="M14 38h68"/>
    <circle cx="22" cy="30" r="1.5" fill="currentColor"/>
    <circle cx="28" cy="30" r="1.5" fill="currentColor"/>
    <path d="M30 52h36M30 60h24" opacity=".55"/>
  </svg>`,
  inbox: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 22h64l-8 32H24z"/>
    <path d="M16 54v18a4 4 0 004 4h56a4 4 0 004-4V54"/>
    <path d="M28 54h12a8 8 0 0016 0h12"/>
  </svg>`,
  search: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="42" cy="42" r="22"/>
    <path d="M58 58l16 16"/>
    <path d="M34 42h16M42 34v16" opacity=".4"/>
  </svg>`,
  calendar: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="22" width="68" height="60" rx="6"/>
    <path d="M14 38h68"/>
    <path d="M30 14v14M66 14v14"/>
    <circle cx="32" cy="52" r="2" fill="currentColor"/>
    <circle cx="48" cy="52" r="2" fill="currentColor"/>
    <circle cx="64" cy="52" r="2" fill="currentColor"/>
    <circle cx="32" cy="66" r="2" fill="currentColor" opacity=".5"/>
    <circle cx="48" cy="66" r="2" fill="currentColor" opacity=".5"/>
  </svg>`,
  comments: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 28a6 6 0 016-6h44a6 6 0 016 6v26a6 6 0 01-6 6H40l-14 12V60h-4a6 6 0 01-6-6z"/>
    <path d="M30 38h28M30 46h20" opacity=".55"/>
  </svg>`,
  users: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="38" cy="36" r="12"/>
    <path d="M16 76c2-12 11-18 22-18s20 6 22 18"/>
    <circle cx="68" cy="32" r="8" opacity=".55"/>
    <path d="M62 50c10 1 16 7 18 16" opacity=".55"/>
  </svg>`,
  flow: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="20" cy="48" r="6"/>
    <circle cx="48" cy="22" r="6"/>
    <circle cx="48" cy="74" r="6"/>
    <circle cx="76" cy="48" r="6"/>
    <path d="M26 46l16-20M26 50l16 20M54 22h2c10 0 20 6 20 26M54 74h2c10 0 20-6 20-26"/>
  </svg>`,
  webhook: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="48" cy="32" r="10"/>
    <circle cx="28" cy="64" r="10"/>
    <circle cx="68" cy="64" r="10"/>
    <path d="M44 40l-12 16M52 40l12 16M36 64h24"/>
  </svg>`,
  kanban: `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="18" width="20" height="60" rx="4"/>
    <rect x="38" y="18" width="20" height="42" rx="4"/>
    <rect x="62" y="18" width="20" height="52" rx="4"/>
    <path d="M20 28h8M20 38h6M44 28h8M68 28h8M68 38h8" opacity=".55"/>
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
  if (me && me.isAdmin) {
    acts.push({ icon: 'users',  label: 'Ir para Usuários',     kind: 'Navegar', run: () => goPage('users') });
    acts.push({ icon: 'webhook',label: 'Ir para Integrações',  kind: 'Navegar', run: () => goPage('integrations') });
  }
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
    if (me && me.isAdmin) {
      usrs = (typeof wsUsers === 'function' ? wsUsers() : [])
        .filter(u => (u.name && u.name.toLowerCase().includes(q)) || (u.username && u.username.toLowerCase().includes(q)))
        .slice(0, 5)
        .map(u => ({
          icon: 'user',
          label: u.name,
          kind: 'Usuário',
          sub: u.role || u.username || '',
          run: () => openUserModal(u.id)
        }));
    }
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
const ROUTED_MODAL_IDS = ['detail-modal','demand-modal','project-modal','flow-modal','user-modal','webhook-modal'];
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
  }, opts || {});
  $('confirm-title').textContent = o.title;
  $('confirm-message').innerHTML = o.message;
  const okBtn = $('confirm-ok-btn');
  okBtn.textContent = o.okLabel;
  okBtn.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
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
  paintIcons();
}

async function loadAll() {
  const promises = [
    api('/workspaces'), api('/users'), api('/projects'), api('/flows'), api('/demands'), api('/roles'), api('/templates')
  ];
  // Webhooks só para admin
  if (me?.isAdmin) promises.push(api('/webhooks'));
  const results = await Promise.all(promises);
  [workspaces, users, projects, flows, demands, roles, templates] = results;
  webhooks = me?.isAdmin ? (results[7] || []) : [];
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
  $('nav-flows').style.display = me.isAdmin ? '' : 'none';
  $('nav-workspaces').style.display = me.isAdmin ? '' : 'none';
  $('nav-users').style.display = me.isAdmin ? '' : 'none';
  $('nav-integrations').style.display = me.isAdmin ? '' : 'none';
}

const PAGE_TITLES = {
  dashboard: 'Dashboard', list: 'Demandas', mine: 'Minhas Demandas',
  projects: 'Projetos', flows: 'Fluxos de Demanda', workspaces: 'Workspaces',
  users: 'Usuários', profile: 'Meu Perfil'
};
function goPage(page) {
  if ((page === 'flows' || page === 'users' || page === 'workspaces' || page === 'integrations') && !me.isAdmin) return;
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
    case 'templates':  renderTemplates(); break;
    case 'integrations': renderIntegrations(); break;
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

  $('dash-chart').innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="dash-chart-svg" preserveAspectRatio="xMidYMid meet">
      ${yEls}
      ${pathParts}
      ${xLabels}
    </svg>`;
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
    $('list-table-body').innerHTML = `<tr><td colspan="10">${emptyState('Nenhuma demanda encontrada', 'Ajuste a busca ou os filtros para encontrar o que procura.', 'search')}</td></tr>`;
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
      <td class="${isLate(d) ? 'deadline-late' : ''}">${fmtDate(effDue(d))}</td>
    </tr>`).join('')
    : `<tr><td colspan="4">${emptyState('Nenhuma demanda encontrada', 'Você não tem demandas neste filtro.', 'inbox')}</td></tr>`;
  // O calendário fica sempre visível abaixo da tabela em "Minhas Demandas" —
  // re-renderiza junto pra refletir o filtro escolhido imediatamente.
  if ($('cal-mine-body')) renderCalendar('mine');
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
    const estimatedLoad = userDemands.reduce((s, d) => s + (Number(d.estimatedHours) > 0 ? Number(d.estimatedHours) : 4), 0);
    // Preenchimento da barra: horas apontadas no período / capacidade do período
    const pct = capacityHours > 0 ? Math.min(150, Math.round(hoursLogged / capacityHours * 100)) : 0;
    const status = pct >= 100 ? 'overload' : pct >= 75 ? 'high' : pct >= 40 ? 'medium' : 'low';
    return { u, userDemands, inPeriod, lateCount, hoursLogged, estimatedLoad, pct, status };
  }).sort((a, b) => {
    // 1º critério: horas apontadas (decrescente) — quem mais trabalhou no topo
    if (b.hoursLogged !== a.hoursLogged) return b.hoursLogged - a.hoursLogged;
    // 2º critério: nome do usuário em ordem alfabética (A-Z)
    return norm(a.u.name).localeCompare(norm(b.u.name));
  });

  $('capacity-list').innerHTML = `
    <div class="capacity-summary">
      <div class="capacity-summary-item"><div class="capacity-summary-label">Capacidade no período</div><div class="capacity-summary-value">${capacityHours}h</div><div class="capacity-summary-sub">${businessDays} dias úteis × 8h</div></div>
      <div class="capacity-summary-item"><div class="capacity-summary-label">Demandas em aberto</div><div class="capacity-summary-value">${wsdemands.length}</div><div class="capacity-summary-sub">no workspace ${esc(wsById(activeWs)?.name || '')}</div></div>
      <div class="capacity-summary-item"><div class="capacity-summary-label">Pessoas ativas</div><div class="capacity-summary-value">${wsusers.length}</div><div class="capacity-summary-sub">com acesso ao workspace</div></div>
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
      hours: 0, demands: new Set(), users: new Set(), entries: 0
    };
    cur.hours += Number(e.hours) || 0;
    cur.demands.add(d.id);
    if (e.userId) cur.users.add(e.userId);
    cur.entries++;
    if (kind === 'client') cur.projects = projects;
    groups.set(key, cur);
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
function flowsForProject(projectId) {
  const exclusive = wsFlows().filter(f => f.projectId === projectId);
  if (exclusive.length) return exclusive;
  return wsFlows().filter(f => !f.projectId); // fluxos gerais do workspace
}
function onDemandProjectChange() {
  const pid = $('f-project').value;
  const fl = pid ? flowsForProject(pid) : wsFlows();
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
  $('modal-title').textContent = 'Nova Demanda';
  $('demand-delete-btn').style.display = 'none';
  $('save-as-template-btn').style.display = '';
  fillDemandSelectors(null);
  fillTemplateSelector();
  $('f-template').value = '';
  $('f-name').value = ''; $('f-description').value = '';
  $('f-briefing').value = ''; $('f-deadline').value = '';
  $('f-estimated').value = ''; $('f-priority').value = '3';
  $('f-rec-enabled').checked = false; $('f-rec-config').style.display = 'none';
  $('f-rec-pattern').value = 'weekly'; $('f-rec-weekday').value = '1'; $('f-rec-end').value = '';
  $('f-project').value = '';
  demandAttachments = [];
  refreshFormAttList('f-attachments-list');
  onDemandProjectChange();
  openModal('demand-modal');
  navPush('/demands/new');
  setTimeout(() => {
    $('f-name').focus();
    setupDragDrop('#demand-modal .modal-content', 'f-attachments-list', processDroppedFiles);
  }, 60);
}
function openEditDemand(id) {
  const d = demands.find(x => x.id === id); if (!d) return;
  editingId = id;
  $('modal-title').textContent = 'Editar Demanda';
  $('demand-delete-btn').style.display = '';
  $('save-as-template-btn').style.display = '';
  fillDemandSelectors(d);
  fillTemplateSelector();
  $('f-template-group').style.display = 'none';
  $('f-name').value = d.name;
  $('f-description').value = d.description || '';
  $('f-briefing').value = d.briefing || '';
  $('f-deadline').value = d.deadline || '';
  $('f-estimated').value = d.estimatedHours || '';
  $('f-priority').value = d.priority || 3;
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
  openModal('demand-modal');
  navPush('/demands/' + id + '/edit');
  setTimeout(() => setupDragDrop('#demand-modal .modal-content', 'f-attachments-list', processDroppedFiles), 60);
}
async function saveDemand() {
  const recEnabled = $('f-rec-enabled').checked;
  const payload = {
    name: $('f-name').value,
    description: $('f-description').value,
    projectId: $('f-project').value,
    flowId: $('f-flow').value,
    briefing: normalizeUrl($('f-briefing').value),
    deadline: $('f-deadline').value || null,
    estimatedHours: $('f-estimated').value ? Number($('f-estimated').value) : null,
    priority: Number($('f-priority').value) || 3,
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
  try {
    let result;
    if (editingId) result = await api('/demands/' + editingId, 'PUT', payload);
    else result = await api('/demands', 'POST', payload);
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
  } catch (e) { toast(e.message, 'error'); }
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
  _detailPollTimer = setInterval(refreshDetailDemand, 15000);
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
  bar.style.cssText = 'position:sticky;top:80px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:50%;padding:10px 14px;display:flex;align-items:center;gap:12px;margin-bottom:18px;font-size:12px;color:var(--accent-text);font-weight:600;z-index:1';
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
  const preview = $('p-avatar-preview');
  const c = $('p-color').value || '#7A00FF';
  const letter = ($('p-name').value || 'P').charAt(0).toUpperCase();
  preview.innerHTML = '';
  preview.style.background = hexDim(c);
  preview.style.color = c;
  preview.textContent = letter;
  $('p-avatar-remove').style.display = 'none';
}
function handleProjectAvatar(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const img = new Image();
  img.onload = () => {
    const s = 160;
    const canvas = document.createElement('canvas');
    canvas.width = s; canvas.height = s;
    const min = Math.min(img.width, img.height);
    const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
    canvas.getContext('2d').drawImage(img, sx, sy, min, min, 0, 0, s, s);
    projAvatarData = canvas.toDataURL('image/jpeg', 0.85);
    $('p-avatar-preview').innerHTML = `<img src="${projAvatarData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    $('p-avatar-remove').style.display = '';
  };
  img.src = URL.createObjectURL(file);
  ev.target.value = '';
}
function openProjectModal(id) {
  editingProjectId = id || null;
  $('project-modal-title').textContent = id ? 'Editar Projeto' : 'Novo Projeto';
  const p = id ? projectById(id) : null;
  $('p-name').value = p?.name || '';
  $('p-client').value = p?.client || '';
  $('p-color').value = p?.color || '#7A00FF';
  $('p-active').checked = p ? p.active !== false : true;
  projAvatarData = p?.avatar || null;
  const preview = $('p-avatar-preview');
  if (projAvatarData) {
    preview.innerHTML = `<img src="${projAvatarData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    const c = p?.color || '#7A00FF';
    const letter = (p?.name || 'P').charAt(0).toUpperCase();
    preview.innerHTML = '';
    preview.style.background = hexDim(c);
    preview.style.color = c;
    preview.textContent = letter;
  }
  $('p-avatar-remove').style.display = projAvatarData ? '' : 'none';
  $('p-workspace').innerHTML = workspaces.map(w =>
    `<option value="${w.id}" ${(p ? p.workspaceId : activeWs) === w.id ? 'selected' : ''}>${esc(w.name)}</option>`
  ).join('');
  renderClientCombo(); // popula o dropdown rico (substitui o datalist nativo)
  openModal('project-modal');
  navPush(id ? '/projects/' + id : '/projects/new');
}

/* ─── COMBOBOX DE CLIENTE NO MODAL DE PROJETO ───
   Híbrido: o usuário pode digitar um cliente NOVO (vira valor livre) OU
   abrir o dropdown e escolher um existente. Cada opção mostra a "cara" dos
   projetos vinculados àquele cliente — avatar/cor + nomes dos projetos.
   Pattern análogo ao Linear/Stripe — input livre + autocomplete rico. */
let _clientComboIdx = -1;
let _clientComboList = [];

/* Agrupa projetos por cliente. Retorna lista ordenada A-Z com metadados. */
function clientGroups() {
  const groups = new Map();
  for (const p of projects) {
    if (!p.client) continue;
    if (!groups.has(p.client)) groups.set(p.client, { name: p.client, projects: [] });
    groups.get(p.client).projects.push(p);
  }
  return [...groups.values()].sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
}

function renderClientCombo() {
  const menu = $('p-client-menu');
  if (!menu) return;
  const q = norm(($('p-client').value || '').trim());
  const all = clientGroups();
  const filtered = q ? all.filter(g => norm(g.name).includes(q)) : all;
  _clientComboList = filtered;
  _clientComboIdx = -1;
  if (!filtered.length) {
    menu.innerHTML = q
      ? `<div class="combobox-empty">Nenhum cliente existente casa. <strong>Enter</strong> usa "${esc(q)}" como novo.</div>`
      : `<div class="combobox-empty">Nenhum cliente cadastrado ainda. Digite acima pra criar.</div>`;
    return;
  }
  menu.innerHTML = filtered.map((g, i) => {
    return `<div class="combobox-item" data-i="${i}" onmouseenter="setClientComboActive(${i})" onclick="pickClient('${esc(g.name).replace(/'/g,"\\'")}')">
      <div class="combobox-item-name">${esc(g.name)}</div>
    </div>`;
  }).join('');
  paintIcons();
}

function openClientDropdown() {
  const combo = $('p-client-combo');
  if (!combo) return;
  renderClientCombo();
  combo.classList.add('open');
}
function closeClientDropdown() {
  const combo = $('p-client-combo');
  if (combo) combo.classList.remove('open');
}
function toggleClientDropdown() {
  const combo = $('p-client-combo');
  if (combo.classList.contains('open')) closeClientDropdown();
  else { $('p-client').focus(); openClientDropdown(); }
}
function onClientInput() {
  renderClientCombo();
  $('p-client-combo').classList.add('open');
}
function onClientKey(e) {
  const combo = $('p-client-combo');
  const isOpen = combo && combo.classList.contains('open');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!isOpen) { openClientDropdown(); return; }
    _clientComboIdx = Math.min(_clientComboList.length - 1, _clientComboIdx + 1);
    paintClientComboActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _clientComboIdx = Math.max(-1, _clientComboIdx - 1);
    paintClientComboActive();
  } else if (e.key === 'Enter') {
    if (isOpen && _clientComboIdx >= 0 && _clientComboList[_clientComboIdx]) {
      e.preventDefault();
      pickClient(_clientComboList[_clientComboIdx].name);
    } else {
      // Deixa o Enter natural — usuário tá criando cliente novo via texto livre
      closeClientDropdown();
    }
  } else if (e.key === 'Escape') {
    if (isOpen) { e.preventDefault(); closeClientDropdown(); }
  }
}
function setClientComboActive(i) {
  _clientComboIdx = i;
  paintClientComboActive();
}
function paintClientComboActive() {
  const items = document.querySelectorAll('#p-client-menu .combobox-item');
  items.forEach((it, i) => it.classList.toggle('active', i === _clientComboIdx));
  const act = items[_clientComboIdx];
  if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
}
function pickClient(name) {
  $('p-client').value = name;
  closeClientDropdown();
  $('p-client').focus();
}

/* Fecha o combobox ao clicar fora */
document.addEventListener('click', (e) => {
  const combo = document.getElementById('p-client-combo');
  if (!combo || !combo.classList.contains('open')) return;
  if (!combo.contains(e.target)) closeClientDropdown();
});
async function saveProject() {
  const payload = {
    name: $('p-name').value, client: $('p-client').value,
    color: $('p-color').value, active: $('p-active').checked,
    workspaceId: $('p-workspace').value,
    avatar: projAvatarData
  };
  try {
    if (editingProjectId) await api('/projects/' + editingProjectId, 'PUT', payload);
    else await api('/projects', 'POST', payload);
    closeModal('project-modal');
    toast(editingProjectId ? 'Projeto atualizado!' : 'Projeto criado!');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}
async function duplicateProject(id) {
  try {
    await api('/projects/' + id + '/duplicate', 'POST', {});
    toast('Projeto duplicado! Os fluxos exclusivos foram copiados junto.');
    await refreshData();
  } catch (e) { toast(e.message, 'error'); }
}

/* ─── FLUXOS (admin) ─── */
function renderFlows() {
  const allF = wsFlows();
  // Populate filters
  const projList = wsProjects().filter(p => p.active !== false)
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const fpSel = $('flow-f-project');
  const fpPrev = fpSel.value;
  fpSel.innerHTML = '<option value="">Todos os projetos</option>' + projList.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if ([...fpSel.options].some(o => o.value === fpPrev)) fpSel.value = fpPrev;
  const types = [...new Set(allF.map(f => f.demandType).filter(Boolean))].sort((a, b) => norm(a).localeCompare(norm(b)));
  const ftSel = $('flow-f-type');
  const ftPrev = ftSel.value;
  ftSel.innerHTML = '<option value="">Todos os tipos</option>' + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  if ([...ftSel.options].some(o => o.value === ftPrev)) ftSel.value = ftPrev;

  applyFilterDropdown('flow-f-project', { projectIcon: true });
  applyFilterDropdown('flow-f-type');

  // Filter
  const q = norm($('flow-search').value);
  const fp = $('flow-f-project').value;
  const ft = $('flow-f-type').value;
  let list = allF.filter(f => {
    if (q && !norm(f.name).includes(q)) return false;
    if (fp && f.projectId !== fp) return false;
    if (ft && f.demandType !== ft) return false;
    return true;
  });

  // Sort
  list.sort((a, b) => {
    let va, vb;
    if (flowSortKey === 'name')     { va = norm(a.name); vb = norm(b.name); }
    else if (flowSortKey === 'project') {
      const pa = a.projectId ? projectById(a.projectId)?.name || '' : '';
      const pb = b.projectId ? projectById(b.projectId)?.name || '' : '';
      va = norm(pa); vb = norm(pb);
    }
    else if (flowSortKey === 'type')    { va = norm(a.demandType || ''); vb = norm(b.demandType || ''); }
    else if (flowSortKey === 'demands') { va = demands.filter(d => d.flowId === a.id).length; vb = demands.filter(d => d.flowId === b.id).length; }
    else { va = norm(a.name); vb = norm(b.name); }
    return (va < vb ? -1 : va > vb ? 1 : 0) * flowSortDir;
  });

  $('flows-table-body').innerHTML = list.length ? list.map(f => {
    const count = demands.filter(d => d.flowId === f.id).length;
    const proj = f.projectId ? projectById(f.projectId) : null;
    return `<tr class="row-hover-actions">
      <td style="font-weight:600">${esc(f.name)}</td>
      <td>${proj ? esc(proj.name) : '<span style="color:var(--text-muted)">Geral</span>'}</td>
      <td>${esc(f.demandType || '—')}</td>
      <td>${count}</td>
      <td>
        <div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openFlowModal('${f.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          <button class="detail-icon-btn" title="Duplicar" onclick="openDuplicateFlow('${f.id}')"><i data-lucide="copy" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="deleteFlow('${f.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="5">${emptyState('Nenhum fluxo encontrado', 'Ajuste os filtros ou crie um novo fluxo.', 'flow')}</td></tr>`;
}
function sortFlowsBy(key) {
  if (flowSortKey === key) flowSortDir *= -1;
  else { flowSortKey = key; flowSortDir = 1; }
  renderFlows();
}

/* Editor de fluxo com etapas arrastáveis */
let stageRows = [];
let dragIdx = null;

let flowModalDirty = false;
function openFlowModal(id) {
  editingFlowId = id || null;
  flowModalDirty = false;
  $('flow-modal-title').textContent = id ? 'Editar Fluxo' : 'Novo Fluxo';
  const f = id ? flowById(id) : null;
  $('fl-name').value = f?.name || '';
  $('fl-type').value = f?.demandType || '';
  $('flowtypes-datalist').innerHTML = [...new Set(flows.map(x => x.demandType).filter(Boolean))]
    .map(t => `<option value="${esc(t)}">`).join('');
  $('fl-project').innerHTML = '<option value="">— Geral (todos os projetos do workspace) —</option>' +
    wsProjects().slice().sort((a,b) => norm(a.name).localeCompare(norm(b.name))).map(p => `<option value="${p.id}" ${f && f.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  stageRows = f
    ? f.stages.map(s => ({ ...s }))
    : [
        { id: null, label: 'Backlog',   color: '#64748B', done: false, responsibleId: null, deadlineDays: null },
        { id: null, label: 'Execução',  color: '#7A00FF', done: false, responsibleId: null, deadlineDays: 3 },
        { id: null, label: 'Concluída', color: '#22D3A5', done: true,  responsibleId: null, deadlineDays: null }
      ];
  renderStageRows();
  openModal('flow-modal');
  navPush(id ? '/flows/' + id : '/flows/new');
}

function renderStageRows() {
  const sortedUsers = wsUsers().slice().sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const respOpts = uid => '<option value="">— Sem responsável —</option>' +
    sortedUsers.map(u => `<option value="${u.id}" ${uid === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  $('stage-list').innerHTML = stageRows.map((s, i) => `
    <div class="stage-row" draggable="true" data-idx="${i}"
         ondragstart="stageDragStart(event,${i})" ondragover="stageDragOver(event,${i})"
         ondragleave="stageDragLeave(event)" ondrop="stageDrop(event,${i})" ondragend="stageDragEnd()">
      <div class="stage-grip" title="Arraste para reordenar"><i data-lucide="grip-vertical" class="ic-sm"></i></div>
      <input type="color" class="stage-color" value="${s.color}" oninput="stageRows[${i}].color=this.value">
      <input class="form-control" value="${esc(s.label)}" placeholder="Nome da etapa" oninput="stageRows[${i}].label=this.value">
      <select id="stage-resp-${i}" class="form-control stage-resp" title="Responsável padrão da etapa" onchange="stageRows[${i}].responsibleId=this.value||null">${respOpts(s.responsibleId)}</select>
      <div class="stage-days-wrap"><span class="stage-mini-label">Prazo (dias)</span><input class="form-control" type="number" min="1" placeholder="—" value="${s.deadlineDays || ''}" oninput="stageRows[${i}].deadlineDays=this.value?Number(this.value):null"></div>
      <label class="stage-done-toggle"><input type="checkbox" ${s.done ? 'checked' : ''} onchange="stageRows[${i}].done=this.checked"> Conclui</label>
      <div class="stage-actions">
        <button class="icon-btn danger" title="Remover etapa" onclick="removeStageRow(${i})"><i data-lucide="x" class="ic-sm"></i></button>
      </div>
    </div>`).join('');
  // Aplica dropdown customizado com avatar no select de responsável de cada etapa
  stageRows.forEach((_, i) => applyFilterDropdown(`stage-resp-${i}`, { userIcon: true }));
  paintIcons();
}
function addStageRow() {
  stageRows.push({ id: null, label: '', color: '#7A00FF', done: false, responsibleId: null, deadlineDays: null });
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
  const payload = {
    name: $('fl-name').value,
    demandType: $('fl-type').value,
    projectId: $('fl-project').value || null,
    workspaceId: activeWs,
    stages: stageRows
  };
  try {
    if (editingFlowId) await api('/flows/' + editingFlowId, 'PUT', payload);
    else await api('/flows', 'POST', payload);
    closeModal('flow-modal');
    flowModalDirty = false;
    toast(editingFlowId ? 'Fluxo atualizado!' : 'Fluxo criado!');
    await refreshData();
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
    return `<tr class="row-hover-actions">
      <td><span class="pill" style="color:${w.color || '#7A00FF'};background:${hexDim(w.color)}"><span class="pill-dot" style="background:${w.color || '#7A00FF'}"></span>${esc(w.name)}</span></td>
      <td>${nProj}</td>
      <td>${nUsers}</td>
      <td>
        <div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openWsModal('${w.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="deleteWs('${w.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>
      </td>
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
  $('ws-color').value = w?.color || '#7A00FF';
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
      <td>
        <div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openUserModal('${u.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          ${u.id !== me.id ? (u.active !== false
            ? `<button class="detail-icon-btn danger" title="Desativar" onclick="toggleUser('${u.id}')"><i data-lucide="user-x" class="ic-sm"></i></button>`
            : `<button class="detail-icon-btn" title="Reativar" onclick="toggleUser('${u.id}')"><i data-lucide="user-check" class="ic-sm"></i></button>`
          ) : ''}
        </div>
      </td>
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
    return `<tr class="row-hover-actions">
      <td><strong>${esc(r.name)}</strong></td>
      <td>${count} ${count === 1 ? 'usuário' : 'usuários'}</td>
      <td>
        <div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openRoleModal('${r.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="deleteRole('${r.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>
      </td>
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
      <td>
        <div class="row-actions">
          <button class="detail-icon-btn" title="Editar" onclick="openWebhookModal('${h.id}')"><i data-lucide="pencil" class="ic-sm"></i></button>
          <button class="detail-icon-btn" title="Enviar teste" onclick="testWebhookById('${h.id}')"><i data-lucide="send" class="ic-sm"></i></button>
          <button class="detail-icon-btn danger" title="Excluir" onclick="confirmDeleteWebhook('${h.id}')"><i data-lucide="trash-2" class="ic-sm"></i></button>
        </div>
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

/* ─── START ─── */
boot();
