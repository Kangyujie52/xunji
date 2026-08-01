/* ===================== 个人工作台 · 逻辑层（云端同步版 · 多账本） ===================== */
const KEY = 'workstation_v1';
const APP_VERSION = '20260801n16';                               // 程序版本号（与 _publish_app.py 保持一致）
const APP_BLOB_URL = 'https://jsonblob.com/api/jsonBlob/019fb66b-321a-7c45-9520-56f68e87b0bd';  // 云端登记的「最新版本号」
const APP_HOME_URL = 'https://kangyujie52.github.io/xunji/';       // GitHub Pages 在线首页（更新按钮跳转目标）

/* 全局报错可见化：任何脚本错误都会在页面底部弹提示，避免"点了没反应"却查不到原因 */
window.addEventListener('error', (e) => {
  try { if (typeof toast === 'function') toast('⚠️ 页面出错：' + (e.message || '未知错误')); } catch (x) {}
});

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

const DEFAULT = {
  profile: { name: '我', city: '北京' },
  work: { projects: [] },
  life: {
    ledgers: [],          // 多账本：[{id,name,txns:[{id,type:'inc'|'exp',amount,tagId,payId,note,date}]}]
    ledgerTags: [],       // 全局分类标签：[{id,name,icon,color}]
    payMethods: [],       // 全局支付方式：[{id,name,icon}]
    activeLedger: null,
    checkins: [],
    notes: [],
    child: {
      stars: 0,
      pet: { name: '小猫咪', exp: 0, hunger: 80, mood: 80, lastCare: '', actDay: '', actCnt: {}, album: [] },
      tasks: [
        { id: 'ct1', text: '按时完成作业', stars: 2, doneDates: {} },
        { id: 'ct2', text: '阅读30分钟', stars: 1, doneDates: {} },
        { id: 'ct3', text: '整理书桌/收拾玩具', stars: 1, doneDates: {} }
      ],
      days: {}, badges: {}, archive: []
    },
    english: [],
    stocks: { watch: [], notes: [] }
  }
};

let S = load();
function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) { const d = JSON.parse(r); normalize(d); return d; }
  } catch (e) { console.warn('load fail', e); }
  const d = JSON.parse(JSON.stringify(DEFAULT));
  return d;
}
function normalize(d) {
  d.profile = Object.assign({}, DEFAULT.profile, d.profile || {});
  d.work = Object.assign({}, DEFAULT.work, d.work || {});
  d.work.projects = d.work.projects || [];
  d.life = Object.assign({}, DEFAULT.life, d.life || {});
  const L = d.life;
  // 旧版账本数据迁移：把扁平 ledger 包进一个默认账本
  if (Array.isArray(L.ledger) && L.ledger.length && !Array.isArray(L.ledgers)) {
    const txns = L.ledger.map(r => ({ id: uid(), type: r.type === 'inc' ? 'inc' : 'exp', amount: +r.amount || 0, tagId: null, note: r.note || '', date: r.date || todayStr() }));
    L.ledgers = [{ id: uid(), name: '默认账本', txns }];
    delete L.ledger;
  }
  L.ledgers = L.ledgers || [];
  L.ledgerTags = L.ledgerTags || [];
  L.payMethods = L.payMethods || [];
  L.ledgers.forEach(l => { l.txns = l.txns || []; });
  L.activeLedger = (L.activeLedger && L.ledgers.some(l => l.id === L.activeLedger)) ? L.activeLedger : (L.ledgers[0] ? L.ledgers[0].id : null);
  L.checkins = L.checkins || []; L.notes = L.notes || [];
  L.checkins.forEach(c => {
    c.icon = c.icon || '✅';
    c.records = c.records || {};
    if (Array.isArray(c.history)) { c.history.forEach(d => { if (!c.records[d]) c.records[d] = { duration: 0, time: '' }; }); delete c.history; }
    const firstKey = Object.keys(c.records).sort()[0];
    c.startedAt = c.startedAt || (firstKey || todayStr());
    c.remind = Object.assign({ on: false, time: '20:00' }, c.remind || {});
  });
  // 孩子激励：旧版（points/goals）→ 养宠版（stars/tasks/pet）迁移
  L.child = Object.assign({ stars: 0, tasks: [], days: {}, badges: {}, pet: null, archive: [] }, L.child || {});
  if (typeof L.child.points === 'number') { L.child.stars = (L.child.stars || 0) + L.child.points; delete L.child.points; }
  if (Array.isArray(L.child.goals)) {
    L.child.goals.forEach(g => L.child.tasks.push({ id: g.id || uid(), text: g.text || '', stars: 1, doneDates: g.done ? { [todayStr()]: 1 } : {} }));
    delete L.child.goals;
  }
  L.child.tasks = (L.child.tasks || []).map(t => Object.assign({ stars: 1, doneDates: {} }, t));
  L.child.days = L.child.days || {}; L.child.badges = L.child.badges || {};
  L.child.pet = Object.assign({ name: '小猫咪', exp: 0, hunger: 80, mood: 80, lastCare: '', actDay: '', actCnt: {}, album: [] }, L.child.pet || {});
  L.child.pet.actCnt = L.child.pet.actCnt || {}; L.child.pet.album = L.child.pet.album || [];
  L.english = L.english || [];
  L.stocks = Object.assign({ watch: [], notes: [] }, L.stocks || {});
  L.stocks.watch = L.stocks.watch || []; L.stocks.notes = L.stocks.notes || [];
}

/* 本地保存 + 云端同步 */
function save() { localStorage.setItem(KEY, JSON.stringify(S)); pushToCloud(); }

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

/* ---------- toast ---------- */
function toast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(20,24,48,.9);color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;z-index:99;box-shadow:0 6px 24px rgba(0,0,0,.4);backdrop-filter:blur(8px);transition:opacity .3s;'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 1800);
}

/* ===================== 跨设备云同步（jsonblob，免密钥，密钥仅存本机） ===================== */
/* 安全设计：同步密钥不写死在公开代码里。首次运行本地随机生成并存入 localStorage；
   老用户（已有本地数据）沿用 LEGACY_SYNC_ID 迁移以保留云端数据；公开部署时 LEGACY_SYNC_ID 为空，自动生成新密钥。 */
const KEY_SYNC = 'workstation_sync_id';
const LEGACY_SYNC_ID = '';
function genUuid() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function loadSyncId() {
  let id = localStorage.getItem(KEY_SYNC);
  if (!id) {
    if (localStorage.getItem(KEY) && LEGACY_SYNC_ID) id = LEGACY_SYNC_ID;  // 迁移老用户
    else id = genUuid();
    localStorage.setItem(KEY_SYNC, id);
  }
  return id;
}
let SYNC_ID = loadSyncId();
let SYNC_URL = 'https://jsonblob.com/api/jsonBlob/' + SYNC_ID;
let _syncTimer = null;

/* ---------- 专属云端：GitHub 私有仓库（可选，配置后优先使用） ---------- */
const KEY_GH = 'workstation_gh_cfg';
let _ghSha = null;   // data.json 当前版本指纹（GitHub 更新文件时需要）
function ghCfg() {
  try { const c = JSON.parse(localStorage.getItem(KEY_GH) || 'null'); return (c && c.owner && c.repo && c.token) ? c : null; } catch (e) { return null; }
}
function ghApiUrl(c) { return 'https://api.github.com/repos/' + c.owner + '/' + c.repo + '/contents/data.json'; }
function ghHeaders(c) { return { 'Authorization': 'Bearer ' + c.token, 'Accept': 'application/vnd.github+json' }; }
function b64encUtf8(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64decUtf8(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }
function ghIsShell(o) {                                   // 判断是否为「空壳」数据（只有种子、没有任何真实记录）
  if (!o || !o.life) return true;
  const L = o.life || {};
  const ledgers = (L.ledgers || []).reduce((n, x) => n + ((x.txns || []).length), 0);
  const checkins = Object.keys(o.checkins || {}).length;
  const notes = (o.notes || []).length;
  const child = o.child || {};
  const english = o.english || {};
  const stocks = (o.stocks || {}).stocks ? o.stocks.stocks.length : 0;
  return ledgers === 0 && checkins === 0 && notes === 0 &&
         (((child.goals || []).length === 0) && ((child.tasks || []).every(t => Object.keys(t.doneDates || {}).length === 0)) && ((child.stars || 0) === 0) && ((child.points || 0) === 0)) &&
         ((english.words || []).length === 0) && stocks === 0;
}
async function ghGetData(c) {
  const r = await fetch(ghApiUrl(c) + '?t=' + Date.now(), { headers: ghHeaders(c) });
  if (r.status === 404) { _ghSha = null; return null; }              // 仓库还没有数据文件
  if (!r.ok) throw new Error('gh get ' + r.status);
  const j = await r.json();
  _ghSha = j.sha;
  return JSON.parse(b64decUtf8(j.content));
}
async function ghPutData(c, obj, retry) {
  const body = { message: '寻己数据同步 ' + new Date().toLocaleString('zh-CN'), content: b64encUtf8(JSON.stringify(obj)) };
  if (_ghSha) body.sha = _ghSha;
  const r = await fetch(ghApiUrl(c), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(c)), body: JSON.stringify(body) });
  if ((r.status === 409 || r.status === 422) && !retry) {           // 版本指纹过期：重取后重试一次
    try { await ghGetData(c); } catch (e) {}
    return ghPutData(c, obj, true);
  }
  if (!r.ok) throw new Error('gh put ' + r.status);
  const j = await r.json();
  if (j.content && j.content.sha) _ghSha = j.content.sha;
  return true;
}
function setPill(state) {
  const p = $('syncPill'); if (!p) return;
  if (state === 'syncing') { p.textContent = '☁️ 同步中…'; p.className = 'sync-pill syncing'; }
  else if (state === 'ok') { p.textContent = '☁️ 已同步'; p.className = 'sync-pill ok'; }
  else { p.textContent = '⚠️ 离线·本地'; p.className = 'sync-pill offline'; }
}
function pushToCloud(immediate) {
  setPill('syncing');
  clearTimeout(_syncTimer);
  const gc = ghCfg();
  const doPush = gc ? () => {
    S._ts = Date.now();
    ghPutData(gc, S).then(() => setPill('ok')).catch(() => setPill('offline'));
  } : () => {
    S._ts = Date.now();
    fetch(SYNC_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) })
      .then(r => {
        if (r.status === 404) {
          return fetch('https://jsonblob.com/api/jsonBlob', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) })
            .then(rr => { const loc = rr.headers.get('Location'); if (loc) { SYNC_URL = 'https://jsonblob.com' + loc; const nid = loc.split('/').pop(); SYNC_ID = nid; localStorage.setItem(KEY_SYNC, nid); } return 'recreated'; });
        }
        return 'ok';
      })
      .then(() => setPill('ok'))
      .catch(() => setPill('offline'));
  };
  if (immediate) doPush(); else _syncTimer = setTimeout(doPush, 700);
}
async function pullFromCloud() {
  setPill('syncing');
  const gc = ghCfg();
  if (gc) {
    try {
      const data = await ghGetData(gc);
      if (data && data._ts && (!S._ts || data._ts >= S._ts)) {
        Object.assign(S, data); normalize(S); localStorage.setItem(KEY, JSON.stringify(S));
      }
      setPill('ok');
    } catch (e) { setPill('offline'); }
    return;
  }
  try {
    const r = await fetch(SYNC_URL);
    if (r.ok) {
      const data = await r.json();
      if (data && data._ts && (!S._ts || data._ts >= S._ts)) {
        Object.assign(S, data); normalize(S); localStorage.setItem(KEY, JSON.stringify(S));
      }
    }
    setPill('ok');
  } catch (e) { setPill('offline'); }
}
$('syncBtn').onclick = () => pushToCloud(true);

/* ===================== 昵称编辑 ===================== */
const nameEdit = $('nameEdit');
nameEdit.textContent = S.profile.name;
nameEdit.addEventListener('blur', () => { S.profile.name = nameEdit.textContent.trim() || '我'; nameEdit.textContent = S.profile.name; save(); });
nameEdit.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameEdit.blur(); } });

/* ===================== 左侧导台导航 ===================== */
const layout = $('layout');
document.querySelectorAll('.nav-item').forEach(it => {
  it.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    it.classList.add('active');
    $('panel-' + it.dataset.panel).classList.add('active');
    if (it.dataset.panel === 'checkin') { $('checkinDetail').style.display = 'none'; $('checkinHome').style.display = 'block'; renderCheckinHome(); }
    if (it.dataset.panel === 'ledger') { $('ledgerDetail').style.display = 'none'; $('ledgerHome').style.display = 'block'; renderLedgerHome(); }
    if (window.innerWidth <= 720) layout.classList.remove('nav-open');
  };
});
/* 分组父级（生活）：点击只展开 / 收起子模块，不切换页面 */
document.querySelectorAll('.nav-group-parent').forEach(g => {
  g.onclick = () => {
    const sub = document.querySelector('.nav-sub[data-subgroup="' + g.dataset.group + '"]');
    if (sub) sub.classList.toggle('collapsed');
    g.classList.toggle('collapsed');
  };
});
$('backdrop').onclick = () => layout.classList.remove('nav-open');
$('sideToggle').onclick = () => {
  if (window.innerWidth <= 720) layout.classList.toggle('nav-open');
  else layout.classList.toggle('nav-collapsed');
};

/* ===================== 首页（寻己） ===================== */
function todayCheckinCount() {
  const t = todayStr();
  return (S.life.checkins || []).filter(c => c.records && c.records[t]).length;
}
function todayExpense() {
  const t = todayStr();
  let sum = 0;
  (S.life.ledgers || []).forEach(l => (l.txns || []).forEach(x => {
    if (x.type === 'exp' && (x.date || '').slice(0, 10) === t) sum += (+x.amount || 0);
  }));
  return sum;
}
function icon(key) {                       // 取内嵌 IP 图标（icons.js 未加载时返回空，走 emoji 回退）
  return (typeof APP_ICONS !== 'undefined' && APP_ICONS[key]) ? APP_ICONS[key] : '';
}
function renderHome() {
  const av = $('homeAvatar');
  if (av && icon('main')) { av.src = icon('main'); av.style.display = ''; }
  const tav = $('topAvatar');
  if (tav && icon('main')) { tav.src = icon('main'); tav.style.display = ''; const te = $('topEmoji'); if (te) te.style.display = 'none'; }
  const dEl = $('homeDate');
  if (dEl) {
    const d = new Date();
    const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    dEl.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日　星期' + wk;
  }
  const gEl = $('homeGreet');
  if (gEl) {
    const hr = new Date().getHours();
    const greet = hr < 6 ? '夜深了，' : hr < 11 ? '早上好，' : hr < 13 ? '中午好，' : hr < 18 ? '下午好，' : hr < 22 ? '晚上好，' : '夜深了，';
    const name = S.profile.name || '我';
    gEl.textContent = greet + name + '。今天也要好好照顾自己 ✦';
  }
  const mods = [
    { p: 'work', k: 'work', ico: '💼', name: '工作看板', desc: '推进中的项目' },
    { p: 'ledger', k: 'ledger', ico: '💰', name: '账本', desc: '收支一目了然' },
    { p: 'checkin', k: 'checkin', ico: '✅', name: '项目打卡', desc: '坚持每一天' },
    { p: 'notes', k: 'notes', ico: '💡', name: '灵感随想', desc: '捕捉闪现的念头' },
    { p: 'child', k: 'child', ico: '🌟', name: '孩子激励', desc: '积分与目标' },
    { p: 'english', k: 'english', ico: '🔤', name: '英语学习', desc: '攒词与复习' },
    { p: 'stocks', k: 'stocks', ico: '📈', name: '股市学习', desc: '自选与行情' },
  ];
  const mc = $('homeModules');
  if (mc) {
    mc.innerHTML = mods.map(m => {
      const im = icon(m.k);
      const icoHtml = im ? '<img class="hm-img" src="' + im + '" alt="" />' : '<span class="hm-ico">' + m.ico + '</span>';
      return '<div class="home-mod" data-panel="' + m.p + '">' + icoHtml + '<div class="hm-t"><b>' + m.name + '</b><small>' + m.desc + '</small></div><span class="hm-arrow">›</span></div>';
    }).join('');
    mc.querySelectorAll('.home-mod').forEach(el => {
      el.onclick = () => {
        const navEl = document.querySelector('.nav-item[data-panel="' + el.dataset.panel + '"]');
        if (navEl) navEl.click();
      };
    });
  }
  const ov = $('homeOverview');
  if (ov) {
    const items = [
      { ico: '✅', label: '今日打卡', val: todayCheckinCount() + ' 次' },
      { ico: '💰', label: '今日支出', val: '¥' + todayExpense().toFixed(2) },
      { ico: '🌟', label: '孩子⭐', val: (S.life.child.stars || 0) + ' 颗' },
      { ico: '📈', label: '关注股票', val: (S.life.stocks.watch || []).length + ' 支' },
      { ico: '🔤', label: '英语单词', val: (S.life.english || []).length + ' 个' },
    ];
    ov.innerHTML = items.map(i => '<div class="ov-item"><span class="ov-ico">' + i.ico + '</span><div><b>' + i.val + '</b><small>' + i.label + '</small></div></div>').join('');
  }
}

/* ===================== 工作看板 ===================== */
function renderWork() {
  const list = $('workProjList');
  if (!S.work.projects.length) { list.innerHTML = '<div class="empty">还没有工作项目，先加一个吧～</div>'; return; }
  list.innerHTML = '';
  S.work.projects.forEach(p => {
    const item = document.createElement('div'); item.className = 'item';
    const head = document.createElement('div'); head.className = 'body';
    head.innerHTML = `<div class="txt">${esc(p.title)}</div><div class="meta">${p.tasks.length} 项任务</div>`;
    const tools = document.createElement('div'); tools.style.cssText = 'display:flex;gap:6px;';
    const addT = document.createElement('button'); addT.className = 'btn sm ghost'; addT.textContent = '+任务';
    addT.onclick = () => { const t = prompt('任务内容：'); if (t && t.trim()) { p.tasks.push({ id: uid(), text: t.trim(), done: false }); save(); renderWork(); } };
    const del = document.createElement('span'); del.className = 'x'; del.textContent = '✕'; del.onclick = () => { if (confirm('删除该项目？')) { S.work.projects = S.work.projects.filter(x => x.id !== p.id); save(); renderWork(); } };
    tools.append(addT, del);
    item.append(head, tools);
    list.append(item);
    p.tasks.forEach(t => {
      const ti = document.createElement('div'); ti.className = 'item' + (t.done ? ' done' : '');
      const ck = document.createElement('div'); ck.className = 'check' + (t.done ? ' on' : ''); ck.textContent = t.done ? '✓' : '';
      ck.onclick = () => { t.done = !t.done; save(); renderWork(); };
      const tb = document.createElement('div'); tb.className = 'body'; tb.innerHTML = `<div class="txt">${esc(t.text)}</div>`;
      const tx = document.createElement('span'); tx.className = 'x'; tx.textContent = '✕'; tx.onclick = () => { p.tasks = p.tasks.filter(x => x.id !== t.id); save(); renderWork(); };
      ti.append(ck, tb, tx); list.append(ti);
    });
  });
}
$('workProjAdd').onclick = () => {
  const v = $('workProjInput').value.trim(); if (!v) return;
  S.work.projects.push({ id: uid(), title: v, tasks: [] }); $('workProjInput').value = ''; save(); renderWork();
};

