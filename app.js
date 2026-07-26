const API = window.location.pathname.startsWith("/ml/") ? "/ml/api" : window.location.pathname.startsWith("/precios/") ? "/precios/api" : "/api";
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
    showUpgradeModal(data.message || data.detail || 'Limite alcanzado');
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
    // Update search usage bar
    updateSearchUsage(data.usage.remaining, data.usage.limit);
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
    const aiData = await api('GET', '/ai/analyze?q=' + encodeURIComponent(query) + '&site=' + site);
    
    if (aiData.suggested_price) {
      const riskLevels = { 'bajo': 'risk-low', 'low': 'risk-low', 'medio': 'risk-medium', 'medium': 'risk-medium', 'alto': 'risk-high', 'high': 'risk-high' };
      const riskClass = riskLevels[aiData.risk_level?.toLowerCase()] || 'risk-low';
      $('aiBody').innerHTML = '<div class="ai-suggested">' + (aiData.currency || '$') + ' ' + (aiData.suggested_price?.toLocaleString() || aiData.suggested_price) + '</div><div class="ai-reason">' + (aiData.reason || 'Analisis completado.') + '</div><div class="ai-meta"><span class="ai-tag ' + riskClass + '">Riesgo ' + (aiData.risk_level || 'N/A') + '</span>' + (aiData.competitor_insight ? '<span class="ai-tag insight">' + aiData.competitor_insight + '</span>' : '') + '</div>';
    } else {
      $('aiBody').innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:12px">No hay suficiente datos para generar analisis de IA.</p>';
    }
  } catch(e) {
    hide($('aiPanel'));
  }
}
async function generateDescription() {
  const title = $('describeInput').value.trim();
  if (!title) { show($('describeResultWrap')); hide($('copyDescBtn')); $('describeResult').textContent = 'Ingresa un producto'; return; }
  $('describeBtn').textContent = 'Generando...';
  $('describeBtn').disabled = true;
  show($('describeResultWrap'));
  hide($('copyDescBtn'));
  $('describeResult').textContent = 'DeepSeek generando...';
  try {
    const data = await api('GET', '/describe?title=' + encodeURIComponent(title));
    if (data.status === 402) { $('describeBtn').textContent = 'Generar con IA'; $('describeBtn').disabled = false; $('describeResult').textContent = data.detail || 'Limite alcanzado'; showUpgradeModal(data.detail); return; }
    $('describeBtn').textContent = 'Generar con IA';
    $('describeBtn').disabled = false;
    const text = data.description_es || data.description || data.result;
    
    if (text) { $('describeResult').textContent = text; show($('copyDescBtn')); }
    else { $('describeResult').textContent = (data.detail||data.error||'No se pudo generar. Intenta de nuevo.'); if(data.status===402) showUpgradeModal(data.detail); }
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
      'free': ['10 busquedas/dia', 'AI analisis de precios', '1 descripcion IA'],
      'pro': ['500 busquedas/mes', 'AI analisis avanzado', '50 descripciones IA/mes'],
      'enterprise': ['Busquedas ilimitadas', '100 descripciones IA/mes', 'Exportacion CSV'],
      'professional': ['Busquedas ilimitadas', '500 descripciones IA/mes', 'CSV + PDF', 'Seguimiento competidores'],
      'pay_per_search': ['Pago por busqueda', 'AI analisis'],
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
      <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Dashboard</h2>
      <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:20px">Panorama general del negocio</p>
      <div class="admin-stats-grid">
        <div class="admin-stat"><div class="admin-stat-label">Usuarios totales</div><div class="admin-stat-value">${stats.total_users || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Suscripciones activas</div><div class="admin-stat-value" style="color:var(--success)">${stats.active_subs || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Busquedas totales</div><div class="admin-stat-value">${stats.total_searches || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Hoy busquedas</div><div class="admin-stat-value" style="color:var(--accent-hover)">${stats.today_searches || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Descripciones totales</div><div class="admin-stat-value">${stats.total_descriptions || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Hoy descripciones</div><div class="admin-stat-value" style="color:var(--accent-hover)">${stats.today_descriptions || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Pagos completados</div><div class="admin-stat-value">${stats.total_payments || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Ingresos (USD)</div><div class="admin-stat-value" style="color:var(--success)">$${stats.revenue || 0}</div></div>
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

/* --- Upgrade Modal --- */
function showUpgradeModal(message) {
  var old = document.getElementById("upgradeModal");
  if (old) old.remove();
  var overlay = document.createElement("div");
  overlay.id = "upgradeModal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = '<div class="modal" style="max-width:420px;text-align:center">' +
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" style="margin:0 auto 12px;display:block">' +
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
    '<h3 style="margin-bottom:4px">Límite de búsquedas alcanzado</h3>' +
    '<p style="color:var(--text-tertiary);margin-bottom:4px;font-size:13px">' + (message || "Has agotado tus búsquedas gratuitas del plan actual.") + '</p>' +
    '<p style="color:var(--text-tertiary);margin-bottom:20px;font-size:13px">Actualizá tu plan para seguir usando ML Precios sin límites.</p>' +
    `<button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="showPage('pricing');document.getElementById('upgradeModal').remove()">Ver planes y precios</button>` +
    `<button class="btn btn-ghost" style="width:100%" onclick="document.getElementById('upgradeModal').remove()">Ahora no</button></div>`;
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

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
function copyDescription(){var t=document.getElementById("describeResult");if(t&&t.textContent){navigator.clipboard.writeText(t.textContent.trim());var b=document.getElementById("copyDescBtn");b.innerHTML='<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#22c55e\" stroke-width=\"2\"><polyline points=\"20 6 9 17 4 12\"/></svg>';b.title="Copiado!";setTimeout(function(){b.innerHTML='<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg>';b.title="Copiar descripción"},2000)}}
function toggleClear(){document.getElementById("searchClear").classList.toggle("show",document.getElementById("searchInput").value.length>0)}function clearSearch(){var i=document.getElementById("searchInput");i.value="";document.getElementById("searchClear").classList.remove("show");i.focus();document.getElementById("searchSuggestions").classList.remove("show")}
function updateSearchUsage(remaining, limit) {
  var el = document.getElementById("searchUsageText");
  var bar = document.getElementById("searchUsage");
  if (!el || !bar) return;
  bar.classList.remove("low", "exhausted");
  if (remaining === undefined || remaining === null) {
    el.textContent = "Inicia sesión para ver tus búsquedas";
    return;
  }
  var num = parseInt(remaining);
  if (num <= 0) {
    el.textContent = "Has alcanzado el límite de búsquedas";
    bar.classList.add("exhausted");
  } else if (num <= 3) {
    el.textContent = "Te quedan " + num + " búsquedas gratuitas";
    bar.classList.add("low");
  } else {
    el.textContent = "Te quedan " + num + " búsquedas gratuitas";
  }
}

/* --- Share & Referral Bar --- */
function showShareBar() {
  var old = document.getElementById("shareBar");
  if (old) old.remove();
  var q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  var url = window.location.href;
  var text = encodeURIComponent("🔍 Encontré precios para \"" + q + "\" en ML Precios. IA que analiza Mercado Libre y te dice el precio óptimo. " + url);
  var wa = "https://wa.me/?text=" + text;
  var fb = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url) + "&quote=" + encodeURIComponent("Encontré los mejores precios para \"" + q + "\" en Mercado Libre con IA");
  
  var bar = document.createElement("div");
  bar.id = "shareBar";
  bar.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;margin-top:12px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:var(--radius-md);justify-content:space-between";
  bar.innerHTML = '<span style="font-size:13px;color:var(--text-secondary);white-space:nowrap">📤 Compartir resultados</span>' +
    '<div style="display:flex;gap:6px">' +
    '<a href="' + wa + '" target="_blank" class="btn-icon" title="Compartir en WhatsApp" style="color:#25D366;border-color:#25D36633;background:#25D36611">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>' +
    '<a href="' + fb + '" target="_blank" class="btn-icon" title="Compartir en Facebook" style="color:#1877F2;border-color:#1877F233;background:#1877F211">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>' +
    '<button class="btn-icon" onclick="copyShareLink()" title="Copiar enlace" style="color:var(--accent)">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button></div>';
  var rs = document.getElementById("resultsSection");
  if (rs) rs.appendChild(bar);
}
function copyShareLink() {
  var inp = document.createElement("input");
  inp.value = window.location.href;
  document.body.appendChild(inp); inp.select(); document.execCommand("copy");
  document.body.removeChild(inp);
  var btn = document.querySelector("#shareBar .btn-icon:last-child");
  if (btn) { btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'; btn.title = "Copiado!"; }
  setTimeout(function() {
    if (btn) { btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'; btn.title = "Copiar enlace"; }
  }, 2000);
}

async function autocompleteSearch() {
  var q = document.getElementById("searchInput").value;
  var dd = document.getElementById("searchSuggestions");
  if (q.length < 2) { dd.classList.remove("show"); return; }
  try {
    var r = await fetch(API + "/autocomplete?q=" + encodeURIComponent(q) + "&site=" + (document.getElementById("siteSelect")?.value || "MLA"));
    var d = await r.json();
    var items = (d.suggested_queries || []).slice(0, 8);
    if (items.length === 0) { dd.classList.remove("show"); return; }
    dd.innerHTML = items.map(function(i) { return "<div class=\"ss-item\" onclick=\"pickSuggestion(\"" + i.q.replace(/"/g,"&quot;") + "\")\">" + i.q + "</div>"; }).join("");
    dd.classList.add("show");
  } catch(e) { dd.classList.remove("show"); }
}
function pickSuggestion(q) {
  document.getElementById("searchInput").value = q;
  document.getElementById("searchSuggestions").classList.remove("show");
  doSearch();
}

