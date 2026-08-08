const API = window.location.hostname.includes("mlprecios.com") || window.location.hostname === "159.75.27.216" ? "/precios/api" : "https://mlprecios.com/precios/api";
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
   i18n (Español / 中文)
   ═══════════════════════════════════════════════════════════ */
const I18N = {
  es: {
    nav_home: 'Inicio', nav_plans: 'Planes', nav_admin: 'Admin', nav_login: 'Iniciar sesión',
    dd_subscription: 'Mi suscripción', dd_history: 'Historial', dd_logout: 'Cerrar sesión',
    hero_badge: 'Potenciado por Inteligencia Artificial',
    hero_t1: 'Precios inteligentes', hero_t2: 'para vender más',
    hero_sub: 'Analiza el mercado de Mercado Libre en tiempo real. IA que te dice exactamente a qué precio vender y por qué.',
    search_ph: 'Buscar producto… ej: iPhone 15 Pro, Nike Air Max, Samsung S24',
    search_btn: 'Analizar', search_usage_init: 'Búsquedas gratuitas restantes: —', search_plans: 'Ver planes',
    popular: 'Popular:',
    cn_mode_title: '🇨🇳 Modo vendedor chino',
    cn_mode_sub: 'Ingresá tu costo de compra y flete: calculamos ganancia neta, ROI y precio sugerido por producto',
    cn_cost: 'Costo ¥ (CNY)', cn_freight: 'Flete ¥/unidad', cn_apply: 'Aplicar',
    calc_title: 'Calculadora de ganancia para vendedor chino',
    calc_sub: 'Costo → impuestos → comisión → retiro. Sabé cuánto ganás en cada mercado y a qué precio vender.',
    calc_site: 'Mercado', calc_sell: 'Precio local (opcional)', calc_cost: 'Costo ¥ (CNY)',
    calc_freight: 'Flete ¥/unidad (vacío = default del país)', calc_btn: 'Calcular ganancia',
    loading_t: 'Analizando el mercado…', loading_s: 'Buscando productos y calculando precios óptimos',
    ai_title: 'Análisis de IA', products_title: 'Productos encontrados',
    desc_title: 'Generar descripción profesional', desc_sub: 'Descripción lista para copiar y pegar en tu publicación de Mercado Libre. Ahorrá tiempo y vendé más.',
    desc_ph: 'Nombre del producto para generar descripción…', desc_btn: 'Generar con IA', desc_result_label: 'Descripción generada',
    feat_title: 'Todo para vender mejor', feat_sub: 'Herramientas profesionales para vendedores de e-commerce',
    feat1_t: 'Análisis en tiempo real', feat1_s: 'Precio mínimo, máximo, promedio y mediana del mercado actualizados al instante desde Mercado Libre.',
    feat2_t: 'Recomendación con IA', feat2_s: 'DeepSeek analiza la competencia y te sugiere el precio óptimo con explicación detallada.',
    feat3_t: 'Descripciones automáticas', feat3_s: 'Genera títulos y descripciones profesionales para tus publicaciones en segundos.',
    feat4_t: 'Múltiples mercados', feat4_s: 'Argentina, México, Chile, Brasil, Uruguay — analiza cualquier mercado de Latinoamérica.',
    feat5_t: 'Ganancia para vendedor chino', feat5_s: 'Ingresá costo y flete: calculamos impuestos, comisión y retiro. Ganancia neta, ROI y precio sugerido.',
    feat6_t: 'Interfaz en chino', feat6_s: 'Todo el sitio conmutables entre 中文 / Español. Sin fricción para vendedores de China.',
    footer_tag: 'Inteligencia de precios para vendedores de Latinoamérica.',
    footer_plans: 'Planes', footer_terms: 'Términos', footer_privacy: 'Privacidad', footer_copy: '© 2026 ML Precios. Todos los derechos reservados.',
    pricing_t: 'Planes y precios', pricing_s: 'Elige el plan perfecto para tu negocio. Sin costos ocultos.',
    loading_sub: 'Cargando suscripción…', loading_history: 'Cargando historial…', loading_admin: 'Cargando panel…',
    history_t: 'Historial de pagos',
    admin_t: 'Administración', admin_dash: 'Dashboard', admin_plans: 'Planes', admin_users: 'Usuarios', admin_settings: 'Configuración',
    auth_login_tab: 'Iniciar sesión', auth_register_tab: 'Crear cuenta', auth_pass: 'Contraseña', auth_name: 'Nombre',
    auth_login_btn: 'Iniciar sesión', auth_register_btn: 'Crear cuenta', auth_name_ph: 'Tu nombre', auth_pass_ph: 'Mínimo 6 caracteres',
    auth_ref: 'Código de invitación (opcional)',
    stat_min: 'Precio mínimo', stat_max: 'Precio máximo', stat_avg: 'Promedio', stat_median: 'Mediana',
    stat_count: 'Productos', stat_range: 'Rango de precios',
    ai_analyzing: 'DeepSeek analizando el mercado...', ai_no_data: 'No hay suficiente datos para generar analisis de IA.',
    ai_risk: 'Riesgo', ai_ok: 'Análisis completado.',
    no_results_t: 'Sin resultados para', no_results_s: 'No se encontraron productos. Intentá con otra búsqueda.',
    results_for: 'Resultados para', showing: 'Mostrando', products: 'productos',
    desc_enter: 'Ingresa un producto', desc_gen: 'Generando...', desc_gen2: 'DeepSeek generando...', desc_gen_btn: 'Generar con IA',
    desc_fail: 'No se pudo generar. Intenta de nuevo.', desc_conn: 'Error de conexion', desc_limit: 'Limite alcanzado',
    upgrade_t: 'Límite de búsquedas alcanzado', upgrade_s1: 'Has agotado tus búsquedas gratuitas del plan actual.',
    upgrade_s2: 'Actualizá tu plan para seguir usando ML Precios sin límites.', upgrade_btn: 'Ver planes y precios', upgrade_no: 'Ahora no',
    share_t: '📤 Compartir resultados', share_wa: 'Compartir en WhatsApp', share_fb: 'Compartir en Facebook', share_copy: 'Copiar enlace',
    usage_login: 'Inicia sesión para ver tus búsquedas', usage_left_today: 'Hoy no te quedan búsquedas gratuitas',
    usage_left: 'Te quedan', usage_of: 'de', usage_today: 'búsquedas hoy',
    pricing_free: 'Gratis', pricing_forever: 'Para siempre', pricing_month: '/mes', pricing_popular: 'Más popular',
    pricing_start: 'Comenzar gratis', pricing_choose: 'Elegir plan',
    sub_login: 'Iniciá sesión para ver tu suscripción.', sub_title: 'Mi suscripción', sub_plan: 'Plan actual',
    sub_status: 'Estado', sub_remaining: 'Búsquedas restantes', sub_change: 'Cambiar plan',
    hist_empty: 'No hay pagos registrados.', hist_login: 'Iniciá sesión para ver tu historial.',
    cn_verdict_strong: '强机会', cn_verdict_ok: '可做', cn_verdict_caution: '谨慎', cn_verdict_no: '不建议',
    cn_overview_t: '🇨🇳 中国卖家视角', cn_overview_opp: '个产品有机会（净利率≥15%）', cn_overview_avg: '平均净利率',
    cn_best: '最佳机会', cn_net: '净利 ¥', cn_roi: 'ROI', cn_cost_label: '采购成本',
    calc_result_t: '计算结果', calc_revenue: '回款人民币', calc_cost_line: '采购成本', calc_freight_line: '头程运费',
    calc_duty_line: '进口关税', calc_fee_line: '平台佣金', calc_withdraw_line: '提现费', calc_total_cost: '总成本',
    calc_net: '净利润', calc_margin: '净利率', calc_roi: 'ROI', calc_suggest_t: '建议售价（按目标净利率反推）',
    calc_need_cost: '请先输入采购成本（CNY）', calc_sell_hint: '当地售价', calc_usd_hint: '≈ USD',
    lang_toggle_title: 'Idioma / 语言',
  },
  zh: {
    nav_home: '首页', nav_plans: '套餐', nav_admin: '管理', nav_login: '登录',
    dd_subscription: '我的订阅', dd_history: '历史记录', dd_logout: '退出登录',
    hero_badge: 'AI 智能驱动',
    hero_t1: '智能定价', hero_t2: '卖出更多',
    hero_sub: '实时分析 Mercado Libre（美客多）市场。AI 告诉你该卖多少钱、为什么。',
    search_ph: '搜索产品… 例如：iPhone 15 Pro、Nike Air Max、Samsung S24',
    search_btn: '分析', search_usage_init: '今日剩余免费搜索：—', search_plans: '查看套餐',
    popular: '热门:',
    cn_mode_title: '🇨🇳 中国卖家模式',
    cn_mode_sub: '输入采购价和头程运费，每个产品直接算净利润、ROI 和建议售价',
    cn_cost: '采购价 ¥ (CNY)', cn_freight: '头程 ¥/件', cn_apply: '应用',
    calc_title: '中国卖家利润计算器',
    calc_sub: '采购价 → 关税 → 平台佣金 → 提现费，一键算清每个拉美站点能赚多少、该卖多少钱',
    calc_site: '目标站点', calc_sell: '当地售价（选填，填了算真实利润）', calc_cost: '采购成本 ¥ (CNY)',
    calc_freight: '头程运费 ¥/件（留空用站点默认）', calc_btn: '计算利润',
    loading_t: '正在分析市场…', loading_s: '正在搜索产品并计算最优价格',
    ai_title: 'AI 分析', products_title: '找到的产品',
    desc_title: '生成专业描述', desc_sub: '生成可直接粘贴到 Mercado Libre 刊登页的描述，省时多卖',
    desc_ph: '输入产品名称生成描述…', desc_btn: 'AI 生成', desc_result_label: '已生成描述',
    feat_title: '一切为了卖得更好', feat_sub: '为跨境电商卖家打造的专业工具',
    feat1_t: '实时市场分析', feat1_s: 'Mercado Libre 实时价格：最低、最高、均价、中位数，一屏看全。',
    feat2_t: 'AI 定价建议', feat2_s: 'DeepSeek 分析竞争格局，给出最优售价和详细理由。',
    feat3_t: '自动生成描述', feat3_s: '几秒钟生成专业标题和描述，直接复制到你的刊登。',
    feat4_t: '多市场覆盖', feat4_s: '阿根廷、墨西哥、智利、巴西、乌拉圭——拉美市场任意分析。',
    feat5_t: '中国卖家利润计算', feat5_s: '输入采购价和头程运费，自动算清关税、佣金、提现费，净利润和 ROI 一目了然，还能反推建议售价。',
    feat6_t: '中文界面', feat6_s: '全站支持中文 / Español 一键切换，国内卖家零门槛上手。',
    footer_tag: '为拉美卖家提供的价格智能工具。',
    footer_plans: '套餐', footer_terms: '条款', footer_privacy: '隐私', footer_copy: '© 2026 ML Precios. 版权所有。',
    pricing_t: '套餐与价格', pricing_s: '选择适合你业务的套餐，无隐藏费用。',
    loading_sub: '正在加载订阅…', loading_history: '正在加载记录…', loading_admin: '正在加载面板…',
    history_t: '支付记录',
    admin_t: '管理后台', admin_dash: '仪表盘', admin_plans: '套餐', admin_users: '用户', admin_settings: '设置',
    auth_login_tab: '登录', auth_register_tab: '注册', auth_pass: '密码', auth_name: '姓名',
    auth_login_btn: '登录', auth_register_btn: '注册', auth_name_ph: '你的姓名', auth_pass_ph: '至少6位字符',
    auth_ref: '邀请码（选填）',
    stat_min: '最低价', stat_max: '最高价', stat_avg: '均价', stat_median: '中位数',
    stat_count: '商品数', stat_range: '价格区间',
    ai_analyzing: 'DeepSeek 正在分析市场...', ai_no_data: '数据不足，无法生成 AI 分析。',
    ai_risk: '风险', ai_ok: '分析完成。',
    no_results_t: '没有找到', no_results_s: '没有找到相关产品，换个关键词试试。',
    results_for: '结果：', showing: '显示', products: '个产品',
    desc_enter: '请输入产品名称', desc_gen: '生成中...', desc_gen2: 'DeepSeek 生成中...', desc_gen_btn: 'AI 生成',
    desc_fail: '生成失败，请重试。', desc_conn: '连接错误', desc_limit: '已达上限',
    upgrade_t: '搜索次数已达上限', upgrade_s1: '当前套餐的免费搜索次数已用完。',
    upgrade_s2: '升级套餐，无限使用 ML Precios。', upgrade_btn: '查看套餐价格', upgrade_no: '暂不升级',
    share_t: '📤 分享结果', share_wa: '分享到 WhatsApp', share_fb: '分享到 Facebook', share_copy: '复制链接',
    usage_login: '登录后查看剩余搜索次数', usage_left_today: '今天免费搜索次数已用完',
    usage_left: '今日剩余', usage_of: '/', usage_today: '次',
    pricing_free: '免费', pricing_forever: '永久免费', pricing_month: '/月', pricing_popular: '最受欢迎',
    pricing_start: '免费开始', pricing_choose: '选择套餐',
    sub_login: '请先登录查看订阅。', sub_title: '我的订阅', sub_plan: '当前套餐',
    sub_status: '状态', sub_remaining: '剩余搜索次数', sub_change: '更换套餐',
    hist_empty: '暂无支付记录。', hist_login: '请先登录查看记录。',
    cn_verdict_strong: '强机会', cn_verdict_ok: '可做', cn_verdict_caution: '谨慎', cn_verdict_no: '不建议',
    cn_overview_t: '🇨🇳 中国卖家视角', cn_overview_opp: '个产品有机会（净利率≥15%）', cn_overview_avg: '平均净利率',
    cn_best: '最佳机会', cn_net: '净利 ¥', cn_roi: 'ROI',
    calc_result_t: '计算结果', calc_revenue: '回款人民币', calc_cost_line: '采购成本', calc_freight_line: '头程运费',
    calc_duty_line: '进口关税', calc_fee_line: '平台佣金', calc_withdraw_line: '提现费', calc_total_cost: '总成本',
    calc_net: '净利润', calc_margin: '净利率', calc_roi: 'ROI', calc_suggest_t: '建议售价（按目标净利率反推）',
    calc_need_cost: '请先输入采购成本（CNY）', calc_sell_hint: '当地售价', calc_usd_hint: '≈ USD',
    lang_toggle_title: '语言 / Idioma',
  }
};
let LANG = localStorage.getItem('ml_lang') || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'es');
function T(key) { return (I18N[LANG] && I18N[LANG][key]) || I18N.es[key] || key; }
function toggleLang() { LANG = LANG === 'zh' ? 'es' : 'zh'; localStorage.setItem('ml_lang', LANG); applyLang(); }
function applyLang() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (k && I18N[LANG] && I18N[LANG][k] !== undefined) el.textContent = I18N[LANG][k];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const k = el.dataset.i18nPh;
    if (k && I18N[LANG] && I18N[LANG][k] !== undefined) el.placeholder = I18N[LANG][k];
  });
  const lt = document.getElementById('langToggle');
  if (lt) { lt.textContent = LANG === 'zh' ? 'ES' : '中文'; lt.title = T('lang_toggle_title'); }
  updateSearchUsage(); updateHeader();
}