/* ===================== 生活·账本（多账本 + 标签 + 月/年汇总） ===================== */
const TAG_ICONS = ['🍜', '🚌', '🛒', '💴', '🏠', '🎮', '☕', '👕', '💡', '📚', '🍱', '⛽', '🎁', '💊', '🐱', '✈️', '📱', '🏥', '🎓', '💰'];
let ledgerSumMode = 'all';
let ledgerFilter = { ledgerId: '', type: '', tagId: '', kw: '', from: '', to: '' };   // 全局流水搜索条件（账本首页）

function curLedger() { const L = S.life; return L.ledgers.find(l => l.id === L.activeLedger) || L.ledgers[0] || null; }
function tagById(id) { return S.life.ledgerTags.find(t => t.id === id); }
function ledgerBalance(l) { let inc = 0, exp = 0; l.txns.forEach(t => { if (t.type === 'inc') inc += t.amount; else exp += t.amount; }); return inc - exp; }

/* 视图1：账本图标列表 */
function renderLedgerHome() {
  renderTagPalette();     // 通用设置区（标签/支付方式）位于账本首页
  renderTagManager();
  renderPayManager();
  renderFilterOptions();  // 全局流水搜索（账本/分类下拉 + 结果）
  renderGlobalSearch();
  const box = $('ledgerCards'); if (!box) return;
  if (!S.life.ledgers.length) { box.innerHTML = '<div class="empty">还没有账本，下面新建一个吧</div>'; return; }
  box.innerHTML = '';
  S.life.ledgers.forEach(l => {
    const bal = ledgerBalance(l);
    const sign = bal > 0 ? 'pos' : (bal < 0 ? 'neg' : '');
    const card = document.createElement('div'); card.className = 'ledger-card'; card.dataset.id = l.id;
    card.innerHTML = `<div class="lc-icon">${l.icon || '💰'}</div><div class="lc-name">${esc(l.name)}</div><div class="lc-bal ${sign}">结余 ${fmt(bal)}</div>`;
    card.onclick = () => openLedger(l.id);
    box.append(card);
  });
}
function openLedger(id) {
  S.life.activeLedger = id; save();
  $('ledgerHome').style.display = 'none';
  $('ledgerDetail').style.display = 'block';
  renderLedger();
}
function closeLedger() {
  $('ledgerDetail').style.display = 'none';
  $('ledgerHome').style.display = 'block';
  renderLedgerHome();
}
function renderTagOptions() {
  const sel = $('txnTag');
  sel.innerHTML = '<option value="">（未分类）</option>' + S.life.ledgerTags.map(t => `<option value="${t.id}">${t.icon || '🏷️'} ${esc(t.name)}</option>`).join('');
}
function renderTagPalette() {
  const p = $('tagPalettePresets'); if (!p) return;
  p.innerHTML = TAG_ICONS.map(i => `<button type="button" class="tag-ic" data-ic="${i}">${i}</button>`).join('');
  p.querySelectorAll('.tag-ic').forEach(b => b.onclick = () => { $('tagIcon').value = b.dataset.ic; });
}

function payById(id) { return S.life.payMethods.find(p => p.id === id); }
function renderPayOptions() {
  const sel = $('txnPay');
  sel.innerHTML = '<option value="">（不填）</option>' + S.life.payMethods.map(p => `<option value="${p.id}">${p.icon || '💳'} ${esc(p.name)}</option>`).join('');
}
function renderPayManager() {
  const list = $('payList');
  if (!S.life.payMethods.length) { list.innerHTML = '<div class="empty">还没有支付方式，先在上方加一个</div>'; return; }
  list.innerHTML = '';
  S.life.payMethods.forEach(p => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="body"><div class="txt"><span style="font-size:16px;">${p.icon || '💳'}</span> ${esc(p.name)}</div></div>`;
    const tools = document.createElement('div'); tools.style.cssText = 'display:flex;gap:6px;';
    const ed = document.createElement('button'); ed.className = 'btn sm ghost'; ed.textContent = '编辑';
    ed.onclick = () => {
      const ni = prompt('方式名', p.name); if (ni === null) return;
      const ic = prompt('图标 emoji', p.icon || '💳'); if (ic === null) return;
      p.name = ni.trim() || p.name; p.icon = ic.trim() || '💳'; save(); renderLedger();
    };
    const del = document.createElement('span'); del.className = 'x'; del.textContent = '✕';
    del.onclick = () => { if (confirm('删除该支付方式？已记账目会保留为「未填」。')) { S.life.payMethods = S.life.payMethods.filter(x => x.id !== p.id); save(); renderLedger(); } };
    tools.append(ed, del); item.append(tools); list.append(item);
  });
}
function totals(ledger, filterFn) {
  let inc = 0, exp = 0;
  ledger.txns.forEach(t => { if (filterFn(t)) { if (t.type === 'inc') inc += t.amount; else exp += t.amount; } });
  return { inc, exp, net: inc - exp };
}

function renderLedgerSummary() {
  const c = curLedger(); const box = $('ledgerSummary');
  if (!c) { box.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const tot = totals(c, () => true);

  if (ledgerSumMode === 'all') {
    let html = `<div class="stat">
      <div class="box"><div class="k">结余</div><div class="v">${fmt(tot.net)}</div></div>
      <div class="box"><div class="k">收入</div><div class="v inc">${fmt(tot.inc)}</div></div>
      <div class="box"><div class="k">支出</div><div class="v exp">${fmt(tot.exp)}</div></div>
    </div>`;
    // 支出分类占比
    const byTag = {};
    c.txns.forEach(t => { if (t.type === 'exp') { const tg = tagById(t.tagId); const key = tg ? tg.name : '未分类'; byTag[key] = (byTag[key] || 0) + t.amount; } });
    const entries = Object.entries(byTag).sort((a, b) => b[1] - a[1]);
    if (entries.length) {
      const max = entries[0][1];
      html += '<div class="sub-h">支出分类占比</div>';
      entries.forEach(([k, v]) => {
        const tg = S.life.ledgerTags.find(t => t.name === k);
        const useColor = tg && tg.color;
        const style = useColor ? `background:${tg.color};` : '';
        html += `<div class="bar-row"><div class="lbl">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${(v / max * 100).toFixed(0)}%;${style}"></div></div><div>${fmt(v)}</div></div>`;
      });
    }
    // 各支付方式支出汇总
    const payStat = {};
    c.txns.forEach(t => { if (t.type === 'exp') { const pg = payById(t.payId); const key = pg ? pg.name : '未填'; payStat[key] = (payStat[key] || 0) + t.amount; } });
    const psArr = Object.entries(payStat).sort((a, b) => b[1] - a[1]);
    if (psArr.length) {
      html += '<div class="sub-h">各支付方式支出汇总</div>';
      html += '<table class="sum-table"><thead><tr><th>支付方式</th><th>支出</th></tr></thead><tbody>';
      psArr.forEach(([k, v]) => { html += `<tr><td>${esc(k)}</td><td class="exp">${fmt(v)}</td></tr>`; });
      html += '</tbody></table>';
    }
    box.innerHTML = html;
  } else {
    const keyFn = ledgerSumMode === 'month' ? (t => t.date.slice(0, 7)) : (t => t.date.slice(0, 4));
    const map = {};
    c.txns.forEach(t => { const k = keyFn(t); if (!map[k]) map[k] = { inc: 0, exp: 0 }; if (t.type === 'inc') map[k].inc += t.amount; else map[k].exp += t.amount; });
    const keys = Object.keys(map).sort().reverse();
    if (!keys.length) { box.innerHTML = '<div class="empty">暂无记录</div>'; return; }
    let html = `<table class="sum-table"><thead><tr><th>${ledgerSumMode === 'month' ? '月份' : '年份'}</th><th>收入</th><th>支出</th><th>结余</th></tr></thead><tbody>`;
    let ti = 0, te = 0;
    keys.forEach(k => { const m = map[k]; ti += m.inc; te += m.exp; html += `<tr><td>${k}</td><td class="inc">${fmt(m.inc)}</td><td class="exp">${fmt(m.exp)}</td><td>${fmt(m.inc - m.exp)}</td></tr>`; });
    html += `<tr class="sum-total"><td>合计</td><td class="inc">${fmt(ti)}</td><td class="exp">${fmt(te)}</td><td>${fmt(ti - te)}</td></tr></tbody></table>`;
    box.innerHTML = html;
  }
}

function renderLedgerTagSummary() {
  const c = curLedger(); const box = $('ledgerTagSummary'); if (!box) return;
  if (!c || !c.txns.length) { box.innerHTML = ''; return; }
  const tagStat = {};
  c.txns.forEach(t => {
    const tg = tagById(t.tagId); const key = tg ? tg.name : '未分类';
    if (!tagStat[key]) tagStat[key] = { exp: 0, inc: 0, color: tg ? tg.color : '' };
    if (t.type === 'inc') tagStat[key].inc += t.amount; else tagStat[key].exp += t.amount;
  });
  const arr = Object.entries(tagStat).sort((a, b) => (b[1].exp + b[1].inc) - (a[1].exp + a[1].inc));
  let html = '<div class="sub-h">📊 标签花费汇总（各分类花了多少）</div>';
  html += '<table class="sum-table"><thead><tr><th>标签</th><th>支出</th><th>收入</th><th>净额</th></tr></thead><tbody>';
  arr.forEach(([k, v]) => {
    const sw = v.color ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${v.color};margin-right:6px;vertical-align:middle;"></span>` : '';
    html += `<tr><td>${sw}${esc(k)}</td><td class="exp">${fmt(v.exp)}</td><td class="inc">${fmt(v.inc)}</td><td>${fmt(v.inc - v.exp)}</td></tr>`;
  });
  html += '</tbody></table>';
  box.innerHTML = html;
}

function renderFilterOptions() {
  const sel = $('fltTag');
  if (sel) {
    sel.innerHTML = '<option value="">全部分类</option>' + S.life.ledgerTags.map(t => `<option value="${t.id}">${t.icon || '🏷️'} ${esc(t.name)}</option>`).join('');
    sel.value = ledgerFilter.tagId || '';
  }
  const sl = $('fltLedger');
  if (sl) {
    sl.innerHTML = '<option value="">全部账本</option>' + S.life.ledgers.map(l => `<option value="${l.id}">${l.icon || '💰'} ${esc(l.name)}</option>`).join('');
    sl.value = ledgerFilter.ledgerId || '';
  }
}

/* 全局流水搜索（账本首页，跨账本） */
function renderGlobalSearch() {
  const list = $('gsList'); if (!list) return;
  const info = $('fltInfo');
  const kw = (ledgerFilter.kw || '').trim().toLowerCase();
  // 汇集所有账本的账目（带所属账本引用）
  const rows = [];
  let totalCnt = 0;
  S.life.ledgers.forEach(l => {
    totalCnt += l.txns.length;
    if (ledgerFilter.ledgerId && l.id !== ledgerFilter.ledgerId) return;
    l.txns.forEach(t => {
      if (ledgerFilter.type && t.type !== ledgerFilter.type) return;
      if (ledgerFilter.tagId && t.tagId !== ledgerFilter.tagId) return;
      if (ledgerFilter.from && (t.date || '') < ledgerFilter.from) return;
      if (ledgerFilter.to && (t.date || '') > ledgerFilter.to) return;
      if (kw) {
        const tg = tagById(t.tagId);
        const hay = (t.note || '') + ' ' + fmt(t.amount) + ' ' + (tg ? tg.name : '') + ' ' + l.name;
        if (!hay.toLowerCase().includes(kw)) return;
      }
      rows.push({ l, t });
    });
  });
  // 统计 + 计数
  let inc = 0, exp = 0;
  rows.forEach(r => { if (r.t.type === 'inc') inc += r.t.amount; else exp += r.t.amount; });
  if (info) {
    info.textContent = rows.length === totalCnt
      ? `共 ${totalCnt} 笔 · 收入 ${fmt(inc)} / 支出 ${fmt(exp)}`
      : `搜出 ${rows.length} / ${totalCnt} 笔 · 收入 ${fmt(inc)} / 支出 ${fmt(exp)}`;
  }
  if (!rows.length) { list.innerHTML = '<div class="empty">' + (totalCnt ? '没有符合条件的账目' : '还没有账目，进账本记一笔吧') + '</div>'; return; }
  list.innerHTML = '';
  rows.sort((a, b) => ((b.t.date || '') + b.t.id).localeCompare((a.t.date || '') + a.t.id)).forEach(({ l, t }) => {
    const tg = tagById(t.tagId);
    const icon = tg ? (tg.icon || '🏷️') : '💸';
    const pg = payById(t.payId);
    const payStr = pg ? `<span style="color:var(--text-faint);font-size:12px;">· ${pg.icon || '💳'}${esc(pg.name)}</span>` : '';
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="body"><div class="txt" style="color:${t.type === 'inc' ? 'var(--good)' : 'var(--bad)'}">${icon} ${t.type === 'inc' ? '+' : '-'}${fmt(t.amount)} <span style="color:var(--text-faint);font-size:12px;">${tg ? esc(tg.name) : '未分类'}</span></div><div class="meta">${l.icon || '💰'}${esc(l.name)} · ${esc(t.date)} ${payStr}${t.note ? ' · ' + esc(t.note) : ''}</div></div>`;
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
    x.onclick = () => { if (confirm('删除这笔账目？')) { l.txns = l.txns.filter(y => y.id !== t.id); save(); renderLedgerHome(); } };
    item.append(x); list.append(item);
  });
}

function renderLedgerTrend() {
  const c = curLedger(); const cv = $('ledgerTrend');
  if (!c || !cv) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = cv.clientWidth || (cv.parentElement ? cv.parentElement.clientWidth : 600) || 600;
  const cssH = 240;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  // 最近 6 个月（含当前月）
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  const map = {}; months.forEach(m => map[m] = { inc: 0, exp: 0 });
  c.txns.forEach(t => { const m = (t.date || '').slice(0, 7); if (map[m]) { if (t.type === 'inc') map[m].inc += t.amount; else map[m].exp += t.amount; } });
  const data = months.map(m => ({ m, inc: map[m].inc, exp: map[m].exp, net: map[m].inc - map[m].exp }));
  let maxV = 1, minV = 0;
  data.forEach(d => { maxV = Math.max(maxV, d.inc, d.exp, d.net); minV = Math.min(minV, d.net); });
  const padL = 46, padR = 12, padT = 14, padB = 26;
  const plotW = cssW - padL - padR, plotH = cssH - padT - padB;
  const yOf = v => padT + plotH - (v - minV) / (maxV - minV) * plotH;
  const cs = getComputedStyle(document.body);
  const cGood = cs.getPropertyValue('--good').trim() || '#2F8F5B';
  const cBad = cs.getPropertyValue('--bad').trim() || '#C03A2B';
  const cAcc = cs.getPropertyValue('--accent').trim() || '#B4472A';
  const cFaint = cs.getPropertyValue('--text-faint').trim() || 'rgba(0,0,0,.4)';
  const cDim = cs.getPropertyValue('--text-dim').trim() || 'rgba(0,0,0,.6)';
  // 横向网格 + 刻度
  ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = minV + (maxV - minV) * i / 4; const y = yOf(v);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = cFaint; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = cFaint;
    ctx.fillText(Math.round(v).toString(), padL - 6, y + 3);
  }
  // 柱状：收入 / 支出
  const n = data.length; const slot = plotW / n; const bw = Math.min(18, slot * 0.26);
  data.forEach((d, i) => {
    const cx = padL + slot * i + slot / 2; const y0 = yOf(0);
    ctx.globalAlpha = 0.85;
    const yI = yOf(d.inc); ctx.fillStyle = cGood; ctx.fillRect(cx - bw - 2, Math.min(yI, y0), bw, Math.abs(yI - y0));
    const yE = yOf(d.exp); ctx.fillStyle = cBad; ctx.fillRect(cx + 2, Math.min(yE, y0), bw, Math.abs(yE - y0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = cDim; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d.m.slice(5) + '月', cx, cssH - padB + 16);
  });
  // 结余折线
  ctx.strokeStyle = cAcc; ctx.lineWidth = 2; ctx.beginPath();
  data.forEach((d, i) => { const cx = padL + slot * i + slot / 2; const y = yOf(d.net); if (i === 0) ctx.moveTo(cx, y); else ctx.lineTo(cx, y); });
  ctx.stroke();
  ctx.fillStyle = cAcc;
  data.forEach((d, i) => { const cx = padL + slot * i + slot / 2; const y = yOf(d.net); ctx.beginPath(); ctx.arc(cx, y, 3, 0, Math.PI * 2); ctx.fill(); });
}
function renderLedgerList() {
  const c = curLedger(); const list = $('ledgerList');
  if (!c) { list.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  if (!c.txns.length) { list.innerHTML = '<div class="empty">还没有账目，记一笔吧</div>'; return; }
  list.innerHTML = '';
  [...c.txns].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).forEach(t => {
    const tg = tagById(t.tagId);
    const icon = tg ? (tg.icon || '🏷️') : '💸';
    const pg = payById(t.payId);
    const payStr = pg ? `<span style="color:var(--text-faint);font-size:12px;">· ${pg.icon || '💳'}${esc(pg.name)}</span>` : '';
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="body"><div class="txt" style="color:${t.type === 'inc' ? 'var(--good)' : 'var(--bad)'}">${icon} ${t.type === 'inc' ? '+' : '-'}${fmt(t.amount)} <span style="color:var(--text-faint);font-size:12px;">${tg ? esc(tg.name) : '未分类'}</span></div><div class="meta">${esc(t.date)} ${payStr}${t.note ? ' · ' + esc(t.note) : ''}</div></div>`;
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
    x.onclick = () => { c.txns = c.txns.filter(y => y.id !== t.id); save(); renderLedger(); };
    item.append(x); list.append(item);
  });
}

function renderTagManager() {
  const list = $('tagList');
  if (!S.life.ledgerTags.length) { list.innerHTML = '<div class="empty">还没有标签，先在上方加一个</div>'; return; }
  list.innerHTML = '';
  S.life.ledgerTags.forEach(t => {
    const item = document.createElement('div'); item.className = 'item';
    const sw = t.color ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${t.color};margin-right:6px;vertical-align:middle;"></span>` : '';
    item.innerHTML = `<div class="body"><div class="txt"><span style="font-size:16px;">${t.icon || '🏷️'}</span> ${sw}${esc(t.name)}</div></div>`;
    const tools = document.createElement('div'); tools.style.cssText = 'display:flex;gap:6px;';
    const ed = document.createElement('button'); ed.className = 'btn sm ghost'; ed.textContent = '编辑';
    ed.onclick = () => {
      const ni = prompt('标签名', t.name); if (ni === null) return;
      const ic = prompt('图标 emoji', t.icon || '🏷️'); if (ic === null) return;
      const col = prompt('颜色（如 #ff9ecb，留空则用默认渐变）', t.color || ''); if (col === null) return;
      t.name = ni.trim() || t.name; t.icon = ic.trim() || '🏷️'; t.color = col.trim(); save(); renderLedger();
    };
    const del = document.createElement('span'); del.className = 'x'; del.textContent = '✕';
    del.onclick = () => { if (confirm('删除标签？已记账目会保留为「未分类」。')) { S.life.ledgerTags = S.life.ledgerTags.filter(x => x.id !== t.id); save(); renderLedger(); } };
    tools.append(ed, del); item.append(tools); list.append(item);
  });
}

