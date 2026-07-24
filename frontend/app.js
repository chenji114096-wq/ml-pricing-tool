/* ML Precios — Frontend completo v2 */
const API = '/ml';

let TOKEN = localStorage.getItem('ml_token') || '';
let USER = null;
let PLANS = [];
let CURRENT_PLAN = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Hot search buttons
    document.querySelectorAll('.tip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('searchInput').value = btn.dataset.q;
            doSearch();
        });
    });
    document.getElementById('searchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    // Load user + plans
    await Promise.all([loadUser(), loadPlans()]);
    loadPaymentHistory();
});

// ─── Auth ────────────────────────────────────────────────

function showAuth() {
    document.getElementById('authModal').classList.add('active');
    switchTab('login');
}
function hideAuth() {
    document.getElementById('authModal').classList.remove('active');
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (tab === 'login') {
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    } else {
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }
    document.getElementById('loginError').classList.remove('show');
    document.getElementById('regError').classList.remove('show');
}

async function doLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPass').value;
    if (!email || !password) return showFormError('loginError', 'Completa todos los campos');

    try {
        const r = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password}),
        });
        const d = await r.json();
        if (!r.ok) return showFormError('loginError', d.detail || 'Error');
        TOKEN = d.token;
        localStorage.setItem('ml_token', TOKEN);
        USER = d.user;
        hideAuth();
        updateHeader();
        loadPaymentHistory();
    } catch (e) {
        showFormError('loginError', 'Error de conexión');
    }
}

async function doRegister() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const name = document.getElementById('regName').value;
    if (!email || !password) return showFormError('regError', 'Email y contraseña requeridos');

    try {
        const r = await fetch(`${API}/api/auth/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password, name}),
        });
        const d = await r.json();
        if (!r.ok) return showFormError('regError', d.detail || 'Error');
        TOKEN = d.token;
        localStorage.setItem('ml_token', TOKEN);
        USER = d.user;
        hideAuth();
        updateHeader();
        loadPaymentHistory();
    } catch (e) {
        showFormError('regError', 'Error de conexión');
    }
}

function logout() {
    TOKEN = '';
    USER = null;
    localStorage.removeItem('ml_token');
    updateHeader();
}

function showFormError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('show');
}

// ─── User / Header ──────────────────────────────────────

async function loadUser() {
    if (!TOKEN) return updateHeader();
    try {
        const r = await fetch(`${API}/api/subscription`, {
            headers: {'Authorization': `Bearer ${TOKEN}`},
        });
        const d = await r.json();
        USER = d.user;
        CURRENT_PLAN = d.plan;
        document.getElementById('usageCount').textContent = d.remaining;
        updateHeader();
    } catch (e) {
        // Token invalid
        TOKEN = '';
        localStorage.removeItem('ml_token');
        updateHeader();
    }
}

function updateHeader() {
    const loginBtn = document.getElementById('loginBtn');
    const subBtn = document.getElementById('subBtn');
    const adminBtn = document.getElementById('adminBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const usageBadge = document.getElementById('usageBadge');
    const userName = document.getElementById('userName');

    if (USER) {
        loginBtn.classList.add('hidden');
        subBtn.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        usageBadge.classList.remove('hidden');
        userName.textContent = `👤 ${USER.name || USER.email}`;
        if (USER.role === 'admin') {
            adminBtn.classList.remove('hidden');
        } else {
            adminBtn.classList.add('hidden');
        }
    } else {
        loginBtn.classList.remove('hidden');
        subBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        adminBtn.classList.add('hidden');
        usageBadge.classList.add('hidden');
        userName.textContent = '';
    }
}

// ─── Plans / Subscription ───────────────────────────────

async function loadPlans() {
    try {
        const r = await fetch(`${API}/api/plans`);
        PLANS = await r.json();
        renderPlans();
    } catch (e) {}
}

function renderPlans() {
    const grid = document.getElementById('plansGrid');
    grid.innerHTML = '';
    PLANS.forEach(p => {
        const isActive = CURRENT_PLAN === p.slug;
        const features = [];
        if (p.search_limit_monthly < 0) features.push('Búsquedas ilimitadas');
        else if (p.slug === 'free') features.push(`${p.search_limit_monthly} búsquedas/mes`);
        else if (p.slug === 'pay_per_search') features.push('Paga por búsqueda');
        else features.push(`${p.search_limit_monthly} búsquedas/mes`);
        if (p.include_ai_description) features.push('IA: descripciones de productos');
        if (p.price_monthly <= 0 && p.slug === 'free') features.push('Estadísticas básicas');
        if (p.slug === 'enterprise') features.push('API access + Soporte dedicado');

        const card = document.createElement('div');
        card.className = `plan-card${isActive ? ' active' : ''}`;
        card.innerHTML = `
            ${isActive ? '<div class="plan-badge">ACTUAL</div>' : ''}
            <div class="plan-name">${p.name}</div>
            <div class="plan-desc">${p.description}</div>
            <div class="plan-price">
                ${p.price_monthly > 0 ? `$${p.price_monthly}` : (p.slug === 'pay_per_search' ? 'Variable' : 'Gratis')}
                ${p.price_monthly > 0 ? '<span>/mes</span>' : ''}
            </div>
            <ul class="plan-features">
                ${features.map(f => `<li>${f}</li>`).join('')}
            </ul>
        `;
        card.onclick = () => selectPlan(p.id);
        if (isActive) card.style.cursor = 'default';
        grid.appendChild(card);
    });
}

let SELECTED_PLAN_ID = null;

function selectPlan(planId) {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return;
    if (plan.slug === CURRENT_PLAN) return;
    if (plan.price_monthly <= 0 && plan.slug !== 'pay_per_search') {
        // Free plan - just switch
        alert('Cambio a plan gratuito realizado');
        return;
    }
    SELECTED_PLAN_ID = planId;
    document.getElementById('paymentSection').querySelector('h3').textContent =
        `Pagar con: ${plan.name} - $${plan.price_monthly}/mes`;
    document.getElementById('paymentSection').scrollIntoView({behavior: 'smooth'});
}

function checkout(provider) {
    if (!SELECTED_PLAN_ID) return alert('Selecciona un plan primero');
    if (!USER) return alert('Inicia sesión primero');

    fetch(`${API}/api/checkout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({plan_id: SELECTED_PLAN_ID, provider, is_yearly: false}),
    })
    .then(r => r.json())
    .then(d => {
        if (d.checkout_url) window.location.href = d.checkout_url;
        else alert(d.detail || 'Error');
    })
    .catch(e => alert('Error de conexión'));
}