/* ─── 中国卖家模式状态 ─── */
let CN_MODE = false, CN_COST = 0, CN_FREIGHT = 0;
function applyCNMode() {
  const prev = CN_MODE;
  CN_MODE = document.getElementById('cnModeToggle')?.checked || false;
  const cost = parseFloat(document.getElementById('cnCost')?.value || '0');
  const freight = parseFloat(document.getElementById('cnFreight')?.value || '0');
  CN_COST = isNaN(cost) || cost < 0 ? 0 : cost;
  CN_FREIGHT = isNaN(freight) || freight < 0 ? 0 : freight;
  document.getElementById('cnInputs')?.classList.toggle('hidden', !CN_MODE);
  if (CN_MODE !== prev) {
    const q = document.getElementById('searchInput')?.value.trim();
    if (q) doSearch();
  }
}

const fmtCNY = n => {
  try { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(n); }
  catch { return '¥' + Math.round(n).toLocaleString(); }
};
const fmtUSD = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const VERDICT_CLASS = { strong: 'cn-v-strong', ok: 'cn-v-ok', caution: 'cn-v-caution', no: 'cn-v-no' };
function verdictLabel(v) { return T('cn_verdict_' + (v || 'no')) || v; }

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

/* ─── Visit tracking (anónimo) ─── */
(function () {
  try {
    fetch(API + '/track/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'app' }) }).catch(() => { });
  } catch (e) { }
})();

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
  const ref = ($('regRef')?.value || '').trim();
  if (!email || !pass) return;
  const body = { email, password: pass, name };
  if (ref) body.referral_code = ref;
  const result = await api('POST', '/auth/register', body);
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
    show($('calcSection'));
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
  hide($('calcSection'));
  hide($('resultsSection'));
  show($('loadingSection'));
  $('loadingSection').scrollIntoView({ behavior: 'smooth' });

  const site = $('siteSelect').value;
  let url = `/search?q=${encodeURIComponent(q)}&site=${site}`;
  if (CN_MODE && CN_COST > 0) { url += `&cost_cny=${CN_COST}&freight_cny=${CN_FREIGHT || 0}`; }
  const data = await api('GET', url);

  hide($('loadingSection'));

  if (data.status === 402 || data.error === 'usage_limit') {
    showUpgradeModal(data.message || data.detail || 'Limite alcanzado');
    return;
  }

  if (data.error || !data.products) {
    show($('resultsSection'));
    $('resultsTitle').textContent = `${T('no_results_t')} "${q}"`;
    $('resultsCount').textContent = '';
    $('statsGrid').innerHTML = '';
    $('productsGrid').innerHTML = `<p style="color:var(--text-tertiary);padding:40px;text-align:center">${T('no_results_s')}</p>`;
    hide($('aiPanel'));
    hide($('describeCard'));
    hide($('cnOverview'));
    $('resultsSection').scrollIntoView({ behavior: 'smooth' }); showShareBar();
    return;
  }

  show($('resultsSection'));
  $('resultsTitle').textContent = `${T('results_for')} "${q}"`;
  $('resultsCount').textContent = `${data.total} ${T('products')} · ${data.site}`;

  // 中国卖家视角总览
  const cnOv = $('cnOverview');
  if (cnOv) {
    if (data.cn_analysis && data.cn_analysis.mode) {
      const ca = data.cn_analysis;
      const best = ca.best?._profit_cn || null;
      show(cnOv);
      cnOv.innerHTML = `
        <div class="cn-overview-head">${T('cn_overview_t')}</div>
        <div class="cn-overview-grid">
          <div class="cn-ov-item"><div class="cn-ov-label">${T('cn_cost_label')}</div><div class="cn-ov-value">¥${ca.cost_cny}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('cn_freight')}</div><div class="cn-ov-value">¥${ca.freight_cny}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('cn_overview_avg')}</div><div class="cn-ov-value">${ca.avg_margin}%</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('cn_overview_opp')}</div><div class="cn-ov-value" style="color:var(--success)">${ca.opportunities}</div></div>
        </div>
        ${best ? `<div class="cn-ov-best">🏆 ${T('cn_best')}: ${truncate(ca.best.title, 60)} — ${T('cn_net')} ${fmtCNY(best.net_cny)} · ${T('cn_roi')} ${best.roi}% · ${verdictLabel(best.verdict)}</div>` : ''}`;
    } else {
      hide(cnOv);
      cnOv.innerHTML = '';
    }
  }

  // Stats
  if (data.stats) {
    $('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">${T('stat_min')}</div>
        <div class="stat-value positive">${fmtCurrency(data.stats.min, data.stats.currency)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${T('stat_max')}</div>
        <div class="stat-value">${fmtCurrency(data.stats.max, data.stats.currency)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${T('stat_avg')}</div>
        <div class="stat-value neutral">${fmtCurrency(data.stats.avg, data.stats.currency)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${T('stat_median')}</div>
        <div class="stat-value">${fmtCurrency(data.stats.median, data.stats.currency)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${T('stat_count')}</div>
        <div class="stat-value">${data.stats.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${T('stat_range')}</div>
        <div class="stat-value" style="font-size:14px">${data.stats.range}</div>
      </div>
    `;
  }

  // AI Analysis - load async for speed
  loadAIAsync(q, site);
  // Products
  $('productsSub').textContent = `${T('showing')} ${Math.min(data.products.length, 20)} ${T('products')}`;
  $('productsGrid').innerHTML = data.products.map(p => {
    const cn = p._profit_cn ? `
      <div class="cn-profit ${VERDICT_CLASS[p._profit_cn.verdict] || 'cn-v-no'}">
        <span class="cn-profit-net">${T('cn_net')} ${fmtCNY(p._profit_cn.net_cny)}</span>
        <span class="cn-profit-roi">${T('cn_roi')} ${p._profit_cn.roi}%</span>
        <span class="cn-profit-margin">${p._profit_cn.margin}%</span>
        <span class="cn-profit-v">${verdictLabel(p._profit_cn.verdict)}</span>
      </div>` : '';
    return `
    <a class="product-card" href="${p.url}" target="_blank" rel="noopener">
      ${p.image ? `<img class="product-image" src="${p.image}" alt="${p.title}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="product-info">
        <div class="product-title" title="${p.title}">${truncate(p.title, 80)}</div>
        <div class="product-price">${fmtCurrency(p.price, p.currency)}</div>
        <div class="product-meta">
          ${p.condition ? `<span>${p.condition}</span>` : ''}
          ${p.currency ? `<span>${p.currency}</span>` : ''}
        </div>
        ${cn}
      </div>
    </a>
  `;
  }).join('');

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
  $('aiBody').innerHTML = `<div class="ai-loading"><span class="ai-dot"></span>${T('ai_analyzing')}</div>`;
  
  try {
    // Use a separate lightweight AI-only endpoint
    const aiData = await api('GET', '/ai/analyze?q=' + encodeURIComponent(query) + '&site=' + site);
    
    if (aiData.suggested_price) {
      const riskLevels = { 'bajo': 'risk-low', 'low': 'risk-low', 'medio': 'risk-medium', 'medium': 'risk-medium', 'alto': 'risk-high', 'high': 'risk-high' };
      const riskClass = riskLevels[aiData.risk_level?.toLowerCase()] || 'risk-low';
      $('aiBody').innerHTML = '<div class="ai-suggested">' + (aiData.currency || '$') + ' ' + (aiData.suggested_price?.toLocaleString() || aiData.suggested_price) + '</div><div class="ai-reason">' + (aiData.reason || T('ai_ok')) + '</div><div class="ai-meta"><span class="ai-tag ' + riskClass + '">' + T('ai_risk') + ' ' + (aiData.risk_level || 'N/A') + '</span>' + (aiData.competitor_insight ? '<span class="ai-tag insight">' + aiData.competitor_insight + '</span>' : '') + '</div>';
    } else {
      $('aiBody').innerHTML = `<p style="color:var(--text-tertiary);text-align:center;padding:12px">${T('ai_no_data')}</p>`;
    }
  } catch(e) {
    hide($('aiPanel'));
  }
}
async function generateDescription() {
  const title = $('describeInput').value.trim();
  if (!title) { show($('describeResultWrap')); hide($('copyDescBtn')); $('describeResult').textContent = T('desc_enter'); return; }
  $('describeBtn').textContent = T('desc_gen');
  $('describeBtn').disabled = true;
  show($('describeResultWrap'));
  hide($('copyDescBtn'));
  $('describeResult').textContent = T('desc_gen2');
  try {
    const data = await api('GET', '/describe?title=' + encodeURIComponent(title));
    if (data.status === 402) { $('describeBtn').textContent = T('desc_gen_btn'); $('describeBtn').disabled = false; $('describeResult').textContent = data.detail || T('desc_limit'); showUpgradeModal(data.detail); return; }
    $('describeBtn').textContent = T('desc_gen_btn');
    $('describeBtn').disabled = false;
    const text = data.description_es || data.description || data.result;
    
    if (text) { $('describeResult').textContent = text; show($('copyDescBtn')); }
    else { $('describeResult').textContent = (data.detail||data.error||T('desc_fail')); if(data.status===402) showUpgradeModal(data.detail); }
  } catch(e) {
    $('describeBtn').textContent = T('desc_gen_btn');
    $('describeBtn').disabled = false;
    $('describeResult').textContent = T('desc_conn');
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
      'free': [T('pf_free_1') || '10 busquedas/dia', 'AI analisis de precios', '1 descripcion IA'],
      'pro': ['500 busquedas/mes', 'AI analisis avanzado', '50 descripciones IA/mes'],
      'enterprise': ['Busquedas ilimitadas', '100 descripciones IA/mes', 'Exportacion CSV'],
      'professional': ['Busquedas ilimitadas', '500 descripciones IA/mes', 'CSV + PDF', 'Seguimiento competidores'],
      'pay_per_search': ['Pago por busqueda', 'AI analisis'],
    };
    const features = planFeatures[plan.slug] || planFeatures['free'];

    return `
      <div class="pricing-card ${featured ? 'featured' : ''}">
        ${featured ? `<div class="pricing-badge">${T('pricing_popular')}</div>` : ''}
        <div class="pricing-name">${plan.name || plan.slug}</div>
        <div class="pricing-price">${price === 0 ? T('pricing_free') : '$' + price.toLocaleString()}</div>
        <div class="pricing-period">${price === 0 ? T('pricing_forever') : T('pricing_month')}</div>
        <ul class="pricing-features">
          ${features.map(f => `<li><span class="check">✓</span> ${f}</li>`).join('')}
        </ul>
        <button class="pricing-cta ${featured ? 'primary' : 'secondary'}" onclick="handleCheckout('${plan.id || plan.slug}')">
          ${price === 0 ? T('pricing_start') : T('pricing_choose')}
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
    container.innerHTML = `<div style="text-align:center;padding:60px"><p style="color:var(--text-secondary)">${T('sub_login')}</p><br><button class="btn btn-primary" onclick="showAuth()">${T('nav_login')}</button></div>`;
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
      <h2>${T('sub_title')}</h2>
      <div class="sub-detail">
        <div class="sub-detail-label">${T('sub_plan')}</div>
        <div class="sub-detail-value" style="color:var(--accent-hover)">${planName}</div>
      </div>
      <div class="sub-detail">
        <div class="sub-detail-label">${T('sub_status')}</div>
        <div class="sub-detail-value">${data.message || 'Activo'}</div>
      </div>
      ${data.remaining !== undefined ? `
      <div class="sub-detail">
        <div class="sub-detail-label">${T('sub_remaining')}</div>
        <div class="sub-detail-value">${data.remaining}</div>
      </div>` : ''}
      <br>
      <button class="btn btn-secondary" onclick="showPage('pricing')">${T('sub_change')}</button>
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
    container.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:60px">${T('hist_login')}</p>`;
    return;
  }
  const data = await api('GET', '/payment/history');
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `<div class="history-empty">${T('hist_empty')}</div>`;
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
    const [stats, activity] = await Promise.all([
      api('GET', '/admin/stats'),
      api('GET', '/admin/activity')
    ]);
    const daily = (activity && activity.daily) || [];
    const maxD = Math.max(1, ...daily.map(d => Math.max(d.visits || 0, d.logins || 0, d.searches || 0)));
    const bars = daily.map(d => {
      const h = v => Math.round(((v || 0) / maxD) * 80);
      return `<div style="flex:1;text-align:center">
        <div style="display:flex;justify-content:center;align-items:flex-end;gap:3px;height:90px">
          <div title="Visitas" style="width:10px;height:${h(d.visits)}px;background:var(--accent);border-radius:3px 3px 0 0"></div>
          <div title="Logins" style="width:10px;height:${h(d.logins)}px;background:var(--success);border-radius:3px 3px 0 0"></div>
          <div title="Búsquedas" style="width:10px;height:${h(d.searches)}px;background:var(--warning);border-radius:3px 3px 0 0"></div>
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${(d.date || '').slice(5)}</div>
      </div>`;
    }).join('');
    const ACTION_LABEL = { visit_app: 'Visita app', visit_home: 'Visita web', login: 'Login', search: 'Búsqueda', ai_description: 'Descripción IA', referral_reward: 'Bonus referido', share: 'Compartido' };
    const recentRows = ((activity && activity.recent) || []).slice(0, 10).map(r => `
      <tr>
        <td class="mono" style="font-size:11px">${r.time ? new Date(r.time).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
        <td>${ACTION_LABEL[r.action] || r.action}</td>
        <td class="mono" style="font-size:12px">${r.email || 'anon'}</td>
      </tr>`).join('');
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
        <div class="admin-stat"><div class="admin-stat-label">Visitas hoy</div><div class="admin-stat-value" style="color:var(--accent-hover)">${stats.today_visits || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Logins hoy</div><div class="admin-stat-value" style="color:var(--success)">${stats.today_logins || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Compartidos hoy</div><div class="admin-stat-value" style="color:var(--accent-hover)">${stats.today_shares || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Compartidos totales</div><div class="admin-stat-value">${stats.total_shares || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Pagos completados</div><div class="admin-stat-value">${stats.total_payments || 0}</div></div>
        <div class="admin-stat"><div class="admin-stat-label">Ingresos (USD)</div><div class="admin-stat-value" style="color:var(--success)">$${stats.revenue || 0}</div></div>
      </div>
      <div style="margin-top:24px;border:1px solid var(--border);border-radius:12px;padding:16px">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">Actividad últimos 7 días</h3>
        <p style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">Visitas · Logins · Búsquedas</p>
        <div style="display:flex;align-items:flex-end;gap:6px">${bars}</div>
      </div>
      <div style="margin-top:20px;border:1px solid var(--border);border-radius:12px;padding:16px">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">Actividad reciente</h3>
        <table class="admin-table"><thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th></tr></thead><tbody>${recentRows || '<tr><td colspan="3" style="color:var(--text-tertiary)">Sin actividad</td></tr>'}</tbody></table>
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
    '<h3 style="margin-bottom:4px">' + T('upgrade_t') + '</h3>' +
    '<p style="color:var(--text-tertiary);margin-bottom:4px;font-size:13px">' + (message || T('upgrade_s1')) + '</p>' +
    '<p style="color:var(--text-tertiary);margin-bottom:20px;font-size:13px">' + T('upgrade_s2') + '</p>' +
    `<button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="showPage('pricing');document.getElementById('upgradeModal').remove()">${T('upgrade_btn')}</button>` +
    `<button class="btn btn-ghost" style="width:100%" onclick="document.getElementById('upgradeModal').remove()">${T('upgrade_no')}</button></div>`;
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
  applyLang();
  document.getElementById('cnModeToggle')?.addEventListener('change', applyCNMode);
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
    el.textContent = T('usage_login');
    return;
  }
  var num = parseInt(remaining);
  var lim = parseInt(limit);
  if (isNaN(num)) num = 0;
  if (isNaN(lim) || lim <= 0) lim = num;
  if (num <= 0) {
    el.textContent = T('usage_left_today');
    bar.classList.add("exhausted");
  } else {
    el.textContent = `${T('usage_left')} ${num} ${T('usage_of')} ${lim} ${T('usage_today')}`;
    if (num <= 3) bar.classList.add("low");
  }
}

/* --- Share & Referral Bar --- */
function trackShare() {
  try { fetch(API + '/track/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'share' }) }); } catch (e) {}
}
function showShareBar() {
  var old = document.getElementById("shareBar");
  if (old) old.remove();
  var q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  var url = window.location.href;
  var shareText = LANG === 'zh'
    ? '🔍 我在 ML Precios 查到了 "' + q + '" 的价格。AI 分析美客多市场并给出最优定价。 ' + url
    : '🔍 Encontré precios para "' + q + '" en ML Precios. IA que analiza Mercado Libre y te dice el precio óptimo. ' + url;
  var text = encodeURIComponent(shareText);
  var wa = "https://wa.me/?text=" + text;
  var fbQuote = LANG === 'zh'
    ? '我在 ML Precios 找到了 "' + q + '" 的最优定价（AI 分析美客多）'
    : 'Encontré los mejores precios para "' + q + '" en Mercado Libre con IA';
  var fb = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url) + "&quote=" + encodeURIComponent(fbQuote);
  
  var bar = document.createElement("div");
  bar.id = "shareBar";
  bar.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;margin-top:12px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:var(--radius-md);justify-content:space-between";
  bar.innerHTML = `<span style="font-size:13px;color:var(--text-secondary);white-space:nowrap">${T('share_t')}</span>` +
    '<div style="display:flex;gap:6px">' +
    '<a href="' + wa + '" target="_blank" class="btn-icon" title="' + T('share_wa') + '" style="color:#25D366;border-color:#25D36633;background:#25D36611">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>' +
    '<a href="' + fb + '" target="_blank" class="btn-icon" title="' + T('share_fb') + '" style="color:#1877F2;border-color:#1877F233;background:#1877F211">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>' +
    '<button class="btn-icon" onclick="trackShare();copyShareLink()" title="' + T('share_copy') + '" style="color:var(--accent)">' +
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

/* ═══════════════════════════════════════════════════════════
   中国卖家利润计算器
   ═══════════════════════════════════════════════════════════ */
async function runProfitCalc() {
  const site = document.getElementById('calcSite')?.value || 'MLA';
  const sell = parseFloat(document.getElementById('calcSell')?.value || '0');
  const cost = parseFloat(document.getElementById('calcCost')?.value || '0');
  const freight = parseFloat(document.getElementById('calcFreight')?.value || '0');
  const out = document.getElementById('calcResult');
  if (!out) return;
  if (isNaN(cost) || cost <= 0) {
    show(out);
    out.innerHTML = `<div class="calc-msg-warn">${T('calc_need_cost')}</div>`;
    return;
  }
  show(out);
  out.innerHTML = `<div class="calc-loading">${T('desc_gen2')}</div>`;
  let url = `/profit/calc?site=${site}&cost_cny=${cost}`;
  if (!isNaN(sell) && sell > 0) url += `&selling_price=${sell}`;
  if (!isNaN(freight) && freight > 0) url += `&freight_cny=${freight}`;
  const data = await api('GET', url);
  if (!data || data.error) {
    out.innerHTML = `<div class="calc-msg-warn">${T('desc_fail')}</div>`;
    return;
  }
  const a = data.analysis;
  const sug = data.suggestions || {};
  const cur = (a && a.currency) || 'ARS';
  let html = `<div class="calc-head">${T('calc_result_t')} · ${data.site} · ${data.meta.cny_rate}</div>`;
  if (a) {
    const vc = VERDICT_CLASS[a.verdict] || 'cn-v-no';
    html += `
      <div class="calc-grid">
        <div class="calc-col">
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_sell_hint')} (${cur})</div><div class="cn-ov-value">${Number(a.selling_price).toLocaleString()}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_revenue')}</div><div class="cn-ov-value">${fmtCNY(a.revenue_cny)}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_net')}</div><div class="cn-ov-value ${a.net_cny >= 0 ? 'positive' : 'negative'}">${fmtCNY(a.net_cny)}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_margin')}</div><div class="cn-ov-value">${a.margin}%</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_roi')}</div><div class="cn-ov-value">${a.roi}%</div></div>
        </div>
        <div class="calc-col">
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_cost_line')}</div><div class="cn-ov-value">${fmtCNY(a.cost_cny)}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_freight_line')}</div><div class="cn-ov-value">${fmtCNY(a.freight_cny)}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_duty_line')} (${a.breakdown.duty_rate})</div><div class="cn-ov-value">${fmtCNY(a.duty_cny)}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_fee_line')} (${a.breakdown.commission_rate})</div><div class="cn-ov-value">${fmtCNY(a.ml_fee_cny)}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_withdraw_line')}</div><div class="cn-ov-value">${fmtCNY(a.withdraw_cny)}</div></div>
          <div class="cn-ov-item"><div class="cn-ov-label">${T('calc_total_cost')}</div><div class="cn-ov-value">${fmtCNY(a.total_cost_cny)}</div></div>
        </div>
      </div>
      <div class="calc-verdict ${vc}">${verdictLabel(a.verdict)}</div>`;
  } else {
    html += `<p style="color:var(--text-tertiary);font-size:13px;margin-bottom:12px">${T('calc_sell')}: <b>${T('calc_suggest_t')}</b></p>`;
  }
  // 建议售价表
  html += `<div class="calc-suggest"><div class="calc-suggest-title">${T('calc_suggest_t')}</div><div class="calc-suggest-grid">`;
  const fx = (a && a.breakdown && a.breakdown.fx) || 1250;
  Object.keys(sug).forEach(m => {
    const usd = (sug[m] / fx).toFixed(2);
    html += `<div class="calc-suggest-item"><div class="cn-ov-label">${m}%</div><div class="cn-ov-value">${Number(sug[m]).toLocaleString()} ${cur}</div><div class="cn-ov-sub">${T('calc_usd_hint')} ${usd}</div></div>`;
  });
  html += `</div></div>`;
  out.innerHTML = html;
}