function renderLedger() {
  const c = curLedger();
  const tt = $('ledgerDetailTitle');
  if (tt && c) tt.innerHTML = `<span style="font-size:22px;">${c.icon || '💰'}</span> ${esc(c.name)}`;
  renderTagOptions();
  renderTagPalette();
  renderPayOptions();
  renderPayManager();
  renderTagManager();
  renderLedgerSummary();
  renderLedgerList();
  renderLedgerTagSummary();
  renderLedgerTrend();
}

/* 账本操作 */
$('ledgerNew').onclick = () => {
  const inp = $('ledgerNewName');
  const n = (inp ? inp.value : '').trim() || prompt('新账本名称', '我的账本');
  if (!n) return;
  const l = { id: uid(), name: n, icon: '💰', txns: [] };
  S.life.ledgers.push(l); S.life.activeLedger = l.id; save();
  if (inp) inp.value = '';
  openLedger(l.id); toast('已新建账本');
};
$('ledgerBack').onclick = closeLedger;
$('ledgerIconBtn').onclick = () => { const c = curLedger(); if (!c) return; const ic = prompt('账本图标 emoji', c.icon || '💰'); if (ic === null) return; c.icon = ic.trim() || '💰'; save(); renderLedger(); renderLedgerHome(); };
$('ledgerRename').onclick = () => { const c = curLedger(); if (!c) return; const n = prompt('账本名称', c.name); if (n && n.trim()) { c.name = n.trim(); save(); renderLedger(); renderLedgerHome(); } };
$('ledgerDel').onclick = () => {
  const c = curLedger(); if (!c) return;
  if (S.life.ledgers.length <= 1) { toast('至少保留一个账本'); return; }
  if (confirm('删除当前账本及其所有账目？')) { S.life.ledgers = S.life.ledgers.filter(x => x.id !== c.id); S.life.activeLedger = S.life.ledgers[0].id; save(); closeLedger(); }
};

