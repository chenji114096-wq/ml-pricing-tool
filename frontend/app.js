/* ML Precios — App Logic */
const API = '/api';
let TOKEN = localStorage.getItem('ml_token') || '';
let USER = null;
let PLANS = [];

/* ─── DOM Helpers ─── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const hide = el => el?.classList.add('hidden');
const show = el => el?.classList.remove('hidden');
const qs = sel => document.querySelector(sel);

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', async () => {
  /* Hot search buttons */
  document.querySelectorAll('.tip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('searchInput').value = btn.dataset.q;
      doSearch();
    });
  });

  /* Search on Enter */
  $('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  $('searchBtn').addEventListener('click', doSearch);

  /* Nav links */
  document.querySelectorAll('.nav-link[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); showPage(el.dataset.page); });
  });

  /* Auth modal */
  document.querySelectorAll('.modal-tab').forEach(el => {
    el.addEventListener('click', () => {
      $$('.modal-tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      $(el.dataset.tab + 'Form').classList.add('active');
    });
  });
  $('authModal').addEventListener('click', hideAuth);

  /* Login/Register on Enter */
  $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('regPass').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });

  /* User dropdown */
  $('userBtn').addEventListener('click', () => $('userDropdown').classList.toggle('hidden'));
  document.addEventListener('click', e => {
    if (!e.target.closest('#userBtn') && !e.target.closest('#userDropdown'))
      $('userDropdown').classList.add('hidden');
  });

  /* Load data */
  await Promise.all([loadUser(), loadPlans()]);
  loadPricingPage();
});

/* ─── API ─── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + path, opts);
    if (res.status === 401) { TOKEN = ''; localStorage.removeItem('ml_token'); USER = null; updateHeader(); }
    return await res.json();
  } catch(e) {
    return { error: 'Error de conexión' };
  }
}

/* ─── Auth ─── */
async function loadUser() {
  const data = await api('GET', '/auth/me');
  if (data?.user) { USER = data.user; TOKEN = localStorage.getItem('ml_token'); }
  updateHeader();
}

function showAuth() {
  $('authModal').classList.remove('hidden');
  $('loginError').textContent = '';
  $('regError').textContent = '';
}

function hideAuth() { $('authModal').classList.add('hidden'); }

async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  if (!email || !pass) { $('loginError').textContent = 'Completa todos los campos'; return; }
  $('loginError').textContent = 'Iniciando sesión...';
  const data = await api('POST', '/auth/login', { email, password: pass });
  if (data.token) {
    TOKEN = data.token; USER = data.user;
    localStorage.setItem('ml_token', TOKEN);
    hideAuth(); updateHeader(); updateSubscription();
  } else {
    $('loginError').textContent = data.detail || 'Error al iniciar sesión';
  }
}

async function doRegister() {
  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const pass = $('regPass').value;
  if (!email || !pass) { $('regError').textContent = 'Completa todos los campos'; return; }
  $('regError').textContent = 'Creando cuenta...';
  const data = await api('POST', '/auth/register', { email, password: pass, name });
  if (data.token) {
    TOKEN = data.token; USER = data.user;
    localStorage.setItem('ml_token', TOKEN);
    hideAuth(); updateHeader(); updateSubscription();
  } else {
    $('regError').textContent = data.detail || 'Error al registrarse';
  }
}

function logout() {
  TOKEN = ''; USER = null;
  localStorage.removeItem('ml_token');
  updateHeader(); $('userDropdown').classList.add('hidden');
  showPage('home');
}

function updateHeader() {
  if (USER) {
    hide($('loginBtn')); show($('userBtn'));
    $('userBtnName').textContent = USER.name || USER.email;
    show($('usageIndicator'));
    if (USER.role === 'admin') show($('adminNavLink'));
    else hide($('adminNavLink'));
    updateUsage();
  } else {
    show($('loginBtn')); hide($('userBtn'));
    hide($('usageIndicator')); hide($('adminNavLink'));
  }
}

/* ─── Usage ─── */
async function updateUsage() {
  if (!USER) return;
  const data = await api('GET', '/subscription');
  if (data?.remaining !== undefined) {
    $('usageLabel').textContent = `${data.remaining} búsquedas`;
  }
}