function showSubPage() {
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('subPage').classList.add('active');
    loadPaymentHistory();
}

function hideSubPage() {
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('subPage').classList.remove('active');
}

// ─── Payment History ────────────────────────────────────

async function loadPaymentHistory() {
    if (!USER || !TOKEN) {
        document.getElementById('paymentHistory').innerHTML = '';
        return;
    }
    try {
        const r = await fetch(`${API}/api/payment/history`, {
            headers: {'Authorization': `Bearer ${TOKEN}`},
        });
        if (!r.ok) return;
        const payments = await r.json();
        const el = document.getElementById('paymentHistory');
        if (!payments.length) {
            el.innerHTML = '<h4>📋 Historial de pagos</h4><p style="font-size:13px;color:var(--text2)">Sin pagos registrados</p>';
            return;
        }
        el.innerHTML = `
            <h4>📋 Historial de pagos</h4>
            <table>
                <tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Estado</th></tr>
                ${payments.map(p => `
                    <tr>
                        <td>${new Date(p.created_at).toLocaleDateString('es-AR')}</td>
                        <td>$${p.amount.toFixed(2)}</td>
                        <td>${p.provider}</td>
                        <td class="status-${p.status}">${p.status}</td>
                    </tr>
                `).join('')}
            </table>
        `;
    } catch (e) {}
}

// ─── Search ─────────────────────────────────────────────

