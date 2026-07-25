/* ═══════════════════════════════════════════════════════════
   ML Precios — Application Logic
   ═══════════════════════════════════════════════════════════ */

// API base — works both locally (direct) and on Vercel (proxy to server)
// API base — detect context: /ml/ on nginx, direct on Vercel/local
const API = window.location.pathname.startsWith('/ml/') ? '/ml/api' : '/api';
let TOKEN = localStorage.getItem('ml_token') || '';
let USER = null;
let PLANS = [];

/* ─── DOM Helpers ─── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const hide = el => el?.classList.add('hidden');
const show = el => el?.classList.remove('hidden');
const qs = (sel, parent = document) => parent.querySelector(sel);
const qsa = (sel, parent = document) => parent.querySelectorAll(sel);

/* ─── Format Helpers ─── */
const fmtCurrency = (n, currency = 'ARS') => {
  const locales = { ARS: 'es-AR', USD: 'en-US', MXN: 'es-MX', CLP: 'es-CL', BRL: 'pt-BR', UYU: 'es-UY' };
  try { return new Intl.NumberFormat(locales[currency] || 'es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `$${n.toLocaleString()}`; }
};
const fmtDate = d => new Date(d).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
const truncate = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;

/* ═══════════════════════════════════════════════════════════
   API
   ═══════════════════════════════════════════════════════════ */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + path, opts);
    if (res.status === 401) { TOKEN = ''; localStorage.removeItem('ml_token'); USER = null; updateHeader(); }
    const json = await res.json();
    const result = Array.isArray(json) ? json : { ok: res.ok, status: res.status, ...json }; return result;
  } catch (e) {
    return { ok: false, error: 'Error de conexión' };
  }
}

/* ═══════════════════════════════════════════════════════════
   Auth
   ═══════════════════════════════════════════════════════════ */
async function loadUser() {
  const data = await api('GET', '/auth/me');
  if (data?.user) { USER = data.user; TOKEN = localStorage.getItem('ml_token'); }
  updateHeader();
}

function showAuth() {
  show($('authModal'));
  $('loginError').textContent = '';
  $('regError').textContent = '';
  $('loginEmail').focus();
}

function hideAuth() {
  hide($('authModal'));
}

async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  if (!email || !pass) return;
  const result = await api('POST', '/auth/login', { email, password: pass });
  if (!result.ok || result.error) {
    $('loginError').textContent = result.detail || result.error || 'Credenciales inválidas';
    show($('loginError'));
    return;
  }
  TOKEN = result.token;
  USER = result.user;
  localStorage.setItem('ml_token', TOKEN);
  hideAuth();
  updateHeader();
  loadCurrentPage();
}

async function doRegister() {
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const pass = $('regPass').value;
  if (!email || !pass) return;
  const result = await api('POST', '/auth/register', { email, password: pass, name });
  if (!result.ok || result.error) {
    $('regError').textContent = result.detail || result.error || 'Error al registrar';
    show($('regError'));
    return;
  }
  TOKEN = result.token;
  USER = result.user;
  localStorage.setItem('ml_token', TOKEN);
  hideAuth();
  updateHeader();
  loadCurrentPage();
}

function logout() {
  TOKEN = '';
  USER = null;
  localStorage.removeItem('ml_token');
  updateHeader();
  showPage('home');
}

/* ═══════════════════════════════════════════════════════════
   Header & Navigation
   ═══════════════════════════════════════════════════════════ */
function updateHeader() {
  const loggedIn = !!USER;
  hide($('loginBtn'));
  hide($('userMenuBtn'));
  hide($('usageBadge'));
  if (loggedIn) {
    show($('userMenuBtn'));
    $('userName').textContent = USER.name || USER.email.split('@')[0];
    $('userAvatar').textContent = (USER.name || USER.email)[0].toUpperCase();
    // Show admin link if admin
    if (USER.role === 'admin') show($('adminNavLink'));
    else hide($('adminNavLink'));
    // Load subscription for usage badge
    loadSubscriptionBadge();
  } else {
    show($('loginBtn'));
    hide($('adminNavLink'));
  }
}