/* ─── Navigation ─── */
function showPage(name) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = $('page-' + name);
  if (page) page.classList.add('active');
  $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === name));

  if (name === 'subscription') updateSubscription();
  if (name === 'history') loadHistory();
  if (name === 'admin') loadAdmin();
}

/* ─── Plans ─── */
async function loadPlans() {
  const data = await api('GET', '/plans');
  if (Array.isArray(data)) PLANS = data;
}

function loadPricingPage() {
  const grid = $('pricingGrid');
  grid.innerHTML = '';
  /* Free plan (always exists) */
  grid.innerHTML = `
    <div class="pricing-card">
      <h3>Gratis</h3>
      <div class="price">$0<span>/mes</span></div>
      <ul class="price-features">
        <li>3 búsquedas por día</li>
        <li>Análisis básico de precios</li>
        <li>Estadísticas del mercado</li>
      </ul>
      <button class="btn btn-ghost" style="width:100%" onclick="showAuth()">Comenzar gratis</button>
    </div>`;
  PLANS.forEach((p, i) => {
    grid.innerHTML += `
    <div class="pricing-card ${i === 0 ? 'featured' : ''}">
      <h3>${p.name}</h3>
      <div class="price">$${p.price_monthly}<span>/mes</span></div>
      <ul class="price-features">
        <li>${p.search_limit_monthly < 0 ? 'Búsquedas ilimitadas' : `${p.search_limit_monthly} búsquedas/mes`}</li>
        <li>${p.daily_limit < 0 ? 'Sin límite diario' : `${p.daily_limit} búsquedas/día`}</li>
        <li>Análisis IA completo</li>
        <li>Descripciones automáticas</li>
        <li>Soporte prioritario</li>
      </ul>
      <button class="btn ${USER ? 'btn-primary' : 'btn-ghost'}" style="width:100%"
        onclick="${USER ? `checkout('${p.id}')` : 'showAuth()'}">
        ${USER ? 'Suscribirse' : 'Iniciar sesión'}
      </button>
    </div>`;
  });
}

/* ─── Subscription ─── */
async function updateSubscription() {
  if (!USER) { showPage('home'); return; }
  const data = await api('GET', '/subscription');
  if (!data) return;
  $('subCard').innerHTML = `
    <div class="sub-info">
      <div class="sub-plan">${data.plan || 'Gratis'}</div>
      <div class="sub-status ${data.logged_in ? 'active' : 'inactive'}">
        ${data.logged_in ? '● Activo' : 'Inactivo'}
      </div>
      <div class="sub-usage">
        <p style="font-size:14px;color:var(--text-tertiary)">${data.message || 'Sin límites'}</p>
      </div>
    </div>`;
}

/* ─── History ─── */
async function loadHistory() {
  if (!USER) { showPage('home'); return; }
  const data = await api('GET', '/payment/history');
  const list = $('historyList');
  if (!data || !Array.isArray(data) || data.length === 0) {
    list.innerHTML = '<p class="empty-state">No hay pagos registrados.</p>';
    return;
  }
  list.innerHTML = data.map(p => `
    <div class="history-item">
      <div>
        <div class="history-amount">$${p.amount}</div>
        <div style="font-size:13px;color:var(--text-quaternary)">${p.description || p.plan_name || ''}</div>
      </div>
      <div class="history-date">${new Date(p.created_at).toLocaleDateString('es-AR')}</div>
    </div>`).join('');
}

/* ─── Checkout ─── */
async function checkout(planId) {
  const data = await api('POST', '/checkout', { plan_id: planId });
  alert(data.message || 'Redirigiendo al pago...');
}