/* 导出 / 导入 Excel（.xlsx，CDN 加载失败时回退 CSV） */
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
function splitCSVLine(line) {
  const res = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { res.push(cur); cur = ''; }
    else cur += ch;
  }
  res.push(cur); return res;
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = splitCSVLine(line); const obj = {};
    header.forEach((h, i) => obj[h] = cells[i] !== undefined ? cells[i] : '');
    return obj;
  });
}
function ledgerTagSummaryRows(c) {
  const m = {};
  c.txns.forEach(t => {
    const tg = tagById(t.tagId); const name = tg ? tg.name : '未分类';
    if (!m[name]) m[name] = { 标签: name, 支出: 0, 收入: 0 };
    if (t.type === 'inc') m[name].收入 += t.amount; else m[name].支出 += t.amount;
  });
  return Object.values(m).map(r => ({ ...r, 净额: r.收入 - r.支出 }));
}
function ensureXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('xlsx 组件加载失败'));
    document.head.appendChild(s);
  });
}
$('ledgerExport').onclick = async () => {
  const c = curLedger(); if (!c) return;
  const rows = [...c.txns].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)).map(t => {
    const tg = tagById(t.tagId); const pg = payById(t.payId);
    return { 日期: t.date, 类型: t.type === 'inc' ? '收入' : '支出', 金额: t.amount, 标签: tg ? tg.name : '未分类', 支付方式: pg ? pg.name : '未填', 备注: t.note || '' };
  });
  const sumRows = ledgerTagSummaryRows(c);
  const csv = '﻿日期,类型,金额,标签,支付方式,备注\n' + rows.map(r => `${r.日期},${r.类型},${r.金额},${r.标签},${r.支付方式 || ''},${r.备注 || ''}`).join('\n');
  try {
    await ensureXLSX();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 日期: '', 类型: '', 金额: '', 标签: '', 支付方式: '', 备注: '' }]), '账目');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sumRows.length ? sumRows : [{ 标签: '', 支出: 0, 收入: 0, 净额: 0 }]), '标签汇总');
    XLSX.writeFile(wb, `${c.name}_账本.xlsx`);
    toast('已导出 Excel');
  } catch (e) {
    downloadFile(csv, `${c.name}_账本.csv`, 'text/csv');
    toast('Excel 组件加载失败，已改导出 CSV（可用 Excel 打开）');
  }
};
let pendingImport = null;
$('ledgerImport').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const c = curLedger(); if (!c) { e.target.value = ''; return; }
  const isXlsx = /\.xlsx$/i.test(f.name);
  if (isXlsx) {
    try { await ensureXLSX(); }
    catch (err) { toast('Excel 组件加载失败，请用 .csv 文件导入'); e.target.value = ''; return; }
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      let rows = [];
      if (isXlsx) {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws);
      } else {
        rows = parseCSV(ev.target.result);
      }
      showImportPreview(rows, c);
    } catch (err) { toast('导入失败：' + err.message); }
    e.target.value = '';
  };
  if (isXlsx) reader.readAsArrayBuffer(f); else reader.readAsText(f);
};
function showImportPreview(rows, c) {
  pendingImport = { c, rows };
  $('importCount').textContent = rows.length;
  const wrap = $('importPreview');
  if (!rows.length) { wrap.innerHTML = '<div class="empty">未解析到有效账目（需含「金额」列且大于 0）</div>'; }
  else {
    let html = '<table><thead><tr><th>日期</th><th>类型</th><th>金额</th><th>标签</th><th>支付方式</th><th>备注</th></tr></thead><tbody>';
    rows.forEach(r => {
      const amt = parseFloat(r['金额'] ?? r['amount'] ?? r['Amount'] ?? r['AMOUNT']);
      const rawType = (r['类型'] ?? r['type'] ?? r['Type'] ?? '').toString().trim();
      const type = (rawType === '收入' || rawType === 'inc') ? '收入' : '支出';
      const tagName = (r['标签'] ?? r['tag'] ?? r['Tag'] ?? '').toString().trim() || '未分类';
      const payName = (r['支付方式'] ?? r['pay'] ?? r['Pay'] ?? '').toString().trim() || '—';
      const date = (r['日期'] ?? r['date'] ?? r['Date'] ?? '').toString().trim() || '—';
      const note = (r['备注'] ?? r['note'] ?? r['Note'] ?? '').toString().trim();
      html += `<tr><td>${esc(date)}</td><td>${type}</td><td>${isNaN(amt) ? '—' : fmt(amt)}</td><td>${esc(tagName)}</td><td>${esc(payName)}</td><td>${esc(note)}</td></tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }
  $('importModal').style.display = 'flex';
}
$('importModal').onclick = (e) => { if (e.target === $('importModal')) { $('importModal').style.display = 'none'; pendingImport = null; } };
$('importCancel').onclick = () => { $('importModal').style.display = 'none'; pendingImport = null; };
$('importConfirm').onclick = () => {
  if (!pendingImport) return;
  const { c, rows } = pendingImport;
  let added = 0;
  rows.forEach(r => {
    const amt = parseFloat(r['金额'] ?? r['amount'] ?? r['Amount'] ?? r['AMOUNT']);
    if (!(amt > 0)) return;
    const rawType = (r['类型'] ?? r['type'] ?? r['Type'] ?? '').toString().trim();
    const type = (rawType === '收入' || rawType === 'inc') ? 'inc' : 'exp';
    const tagName = (r['标签'] ?? r['tag'] ?? r['Tag'] ?? '').toString().trim();
    let tagId = null;
    if (tagName && tagName !== '未分类') {
      let tg = S.life.ledgerTags.find(t => t.name === tagName);
      if (!tg) { tg = { id: uid(), name: tagName, icon: '🏷️', color: '' }; S.life.ledgerTags.push(tg); }
      tagId = tg.id;
    }
    const payName = (r['支付方式'] ?? r['pay'] ?? r['Pay'] ?? '').toString().trim();
    let payId = null;
    if (payName && payName !== '未填') {
      let pg = S.life.payMethods.find(p => p.name === payName);
      if (!pg) { pg = { id: uid(), name: payName, icon: '💳' }; S.life.payMethods.push(pg); }
      payId = pg.id;
    }
    const date = (r['日期'] ?? r['date'] ?? r['Date'] ?? '').toString().trim() || todayStr();
    const note = (r['备注'] ?? r['note'] ?? r['Note'] ?? '').toString().trim();
    c.txns.push({ id: uid(), type, amount: amt, tagId, payId, note, date });
    added++;
  });
  save(); renderLedger(); renderLedgerHome();
  $('importModal').style.display = 'none';
  pendingImport = null;
  toast(`已导入 ${added} 条账目`);
};

/* 记一笔 */
$('txnAdd').onclick = () => {
  const c = curLedger(); if (!c) { toast('请先创建账本'); return; }
  const amt = parseFloat($('txnAmount').value); if (!(amt > 0)) { toast('请输入有效金额'); return; }
  c.txns.push({ id: uid(), type: $('txnType').value, amount: amt, tagId: $('txnTag').value || null, payId: $('txnPay').value || null, note: $('txnNote').value.trim(), date: $('txnDate').value || todayStr() });
  $('txnAmount').value = ''; $('txnNote').value = ''; save(); renderLedger();
};

/* 新增标签 */
$('tagAdd').onclick = () => {
  const name = $('tagName').value.trim(); if (!name) { toast('请输入标签名'); return; }
  const t = { id: uid(), name, icon: ($('tagIcon').value.trim()) || '🏷️', color: ($('tagColor').value || '').trim() };
  S.life.ledgerTags.push(t); $('tagName').value = ''; $('tagIcon').value = ''; save(); renderLedger(); toast('标签已添加');
};
$('payAdd').onclick = () => {
  const name = $('payName').value.trim(); if (!name) { toast('请输入支付方式名'); return; }
  const p = { id: uid(), name, icon: ($('payIcon').value.trim()) || '💳' };
  S.life.payMethods.push(p); $('payName').value = ''; $('payIcon').value = ''; save(); renderLedger(); toast('支付方式已添加');
};

/* 汇总切换 */
document.querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
  document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); ledgerSumMode = b.dataset.sum; renderLedgerSummary();
});

/* 流水筛选 */
function bindLedgerFilter() {
  const fl = $('fltLedger'), ft = $('fltType'), ftg = $('fltTag'), fk = $('fltKw'), ff = $('fltFrom'), fto = $('fltTo');
  if (fl) fl.onchange = () => { ledgerFilter.ledgerId = fl.value; renderGlobalSearch(); };
  if (ft) ft.onchange = () => { ledgerFilter.type = ft.value; renderGlobalSearch(); };
  if (ftg) ftg.onchange = () => { ledgerFilter.tagId = ftg.value; renderGlobalSearch(); };
  if (fk) fk.oninput = () => { ledgerFilter.kw = fk.value; renderGlobalSearch(); };
  if (ff) ff.onchange = () => { ledgerFilter.from = ff.value; renderGlobalSearch(); };
  if (fto) fto.onchange = () => { ledgerFilter.to = fto.value; renderGlobalSearch(); };
  const fa = $('fltApply'); if (fa) fa.onclick = () => renderGlobalSearch();
  const fc = $('fltClear'); if (fc) fc.onclick = () => {
    ledgerFilter = { ledgerId: '', type: '', tagId: '', kw: '', from: '', to: '' };
    [fl, ft, ftg, fk, ff, fto].forEach(el => { if (el) el.value = ''; });
    renderGlobalSearch();
  };
}
bindLedgerFilter();
window.addEventListener('resize', () => {
  const p = $('panel-ledger');
  if (p && p.classList.contains('active') && $('ledgerDetail').style.display !== 'none') renderLedgerTrend();
});

/* ===================== 生活·项目打卡 ===================== */
function lastNDays(n) { const a = []; const t = new Date(); for (let i = n - 1; i >= 0; i--) { const d = new Date(t); d.setDate(t.getDate() - i); a.push(d.toISOString().slice(0, 10)); } return a; }
function streakOf(hist) {
  const set = new Set(hist); let d = new Date();
  if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  let c = 0; while (set.has(d.toISOString().slice(0, 10))) { c++; d.setDate(d.getDate() - 1); }
  return c;
}
/* ===================== 生活·项目打卡（图标列表 + 明细两步） ===================== */
function curCheckin() { return S.life.checkins.find(c => c.id === S.life.activeCheckin) || null; }
function renderCheckinHome() {
  const box = $('checkinCards'); if (!box) return;
  if (!S.life.checkins.length) { box.innerHTML = '<div class="empty">还没有打卡项目，下面新建一个吧</div>'; }
  else {
    box.innerHTML = '';
    S.life.checkins.forEach(c => {
      const total = Object.keys(c.records).length;
      const ym = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
      const mCnt = Object.keys(c.records).filter(k => k.startsWith(ym)).length;
      const card = document.createElement('div'); card.className = 'ledger-card';
      card.innerHTML = `<div class="lc-icon">${c.icon || '✅'}</div><div class="lc-name">${esc(c.name)}</div><div class="lc-bal">🔥 连续 ${streakOf(Object.keys(c.records))} 天 · 共 ${total} 天 · 本月 ${mCnt} 天</div>`;
      card.onclick = () => openCheckin(c.id);
      box.append(card);
    });
  }
}
function openCheckin(id) {
  S.life.activeCheckin = id; save();
  $('checkinHome').style.display = 'none';
  $('checkinDetail').style.display = 'block';
  renderCheckinDetail();
}
function closeCheckin() {
  $('checkinDetail').style.display = 'none';
  $('checkinHome').style.display = 'block';
  renderCheckinHome();
}
function checkinStats(c) {
  const rec = c.records; const keys = Object.keys(rec);
  const total = keys.length;
  const now = new Date(); const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let month = 0, durSum = 0;
  keys.forEach(k => { if (k.startsWith(ym)) month++; durSum += (rec[k].duration || 0); });
  const avg = total ? Math.round(durSum / total) : 0;
  // 本周（周一到今天，含今天）
  const t = new Date(); const dow = (t.getDay() + 6) % 7;
  const mon = new Date(t); mon.setDate(t.getDate() - dow);
  let week = 0;
  for (const d = new Date(mon); d <= t; d.setDate(d.getDate() + 1)) {
    if (keys.includes(d.toISOString().slice(0, 10))) week++;
  }
  return { total, month, week, streak: streakOf(keys), avg, startedAt: c.startedAt };
}
function renderCheckinDetail() {
  const c = curCheckin(); if (!c) { closeCheckin(); return; }
  const today = todayStr();
  $('checkinDetailTitle').textContent = (c.icon || '✅') + ' ' + c.name;
  const st = checkinStats(c);
  const todayDur = (c.records[today] ? c.records[today].duration : 0);
  $('checkinStats').innerHTML =
    `<div class="stat"><div class="sv">${st.total}</div><div class="sl">累计打卡(天)</div></div>` +
    `<div class="stat"><div class="sv">${st.month}</div><div class="sl">本月打卡(天)</div></div>` +
    `<div class="stat"><div class="sv">${st.week}</div><div class="sl">本周打卡(天)</div></div>` +
    `<div class="stat"><div class="sv">${st.streak}</div><div class="sl">连续打卡(天)</div></div>` +
    `<div class="stat"><div class="sv">${todayDur}</div><div class="sl">今日时长(分)</div></div>` +
    `<div class="stat"><div class="sv">${st.avg}</div><div class="sl">日均时长(分)</div></div>` +
    `<div class="stat"><div class="sv" style="font-size:14px;">${st.startedAt}</div><div class="sl">开始日期</div></div>`;
  // 月度目标进度
  const goal = c.goalMonth || 20;
  const pct = Math.min(100, Math.round(st.month / goal * 100));
  $('checkinGoal').innerHTML =
    `<div class="goal-head"><span>🎯 本月目标 <b>${goal}</b> 天 · 已打卡 <b>${st.month}</b> 天（${pct}%）</span>` +
    `<input type="number" id="goalMonthInput" value="${goal}" min="1" max="31" style="flex:0 0 68px;" title="设本月目标天数"/></div>` +
    `<div class="progress"><div class="progress-bar" style="width:${pct}%;"></div></div>`;
  $('goalMonthInput').onchange = () => { const cc = curCheckin(); if (!cc) return; cc.goalMonth = parseInt($('goalMonthInput').value, 10) || 20; save(); renderCheckinDetail(); };
  const t = c.records[today];
  const tb = $('checkinToday');
  if (t) {
    tb.innerHTML = `<div class="done-mark">✓ 今日已打卡</div><div class="row" style="align-items:center;"><span class="hint">时长 ${t.duration} 分 · 时间 ${t.time || '—'}</span><button class="btn sm danger" id="checkinCancel">取消当日打卡</button></div>`;
    $('checkinCancel').onclick = () => { delete c.records[today]; save(); renderCheckinDetail(); toast('已取消今日打卡'); };
  } else {
    tb.innerHTML = `<div class="hint" style="font-size:14px;">今天还没打卡～</div><div class="row" style="align-items:center;"><input id="checkinDur" type="number" placeholder="时长(分钟)" value="30" style="flex:0 0 120px;" /><button class="btn" id="checkinConfirm">确认打卡</button></div>`;
    $('checkinConfirm').onclick = () => {
      const d = parseInt($('checkinDur').value, 10) || 0;
      const n = new Date();
      const hhmm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
      c.records[today] = { duration: d, time: hhmm }; save(); renderCheckinDetail(); toast('打卡成功 +1 🔥');
    };
  }
  renderCalendar(c);
  renderTrend(c);
  $('remindOn').checked = !!c.remind.on;
  $('remindTime').value = c.remind.time || '20:00';
  $('checkinStart').value = c.startedAt || today;
  $('checkinStart').onchange = () => { const cc = curCheckin(); if (!cc) return; cc.startedAt = $('checkinStart').value || todayStr(); save(); renderCheckinDetail(); };
  $('remindHint').textContent = ('Notification' in window)
    ? (Notification.permission === 'granted' ? '系统通知已启用，到点会弹窗提醒。' : '点击「启用系统通知」授权后，到点会弹窗提醒。')
    : '当前浏览器不支持系统通知，将用页面内提示代替。';
}
function renderCalendar(c) {
  const cal = $('checkinCal'); cal.innerHTML = '';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(d => { const e = document.createElement('div'); e.className = 'cal-dow'; e.textContent = d; cal.append(e); });
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = todayStr();
  for (let i = 0; i < first; i++) { const e = document.createElement('div'); e.className = 'cal-cell empty'; cal.append(e); }
  for (let d = 1; d <= days; d++) {
    const key = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const cell = document.createElement('div');
    const rec = c.records[key];
    cell.className = 'cal-cell' + (rec ? ' on' : '') + (key === today ? ' today' : '');
    cell.innerHTML = `<div>${d}</div>` + (rec ? `<div class="dur">${rec.duration}分</div>` : '');
    cell.onclick = () => {
      if (key > today) { toast('不能给未来的日期打卡'); return; }
      if (rec) { delete c.records[key]; save(); renderCheckinDetail(); }
      else {
        const inp = prompt('本次打卡时长（点取消=0分钟）', '30');
        if (inp === null) return;
        const mins = parseInt(inp, 10) || 0;
        const n = new Date();
        c.records[key] = { duration: mins, time: String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0') };
        save(); renderCheckinDetail(); toast(key === today ? '打卡成功 +1 🔥' : '已补卡 ✓');
      }
    };
    cal.append(cell);
  }
}
function renderTrend(c) {
  const box = $('checkinTrend'); box.innerHTML = '';
  const days = lastNDays(14);
  const vals = days.map(d => (c.records[d] ? c.records[d].duration : 0));
  const max = Math.max(1, ...vals);
  days.forEach((d, i) => {
    const wrap = document.createElement('div'); wrap.className = 'bar-wrap';
    const h = Math.round(vals[i] / max * 100);
    wrap.innerHTML = `<div class="bar-val">${vals[i]}</div><div class="bar" style="height:${h}%;" title="${d} · ${vals[i]}分"></div><div class="bar-lbl">${d.slice(5)}</div>`;
    box.append(wrap);
  });
}
/* 打卡提醒（系统通知 / 页面内提示） */
function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
    else toast('🔔 ' + title + '：' + body);
  } catch (e) { toast('🔔 ' + title); }
}
function checkReminders() {
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const today = todayStr();
  S.life.checkins.forEach(c => {
    if (!c.remind || !c.remind.on) return;
    if (hhmm >= c.remind.time && !c.records[today] && c.remind.lastNotified !== today) {
      c.remind.lastNotified = today; save();
      notify('打卡提醒 · ' + c.name, '今天还没打卡，去坚持一下吧 💪');
    }
  });
}
$('checkinBack').onclick = () => closeCheckin();
$('checkinNew').onclick = () => {
  try {
    const v = $('checkinNewName').value.trim();
    if (!v) { toast('请先输入项目名，再点新建 ✏️'); $('checkinNewName').focus(); return; }
    if (!S.life.checkins) S.life.checkins = [];
    const c = { id: uid(), name: v, icon: '✅', startedAt: todayStr(), records: {}, goalMonth: 20, remind: { on: false, time: '20:00' } };
    S.life.checkins.push(c); $('checkinNewName').value = ''; save(); openCheckin(c.id);
    toast('已新建项目「' + v + '」✓');
  } catch (err) { toast('新建失败：' + err.message); console.error(err); }
};
$('checkinNewName').onkeydown = (e) => { if (e.key === 'Enter') $('checkinNew').onclick(); };
$('checkinIconBtn').onclick = () => { const c = curCheckin(); if (!c) return; const ic = prompt('项目图标 emoji', c.icon || '✅'); if (ic) { c.icon = ic.trim() || '✅'; save(); renderCheckinDetail(); renderCheckinHome(); } };
$('checkinRename').onclick = () => { const c = curCheckin(); if (!c) return; const n = prompt('项目名称', c.name); if (n && n.trim()) { c.name = n.trim(); save(); renderCheckinDetail(); renderCheckinHome(); } };
$('checkinDel').onclick = () => {
  const c = curCheckin(); if (!c) return;
  if (S.life.checkins.length <= 1) { toast('至少保留一个项目'); return; }
  if (confirm('删除该项目及所有打卡记录？')) { S.life.checkins = S.life.checkins.filter(x => x.id !== c.id); save(); closeCheckin(); }
};
$('remindOn').onchange = () => { const c = curCheckin(); if (!c) return; c.remind.on = $('remindOn').checked; save(); };
$('remindTime').onchange = () => { const c = curCheckin(); if (!c) return; c.remind.time = $('remindTime').value; save(); };
$('remindEnable').onclick = () => {
  if (!('Notification' in window)) { toast('当前浏览器不支持系统通知'); return; }
  if (Notification.permission === 'granted') { toast('通知已启用 ✓'); return; }
  Notification.requestPermission().then(p => { toast(p === 'granted' ? '已授权，到点会弹窗提醒 🔔' : '未授权，将用页面内提示'); renderCheckinDetail(); });
};
$('checkinStart').onchange = () => { const c = curCheckin(); if (!c) return; c.startedAt = $('checkinStart').value || todayStr(); save(); renderCheckinDetail(); };

/* ===================== 生活·灵感随想 ===================== */
const NOTE_CATS = [
  { id: 'work',  icon: '💼', name: '工作' },
  { id: 'biz',   icon: '💰', name: '生意' },
  { id: 'study', icon: '📖', name: '学习' },
  { id: 'life',  icon: '🏠', name: '生活' },
  { id: 'other', icon: '✨', name: '其他' }
];
const NOTE_STATUS = {
  idea: { icon: '💭', name: '闪念',   next: 'grow' },
  grow: { icon: '🌱', name: '孵化中', next: 'done' },
  done: { icon: '✅', name: '已实现', next: 'drop' },
  drop: { icon: '🗑', name: '已放弃', next: 'idea' }
};
let noteCatSel = 'other';                                   // 新随想默认分类
let noteFlt = { kw: '', cat: '', status: '' };              // 搜索/筛选条件
function noteCatById(id) { return NOTE_CATS.find(c => c.id === id) || NOTE_CATS[NOTE_CATS.length - 1]; }

function renderNoteCatPick() {
  const box = $('noteCatPick'); if (!box) return;
  box.innerHTML = '';
  NOTE_CATS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'note-cat-btn' + (noteCatSel === c.id ? ' on' : '');
    b.textContent = c.icon + ' ' + c.name;
    b.onclick = () => { noteCatSel = c.id; renderNoteCatPick(); };
    box.append(b);
  });
}
function renderNoteFltOptions() {
  const sel = $('noteFltCat'); if (!sel) return;
  sel.innerHTML = '<option value="">全部分类</option>' + NOTE_CATS.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  sel.value = noteFlt.cat || '';
}
function renderNoteStats() {
  const box = $('noteStats'); if (!box) return;
  const ns = S.life.notes;
  if (!ns.length) { box.innerHTML = ''; return; }
  const cnt = { idea: 0, grow: 0, done: 0, drop: 0 };
  ns.forEach(n => { cnt[n.st || 'idea'] = (cnt[n.st || 'idea'] || 0) + 1; });
  const rate = ns.length ? Math.round(cnt.done / ns.length * 100) : 0;
  box.innerHTML = `共 <b>${ns.length}</b> 条 · 💭闪念 <b>${cnt.idea}</b> · 🌱孵化中 <b>${cnt.grow}</b> · ✅已实现 <b>${cnt.done}</b> · 🗑已放弃 <b>${cnt.drop}</b> · 实现率 <b>${rate}%</b>`;
}
function renderNotes() {
  renderNoteCatPick();
  renderNoteFltOptions();
  renderNoteStats();
  const wall = $('noteWall'); if (!wall) return;
  const all = S.life.notes;
  if (!all.length) { wall.innerHTML = '<div class="empty">还没有随想，写下第一条灵感吧</div>'; const fi = $('noteFltInfo'); if (fi) fi.textContent = ''; return; }
  const kw = (noteFlt.kw || '').trim().toLowerCase();
  const list = all.filter(n => {
    if (noteFlt.cat && (n.cat || 'other') !== noteFlt.cat) return false;
    if (noteFlt.status && (n.st || 'idea') !== noteFlt.status) return false;
    if (kw && !(n.text || '').toLowerCase().includes(kw)) return false;
    return true;
  });
  const fi = $('noteFltInfo');
  if (fi) fi.textContent = (list.length === all.length) ? ('共 ' + all.length + ' 条') : ('筛选出 ' + list.length + ' / ' + all.length + ' 条');
  if (!list.length) { wall.innerHTML = '<div class="empty">没有符合条件的随想</div>'; return; }
  // 按月分组（新月份在前）
  const groups = {};
  list.forEach(n => { const m = (n.date || '').slice(0, 7) || '未知'; (groups[m] = groups[m] || []).push(n); });
  const months = Object.keys(groups).sort().reverse();
  wall.innerHTML = '';
  months.forEach((m, mi) => {
    const det = document.createElement('details');
    det.className = 'note-month';
    det.open = mi === 0;                                     // 最近一个月默认展开
    const [y, mo] = m.split('-');
    const sum = document.createElement('summary');
    sum.textContent = (mo ? (y + '年' + Number(mo) + '月') : m) + ' · ' + groups[m].length + '条';
    det.append(sum);
    const grid = document.createElement('div'); grid.className = 'note-wall';
    [...groups[m]].sort((a, b) => ((b.date || '') + b.id).localeCompare((a.date || '') + a.id)).forEach(n => {
      const cat = noteCatById(n.cat || 'other');
      const st = NOTE_STATUS[n.st || 'idea'] || NOTE_STATUS.idea;
      const card = document.createElement('div');
      card.className = 'note-card cat-' + (n.cat || 'other') + (n.st === 'done' ? ' st-done' : '') + (n.st === 'drop' ? ' st-drop' : '');
      const txt = document.createElement('div'); txt.className = 'nc-txt'; txt.textContent = n.text || '';
      const foot = document.createElement('div'); foot.className = 'nc-foot';
      foot.innerHTML = `<span class="nc-cat">${cat.icon} ${esc(cat.name)}</span><span>${esc(n.date || '')}</span>`;
      const stBtn = document.createElement('button');
      stBtn.className = 'nc-status'; stBtn.title = '点击切换状态';
      stBtn.textContent = st.icon + ' ' + st.name;
      stBtn.onclick = () => {
        n.st = NOTE_STATUS[n.st || 'idea'].next; save(); renderNotes();
        const ns = NOTE_STATUS[n.st]; toast('已标记为 ' + ns.icon + ' ' + ns.name);
      };
      foot.append(stBtn);
      const ops = document.createElement('div'); ops.className = 'nc-ops';
      const del = document.createElement('button'); del.className = 'nc-op del'; del.textContent = '✕'; del.title = '删除';
      del.onclick = () => { if (!confirm('删除这条随想？')) return; S.life.notes = S.life.notes.filter(y => y.id !== n.id); save(); renderNotes(); };
      ops.append(del);
      card.append(ops, txt, foot); grid.append(card);
    });
    det.append(grid); wall.append(det);
  });
}
$('noteAdd').onclick = () => {
  const v = $('noteInput').value.trim();
  if (!v) { toast('先写点什么，再保存 ✏️'); $('noteInput').focus(); return; }
  S.life.notes.push({ id: uid(), text: v, date: todayStr(), cat: noteCatSel, st: 'idea' });
  $('noteInput').value = ''; save(); renderNotes(); toast('灵感已收好 💡');
};
(() => {                                                    // 搜索/筛选事件绑定
  const kw = $('noteKw'), fc = $('noteFltCat'), fs = $('noteFltStatus'), clr = $('noteFltClear');
  if (kw) kw.oninput = () => { noteFlt.kw = kw.value; renderNotes(); };
  if (fc) fc.onchange = () => { noteFlt.cat = fc.value; renderNotes(); };
  if (fs) fs.onchange = () => { noteFlt.status = fs.value; renderNotes(); };
  if (clr) clr.onclick = () => {
    noteFlt = { kw: '', cat: '', status: '' };
    if (kw) kw.value = ''; if (fc) fc.value = ''; if (fs) fs.value = '';
    renderNotes();
  };
})();

/* ===================== 生活·孩子激励（养宠物玩法） ===================== */
const CHEERS = [
  '你今天又进步了一点点，超棒的！🌟', '努力的样子，就是最好的你 ✨', '不怕慢，就怕站，你一直在往前走 💪',
  '错了也没关系，那是大脑在长大 🧠', '爸爸妈妈为你骄傲，真的！❤️', '再试一次，你比昨天更强 🚀',
  '专注当下的你，闪闪发光 🌈', '今天的坚持，是明天惊喜的种子 🌱', '你认真的时候，全世界都在帮你 👏',
  '爱学习的你，未来有无限可能 🔭'
];
/* 宠物成长阶段：need 为升到该阶段所需累计经验；icon 键先用 emoji，之后可换成 APP_ICONS['pet_' + key] 图片 */
const PET_STAGES = [
  { key: 'egg',   name: '神秘蛋',   emoji: '🥚', need: 0 },
  { key: 'baby',  name: '破壳喵',   emoji: '🐣', need: 10 },
  { key: 'kid',   name: '幼年喵',   emoji: '🐱', need: 30 },
  { key: 'teen',  name: '少年喵',   emoji: '😺', need: 70 },
  { key: 'adult', name: '威风大喵', emoji: '🐈', need: 130 }
];
/* 陪玩动作：cost 星星消耗；mood/exp/hunger 为效果增减；limit 为每日次数上限（0=不限）；lines 为随机反应文案 */
const PET_ACTS = [
  { key: 'poke', icon: '🪶', name: '逗猫棒', anim: 'pounce', cost: 1, mood: 25, exp: 3, hunger: -5, limit: 0,
    lines: ['喵！差一点就抓到了！', '嗖——羽毛跑哪儿去了？', '扑！这次一定抓住你！', '我的爪子快得像闪电喵～'] },
  { key: 'ball', icon: '⚽', name: '丢球捡球', anim: 'chase', cost: 1, mood: 20, exp: 3, hunger: 0, limit: 0,
    lines: ['球球我叼回来啦，快夸我！', '咕噜噜——球滚到沙发底下了…', '再丢一次！再丢一次！', '这颗球是我的宝贝喵！'] },
  { key: 'comb', icon: '🪮', name: '梳毛', anim: 'brush', cost: 1, mood: 15, exp: 2, hunger: 5, limit: 0,
    lines: ['呼噜呼噜…好舒服喵～', '毛毛顺顺的，我最漂亮了', '这里，再挠挠下巴嘛～', '梳完毛，我要去照镜子'] },
  { key: 'sun', icon: '☀️', name: '晒太阳', anim: 'sun', cost: 0, mood: 10, exp: 1, hunger: 0, limit: 1,
    lines: ['晒得暖洋洋，好想睡午觉…', '阳光下的我，毛都发光了呢', '喵～这块地板今天归我了', '打个哈欠…春困秋乏夏打盹'] },
  { key: 'walk', icon: '🚶', name: '散步', anim: 'walk', cost: 2, mood: 30, exp: 5, hunger: -10, limit: 1,
    lines: ['外面的世界好大呀！', '我看到一只蝴蝶，可惜追不上…', '走累啦，抱我回家嘛～', '今天认识了隔壁的大黄狗'] },
  { key: 'photo', icon: '📷', name: '拍合照', anim: 'snap', cost: 1, mood: 15, exp: 2, hunger: 0, limit: 3,
    lines: ['咔嚓！我摆的姿势帅不帅？', '等等，我先舔一下毛…', '这张要放进相册喵！', '记得把我拍得瘦一点'] }
];
const PET_BADGES = [
  { key: 's3',  icon: '🥉', name: '坚持3天',  days: 3 },
  { key: 's7',  icon: '🥈', name: '坚持7天',  days: 7 },
  { key: 's14', icon: '🥇', name: '坚持14天', days: 14 },
  { key: 's21', icon: '🏆', name: '坚持21天', days: 21 },
  { key: 's30', icon: '👑', name: '坚持30天', days: 30 }
];
function petStage(exp) {
  let s = PET_STAGES[0];
  PET_STAGES.forEach(x => { if (exp >= x.need) s = x; });
  return s;
}
function petNextStage(exp) { return PET_STAGES.find(x => x.need > exp) || null; }
/* 离线衰减：距上次照顾每过一天，饱食-10、心情-8（最低保留 10，不会死亡） */
function applyPetDecay() {
  const p = S.life.child.pet; const today = todayStr();
  if (!p.lastCare) { p.lastCare = today; return; }
  if (p.lastCare >= today) return;
  const days = Math.min(30, Math.round((new Date(today) - new Date(p.lastCare)) / 86400000));
  if (days > 0) {
    p.hunger = Math.max(10, (p.hunger || 80) - days * 10);
    p.mood = Math.max(10, (p.mood || 80) - days * 8);
    p.lastCare = today;
    save();
  }
}
/* 连续打卡天数：从今天（或昨天）往前数连续有完成记录的天数 */
function childStreak() {
  const days = S.life.child.days; let n = 0;
  let d = new Date();
  if (!days[todayStr()]) d.setDate(d.getDate() - 1);   // 今天还没打卡则从昨天数
  for (;;) {
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (days[k]) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
function petTalkLine() {
  const p = S.life.child.pet;
  if (petStage(p.exp).key === 'egg') return '蛋里好像有小动静…完成任务赚⭐喂我，帮我破壳吧！';
  if (p.hunger < 40) return '咕噜噜…我肚子好饿，喂我吃点东西吧 🥺';
  if (p.mood < 40) return '好久没一起玩了，陪我玩一会儿嘛～';
  if (p.hunger > 80 && p.mood > 80) return '今天也是元气满满的一天，喵～ 😸';
  return '继续做任务赚星星，我还能长大变强哦！';
}
function petExpr() {
  const p = S.life.child.pet;
  if ((p.hunger || 0) < 40) return 'hungry';
  if ((p.mood || 0) < 40) return 'sad';
  if ((p.mood || 0) >= 70) return 'happy';
  return 'normal';
}
/* 狸花猫配色（3D 黏土/手办风） */
const CAT_FUR = '#d4915d', CAT_FUR_DARK = '#5a3a2a', CAT_FUR_LIGHT = '#e4b58a';
const CAT_BELLY = '#fff5e8', CAT_PINK = '#f4a090', CAT_EYE = '#f4c430', CAT_EAR = '#f4b8a8';
function catGradients() {
  return '<defs>'
    + '<radialGradient id="furGrad" cx="35%" cy="30%" r="78%"><stop offset="0%" stop-color="' + CAT_FUR_LIGHT + '"/><stop offset="55%" stop-color="' + CAT_FUR + '"/><stop offset="100%" stop-color="#b8764a"/></radialGradient>'
    + '<radialGradient id="bellyGrad" cx="50%" cy="35%" r="70%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="' + CAT_BELLY + '"/></radialGradient>'
    + '<radialGradient id="earGrad" cx="50%" cy="20%" r="80%"><stop offset="0%" stop-color="#ffded6"/><stop offset="100%" stop-color="' + CAT_EAR + '"/></radialGradient>'
    + '<radialGradient id="eyeGrad" cx="40%" cy="40%" r="70%"><stop offset="0%" stop-color="#ffe066"/><stop offset="60%" stop-color="' + CAT_EYE + '"/><stop offset="100%" stop-color="#d4a017"/></radialGradient>'
    + '<filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.2"/><feOffset dx="0" dy="1.2" result="off"/><feComponentTransfer><feFuncA type="linear" slope=".25"/></feComponentTransfer><feMerge><feMergeNode in="off"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
    + '</defs>';
}
function catEyes() {
  // 3D 水润大眼：白底 + 金黄虹膜渐变 + 黑瞳 + 大小高光
  return '<g class="cat-eye">'
    + '<ellipse cx="45" cy="52" rx="9.5" ry="11.5" fill="#fff"/>'
    + '<ellipse cx="45" cy="53" rx="7.5" ry="9" fill="url(#eyeGrad)"/>'
    + '<circle class="cat-pupil" cx="45" cy="54" r="5" fill="#1f1714"/>'
    + '<circle cx="42.5" cy="50" r="2.4" fill="#fff" opacity=".95"/>'
    + '<circle cx="47.5" cy="56" r="1.3" fill="#fff" opacity=".65"/></g>'
    + '<g class="cat-eye">'
    + '<ellipse cx="75" cy="52" rx="9.5" ry="11.5" fill="#fff"/>'
    + '<ellipse cx="75" cy="53" rx="7.5" ry="9" fill="url(#eyeGrad)"/>'
    + '<circle class="cat-pupil" cx="75" cy="54" r="5" fill="#1f1714"/>'
    + '<circle cx="72.5" cy="50" r="2.4" fill="#fff" opacity=".95"/>'
    + '<circle cx="77.5" cy="56" r="1.3" fill="#fff" opacity=".65"/></g>';
}
function catMouth(expr) {
  if (expr === 'happy') return '<path class="cat-mouth" d="M54 66 Q60 73 66 66" fill="none"/>';
  if (expr === 'sad') return '<path class="cat-mouth" d="M55 70 Q60 64 65 70" fill="none"/><path class="cat-tear" d="M47 55 q-2 9 0 13" /><path class="cat-tear" d="M73 55 q2 9 0 13"/>';
  if (expr === 'hungry') return '<path class="cat-mouth" d="M54 65 Q60 77 66 65 Z" fill="#c0473f"/><ellipse class="cat-tongue" cx="60" cy="69" rx="4" ry="3"/>';
  return '<path class="cat-mouth" d="M56 68 Q60 71 64 68" fill="none"/>';
}
function catBlush(expr) {
  return expr === 'happy' ? '<ellipse class="cat-blush" cx="36" cy="64" rx="5.5" ry="3.5"/><ellipse class="cat-blush" cx="84" cy="64" rx="5.5" ry="3.5"/>' : '';
}
function catWhiskers() {
  return '<g class="cat-whisk" stroke="#9e7b60" stroke-width="1.2" opacity=".7" fill="none" stroke-linecap="round"><path d="M24 60 H6"/><path d="M25 66 H5"/><path d="M96 60 H114"/><path d="M95 66 H115"/></g>';
}
/* 狸花条纹：更柔和，像毛色自然过渡 */
function tabbyHeadStripes() {
  return '<g opacity=".82" filter="url(#softShadow)">'
    + '<path d="M47 22 Q52 30 56 21" stroke="' + CAT_FUR_DARK + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
    + '<path d="M60 20 L60 31" stroke="' + CAT_FUR_DARK + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    + '<path d="M73 22 Q68 30 64 21" stroke="' + CAT_FUR_DARK + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
    + '<path d="M41 38 Q32 42 28 49" stroke="' + CAT_FUR_DARK + '" stroke-width="3" fill="none" stroke-linecap="round"/>'
    + '<path d="M40 47 Q31 51 27 58" stroke="' + CAT_FUR_DARK + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>'
    + '<path d="M39 56 Q31 60 28 66" stroke="' + CAT_FUR_DARK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    + '<path d="M79 38 Q88 42 92 49" stroke="' + CAT_FUR_DARK + '" stroke-width="3" fill="none" stroke-linecap="round"/>'
    + '<path d="M80 47 Q89 51 93 58" stroke="' + CAT_FUR_DARK + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>'
    + '<path d="M81 56 Q89 60 92 66" stroke="' + CAT_FUR_DARK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    + '</g>';
}
function tabbyBodyStripes() {
  return '<g opacity=".82" filter="url(#softShadow)">'
    + '<path d="M47 84 Q60 89 73 84" stroke="' + CAT_FUR_DARK + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    + '<path d="M44 93 Q60 98 76 93" stroke="' + CAT_FUR_DARK + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    + '<path d="M48 102 Q60 106 72 102" stroke="' + CAT_FUR_DARK + '" stroke-width="3" fill="none" stroke-linecap="round"/>'
    + '<path d="M41 78 L38 67 M42 81 L37 71 M44 83 L39 75" stroke="' + CAT_FUR_DARK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    + '<path d="M79 78 L82 67 M78 81 L83 71 M76 83 L81 75" stroke="' + CAT_FUR_DARK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    + '</g>';
}
function tabbyLegStripes() {
  return '<g opacity=".8" filter="url(#softShadow)">'
    + '<path d="M39 105 l-1 8 M43 105 l0 8 M47 105 l1 7" stroke="' + CAT_FUR_DARK + '" stroke-width="2.1" fill="none" stroke-linecap="round"/>'
    + '<path d="M73 105 l-1 7 M77 105 l0 8 M81 105 l1 8" stroke="' + CAT_FUR_DARK + '" stroke-width="2.1" fill="none" stroke-linecap="round"/>'
    + '</g>';
}
function stageDeco(stageKey) {
  if (stageKey === 'baby') return '<path d="M33 30 L33 14 Q60 1 87 14 L87 30 L79 23 L71 30 L63 23 L55 30 L47 23 L39 30 Z" fill="#fffdf7" stroke="#e6e1d6" stroke-width="1.5"/>';
  if (stageKey === 'teen') return '<path d="M38 73 Q60 84 82 73 L84 82 Q60 93 36 82 Z" fill="#56b4c9"/><rect x="70" y="80" width="11" height="18" rx="4" fill="#56b4c9"/>';
  if (stageKey === 'adult') return '<path d="M40 22 L46 7 L54 18 L60 5 L66 18 L74 7 L80 22 Z" fill="#ffd24d" stroke="#e0a92e" stroke-width="1.4"/><circle cx="60" cy="8" r="2.4" fill="#ff6b6b"/>';
  return '';
}
function catSvgBody(stageKey, expr) {
  const deco = stageDeco(stageKey);
  const scale = ({ baby: 0.78, kid: 0.9, teen: 1, adult: 1.08 })[stageKey] || 1;
  // 3D 狸花猫：头身用径向渐变做出圆鼓鼓体积，大眼水润高光，条纹带柔和投影
  return '<svg viewBox="0 0 120 120" class="cat-svg" aria-label="宠物猫">'
    + catGradients()
    + '<ellipse class="cat-shadow" cx="60" cy="114" rx="36" ry="6"/>'
    + '<g class="cat-stage" transform="translate(60 60) scale(' + scale + ') translate(-60 -60)">'
    + '<g class="cat-all">'
    // 尾巴（环纹，底部更粗）
    + '<g class="cat-tail"><path d="M80 100 q28 -2 26 -32 q-1 -10 -12 -8 q-5 20 -22 22 Z" fill="url(#furGrad)"/>'
    + '<path d="M86 93 q20 -2 19 -19" stroke="' + CAT_FUR_DARK + '" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>'
    + '<path d="M90 84 q14 -1 13 -12" stroke="' + CAT_FUR_DARK + '" stroke-width="3.6" fill="none" stroke-linecap="round" opacity=".85"/>'
    + '<path d="M95 74 q8 0 7 -6" stroke="' + CAT_FUR_DARK + '" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".85"/></g>'
    // 身体（圆润梨形 + 渐变肚皮）
    + '<g class="cat-body-g"><path d="M40 82 Q35 115 60 116 Q85 115 80 82 Q75 65 60 65 Q45 65 40 82 Z" fill="url(#furGrad)"/>'
    + '<ellipse cx="60" cy="99" rx="19" ry="18" fill="url(#bellyGrad)"/>'
    + tabbyBodyStripes() + tabbyLegStripes() + '</g>'
    // 前爪（白手套，更圆润）
    + '<ellipse cx="43" cy="112" rx="9" ry="7" fill="url(#bellyGrad)"/>'
    + '<ellipse cx="77" cy="112" rx="9" ry="7" fill="url(#bellyGrad)"/>'
    // 脑袋（更大更圆）
    + '<g class="cat-head-g">'
    + '<g class="cat-ear cat-ear-l"><path d="M36 36 L24 4 L54 26 Z" fill="url(#furGrad)"/><path d="M37 31 L28 11 L50 26 Z" fill="url(#earGrad)"/></g>'
    + '<g class="cat-ear cat-ear-r"><path d="M84 36 L96 4 L66 26 Z" fill="url(#furGrad)"/><path d="M83 31 L92 11 L70 26 Z" fill="url(#earGrad)"/></g>'
    + '<ellipse cx="60" cy="54" rx="36" ry="33" fill="url(#furGrad)"/>'
    // 白嘴套/下巴
    + '<ellipse cx="60" cy="66" rx="25" ry="18" fill="url(#bellyGrad)"/>'
    + '<ellipse cx="60" cy="58" rx="14" ry="9" fill="' + CAT_BELLY + '" opacity=".85"/>'
    + tabbyHeadStripes()
    + catEyes() + '<path class="cat-nose" d="M57 63 L63 63 L60 68 Z" fill="' + CAT_PINK + '"/>'
    + catMouth(expr) + catBlush(expr) + catWhiskers() + deco
    + '</g></g></g></svg>';
}
function eggSvg(expr) {
  const face = '<g class="cat-eye"><ellipse cx="52" cy="60" rx="5.5" ry="7" fill="#fff"/><circle class="cat-pupil" cx="52" cy="61" r="3.4" fill="#2b2b35"/></g>'
    + '<g class="cat-eye"><ellipse cx="68" cy="60" rx="5.5" ry="7" fill="#fff"/><circle class="cat-pupil" cx="68" cy="61" r="3.4" fill="#2b2b35"/></g>'
    + '<path class="cat-nose" d="M58 67 L62 67 L60 70 Z" fill="#ffd1d1"/>' + catMouth(expr) + catBlush(expr);
  return '<svg viewBox="0 0 120 120" class="cat-svg cat-egg" aria-label="神秘蛋">'
    + '<ellipse class="cat-shadow" cx="60" cy="112" rx="30" ry="5"/>'
    + '<g class="cat-egg-wob"><ellipse cx="60" cy="64" rx="34" ry="42" fill="url(#eggGrad)"/>'
    + '<ellipse cx="60" cy="64" rx="34" ry="42" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>'
    + '<g fill="#fff" opacity=".8"><circle cx="44" cy="40" r="2.4"/><circle cx="76" cy="46" r="2"/><circle cx="60" cy="30" r="1.8"/><circle cx="84" cy="72" r="2.2"/><circle cx="36" cy="78" r="1.8"/></g>'
    + face + '</g>'
    + '<defs><radialGradient id="eggGrad" cx="40%" cy="35%" r="75%"><stop offset="0%" stop-color="#8b7bff"/><stop offset="100%" stop-color="#4a35c9"/></radialGradient></defs>'
    + '</svg>';
}
function petSvg(stageKey, expr) {
  if (stageKey === 'egg') return eggSvg(expr);
  return catSvgBody(stageKey, expr);
}
function petVisualHtml(stage) {
  const img = (typeof APP_ICONS !== 'undefined') && APP_ICONS['pet_' + stage.key];
  if (img) return '<img class="pet-img" src="' + img + '" alt="' + stage.name + '">';
  return petSvg(stage.key, petExpr());   // 兜底：仍用 SVG
}
function animatePet(anim) {
  if (PetCat3D.ready) {
    const m = { bounce: 'bounce', pounce: 'stand', chase: 'walk', ball: 'walk', comb: 'sit', brush: 'sit', sun: 'sit', walk: 'walk', snap: 'idle', photo: 'idle', chew: 'sit' };
    PetCat3D.play(m[anim] || 'idle');
    return;
  }
  /* 兜底：无 3D 时用 CSS 动画 */
  const v = $('petVisual'); if (!v) return;
  const body = v.querySelector('.pet-body') || v;
  body.classList.remove('bounce', 'pounce', 'chase', 'brush', 'sun', 'walk', 'snap', 'chew');
  void body.offsetWidth;
  body.classList.add(anim || 'bounce');
}

/* ============================================================
   Pet3DGLB —— Three.js 加载 AI 生成的 3D 狸花猫 GLB 模型
   支持：拖拽旋转、自动旋转、姿态切换（sit/loaf/walk）。
   加载失败时自动降级为 AI 图片。
   ============================================================ */
const Pet3DGLB = {
  ready: false, loading: false, failed: false,
  THREE: null, GLTFLoader: null, OrbitControls: null,
  renderer: null, scene: null, camera: null, controls: null,
  current: null, host: null, container: null, raf: 0,
  poseKey: 'sit',
  rig: null,               // 承载模型的组：所有程序化动画都作用在它身上
  models: {},              // GLB 缓存（避免每次切姿态重新下载 2.8MB）
  act: null,               // 当前动作 {name, t0, dur}
  t0: 0, idleEvt: 0, idleKind: '',   // 空闲小动作（甩头/抖毛/小跳）
  CDN: [
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    'https://unpkg.com/three@0.128.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
  ],
  CDN_LOADER: [
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
    'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/loaders/GLTFLoader.js'
  ],
  CDN_CONTROLS: [
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
    'https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/OrbitControls.js'
  ],

  /* 依次加载 script，返回 Promise */
  loadScript(urls) {
    return new Promise((resolve, reject) => {
      let i = 0;
      const next = () => {
        if (i >= urls.length) return reject(new Error('all CDN failed'));
        const s = document.createElement('script');
        s.src = urls[i++]; s.async = true;
        s.onload = () => resolve(s.src);
        s.onerror = () => { s.remove(); next(); };
        document.head.appendChild(s);
      };
      next();
    });
  },

  /* 载入 three.js + GLTFLoader + OrbitControls */
  load(cb) {
    if (this.ready) { cb && cb(true); return; }
    if (this.failed) { cb && cb(false); return; }
    if (this.loading) { (this._q = this._q || []).push(cb); return; }
    /* 页面已内联 three 全家桶（window.THREE + GLTFLoader + OrbitControls 均存在）→ 直接启用，彻底不依赖外部 CDN */
    if (window.THREE && window.THREE.GLTFLoader && window.THREE.OrbitControls) {
      this.THREE = window.THREE; this.GLTFLoader = window.THREE.GLTFLoader; this.OrbitControls = window.THREE.OrbitControls;
      this.ready = true; this.loading = false; cb && cb(true); return;
    }
    this.loading = true; this._q = [cb];
    const self = this;
    const done = ok => {
      self.loading = false;
      if (!ok) self.failed = true;
      else { self.THREE = window.THREE; self.GLTFLoader = window.THREE.GLTFLoader; self.OrbitControls = window.THREE.OrbitControls; self.ready = true; }
      (self._q || []).forEach(f => f && f(ok)); self._q = [];
    };
    self.loadScript(self.CDN)
      .then(() => self.loadScript(self.CDN_LOADER))
      .then(() => self.loadScript(self.CDN_CONTROLS))
      .then(() => done(true))
      .catch(() => done(false));
  },

  /* 初始化场景、相机、灯光、渲染器 */
  init(host) {
    const T = this.THREE;
    const w = host.clientWidth || 180, h = host.clientHeight || 180;
    const scene = new T.Scene(); this.scene = scene;
    const cam = new T.PerspectiveCamera(40, w / h || 1, .1, 100); this.camera = cam;
    cam.position.set(0, .8, 3.2); cam.lookAt(0, .2, 0);

    const rd = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rd.setSize(w, h); rd.setClearColor(0x000000, 0);
    rd.outputEncoding = T.sRGBEncoding;
    rd.toneMapping = T.ACESFilmicToneMapping;
    this.renderer = rd;
    rd.domElement.className = 'pet-3d-canvas';
    host.appendChild(rd.domElement);

    scene.add(new T.AmbientLight(0xffffff, .75));
    scene.add(new T.HemisphereLight(0xffffff, 0x9aa7b2, .55));
    const key = new T.DirectionalLight(0xffffff, 1.0); key.position.set(2, 4, 3); scene.add(key);
    const rim = new T.DirectionalLight(0xffffff, .55); rim.position.set(-3, 2, -2); scene.add(rim);
    const fill = new T.DirectionalLight(0xffffff, .35); fill.position.set(0, -1, 2); scene.add(fill);

    /* 承载模型的 rig：程序化动画全部作用在这里，不影响相机控制 */
    const rig = new T.Group(); scene.add(rig); this.rig = rig;

    const ctrl = new this.OrbitControls(cam, rd.domElement);
    ctrl.enableDamping = true; ctrl.dampingFactor = .06;
    ctrl.enablePan = false; ctrl.minDistance = 2; ctrl.maxDistance = 6;
    ctrl.autoRotate = false;                 // 相机不自转：改由猫自己动，才像“活的”
    ctrl.target.set(0, .2, 0);
    this.controls = ctrl;
    const self = this;                       // 拖拽旋转时不误触“点击宠物”
    ctrl.addEventListener('start', () => { self._dragging = true; });
    ctrl.addEventListener('end', () => { setTimeout(() => { self._dragging = false; }, 60); });
    this.t0 = performance.now();
  },

  /* 挂载到宿主容器 */
  mount(host, stageKey) {
    if (!host || this.failed) return;
    this.host = host; this.stageKey = stageKey;
    const self = this;
    this.load(ok => {
      if (!ok || !host.isConnected) { self.showFallback(); return; }
      try {
        if (!self.renderer) self.init(host);
        else if (self.renderer.domElement.parentNode !== host) host.appendChild(self.renderer.domElement);
        self.container = host;
        host.classList.add('on');
        if (!self.current) self.pose('sit');       // 已有模型则保留当前姿态，不因重渲染而重置
        self.resize();
        if (!self.raf) self.animate();
        self._resizeBound = self._resizeBound || (() => self.resize());
        window.addEventListener('resize', self._resizeBound);
      } catch (e) { console.warn('Pet3DGLB mount fail', e); self.failed = true; self.showFallback(); }
    });
  },

  showFallback() {
    if (!this.host) return;
    this.host.classList.remove('on');
    const body = this.host.parentNode && this.host.parentNode.querySelector('.pet-body');
    if (body) body.style.opacity = '1';
  },

  resize() {
    if (!this.renderer || !this.container) return;
    const w = this.container.clientWidth || 180, h = this.container.clientHeight || 180;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  },

  /* 用 GitHub Pages 绝对路径加载 GLB：单文件版本地打开时旁边没有 assets/ 文件夹，
     相对路径会失败并降级成静态图片；绝对路径经测试 CORS 已放行，3D 才能正常出来。 */
  POSE_URL: {
    sit:  APP_HOME_URL + 'assets/cat_sit.glb',
    loaf: APP_HOME_URL + 'assets/cat_loaf.glb',
    walk: APP_HOME_URL + 'assets/cat_walk.glb'
  },

  /* 载入一个姿态模型（带缓存），cb(model|null) */
  fetchModel(key, cb) {
    const self = this;
    if (this.models[key]) { cb(this.models[key]); return; }
    const url = this.POSE_URL[key]; if (!url) { cb(null); return; }
    new this.GLTFLoader().load(url, gltf => {
      const model = gltf.scene;
      const T = self.THREE;
      /* 图生 3D 的 GLB 多为金属 PBR 材质但无环境贴图 → 金属度=1 时会反射黑环境而几乎全黑，
         在透明画布上看起来就是空白。统一改：去金属化 + 双面 + 关透明，确保漫反射贴图可见。 */
      model.traverse(o => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => {
            m.metalness = 0.0;
            m.roughness = 0.7;
            m.side = T.DoubleSide;
            if (m.map) m.map.encoding = T.sRGBEncoding;
            m.transparent = false;
            m.needsUpdate = true;
          });
        }
      });
      /* 归一化：居中 + 缩放到统一大小，让三种姿态切换时体型一致 */
      const box = new T.Box3().setFromObject(model);
      const center = box.getCenter(new T.Vector3());
      const size = box.getSize(new T.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 2.0 / maxDim;
      model.scale.setScalar(s);
      model.position.sub(center.multiplyScalar(s));
      model.position.y += .1;
      self.models[key] = model;
      cb(model);
    }, undefined, err => { console.warn('GLB load fail', key, err); cb(null); });
  },

  /* 切换姿态（缓存命中则瞬间完成） */
  pose(key) {
    if (!this.ready || !this.rig) return;
    if (!this.POSE_URL[key]) key = 'sit';
    this.poseKey = key;
    const self = this;
    this.fetchModel(key, model => {
      if (!self.rig) return;
      if (!model) {                                   // 首个姿态都加载不出来才算失败
        if (!self.current) { self.failed = true; self.showFallback(); }
        return;
      }
      if (self.poseKey !== key) return;               // 期间又切了别的姿态
      if (self.current && self.current !== model) self.rig.remove(self.current);
      self.current = model;
      if (model.parent !== self.rig) self.rig.add(model);
      self.preloadRest();
    });
  },

  /* 后台预载其余姿态，动作切换时零等待 */
  preloadRest() {
    if (this._pre) return; this._pre = true;
    const self = this;
    setTimeout(() => {
      Object.keys(self.POSE_URL).forEach(k => {
        if (!self.models[k]) self.fetchModel(k, () => {});
      });
    }, 1200);
  },

  /* 触发动作：切姿态 + 播一段程序化动画 */
  play(name) {
    if (!this.ready) return;
    const poseMap = { poke: 'sit', pounce: 'sit', ball: 'walk', chase: 'walk', comb: 'loaf', brush: 'loaf', sun: 'loaf', walk: 'walk', snap: 'sit', photo: 'sit', chew: 'sit', bounce: 'sit' };
    const dur = { poke: 900, pounce: 900, ball: 1200, chase: 1200, comb: 1400, brush: 1400, sun: 1800, walk: 1600, snap: 800, photo: 800, chew: 1100, bounce: 700 };
    const target = poseMap[name] || 'sit';
    if (this.poseKey !== target) this.pose(target);
    this.act = { name: name || 'bounce', t0: performance.now(), dur: dur[name] || 700 };
  },

  /* 逐帧：空闲呼吸/摆动 + 动作叠加（GLB 无骨骼，用整体变换模拟生命感） */
  animate() {
    const self = this;
    this.raf = requestAnimationFrame(() => self.animate());
    if (!this.renderer || !this.scene || !this.camera) return;
    const host = this.container;
    const visible = host && host.isConnected && host.offsetWidth > 0 && host.offsetHeight > 0;
    if (!visible) return;   // 不可见时不渲染，省电

    const R = this.rig, now = performance.now(), t = (now - this.t0) / 1000;
    if (R) {
      /* —— 常驻：轻柔呼吸（整体均匀缩放，不形变）+ 微小上下浮动 —— */
      const br = Math.sin(t * 1.6);
      let um = 1 + br * .012;                     // 均匀缩放 ±1.2%，猫不会变胖/变瘦
      let px = 0, py = br * .018, pz = 0;         // 上下轻晃，幅度很小
      /* —— 常驻：极缓慢左右张望 + 几乎不可见的点头/侧倾 —— */
      let rx = Math.sin(t * .55) * .025;
      let ry = Math.sin(t * .42) * .12 + Math.sin(t * .17) * .05;   // 左右摇头 ±~8°
      let rz = Math.sin(t * .40) * .022;

      /* —— 空闲小动作：每 6~10 秒一次，幅度克制，像真猫一样慵懒 —— */
      if (now > this.idleEvt) {
        this.idleEvt = now + 6000 + Math.random() * 4000;
        this.idleKind = ['shake', 'hop', 'turn', 'flick'][Math.floor(Math.random() * 4)];
        this._idleT0 = now;
      }
      const ip = (now - (this._idleT0 || 0)) / 900;
      if (ip >= 0 && ip < 1 && !this.act) {
        const is = Math.sin(ip * Math.PI);
        if (this.idleKind === 'shake') { rz += Math.sin(ip * Math.PI * 5) * .08; ry += Math.sin(ip * Math.PI * 4) * .16; }
        else if (this.idleKind === 'hop') { py += is * .10; um += is * .02; }     // 均匀缩放，不变形
        else if (this.idleKind === 'flick') { rx += Math.sin(ip * Math.PI * 6) * .07; }
        else { ry += is * .35; }                   // 慢半拍转身
      }

      /* —— 陪玩动作：贴近真实猫，以旋转/小位移为主，禁用非均匀缩放 —— */
      const A = this.act;
      if (A) {
        const p = (now - A.t0) / A.dur;
        if (p >= 1) { this.act = null; }
        else {
          const s = Math.sin(p * Math.PI);                 // 0→1→0
          switch (A.name) {
            case 'poke': case 'pounce':                    // 逗猫/扑：轻探头 + 前倾
              rx += -s * .14; pz += s * .15; um += s * .02;
              break;
            case 'ball': case 'chase':                     // 追球：小幅侧扑
              px += Math.sin(p * Math.PI * 2) * .32;
              rz += -Math.sin(p * Math.PI * 2) * .10;
              ry += Math.sin(p * Math.PI * 2) * .35;
              py += Math.abs(Math.sin(p * Math.PI * 4)) * .05;
              break;
            case 'comb': case 'brush':                     // 梳毛：舒服地轻扭
              rz += Math.sin(p * Math.PI * 5) * .06;
              ry += Math.sin(p * Math.PI * 3) * .18;
              break;
            case 'sun':                                    // 晒太阳：轻微舒展
              um += s * .03; pz += s * .08; rx += s * .05; py -= s * .02;
              break;
            case 'walk':                                   // 散步：小步踱 + 转身
              px += Math.sin(p * Math.PI * 2) * .28;
              ry += Math.sin(p * Math.PI * 2) * .45;
              py += Math.abs(Math.sin(p * Math.PI * 6)) * .04;
              break;
            case 'snap': case 'photo':                     // 拍照：转正 + 微挺身
              ry *= (1 - s); py += s * .04; um += s * .02;
              break;
            case 'chew':                                   // 吃饭：低头小幅点头
              rx += .08 + Math.sin(p * Math.PI * 8) * .05;
              py -= s * .03;
              break;
            default:                                       // bounce：小跳
              py += Math.abs(Math.sin(p * Math.PI * 2)) * .16;
              um += Math.sin(p * Math.PI * 2) * .02;
          }
        }
      }

      R.position.set(px, py, pz);
      R.rotation.set(rx, ry, rz);
      R.scale.set(um, um, um);
    }

    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  },

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    if (this.renderer) { try { this.renderer.dispose(); } catch (e) {} }
    if (this._resizeBound) window.removeEventListener('resize', this._resizeBound);
  }
};

/* ============================================================
   PetCat3D —— 纯几何体程序化搭建的可动 3D 小猫（无外部资源、离线可用、不会空白）
   动作：idle 待机 / sit 坐下 / stand 站立 / walk 走路 / play 逗猫棒(站立抓逗猫棒) / bounce 点击跳一下
   支持拖拽旋转；不同阶段有不同配饰（破壳帽/围巾/皇冠）与体型。
   ============================================================ */
const PetCat3D = {
  ready: false, failed: false, inited: false, active: false,
  T: null, host: null, renderer: null, scene: null, camera: null, controls: null, raf: 0,
  root: null, parts: {}, wand: null, stageKey: 'kid', state: 'idle', act: null, t0: 0,
  _dragging: false, _resizeBound: null, _last: 0, _w: 0, _h: 0, _scale: 0.9, _lastStage: null, _c: null,

  mat(c, o) { const T = this.T; return new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .82, metalness: 0 }, o || {})); },
  sph(r, c, o) { const T = this.T; return new T.Mesh(new T.SphereGeometry(r, 22, 16), this.mat(c, o)); },
  cyl(rt, rb, h, c, o) { const T = this.T; return new T.Mesh(new T.CylinderGeometry(rt, rb, h, 16), this.mat(c, o)); },
  cone(r, h, c, o) { const T = this.T; return new T.Mesh(new T.ConeGeometry(r, h, 18), this.mat(c, o)); },

  ensure() {
    if (this.failed) return false;
    if (!window.THREE) { this.failed = true; return false; }
    if (!this.inited) this.init();
    return this.ready;
  },

  init() {
    const T = window.THREE; this.T = T;
    const scene = new T.Scene(); this.scene = scene;
    const cam = new T.PerspectiveCamera(42, 1, .1, 100); cam.position.set(0, 1.2, 3.7); cam.lookAt(0, .85, 0); this.camera = cam;
    const rd = new T.WebGLRenderer({ alpha: true, antialias: true });
    rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); rd.setSize(240, 240);
    rd.setClearColor(0x000000, 0);
    if (T.sRGBEncoding !== undefined) rd.outputEncoding = T.sRGBEncoding;
    this.renderer = rd; rd.domElement.className = 'pet-3d-canvas';
    scene.add(new T.AmbientLight(0xffffff, .85));
    scene.add(new T.HemisphereLight(0xffffff, 0x95a3b3, .6));
    const key = new T.DirectionalLight(0xffffff, 1.05); key.position.set(2.4, 4.2, 3); scene.add(key);
    const rim = new T.DirectionalLight(0xffffff, .5); rim.position.set(-3, 2, -2.4); scene.add(rim);
    const fill = new T.DirectionalLight(0xffffff, .35); fill.position.set(0, -1, 3); scene.add(fill);
    const root = new T.Group(); scene.add(root); this.root = root;
    this.buildCat(); this.buildWand();
    if (T.OrbitControls) {
      const ctrl = new T.OrbitControls(cam, rd.domElement);
      ctrl.enableDamping = true; ctrl.dampingFactor = .08; ctrl.enablePan = false;
      ctrl.minDistance = 2.3; ctrl.maxDistance = 6.2; ctrl.minPolarAngle = .45; ctrl.maxPolarAngle = 2.35;
      ctrl.target.set(0, .85, 0);
      ctrl.addEventListener('start', () => { this._dragging = true; });
      ctrl.addEventListener('end', () => { const s = this; setTimeout(() => { s._dragging = false; }, 80); });
      this.controls = ctrl;
      rd.domElement.addEventListener('click', (e) => { if (!this._dragging) { e.stopPropagation(); this.play('bounce'); try { showPetBubble('喵～'); } catch (er) {} } });
    }
    this.t0 = performance.now(); this._last = this.t0; this.inited = true; this.ready = true;
    this._c = { bodyRX: 0, bodyY: 0, headRX: 0, headRY: 0, headRZ: 0, tailRZ: 0, tailRX: 0, fL: 0, fR: 0, bL: 0, bR: 0, rootY: 0 };
    this.animate();
  },

  buildCat() {
    const T = this.T;
    const FUR = 0x9aa3ab, FUR2 = 0x828b94, BELLY = 0xeef1f3, PINK = 0xf6b8c4, DARK = 0x2b2b30, GREEN = 0x8fd17a;
    const body = new T.Group(); this.root.add(body); this.parts.body = body;
    const torso = this.sph(1, FUR); torso.scale.set(.46, .42, .62); torso.position.set(0, .58, 0); body.add(torso);
    const belly = this.sph(1, BELLY); belly.scale.set(.34, .3, .5); belly.position.set(0, .5, .12); body.add(belly);
    const rump = this.sph(1, FUR); rump.scale.set(.42, .4, .4); rump.position.set(0, .6, -.3); body.add(rump);
    const chest = this.sph(1, FUR); chest.scale.set(.36, .36, .4); chest.position.set(0, .66, .3); body.add(chest);

    const head = new T.Group(); head.position.set(0, .98, .34); body.add(head); this.parts.head = head;
    const skull = this.sph(1, FUR); skull.scale.set(.34, .32, .34); head.add(skull);
    const face = this.sph(1, BELLY); face.scale.set(.26, .24, .22); face.position.set(0, -.04, .16); head.add(face);
    [-1, 1].forEach(s => {
      const ear = this.cone(.13, .26, FUR); ear.position.set(.17 * s, .28, 0); ear.rotation.z = .32 * s; head.add(ear);
      const inner = this.cone(.07, .18, PINK); inner.position.set(.17 * s, .27, .03); inner.rotation.z = .32 * s; head.add(inner);
    });
    [-1, 1].forEach(s => {
      const iris = this.sph(.075, GREEN); iris.position.set(.13 * s, .05, .27); head.add(iris);
      const pupil = this.sph(.04, DARK); pupil.scale.set(.5, 1.3, .5); pupil.position.set(.13 * s, .05, .32); head.add(pupil);
      const hl = this.sph(.018, 0xffffff); hl.position.set(.13 * s + .02, .08, .33); head.add(hl);
    });
    const nose = this.cone(.05, .06, PINK); nose.position.set(0, -.04, .34); nose.rotation.x = Math.PI / 2; head.add(nose);
    [-1, 1].forEach(s => { for (let i = 0; i < 3; i++) { const w = this.cyl(.006, .006, .26, DARK); w.rotation.z = Math.PI / 2; w.rotation.y = .25 * s; w.position.set(.12 * s, -.02 + i * .05, .3); head.add(w); } });

    const tail = new T.Group(); tail.position.set(0, .62, -.5); body.add(tail); this.parts.tail = tail;
    let prev = tail;
    for (let i = 0; i < 5; i++) { const seg = new T.Group(); seg.position.set(0, 0, -.18); seg.rotation.x = .16; const r = .1 - i * .013; const m = this.sph(1, FUR); m.scale.set(r, r, r * 1.5); m.position.y = -.09; seg.add(m); prev.add(seg); prev = seg; }

    const legs = {};
    const def = [['fL', .22, .3], ['fR', -.22, .3], ['bL', .26, -.28], ['bR', -.26, -.28]];
    def.forEach(([nm, x, z]) => {
      const leg = new T.Group(); leg.position.set(x, .6, z); body.add(leg);
      const up = this.cyl(.085, .07, .34, FUR); up.position.y = -.17; leg.add(up);
      const lo = this.cyl(.07, .055, .32, FUR2); lo.position.y = -.46; leg.add(lo);
      const paw = this.sph(1, BELLY); paw.scale.set(.1, .06, .14); paw.position.set(0, -.64, .03); leg.add(paw);
      legs[nm] = leg;
    });
    this.parts.legs = legs;
    const acc = new T.Group(); body.add(acc); this.parts.acc = acc;
  },

  buildWand() {
    const T = this.T;
    const wand = new T.Group();
    const stick = this.cyl(.02, .02, 1.1, 0xb98a5a); stick.position.y = .55; wand.add(stick);
    const f1 = this.cone(.13, .32, 0xff7aa2); f1.position.y = 1.18; wand.add(f1);
    const f2 = this.cone(.1, .26, 0xffd166); f2.position.set(.09, 1.12, .05); f2.rotation.z = .4; wand.add(f2);
    wand.position.set(.3, .25, .7); wand.rotation.z = -.25; wand.visible = false;
    this.scene.add(wand); this.wand = wand;
  },

  applyStage(key) {
    this.stageKey = key || 'kid';
    const acc = this.parts.acc; if (!acc) return;
    const scales = { baby: .74, kid: .88, teen: 1.0, adult: 1.16 };
    this._scale = scales[this.stageKey] || .9;
    if (this._lastStage === this.stageKey) return; this._lastStage = this.stageKey;
    while (acc.children.length) acc.remove(acc.children[0]);
    const T = this.T;
    if (this.stageKey === 'baby') {
      const sh = this.sph(1, 0xffffff); sh.scale.set(.3, .16, .3); sh.position.set(0, .32, .04); acc.add(sh);
      const sh2 = this.sph(1, 0xf0f0f0); sh2.scale.set(.18, .12, .18); sh2.position.set(.18, .28, .05); acc.add(sh2);
    } else if (this.stageKey === 'teen') {
      const t = new T.Mesh(new T.TorusGeometry(.22, .06, 10, 22), this.mat(0x4a90d9)); t.rotation.x = Math.PI / 2; t.position.set(0, -.16, .02); acc.add(t);
    } else if (this.stageKey === 'adult') {
      const crown = this.cone(.12, .16, 0xffd700); crown.position.set(0, .34, 0); crown.scale.set(1, 1, .7); acc.add(crown);
      const ball = this.sph(.045, 0xffd700); ball.position.set(0, .43, 0); acc.add(ball);
    }
  },

  poseTargets() {
    const s = this.state;
    const P = { bodyRX: 0, bodyY: 0, headRX: 0, headRY: 0, headRZ: 0, tailRZ: 0, tailRX: 0, fL: 0, fR: 0, bL: 0, bR: 0, rootY: 0 };
    if (s === 'sit') { P.bodyRX = .4; P.bodyY = .04; P.bL = 1.2; P.bR = 1.2; P.headRX = .05; P.tailRZ = .2; }
    else if (s === 'stand' || s === 'play') { P.bodyRX = .55; P.fL = -2.2; P.fR = -2.2; P.bL = .18; P.bR = .18; P.headRX = -.12; P.tailRZ = .1; }
    else if (s === 'walk') { P.bodyRX = .04; }
    return P;
  },

  play(name) {
    if (!this.ready) return;
    if (name === 'bounce') { this.act = { name: 'bounce', t0: performance.now(), dur: 620 }; return; }
    if (['idle', 'sit', 'stand', 'walk', 'play'].indexOf(name) >= 0) this.state = name; else this.state = 'idle';
  },

  mount(host, stageKey) {
    if (!host) return;
    this.host = host;
    if (!this.ensure()) { this.showFallback(); return; }
    if (this.renderer.domElement.parentNode !== host) host.appendChild(this.renderer.domElement);
    host.classList.add('on'); this.active = true;
    if (stageKey) this.applyStage(stageKey);
    if (this.state === 'idle' || !this.state) this.play('idle');
    this.resize();
    if (!this._resizeBound) { this._resizeBound = () => this.resize(); window.addEventListener('resize', this._resizeBound); }
  },
  hide() { this.active = false; if (this.host) this.host.classList.remove('on'); },
  showFallback() { this.active = false; if (this.host) this.host.classList.remove('on'); },

  resize() {
    if (!this.renderer || !this.host) return;
    const w = this.host.clientWidth || 240, h = this.host.clientHeight || 240;
    if (w <= 0 || h <= 0) return;
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  },

  animate() {
    const self = this;
    this.raf = requestAnimationFrame(() => self.animate());
    if (!this.renderer || !this.scene || !this.camera) return;
    const host = this.host;
    const visible = this.active && host && host.isConnected && host.offsetWidth > 0 && host.offsetHeight > 0;
    if (!visible) return;
    if (host.clientWidth !== this._w || host.clientHeight !== this._h) this.resize();
    const T = this.T, now = performance.now(), t = (now - this.t0) / 1000;
    const dt = Math.min(0.05, (now - this._last) / 1000) || 0.016; this._last = now;
    const P = this.poseTargets();
    const k = Math.min(1, dt * 7);
    const c = this._c;
    c.bodyRX += (P.bodyRX - c.bodyRX) * k; c.bodyY += (P.bodyY - c.bodyY) * k;
    c.headRX += (P.headRX - c.headRX) * k; c.headRY += (P.headRY - c.headRY) * k; c.headRZ += (P.headRZ - c.headRZ) * k;
    c.tailRZ += (P.tailRZ - c.tailRZ) * k; c.tailRX += (P.tailRX - c.tailRX) * k;
    c.fL += (P.fL - c.fL) * k; c.fR += (P.fR - c.fR) * k; c.bL += (P.bL - c.bL) * k; c.bR += (P.bR - c.bR) * k;
    c.rootY += (P.rootY - c.rootY) * k;

    const br = Math.sin(t * 1.6);
    let breath = 1 + br * 0.015;
    let bodyY = c.bodyY + br * 0.012;
    let headRX = c.headRX + Math.sin(t * 1.1) * 0.04;
    let headRY = c.headRY + Math.sin(t * 0.7) * 0.12;
    let headRZ = c.headRZ + Math.sin(t * 0.9) * 0.03;
    let tailWag = Math.sin(t * 2.4) * 0.28 + c.tailRZ;
    let tailSway = Math.sin(t * 1.7) * 0.12 + c.tailRX;
    let fL = c.fL, fR = c.fR, bL = c.bL, bR = c.bR, rootY = c.rootY;

    if (this.state === 'walk') {
      const ph = t * 6.5;
      fL = Math.sin(ph) * 0.5; fR = Math.sin(ph + Math.PI) * 0.5; bL = Math.sin(ph + Math.PI) * 0.5; bR = Math.sin(ph) * 0.5;
      bodyY += Math.abs(Math.sin(ph * 2)) * 0.03; headRY += Math.sin(ph) * 0.1;
    }
    if (this.state === 'play') {
      const sw = Math.sin(t * 6) * 0.4;
      fL = -2.2 + sw; fR = -2.2 - sw;
      if (this.wand) { this.wand.visible = true; this.wand.position.x = 0.3 + Math.sin(t * 2.2) * 0.5; this.wand.position.y = 0.25 + Math.sin(t * 3.1) * 0.12; this.wand.rotation.z = -0.25 + Math.sin(t * 2.2) * 0.4; }
    } else if (this.wand) { this.wand.visible = false; }

    const bd = this.parts.body, hd = this.parts.head, tl = this.parts.tail, L = this.parts.legs;
    bd.rotation.x = c.bodyRX; bd.position.y = bodyY;
    hd.rotation.set(headRX, headRY, headRZ);
    tl.rotation.z = tailWag; tl.rotation.x = tailSway;
    L.fL.rotation.x = fL; L.fR.rotation.x = fR; L.bL.rotation.x = bL; L.bR.rotation.x = bR;

    const sc = this._scale || 1;
    let bs = breath * sc; this.root.position.y = rootY; this.root.scale.set(bs, bs, bs);

    if (this.act) {
      const p = (now - this.act.t0) / this.act.dur;
      if (p >= 1) { this.act = null; }
      else { const s = Math.abs(Math.sin(p * Math.PI)); this.root.position.y += s * 0.22; const bb = (1 + s * 0.05) * sc; this.root.scale.set(bb, bb, bb); }
    }
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
};

/* 每个陪玩动作对应的“道具/特效”图层 HTML（emoji + 装饰元素，由 CSS 动画驱动） */
const PET_PROP = {
  poke: '<div class="pp pp-feather">🪶</div><div class="pp pp-dust">✨</div>',
  ball: '<div class="pp pp-ball">⚽</div>',
  comb: '<div class="pp pp-comb">🪮</div><div class="pp pp-spark">✨</div>',
  sun:  '<div class="pp pp-sun">☀️</div><div class="pp pp-glow"></div>',
  walk: '<div class="pp pp-foot f1">👣</div><div class="pp pp-foot f2">👣</div><div class="pp pp-bush">🌿</div>',
  photo: '<div class="pp pp-flash"></div><div class="pp pp-frame"></div>'
};
function playPetProp(key) {
  const prop = $('petProp'); if (!prop) return;
  prop.innerHTML = PET_PROP[key] || '';
  prop.classList.add('run');
  clearTimeout(prop._t);
  prop._t = setTimeout(() => { prop.classList.remove('run'); prop.innerHTML = ''; }, 1500);
}
/* 点击宠物本身：轻互动一声“喵” */
function petTap() {
  if (Pet3DGLB._dragging) return;              // 刚拖拽旋转过 3D 模型，不算点击
  const p = S.life.child.pet;
  if (petStage(p.exp).key === 'egg') {
    showPetBubble('🥚 还在蛋里呢～');
    const t = $('petTalk'); if (t) t.textContent = '轻轻敲了敲蛋，里面传来“哒哒”声…';
    return;
  }
  animatePet('bounce');
  const says = ['喵～', '你回来啦！', '陪我玩嘛～', '咕噜咕噜…', '最喜欢你啦！'];
  const el = $('petTalk'); if (el) el.textContent = says[Math.floor(Math.random() * says.length)];
}
function showPetBubble(html) {
  const b = $('petBubble'); if (!b) return;
  b.innerHTML = html;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function spendStar(n) {
  const c = S.life.child;
  if ((c.stars || 0) < n) { toast('星星不够啦，先去完成任务赚⭐吧'); return false; }
  c.stars -= n; return true;
}
/* 每日动作次数：跨天自动清零 */
function petActCnt(key) {
  const p = S.life.child.pet; const today = todayStr();
  if (p.actDay !== today) { p.actDay = today; p.actCnt = {}; }
  return p.actCnt[key] || 0;
}
function petActLeft(a) { return a.limit ? Math.max(0, a.limit - petActCnt(a.key)) : -1; }   // -1 表示不限次
/* 执行一个陪玩动作 */
function doPetAct(key) {
  const a = PET_ACTS.find(x => x.key === key); if (!a) return;
  const p = S.life.child.pet;
  if (petStage(p.exp).key === 'egg' && a.key !== 'sun') { toast('还没破壳呢，先喂食帮它长大吧 🥚'); return; }
  if (a.limit && petActCnt(a.key) >= a.limit) { toast('今天的「' + a.name + '」已经玩过 ' + a.limit + ' 次啦，明天再来～'); return; }
  if (a.cost > 0 && !spendStar(a.cost)) return;
  p.mood = Math.min(100, Math.max(0, (p.mood || 0) + (a.mood || 0)));
  if (a.hunger) p.hunger = Math.min(100, Math.max(0, (p.hunger || 0) + a.hunger));
  p.lastCare = todayStr();
  p.actCnt[a.key] = petActCnt(a.key) + 1;
  petGainExp(a.exp || 0);
  const line = a.lines[Math.floor(Math.random() * a.lines.length)];
  const st = petStage(p.exp);
  if (a.key === 'photo') {                                        // 拍合照：存进相册（含阶段图片）
    if (!Array.isArray(p.album)) p.album = [];
    p.album.unshift({ id: uid(), date: todayStr(), stage: st.name, stageKey: st.key, text: line });
    if (p.album.length > 30) p.album.length = 30;
  }
  save(); renderChild();
  animatePet(a.anim);
  playPetProp(a.key);
  showPetBubble(a.icon + ' <span style="font-size:12px;color:var(--text-dim);">' + esc(a.name) + '</span>');
  const el = $('petTalk'); if (el) el.textContent = line;          // 宠物说专属反应文案
  const eff = [];
  if (a.mood) eff.push('心情+' + a.mood);
  if (a.hunger) eff.push('饱食' + (a.hunger > 0 ? '+' : '') + a.hunger);
  if (a.exp) eff.push('成长+' + a.exp);
  toast(a.icon + ' ' + a.name + '：' + eff.join('、'));
}
function renderPetActs() {
  const box = $('petActs'); if (!box) return;
  box.innerHTML = '';
  PET_ACTS.forEach(a => {
    const left = petActLeft(a);
    const used = left === 0;
    const el = document.createElement('div');
    el.className = 'pet-act' + (used ? ' used' : '') + (a.cost === 0 ? ' free' : '');
    const costTxt = a.cost === 0 ? '免费' : ('⭐×' + a.cost);
    const limitTxt = a.limit ? ('　今日 ' + petActCnt(a.key) + '/' + a.limit) : '';
    el.innerHTML = `<span class="pa-ico">${a.icon}</span><span class="pa-name">${a.name}</span><span class="pa-cost">${costTxt}${limitTxt}</span>`;
    el.title = a.name + '：心情+' + a.mood + (a.hunger ? '、饱食' + (a.hunger > 0 ? '+' : '') + a.hunger : '') + '、成长+' + a.exp + (a.limit ? '（每天限 ' + a.limit + ' 次）' : '');
    el.onclick = () => doPetAct(a.key);
    box.append(el);
  });
}
function renderPetAlbum() {
  const list = $('petAlbumList'), cnt = $('petAlbumCount'); if (!list) return;
  const al = S.life.child.pet.album || [];
  if (cnt) cnt.textContent = al.length;
  if (!al.length) { list.innerHTML = '<div class="empty">还没有合照，点「📷 拍合照」记录下此刻吧</div>'; return; }
  list.innerHTML = '';
  al.forEach(ph => {
    const stage = PET_STAGES.find(s => s.key === ph.stageKey) || PET_STAGES[0];
    const img = (typeof APP_ICONS !== 'undefined') && APP_ICONS['pet_' + stage.key];
    const pic = img ? `<img src="${img}" alt="${stage.name}">` : `<span class="emoji">${stage.emoji}</span>`;
    const item = document.createElement('div'); item.className = 'pet-photo';
    item.innerHTML = `<div class="photo-stage">${pic}</div><div class="photo-cap">${esc(ph.text)}</div><div class="photo-meta">${esc(ph.date)} · ${esc(ph.stage)}</div>`;
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
    x.onclick = () => { S.life.child.pet.album = al.filter(y => y.id !== ph.id); save(); renderPetAlbum(); };
    item.append(x); list.append(item);
  });
}
function petGainExp(n) {
  const p = S.life.child.pet;
  const before = petStage(p.exp).key;
  p.exp = (p.exp || 0) + n;
  const after = petStage(p.exp);
  if (after.key !== before) toast('🎉 升级啦！' + (S.life.child.pet.name || '宠物') + ' 进化成「' + after.name + '」！');
}
function renderChild() {
  const c = S.life.child; const p = c.pet;
  applyPetDecay();
  $('childStars').textContent = c.stars || 0;
  /* 宠物区：3D 可动小猫（程序化几何体，离线可用、不会空白）；卡通 PNG 作为降级兜底 */
  const st = petStage(p.exp), next = petNextStage(p.exp);
  const pv = $('petVisual');
  if (!pv.querySelector('.pet-body')) {
    pv.innerHTML = '<div class="pet-body">' + petVisualHtml(st) + '</div>'
      + '<div class="pet-3d" id="pet3d"></div>'
      + '<div class="pet-prop" id="petProp"></div><div class="pet-bubble" id="petBubble"></div>';
    pv.onclick = petTap;
  } else {
    pv.querySelector('.pet-body').innerHTML = petVisualHtml(st);
  }
  if (st.key === 'egg') { PetCat3D.hide(); }
  else { PetCat3D.mount($('pet3d'), st.key); }
  $('petName').textContent = p.name || '小猫咪';
  $('petLv').textContent = 'Lv.' + (PET_STAGES.indexOf(st) + 1) + ' · ' + st.name;
  $('petTalk').textContent = petTalkLine();
  const expBase = st.need, expTop = next ? next.need : st.need;
  const expPct = next ? Math.round((p.exp - expBase) / (expTop - expBase) * 100) : 100;
  $('petExpBar').style.width = expPct + '%';
  $('petExpVal').textContent = next ? (p.exp + '/' + next.need) : '满级';
  $('petHungerBar').style.width = (p.hunger || 0) + '%';
  $('petHungerVal').textContent = (p.hunger || 0) + '/100';
  $('petMoodBar').style.width = (p.mood || 0) + '%';
  $('petMoodVal').textContent = (p.mood || 0) + '/100';
  renderPetActs();
  renderPetAlbum();
  renderChildStats();
  /* 3D 小猫动作按钮（免费，纯动画） */
  const ab = $('petAnimBar');
  if (ab && !ab._built) {
    const acts = [{ k: 'play', i: '🪶', n: '逗猫棒' }, { k: 'sit', i: '🐾', n: '坐下' }, { k: 'stand', i: '🧍', n: '站立' }, { k: 'walk', i: '🚶', n: '走路' }, { k: 'idle', i: '😺', n: '待机' }];
    ab.innerHTML = acts.map(a => '<button class="pet-anim-btn" data-k="' + a.k + '">' + a.i + ' ' + a.n + '</button>').join('');
    ab.querySelectorAll('.pet-anim-btn').forEach(b => {
      b.onclick = () => {
        if (petStage(S.life.child.pet.exp).key === 'egg') { toast('还没破壳呢，先喂食帮它长大吧 🥚'); return; }
        PetCat3D.play(b.dataset.k);
        if (b.dataset.k === 'play') playPetProp('poke');
      };
    });
    ab._built = true;
  }
  renderArchive();
  { const c = S.life.child, today = todayStr(); const a = (c.archive || []).find(x => x.date === today); const h = $('childArchiveHint'); if (h) h.textContent = a ? '今日已归档 ✓' : ''; const cnt = $('childArchiveCount'); if (cnt) cnt.textContent = (c.archive || []).length; }
  /* 徽章区 */
  const streak = childStreak();
  $('childStreak').textContent = streak;
  PET_BADGES.forEach(b => { if (streak >= b.days && !c.badges[b.key]) { c.badges[b.key] = todayStr(); toast('🏅 解锁徽章「' + b.name + '」！'); save(); } });
  $('childBadges').innerHTML = PET_BADGES.map(b => {
    const un = !!c.badges[b.key];
    return `<div class="pet-badge ${un ? 'unlocked' : 'locked'}" title="${un ? '已解锁 ' + c.badges[b.key] : '连续 ' + b.days + ' 天完成任务解锁'}">${b.icon}<span class="bd-name">${b.name}</span></div>`;
  }).join('');
  /* 任务区 */
  const today = todayStr();
  $('childTaskDate').textContent = today;
  const doneCnt = c.tasks.filter(t => t.doneDates[today]).length;
  $('childTaskProg').textContent = c.tasks.length
    ? ('今日完成 ' + doneCnt + ' / ' + c.tasks.length + ' 项' + (doneCnt === c.tasks.length && c.tasks.length ? '，全部完成，太棒啦！🎉' : '，加油！'))
    : '添加几个每日任务吧（如：阅读30分钟）';
  const list = $('childTaskList'); list.innerHTML = '';
  if (!c.tasks.length) { list.innerHTML = '<div class="empty">还没有任务，先添加一个吧</div>'; return; }
  c.tasks.forEach(t => {
    const done = !!t.doneDates[today];
    const item = document.createElement('div'); item.className = 'item' + (done ? ' done' : '');
    const ck = document.createElement('div'); ck.className = 'check' + (done ? ' on' : ''); ck.textContent = done ? '✓' : '';
    ck.onclick = () => {
      if (t.doneDates[today]) {                                  // 取消完成：收回星星
        delete t.doneDates[today];
        c.stars = Math.max(0, (c.stars || 0) - (t.stars || 1));
        if (!c.tasks.some(x => x.doneDates[today])) delete c.days[today];
      } else {                                                   // 完成：得星星
        t.doneDates[today] = 1;
        c.stars = (c.stars || 0) + (t.stars || 1);
        c.days[today] = (c.days[today] || 0) + 1;
        toast('完成任务 +' + (t.stars || 1) + '⭐ 棒！');
      }
      save(); renderChild();
    };
    const b = document.createElement('div'); b.className = 'body';
    b.innerHTML = `<div class="txt"><span class="task-text" title="点击修改内容">${esc(t.text)}</span> <span class="task-stars" title="点击调整星星值">⭐×${t.stars || 1}</span></div>`;
    b.querySelector('.task-text').onclick = () => {
      const v = prompt('修改任务内容：', t.text);
      if (v && v.trim()) { t.text = v.trim().slice(0, 40); save(); renderChild(); }
    };
    b.querySelector('.task-stars').onclick = () => {
      const old = t.stars || 1, nv = ({ 1: 2, 2: 3, 3: 5, 5: 1 })[old] || 1;
      t.stars = nv;
      if (t.doneDates[todayStr()]) c.stars = (c.stars || 0) + (nv - old);   // 今日已完成则同步星星余额
      save(); renderChild();
    };
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
    x.onclick = () => { if (!confirm('删除任务「' + t.text + '」？')) return; c.tasks = c.tasks.filter(y => y.id !== t.id); save(); renderChild(); };
    item.append(ck, b, x); list.append(item);
  });
}
function renderChildStats() {
  const c = S.life.child;
  const el = $('childStats'); if (!el) return;
  el.innerHTML =
    '<div class="cstat"><div class="csv">' + (c.stars || 0) + '</div><div class="csl">当前⭐</div></div>'
    + '<div class="cstat"><div class="csv">' + childStreak() + '</div><div class="csl">连续打卡</div></div>'
    + '<div class="cstat"><div class="csv">' + Object.keys(c.days || {}).length + '</div><div class="csl">累计打卡天</div></div>'
    + '<div class="cstat"><div class="csv">' + (c.tasks || []).length + '</div><div class="csl">任务数</div></div>';
}
function archiveToday() {
  const c = S.life.child, today = todayStr();
  const done = c.tasks.filter(t => t.doneDates[today]).map(t => ({ text: t.text, stars: t.stars || 1 }));
  if (!done.length) { toast('今天还没有完成的任务，先去打卡吧 ✅'); return; }
  c.archive = c.archive || [];
  const exist = c.archive.find(a => a.date === today);
  if (exist) { exist.items = done; exist.at = Date.now(); toast('已更新今日归档（' + done.length + ' 项）📦'); }
  else { c.archive.unshift({ date: today, items: done, at: Date.now() }); toast('已归档今日 ' + done.length + ' 项任务 📦'); }
  save(); renderChild();
}
function renderArchive() {
  const c = S.life.child, box = $('childArchiveList'); if (!box) return;
  const ar = (c.archive || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!ar.length) { box.innerHTML = '<div class="empty">还没有归档记录。每天完成任务后点「归档今日」，留一份成长纪念 📦</div>'; return; }
  box.innerHTML = '';
  ar.forEach(a => {
    const items = a.items || [];
    const earn = items.reduce((s, x) => s + (x.stars || 1), 0);
    const item = document.createElement('div'); item.className = 'archive-day';
    const head = document.createElement('div'); head.className = 'ad-head';
    head.innerHTML = '<b>' + esc(a.date) + '</b><span class="ad-meta">完成 ' + items.length + ' 项 · 得 ⭐' + earn + '</span>';
    const del = document.createElement('span'); del.className = 'x'; del.textContent = '✕'; del.title = '删除这天的归档';
    del.onclick = () => { if (confirm('删除 ' + a.date + ' 的归档记录？')) { c.archive = c.archive.filter(x => x !== a); save(); renderChild(); } };
    head.append(del);
    const ul = document.createElement('div'); ul.className = 'ad-items';
    ul.innerHTML = items.map(x => '<div class="ad-t">✅ ' + esc(x.text) + (x.stars ? ' <span class="ad-s">⭐×' + x.stars + '</span>' : '') + '</div>').join('');
    item.append(head, ul); box.append(item);
  });
}
$('petFeed').onclick = () => {
  const p = S.life.child.pet;
  if (!spendStar(1)) return;
  p.hunger = Math.min(100, (p.hunger || 0) + 20);
  p.lastCare = todayStr();
  petGainExp(2);
  save(); renderChild();
  animatePet('chew');
  showPetBubble('🍚 <span style="font-size:12px;color:var(--text-dim);">好吃喵～</span>');
  toast('🍚 喂食成功，饱食+20、成长+2');
};
$('petVisual').onclick = () => { animatePet('bounce'); showPetBubble('喵～'); $('petTalk').textContent = petTalkLine(); };
$('petRename').onclick = () => {
  const v = prompt('给宠物起个名字：', S.life.child.pet.name || '小猫咪');
  if (v && v.trim()) { S.life.child.pet.name = v.trim().slice(0, 12); save(); renderChild(); }
};
$('childTaskAdd').onclick = () => {
  const v = $('childTaskName').value.trim();
  if (!v) { toast('请先输入任务内容 ✏️'); $('childTaskName').focus(); return; }
  S.life.child.tasks.push({ id: uid(), text: v, stars: +$('childTaskStars').value || 1, doneDates: {} });
  $('childTaskName').value = ''; save(); renderChild(); toast('已添加任务 ✓');
};
$('childTaskName').onkeydown = e => { if (e.key === 'Enter') $('childTaskAdd').onclick(); };
$('childMsgBtn').onclick = () => {
  let m; do { m = CHEERS[Math.floor(Math.random() * CHEERS.length)]; } while (m === $('childMsg').textContent && CHEERS.length > 1);
  $('childMsg').textContent = m;
};
$('childArchiveBtn').onclick = archiveToday;

/* ===================== 生活·英语学习 ===================== */
function renderEnglish() {
  const list = $('enList');
  if (!S.life.english.length) { list.innerHTML = '<div class="empty">收藏单词，开始积累</div>'; return; }
  list.innerHTML = '';
  [...S.life.english].reverse().forEach(w => {
    const item = document.createElement('div'); item.className = 'item' + (w.reviewed ? ' done' : '');
    const b = document.createElement('div'); b.className = 'body'; b.innerHTML = `<div class="txt"><b>${esc(w.word)}</b> — ${esc(w.mean)}</div>${w.note ? `<div class="meta">${esc(w.note)}</div>` : ''}`;
    const tools = document.createElement('div'); tools.style.cssText = 'display:flex;gap:6px;';
    const rev = document.createElement('button'); rev.className = 'btn sm ghost'; rev.textContent = w.reviewed ? '已复习' : '标复习';
    rev.onclick = () => { w.reviewed = !w.reviewed; save(); renderEnglish(); };
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.onclick = () => { S.life.english = S.life.english.filter(y => y.id !== w.id); save(); renderEnglish(); };
    tools.append(rev, x); item.append(b, tools); list.append(item);
  });
}
$('enAdd').onclick = () => {
  const word = $('enWord').value.trim(); const mean = $('enMean').value.trim(); if (!word || !mean) { toast('单词和释义都要填'); return; }
  S.life.english.push({ id: uid(), word, mean, note: $('enNote').value.trim(), reviewed: false }); $('enWord').value = ''; $('enMean').value = ''; $('enNote').value = ''; save(); renderEnglish();
};
$('enReview').onclick = () => {
  const pool = S.life.english.filter(w => !w.reviewed);
  const pick = (pool.length ? pool : S.life.english)[Math.floor(Math.random() * (pool.length ? pool.length : S.life.english.length))];
  if (!pick) { toast('先收藏一些单词'); return; }
  toast(`📖 ${pick.word} — ${pick.mean}`);
};

/* ===================== 生活·股市学习（真实行情） ===================== */
function stockPrefix(code) {
  const c = String(code).replace(/[^0-9]/g, '');
  if (/^(60|68|9)/.test(c)) return 'sh';
  if (/^(00|30|2)/.test(c)) return 'sz';
  if (/^(8|4|92)/.test(c)) return 'bj';
  return 'sh';
}
function parseGtimg(raw) {
  if (!raw) return null;
  const m = raw.match(/"([^"]*)"/);
  if (!m) return null;
  const a = m[1].split('~');
  const price = parseFloat(a[3]);
  const prev = parseFloat(a[4]);
  if (isNaN(price) || isNaN(prev)) return null;
  const chg = price - prev;
  const pct = prev ? (chg / prev * 100) : 0;
  return { price, prev, open: parseFloat(a[5]), chg, pct };
}
function gtimgKey(it) { return (it.prefix || stockPrefix(it.code)) + it.code; }
let _quotes = {};
function refreshQuotes() {
  const items = S.life.stocks.watch;
  if (!items.length) { const u = $('stockUpdate'); if (u) u.textContent = ''; return Promise.resolve(); }
  const q = items.map(gtimgKey).join(',');
  return new Promise((resolve) => {
    const s = document.createElement('script');
    let done = false;
    const fin = () => { if (done) return; done = true; try { s.remove(); } catch (e) {} resolve(); };
    s.onload = fin; s.onerror = fin;
    s.src = 'https://qt.gtimg.cn/q=' + q + '&_=' + Date.now();
    document.head.appendChild(s);
    setTimeout(fin, 6000);
  }).then(() => {
    items.forEach(it => { _quotes[gtimgKey(it)] = parseGtimg(window['v_' + gtimgKey(it)]); });
    const u = $('stockUpdate'); if (u) u.textContent = '行情更新于 ' + new Date().toLocaleTimeString('zh-CN');
  });
}
function renderStockPrices() {
  S.life.stocks.watch.forEach(s => {
    const el = $('q_' + s.id); if (!el) return;
    const q = _quotes[gtimgKey(s)];
    if (!q) { el.innerHTML = '<span class="qs">—</span>'; return; }
    const cls = q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : 'flat';
    const sign = q.chg > 0 ? '+' : '';
    el.innerHTML = '<span class="qp ' + cls + '">' + q.price.toFixed(2) + '</span>' +
                   '<span class="qc ' + cls + '">' + sign + q.chg.toFixed(2) + '  ' + sign + q.pct.toFixed(2) + '%</span>';
  });
}
function renderStocks() {
  const wl = $('stockWatchList');
  if (!S.life.stocks.watch.length) wl.innerHTML = '<div class="empty">添加自选观察标的</div>';
  else {
    wl.innerHTML = '';
    S.life.stocks.watch.forEach(s => {
      const item = document.createElement('div'); item.className = 'item';
      const b = document.createElement('div'); b.className = 'body';
      const a = document.createElement('a'); a.href = 'https://so.eastmoney.com/web/s?keyword=' + encodeURIComponent(s.code); a.target = '_blank'; a.rel = 'noopener';
      a.style.cssText = 'color:var(--text);text-decoration:none;';
      a.innerHTML = '<div class="txt"><b>' + esc(s.name) + '</b> <span style="color:var(--text-faint);font-size:12px;">' + esc(s.code) + '</span></div>';
      b.append(a);
      const q = document.createElement('div'); q.className = 'qblock'; q.id = 'q_' + s.id; q.innerHTML = '<span class="qs">加载中…</span>';
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
      x.onclick = () => { S.life.stocks.watch = S.life.stocks.watch.filter(y => y.id !== s.id); save(); renderStocks(); };
      item.append(b, q, x); wl.append(item);
    });
  }
  const nl = $('stockNoteList');
  if (!S.life.stocks.notes.length) nl.innerHTML = '<div class="empty">记一条学习笔记</div>';
  else {
    nl.innerHTML = '';
    [...S.life.stocks.notes].reverse().forEach(n => {
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = '<div class="body"><div class="txt">' + esc(n.text) + '</div><div class="meta">' + esc(n.date) + '</div></div>';
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
      x.onclick = () => { S.life.stocks.notes = S.life.stocks.notes.filter(y => y.id !== n.id); save(); renderStocks(); };
      item.append(x); nl.append(item);
    });
  }
  refreshQuotes().then(renderStockPrices);
}
$('stockAdd').onclick = () => {
  const code = $('stockCode').value.trim(); const name = $('stockName').value.trim(); if (!code) { toast('请输入代码'); return; }
  const prefix = stockPrefix(code);
  const cleanCode = code.replace(/^(sh|sz|bj)/i, '');
  S.life.stocks.watch.push({ id: uid(), code: cleanCode, prefix, name: name || cleanCode }); $('stockCode').value = ''; $('stockName').value = ''; save(); renderStocks();
};
$('stockRefresh').onclick = () => {
  const btn = $('stockRefresh'); btn.disabled = true;
  refreshQuotes().then(() => { renderStockPrices(); btn.disabled = false; });
};
$('stockNoteAdd').onclick = () => {
  const v = $('stockNote').value.trim(); if (!v) return;
  S.life.stocks.notes.push({ id: uid(), text: v, date: todayStr() }); $('stockNote').value = ''; save(); renderStocks();
};

/* ===================== 数据备份（整库 JSON 导出 / 导入，云端同步的兜底） ===================== */
$('backupExport').onclick = () => {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '工作台数据备份_' + todayStr() + '.json';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  toast('已导出全部数据 ✓');
};
$('backupImport').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (!confirm('导入备份将【覆盖】当前全部数据（账本 / 打卡 / 随想 / 英语 / 股市等）。\n建议先点「导出全部数据」留一份当前备份。确定继续？')) { e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      normalize(data);
      S = data;
      save();                 // 写入本地 + 推送云端（覆盖所有设备）
      renderAll();
      toast('已从备份恢复全部数据 ✓');
    } catch (err) { toast('导入失败：' + err.message); }
    e.target.value = '';
  };
  reader.readAsText(f);
};

/* ===================== 同步密钥管理（隐私：密钥只在本机，不进公开代码） ===================== */
function renderSyncKey() { const el = $('syncKeyText'); if (el) el.textContent = SYNC_ID; }
$('syncKeyCopy').onclick = () => {
  const t = SYNC_ID;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast('已复制同步密钥 ✓'), () => toast('复制失败，请手动选择'));
  else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('已复制同步密钥 ✓'); } catch (e) { toast('复制失败，请手动选择'); } ta.remove(); }
};
$('syncKeyNew').onclick = () => {
  if (!confirm('生成新密钥会创建一个全新的私有数据保险箱，并把当前全部数据复制到新箱。\n旧密钥将不再使用（建议在其它设备也改用新密钥）。继续？')) return;
  const nid = genUuid();
  SYNC_ID = nid; localStorage.setItem(KEY_SYNC, nid); SYNC_URL = 'https://jsonblob.com/api/jsonBlob/' + nid;
  save();                 // 把当前数据推到新箱
  renderSyncKey();
  toast('已生成私有新密钥，数据已迁入 🔒');
};
$('syncKeyApply').onclick = () => {
  const v = $('syncKeyInput').value.trim();
  if (!v) return;
  if (!confirm('应用此密钥会尝试从该密钥对应的云端数据拉取（用于把本机连到另一台设备的数据）。\n若本机已有数据且较新，可能被覆盖。建议先「导出全部数据」备份。继续？')) { $('syncKeyInput').value = ''; return; }
  SYNC_ID = v; localStorage.setItem(KEY_SYNC, v); SYNC_URL = 'https://jsonblob.com/api/jsonBlob/' + v;
  setPill('syncing');
  fetch(SYNC_URL).then(r => {
    if (r.status === 404) { setPill('ok'); renderSyncKey(); $('syncKeyInput').value = ''; toast('已连接（云端暂无数据）'); return; }
    if (!r.ok) { setPill('offline'); return; }
    return r.json().then(data => {
      if (data && Object.keys(data).length) { Object.assign(S, data); normalize(S); localStorage.setItem(KEY, JSON.stringify(S)); renderAll(); }
      setPill('ok'); renderSyncKey(); $('syncKeyInput').value = ''; toast('已连接并同步 ✓');
    });
  }).catch(() => setPill('offline'));
};

/* ===================== 专属云端（GitHub 私有仓库）配置 ===================== */
function renderGhStatus() {
  const st = $('ghStatus'); if (!st) return;
  const c = ghCfg();
  if (c) {
    st.innerHTML = '当前：✅ 已启用专属云端 <b>' + esc(c.owner + '/' + c.repo) + '</b>，数据保存在你自己的私有仓库。';
    if ($('ghUser')) $('ghUser').value = c.owner;
    if ($('ghRepo')) $('ghRepo').value = c.repo;
    if ($('ghOff')) $('ghOff').style.display = '';
  } else {
    st.textContent = '当前：未配置，仍使用公共云同步。';
    if ($('ghOff')) $('ghOff').style.display = 'none';
  }
}
if ($('ghSave')) $('ghSave').onclick = async () => {
  const owner = $('ghUser').value.trim(), repo = $('ghRepo').value.trim(), token = $('ghToken').value.trim();
  if (!owner || !repo || !token) { toast('请把三项都填好再保存'); return; }
  const c = { owner, repo, token };
  $('ghSave').disabled = true; toast('正在验证仓库…');
  try {
    const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo, { headers: ghHeaders(c) });
    if (!r.ok) {
      toast(r.status === 404 ? '找不到仓库：请检查用户名、仓库名，或令牌没勾选这个仓库' : '令牌验证失败（' + r.status + '），请重新生成令牌');
      $('ghSave').disabled = false; return;
    }
    let remote = null;
    try { remote = await ghGetData(c); } catch (e) {}
    localStorage.setItem(KEY_GH, JSON.stringify(c));
    // 远端为「空壳」或不存在时，优先用本地真实数据上传，避免空白覆盖真数据
    const remoteShell = ghIsShell(remote);
    if (remote && !remoteShell && remote._ts && remote._ts > (S._ts || 0)) {
      Object.assign(S, remote); normalize(S); localStorage.setItem(KEY, JSON.stringify(S)); renderAll();
      toast('已连接专属云端，并取回了云端较新的数据 ✓');
    } else {
      S._ts = Date.now();
      await ghPutData(c, S);
      toast('专属云端已启用，数据已迁入你的私有仓库 🔒');
    }
    $('ghToken').value = '';
    setPill('ok'); renderGhStatus();
  } catch (e) { toast('连接失败，请检查网络后重试'); }
  $('ghSave').disabled = false;
};
if ($('ghOff')) $('ghOff').onclick = () => {
  if (!confirm('断开后将回到公共云同步（你私有仓库里的数据不会被删除，随时可重新连接）。继续？')) return;
  localStorage.removeItem(KEY_GH); _ghSha = null;
  renderGhStatus(); pushToCloud(true); toast('已断开专属云端');
};

/* ===================== 启动 ===================== */
function ensureSeeds() {
  if (!S.life.ledgers.length) { S.life.ledgers.push({ id: uid(), name: '我的账本', icon: '💰', txns: [] }); S.life.activeLedger = S.life.ledgers[0].id; }
  if (!S.life.ledgerTags.length) {
    [['餐饮', '🍜'], ['交通', '🚌'], ['购物', '🛒'], ['工资', '💴'], ['居住', '🏠'], ['娱乐', '🎮']].forEach(([n, i]) => S.life.ledgerTags.push({ id: uid(), name: n, icon: i, color: '' }));
  }
  if (!S.life.payMethods.length) {
    [['支付宝', '🟦'], ['微信', '💚'], ['银行卡', '🏦'], ['花呗', '🟧'], ['信用卡', '💳'], ['现金', '💵']].forEach(([n, i]) => S.life.payMethods.push({ id: uid(), name: n, icon: i }));
  }
}
function renderAll() {
  renderHome(); renderWork(); renderLedger(); renderLedgerHome(); renderCheckinHome(); renderNotes();
  renderChild(); renderEnglish(); renderStocks();
}
function applyNavIcons() {   // 左侧导航 emoji → IP 小人图标（icons.js 未加载则保留 emoji）
  const map = { home: 'main', work: 'work', ledger: 'ledger', checkin: 'checkin', notes: 'notes', child: 'child', english: 'english', stocks: 'stocks' };
  document.querySelectorAll('.nav-item[data-panel]').forEach(el => {
    const key = map[el.dataset.panel]; if (!key) return;
    const src = icon(key); if (!src) return;
    const ico = el.querySelector('.nav-ico'); if (!ico) return;
    ico.innerHTML = '<img src="' + src + '" alt="" class="nav-ico-img">';
  });
  // 分组标题（生活/自身）：data-group 与 APP_ICONS 键同名
  document.querySelectorAll('.nav-group-parent[data-group]').forEach(el => {
    const src = icon(el.dataset.group); if (!src) return;
    const ico = el.querySelector('.nav-ico'); if (!ico) return;
    ico.innerHTML = '<img src="' + src + '" alt="" class="nav-ico-img">';
  });
}
/* ===== 主题：晨光宣纸(light，默认) / 暮色沉香(dusk)，本地记忆 ===== */
function applyTheme(t) {
  document.body.classList.toggle('theme-dusk', t === 'dusk');
  const tb = $('themeToggle'); if (tb) tb.textContent = (t === 'dusk') ? '☀️' : '🌙';
}
let curTheme = localStorage.getItem('xj_theme') || 'light';
applyTheme(curTheme);
if ($('themeToggle')) $('themeToggle').onclick = () => {
  curTheme = (curTheme === 'dusk') ? 'light' : 'dusk';
  localStorage.setItem('xj_theme', curTheme);
  applyTheme(curTheme);
};

ensureSeeds();
applyNavIcons();
$('txnDate').value = todayStr();
renderAll();                 // 先用本地数据渲染
renderSyncKey();
renderGhStatus();
pushToCloud(true);           // 把种子数据同步上去
pullFromCloud().then(renderAll);  // 再从云端拉取最新，覆盖渲染
checkReminders(); setInterval(checkReminders, 60000);  // 打卡提醒：每分钟检查一次
if ($('curVerText')) $('curVerText').textContent = 'v' + APP_VERSION;
checkAppUpdate();            // 自检云端新版本（无需部署）

/* ===================== 自检更新（云端版本号，免部署 / 免账号） ===================== */
function checkAppUpdate() {
  const bar = $('appUpdateBar'); if (!bar) return;
  fetch(APP_BLOB_URL + '?_=' + Date.now())
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (!d || !d.version) return;
      if (d.version !== APP_VERSION) {
        bar.style.display = 'flex';
        $('appUpdateVer').textContent = d.version + (d.updatedAt ? '（' + String(d.updatedAt).slice(0, 10) + '）' : '');
      }
    })
    .catch(() => { /* 离线或网络失败则静默 */ });
}
$('appUpdateBtn').onclick = () => {
  const bar = $('appUpdateBar'); if (bar) bar.style.display = 'none';
  // 下载最新单文件版到本地，覆盖旧文件后重新打开即可（不再每次弹提示）
  toast('正在下载最新版…');
  const a = document.createElement('a');
  a.href = APP_HOME_URL + 'workstation_single.html?v=' + Date.now();
  a.download = '个人工作台_单文件版.html';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); toast('下载完成，请用新文件覆盖旧版后重新打开'); }, 1200);
};