async function doSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;

    const btn = document.getElementById('searchBtn');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const results = document.getElementById('results');

    btn.disabled = true;
    btn.textContent = 'Buscando...';
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    results.classList.add('hidden');

    try {
        const site = document.getElementById('siteSelect').value;
        const headers = TOKEN ? {'Authorization': `Bearer ${TOKEN}`} : {};
        const r = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}&site=${site}`, {headers});
        const data = await r.json();

        // Handle payment required (402)
        if (data.error === 'usage_limit') {
            showError(data.message + ' — <a href="#" onclick="showSubPage();return false" style="color:var(--accent)">Ver planes</a>');
            return;
        }
        if (data.error) {
            showError(data.error);
            return;
        }

        renderResults(data);
        // Update usage
        if (data.usage && data.usage.remaining) {
            const m = data.usage.remaining.match(/(\d+)/);
            if (m) document.getElementById('usageCount').textContent = m[1];
        }
    } catch (e) {
        showError('Error de conexión. Asegúrate de que el servidor esté corriendo.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analizar';
        loading.classList.add('hidden');
    }
}

function renderResults(data) {
    document.getElementById('statMin').textContent = formatPrice(data.stats.min);
    document.getElementById('statMax').textContent = formatPrice(data.stats.max);
    document.getElementById('statAvg').textContent = formatPrice(data.stats.avg);
    document.getElementById('statMedian').textContent = formatPrice(data.stats.median);
    document.getElementById('statTotal').textContent = data.stats.total;

    const ai = data.ai;
    document.getElementById('aiPrice').textContent = formatPrice(ai.suggested_price);
    const riskTag = document.getElementById('aiRisk');
    riskTag.textContent = riskLabel(ai.risk_level);
    riskTag.className = `ai-tag ${ai.risk_level}`;
    document.getElementById('aiReason').textContent = ai.reason;
    document.getElementById('aiInsight').textContent = ai.competitor_insight || '—';

    const productList = document.getElementById('productList');
    document.getElementById('productCount').textContent = data.products.length;
    productList.innerHTML = '';

    data.products.forEach(p => {
        const item = document.createElement('div');
        item.className = 'product-item';
        item.innerHTML = `
            <div class="product-title">
                <a href="${p.url}" target="_blank" rel="noopener">${p.title}</a>
                <div class="product-condition">${p.condition === 'new' ? '🆕 Nuevo' : '♻️ Usado'}</div>
            </div>
            <div style="text-align:right">
                <div class="product-price">${formatPrice(p.price)}</div>
                <div class="product-condition">${p.currency}</div>
            </div>
        `;
        productList.appendChild(item);
    });

    // Pre-fill desc generator
    if (data.products.length > 0) {
        document.getElementById('descTitle').value = data.products[0].title;
        document.getElementById('descPrice').value = data.products[0].price;
    }

    document.getElementById('results').classList.remove('hidden');
    document.getElementById('results').scrollIntoView({behavior: 'smooth', block: 'start'});
}

// ─── Description Generator ─────────────────────────────

async function generateDescription() {
    const title = document.getElementById('descTitle').value.trim();
    const price = document.getElementById('descPrice').value.trim();
    const features = document.getElementById('descFeatures').value.trim();
    if (!title) return;

    if (!USER) return alert('Inicia sesión para usar esta función');

    const btn = document.getElementById('generateDescBtn');
    btn.disabled = true;
    btn.textContent = 'Generando...';

    try {
        let url = `${API}/api/describe?title=${encodeURIComponent(title)}&price=${price || 0}`;
        if (features) url += `&features=${encodeURIComponent(features)}`;

        const r = await fetch(url, {
            headers: {'Authorization': `Bearer ${TOKEN}`},
        });
        if (r.status === 402) {
            alert('Necesitas un plan Pro o Enterprise para generar descripciones');
            return;
        }
        const data = await r.json();
        const descResult = document.getElementById('descResult');
        document.getElementById('descText').textContent = data.description_es;
        descResult.classList.remove('hidden');
    } catch (e) {
        alert('Error al generar descripción');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generar descripción';
    }
}

function copyDescription() {
    const text = document.getElementById('descText').textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyDescBtn');
        btn.textContent = '✅ Copiado';
        setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
    });
}

// ─── Admin Panel ────────────────────────────────────────

let adminVisible = false;

async function toggleAdmin() {
    const panel = document.getElementById('adminPanel');
    adminVisible = !adminVisible;
    panel.classList.toggle('active', adminVisible);
    if (adminVisible) {
        await loadAdminData();
    }
}

async function loadAdminData() {
    if (!USER || USER.role !== 'admin') return;
    try {
        const headers = {'Authorization': `Bearer ${TOKEN}`};

        // Stats
        const sr = await fetch(`${API}/api/admin/stats`, {headers});
        if (sr.ok) {
            const stats = await sr.json();
            document.getElementById('adminStats').innerHTML = `
                <div class="stat-item"><div class="num">${stats.total_users}</div><div class="label">Usuarios</div></div>
                <div class="stat-item"><div class="num">${stats.active_subscriptions}</div><div class="label">Suscripciones</div></div>
                <div class="stat-item"><div class="num">${stats.total_searches}</div><div class="label">Búsquedas</div></div>
                <div class="stat-item"><div class="num">$${stats.total_revenue || 0}</div><div class="label">Ingresos</div></div>
            `;
        }

        // Plans
        const pr = await fetch(`${API}/api/admin/plans`, {headers});
        if (pr.ok) {
            const plans = await pr.json();
            document.getElementById('adminPlans').innerHTML = plans.map(p => `
                <div class="plan-toggle">
                    <div>
                        <strong>${p.name}</strong>
                        <span style="font-size:12px;color:var(--text2)"> — ${p.subscriber_count} suscriptores</span>
                    </div>
                    <div class="toggle ${p.enabled ? 'on' : ''}" data-id="${p.id}" data-enabled="${p.enabled}" onclick="togglePlan(this)">
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {}
}

async function togglePlan(el) {
    const id = el.dataset.id;
    const enabled = el.dataset.enabled === 'true' ? false : true;
    try {
        const r = await fetch(`${API}/api/admin/plans/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`,
            },
            body: JSON.stringify({enabled}),
        });
        if (r.ok) {
            el.classList.toggle('on', enabled);
            el.dataset.enabled = enabled;
        }
    } catch (e) {}
}

// ─── Utils ──────────────────────────────────────────────

function showError(msg) {
    const el = document.getElementById('error');
    el.innerHTML = msg;
    el.classList.remove('hidden');
    el.scrollIntoView({behavior: 'smooth'});
}

function formatPrice(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    return '$' + n.toLocaleString('es-AR');
}

function riskLabel(level) {
    const labels = { bajo: '🟢 Bajo', medio: '🟡 Medio', alto: '🔴 Alto' };
    return labels[level] || level;
}