/* ─── Admin ─── */
async function loadAdmin() {
  if (!USER || USER.role !== 'admin') { showPage('home'); return; }
  const stats = await api('GET', '/admin/stats');
  const users = await api('GET', '/admin/users');
  const plans = await api('GET', '/admin/plans');
  const settings = await api('GET', '/admin/settings');
  $('adminStats').innerHTML = `
    <h3 style="font-size:16px;font-weight:590;margin-bottom:16px">Estadísticas</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div class="stat-pill"><div class="stat-label">Usuarios</div><div class="stat-value">${stats?.total_users || 0}</div></div>
      <div class="stat-pill"><div class="stat-label">Búsquedas</div><div class="stat-value">${stats?.total_searches || 0}</div></div>
      <div class="stat-pill"><div class="stat-label">Ingresos</div><div class="stat-value">$${stats?.total_revenue || 0}</div></div>
    </div>`;
  $('adminUsers').innerHTML = `
    <h3 style="font-size:16px;font-weight:590;margin:20px 0 12px">Usuarios (${users?.length || 0})</h3>
    ${(users || []).slice(0,20).map(u => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
        <span style="font-size:13px">${u.name || u.email}</span>
        <span style="font-size:12px;color:var(--text-quaternary)">${u.email} · ${u.role}</span>
      </div>`).join('')}`;
}

/* ════════════════════════════════════════════
   SEARCH — Core functionality
   ════════════════════════════════════════════ */

async function doSearch() {
  const q = $('searchInput').value.trim();
  if (!q) { $('searchInput').focus(); return; }

  /* Check auth */
  if (!USER) { showAuth(); return; }

  /* Show loading */
  $('resultsSection').classList.remove('hidden');
  $('featuresSection').style.display = 'none';
  $('statsBar').innerHTML = '';
  $('aiCard').classList.add('hidden');
  $('productsGrid').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const data = await api('GET', `/search?q=${encodeURIComponent(q)}&site=MLA`);
  $('productsGrid').innerHTML = '';

  if (data.error === 'usage_limit') {
    $('productsGrid').innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-tertiary)">
        <p style="font-size:16px;margin-bottom:12px">${data.message}</p>
        <button class="btn btn-primary" onclick="showPage('pricing')">Ver planes</button>
      </div>`;
    return;
  }

  if (!data.products || data.products.length === 0) {
    $('productsGrid').innerHTML = `
      <p style="text-align:center;padding:40px;color:var(--text-tertiary)">
        No se encontraron productos para "${q}"
      </p>`;
    return;
  }

  /* Stats */
  const s = data.stats;
  $('statsBar').innerHTML = `
    <div class="stat-pill"><div class="stat-label">Productos</div><div class="stat-value">${s.total}</div></div>
    <div class="stat-pill"><div class="stat-label">Mínimo</div><div class="stat-value">$${s.min?.toLocaleString()}</div></div>
    <div class="stat-pill"><div class="stat-label">Máximo</div><div class="stat-value">$${s.max?.toLocaleString()}</div></div>
    <div class="stat-pill"><div class="stat-label">Promedio</div><div class="stat-value">$${s.avg?.toLocaleString()}</div></div>
    <div class="stat-pill"><div class="stat-label">Mediana</div><div class="stat-value">$${s.median?.toLocaleString()}</div></div>`;

  /* AI Analysis */
  if (data.ai) {
    const ai = data.ai;
    $('aiCard').classList.remove('hidden');
    $('aiBody').innerHTML = `
      <div class="ai-metric">
        <span class="ai-metric-label">Precio sugerido</span>
        <span class="ai-metric-value">$${ai.suggested_price?.toLocaleString()}</span>
      </div>
      <div class="ai-metric">
        <span class="ai-metric-label">Nivel de riesgo</span>
        <span class="ai-metric-value ${ai.risk_level === 'Bajo' ? 'green' : ai.risk_level === 'Medio' ? 'yellow' : 'red'}">${ai.risk_level}</span>
      </div>
      <p style="margin-top:12px">${ai.reason || ''}</p>
      ${ai.competitor_insight ? `<p style="color:var(--accent-bright)">💡 ${ai.competitor_insight}</p>` : ''}`;
  }

  /* Products */
  data.products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <img class="product-img" src="${p.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="%23191a1b" width="64" height="64"/><text x="20" y="38" fill="%2362666d" font-size="20">📦</text></svg>'}"
        alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect fill=%22%23191a1b%22 width=%2264%22 height=%2264%22/><text x=%2220%22 y=%2238%22 fill=%22%2362666d%22 font-size=%2220%22>📦</text></svg>'">
      <div class="product-info">
        <div class="product-title">${p.title}</div>
        <div class="product-price">$${p.price?.toLocaleString()}<span class="product-currency">${p.currency || ''}</span></div>
        <div class="product-meta">
          <span class="product-tag">${p.condition || 'Nuevo'}</span>
          <a class="product-tag" href="${p.url}" target="_blank" rel="noopener" style="text-decoration:none">🔗 Ver en ML</a>
        </div>
      </div>`;
    $('productsGrid').appendChild(card);
  });
}