async function loadSubscriptionBadge() {
  const data = await api('GET', '/subscription');
  if (data?.message) {
    $('usageLabel').textContent = data.message;
    show($('usageBadge'));
  }
}

$('userMenuBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('userDropdown').classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#userMenuBtn') && !e.target.closest('#userDropdown')) {
    $('userDropdown')?.classList.add('hidden');
  }
});

/* ─── Nav Links ─── */
$$('.nav-link[data-page]').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); showPage(el.dataset.page); });
});

/* ─── Page Navigation ─── */
let currentPage = 'home';

function showPage(page) {
  currentPage = page;
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-link').forEach(l => l.classList.remove('active'));
  const pageEl = $(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  const navLink = qs(`.nav-link[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');
  
  if (page === 'pricing') loadPricingPage();
  if (page === 'subscription') loadSubscriptionPage();
  if (page === 'history') loadHistoryPage();
  if (page === 'admin') loadAdminPage();
  if (page === 'home') {
    show($('featuresSection'));
    hide($('resultsSection'));
    hide($('loadingSection'));
  }
  
  window.scrollTo(0, 0);
}

function loadCurrentPage() {
  showPage(currentPage);
}

/* ═══════════════════════════════════════════════════════════
   Search
   ═══════════════════════════════════════════════════════════ */
async function doSearch() {
  const q = $('searchInput').value.trim();
  if (!q) return;

  hide($('featuresSection'));
  hide($('resultsSection'));
  show($('loadingSection'));
  $('loadingSection').scrollIntoView({ behavior: 'smooth' });

  const site = $('siteSelect').value;
  const data = await api('GET', `/search?q=${encodeURIComponent(q)}&site=${site}`);

  hide($('loadingSection'));

  if (data.status === 402 || data.error === 'usage_limit') {
    if (!USER) { showAuth(); return; }
    showUpgradeModal(data.message || 'Limite alcanzado');
    return;
  }

  if (data.error || !data.products) {
    show($('resultsSection'));
    $('resultsTitle').textContent = `Sin resultados para "${q}"`;
    $('resultsCount').textContent = '';
    $('statsGrid').innerHTML = '';
    $('productsGrid').innerHTML = '<p style="color:var(--text-tertiary);padding:40px;text-align:center">No se encontraron productos. Intentá con otra búsqueda.</p>';
    hide($('aiPanel'));
    hide($('describeCard'));
    $('resultsSection').scrollIntoView({ behavior: 'smooth' }); showShareBar();
    return;
  }

  show($('resultsSection'));
  $('resultsTitle').textContent = `Resultados para "${q}"`;
  $('resultsCount').textContent = `${data.total} productos · ${data.site}`;

  // Stats
  if (data.stats) {
    $('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Precio mínimo</div>
        <div class="stat-value positive">${fmtCurrency(data.stats.min)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Precio máximo</div>
        <div class="stat-value">${fmtCurrency(data.stats.max)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Promedio</div>
        <div class="stat-value neutral">${fmtCurrency(data.stats.avg)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Mediana</div>
        <div class="stat-value">${fmtCurrency(data.stats.median)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Productos</div>
        <div class="stat-value">${data.stats.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Rango de precios</div>
        <div class="stat-value" style="font-size:14px">${data.stats.range}</div>
      </div>
    `;
  }

  // AI Analysis - load async for speed
  loadAIAsync(q, site);
  // Products
  $('productsSub').textContent = `Mostrando ${Math.min(data.products.length, 20)} productos`;
  $('productsGrid').innerHTML = data.products.map(p => `
    <a class="product-card" href="${p.url}" target="_blank" rel="noopener">
      ${p.image ? `<img class="product-image" src="${p.image}" alt="${p.title}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="product-info">
        <div class="product-title" title="${p.title}">${truncate(p.title, 80)}</div>
        <div class="product-price">${fmtCurrency(p.price, p.currency)}</div>
        <div class="product-meta">
          ${p.condition ? `<span>${p.condition}</span>` : ''}
          ${p.currency ? `<span>${p.currency}</span>` : ''}
        </div>
      </div>
    </a>
  `).join('');

  // Description generator
  show($('describeCard'));
  $('describeInput').value = q;

  if (data.usage) {
    $('usageLabel').textContent = data.usage.remaining;
    show($('usageBadge'));
  }

  $('resultsSection').scrollIntoView({ behavior: 'smooth' }); showShareBar();
}

// Describe
$('describeBtn')?.addEventListener('click', generateDescription);
$('describeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') generateDescription(); });


async function loadAIAsync(query, site) {
  // Show loading state in AI panel
  show($('aiPanel'));
  $('aiBody').innerHTML = '<div class="ai-loading"><span class="ai-dot"></span>DeepSeek analizando el mercado...</div>';
  
  try {
    // Use a separate lightweight AI-only endpoint
    const res = await fetch(API + '/ai/analyze?q=' + encodeURIComponent(query) + '&site=' + site);
    const aiData = await res.json();
    
    if (aiData.suggested_price) {
      const riskLevels = { 'bajo': 'risk-low', 'low': 'risk-low', 'medio': 'risk-medium', 'medium': 'risk-medium', 'alto': 'risk-high', 'high': 'risk-high' };
      const riskClass = riskLevels[aiData.risk_level?.toLowerCase()] || 'risk-low';
      $('aiBody').innerHTML = '<div class="ai-suggested">' + (aiData.currency || '$') + ' ' + (aiData.suggested_price?.toLocaleString() || aiData.suggested_price) + '</div><div class="ai-reason">' + (aiData.reason || 'Analisis completado.') + '</div><div class="ai-meta"><span class="ai-tag ' + riskClass + '">Riesgo ' + (aiData.risk_level || 'N/A') + '</span>' + (aiData.competitor_insight ? '<span class="ai-tag insight">' + aiData.competitor_insight + '</span>' : '') + '</div>';
    } else {
      hide($('aiPanel'));
    }
  } catch(e) {
    hide($('aiPanel'));
  }
}
async function generateDescription() {
  const title = $('describeInput').value.trim();
  if (!title) { show($('describeResult')); $('describeResult').textContent = 'Ingresa un producto'; return; }
  $('describeBtn').textContent = 'Generando...';
  $('describeBtn').disabled = true;
  show($('describeResult'));
  $('describeResult').textContent = 'DeepSeek generando...';
  try {
    const data = await api('GET', '/describe?title=' + encodeURIComponent(title));
    $('describeBtn').textContent = 'Generar con IA';
    $('describeBtn').disabled = false;
    const text = data.description_es || data.description || data.result;
    if (text) $('describeResult').textContent = text;
    else $('describeResult').textContent = 'No se pudo generar. Intenta de nuevo.';
  } catch(e) {
    $('describeBtn').textContent = 'Generar con IA';
    $('describeBtn').disabled = false;
    $('describeResult').textContent = 'Error de conexion';
  }
}

/* ═══════════════════════════════════════════════════════════
   Pricing
   ═══════════════════════════════════════════════════════════ */
async function loadPlans() {
  const data = await api('GET', '/plans');
  PLANS = Array.isArray(data) ? data : (data.plans || []);
}

async function loadPricingPage() {
  if (PLANS.length === 0) await loadPlans();
  const grid = $('pricingGrid');
  if (!grid) return;
  
  if (PLANS.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:60px">No hay planes disponibles.</p>';
    return;
  }

  grid.innerHTML = PLANS.map((plan, i) => {
    const price = plan.price_monthly || 0;
    const featured = price > 0 && i === PLANS.findIndex(p => p.price_monthly > 0);
    const planFeatures = {
      'free': ['10 busquedas/dia (300/mes)', 'AI analisis de precios', '1 descripcion IA gratuita', 'Soporte por email'],
      'pro': ['500 busquedas/mes', 'AI analisis (DeepSeek)', '50 descripciones IA/mes', 'Soporte prioritario'],
      'empresa': ['Busquedas ilimitadas', 'AI analisis avanzado', '100 descripciones IA/mes', 'Soporte prioritario', 'Exportacion CSV'],
      'professional': ['Busquedas ilimitadas', 'IA + descripciones premium', '200 descripciones IA/mes', 'Soporte dedicado 24/7', 'CSV + PDF', 'Seguimiento competidores'],
      'pay_per_search': ['Pago por busqueda', 'Analisis de IA', 'Soporte por email'],
    };
    const features = planFeatures[plan.slug] || planFeatures['free'];

    return `
      <div class="pricing-card ${featured ? 'featured' : ''}">
        ${featured ? '<div class="pricing-badge">Más popular</div>' : ''}
        <div class="pricing-name">${plan.name || plan.slug}</div>
        <div class="pricing-price">${price === 0 ? 'Gratis' : '$' + price.toLocaleString()}</div>
        <div class="pricing-period">${price === 0 ? 'Para siempre' : '/mes'}</div>
        <ul class="pricing-features">
          ${features.map(f => `<li><span class="check">✓</span> ${f}</li>`).join('')}
        </ul>
        <button class="pricing-cta ${featured ? 'primary' : 'secondary'}" onclick="handleCheckout('${plan.id || plan.slug}')">
          ${price === 0 ? 'Comenzar gratis' : 'Elegir plan'}
        </button>
      </div>
    `;
  }).join('');
}

async function handleCheckout(planId) {
  if (!USER) { showAuth(); return; }
  const result = await api('POST', '/checkout', { plan_id: planId });
  alert(result.message || 'Procesando…');
}

/* ═══════════════════════════════════════════════════════════
   Subscription
   ═══════════════════════════════════════════════════════════ */
async function loadSubscriptionPage() {
  const container = $('subContent');
  if (!container) return;
  if (!USER) {
    container.innerHTML = '<div style="text-align:center;padding:60px"><p style="color:var(--text-secondary)">Iniciá sesión para ver tu suscripción.</p><br><button class="btn btn-primary" onclick="showAuth()">Iniciar sesión</button></div>';
    return;
  }
  const data = await api('GET', '/subscription');
  if (!data || data.error) {
    container.innerHTML = `<div class="sub-card"><h2>Error</h2><p style="color:var(--text-secondary)">${data?.error || 'No se pudo cargar'}</p></div>`;
    return;
  }
  
  const planNames = { free: 'Gratuito', pro: 'Profesional', enterprise: 'Empresarial' };
  const planName = planNames[data.plan] || data.plan || 'Desconocido';
  
  container.innerHTML = `
    <div class="sub-card">
      <h2>Mi suscripción</h2>
      <div class="sub-detail">
        <div class="sub-detail-label">Plan actual</div>
        <div class="sub-detail-value" style="color:var(--accent-hover)">${planName}</div>
      </div>
      <div class="sub-detail">
        <div class="sub-detail-label">Estado</div>
        <div class="sub-detail-value">${data.message || 'Activo'}</div>
      </div>
      ${data.remaining !== undefined ? `
      <div class="sub-detail">
        <div class="sub-detail-label">Búsquedas restantes</div>
        <div class="sub-detail-value">${data.remaining}</div>
      </div>` : ''}
      <br>
      <button class="btn btn-secondary" onclick="showPage('pricing')">Cambiar plan</button>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   History
   ═══════════════════════════════════════════════════════════ */
async function loadHistoryPage() {
  const container = $('historyList');
  if (!container) return;
  if (!USER) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:60px">Iniciá sesión para ver tu historial.</p>';
    return;
  }
  const data = await api('GET', '/payment/history');
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = '<div class="history-empty">No hay pagos registrados.</div>';
    return;
  }
  container.innerHTML = data.map(p => `
    <div class="history-item">
      <div class="history-item-left">
        <div>${p.plan_name || p.description || 'Pago'}</div>
        <div class="history-item-date">${fmtDate(p.created_at || p.date)}</div>
      </div>
      <div class="history-item-amount">${p.amount ? '$' + p.amount.toLocaleString() : ''}</div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   Admin
   ═══════════════════════════════════════════════════════════ */
let adminTab = 'dashboard';

$$('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    adminTab = tab.dataset.admin;
    loadAdminPanel();
  });
});

async function loadAdminPage() {
  if (!USER || USER.role !== 'admin') {
    $('adminMain').innerHTML = '<p style="padding:40px;color:var(--text-secondary)">Acceso restringido.</p>';
    return;
  }
  loadAdminPanel();
}

async function loadAdminPanel() {
  const main = $('adminMain');
  if (!main) return;
  main.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Cargando…</p></div>';

  if (adminTab === 'dashboard') {
    const stats = await api('GET', '/admin/stats');
    main.innerHTML = `
      <h2 style="font-size:20px;font-weight:700;margin-bottom:20px">Dashboard</h2>
      <div class="admin-stats-grid">
        <div class="admin-stat"><div class="admin-stat-label">Usuarios</div><div class="admin-stat-value">${stats.users || stats.total_users || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Planes</div><div class="admin-stat-value">${stats.plans || stats.total_plans || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Suscripciones</div><div class="admin-stat-value">${stats.subscriptions || stats.total_subs || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Búsquedas</div><div class="admin-stat-value">${stats.searches || stats.total_searches || 0}</div></div>
      </div>
    `;
  } else if (adminTab === 'plans') {
    const plans = await api('GET', '/admin/plans');
    let html = '<h2 style="font-size:20px;font-weight:700;margin-bottom:20px">Planes</h2>';
    if (Array.isArray(plans)) {
      html += `<table class="admin-table"><thead><tr><th>Nombre</th><th>Slug</th><th>Precio</th><th>Búsquedas/mes</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
      plans.forEach(p => {
        html += `<tr>
          <td>${p.name || p.slug}</td>
          <td class="mono">${p.slug || ''}</td>
          <td class="mono">$${p.price_monthly || 0}</td>
          <td>${p.search_limit_monthly || 0}</td>
          <td>${p.enabled ? '✅ Activo' : '❌ Inactivo'}</td>
          <td><button class="btn btn-ghost" onclick="togglePlan('${p.id}', ${!p.enabled})" style="font-size:11px;padding:4px 10px">${p.enabled ? 'Desactivar' : 'Activar'}</button></td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    main.innerHTML = html;
  } else if (adminTab === 'users') {
    const users = await api('GET', '/admin/users');
    let html = '<h2 style="font-size:20px;font-weight:700;margin-bottom:20px">Usuarios</h2>';
    if (Array.isArray(users)) {
      html += `<table class="admin-table"><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Registro</th></tr></thead><tbody>`;
      users.forEach(u => {
        html += `<tr>
          <td>${u.name || '-'}</td>
          <td class="mono">${u.email || u.id}</td>
          <td>${u.role || 'user'}</td>
          <td>${u.created_at ? fmtDate(u.created_at) : '-'}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    main.innerHTML = html;
  } else if (adminTab === 'settings') {
    const settings = await api('GET', '/admin/settings');
    let html = '<h2 style="font-size:20px;font-weight:700;margin-bottom:20px">Configuración</h2>';
    html += '<div class="admin-form"><h3>Configuración global</h3>';
    if (Array.isArray(settings)) {
      settings.forEach(s => {
        html += `<div class="sub-detail" style="margin-bottom:12px"><div class="sub-detail-label">${s.key || s.setting_key}</div><div class="sub-detail-value" style="font-size:13px">${s.value || '-'}</div></div>`;
      });
    }
    html += '</div>';
    main.innerHTML = html;
  }
}

async function togglePlan(planId, enabled) {
  await api('PATCH', `/admin/plans/${planId}`, { enabled });
  loadAdminPanel();
}

/* ═══════════════════════════════════════════════════════════
   Init
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Hot tags
  $$('.tag[data-q]').forEach(btn => {
    btn.addEventListener('click', () => {
      $('searchInput').value = btn.dataset.q;
      doSearch();
    });
  });

  // Search events
  $('searchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  $('searchBtn')?.addEventListener('click', doSearch);

  // Auth modal
  $$('.modal-tab').forEach(el => {
    el.addEventListener('click', () => {
      $$('.modal-tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      $(el.dataset.tab + 'Form').classList.add('active');
    });
  });
  $('authModal')?.addEventListener('click', (e) => {
    if (e.target === $('authModal')) hideAuth();
  });
  $('loginBtn')?.addEventListener('click', showAuth);

  // Footer links
  $$('.footer-links a[data-page]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); showPage(a.dataset.page); });
  });

  // Init
  await Promise.all([loadUser(), loadPlans()]);
  updateHeader();
  if (currentPage === 'pricing') loadPricingPage();
});
