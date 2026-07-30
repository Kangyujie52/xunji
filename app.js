/* ===================== 个人工作台 · 逻辑层（云端同步版 · 多账本） ===================== */
const KEY = 'workstation_v1';

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
    child: { points: 0, goals: [] },
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
  L.child = Object.assign({ points: 0, goals: [] }, L.child || {}); L.child.goals = L.child.goals || [];
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

/* ===================== 跨设备云同步（jsonblob，免密钥） ===================== */
const SYNC_ID = '019fac86-0a04-76f1-a9a4-63b7ef88f878';
let SYNC_URL = 'https://jsonblob.com/api/jsonBlob/' + SYNC_ID;
let _syncTimer = null;
function setPill(state) {
  const p = $('syncPill'); if (!p) return;
  if (state === 'syncing') { p.textContent = '☁️ 同步中…'; p.className = 'sync-pill syncing'; }
  else if (state === 'ok') { p.textContent = '☁️ 已同步'; p.className = 'sync-pill ok'; }
  else { p.textContent = '⚠️ 离线·本地'; p.className = 'sync-pill offline'; }
}
function pushToCloud(immediate) {
  setPill('syncing');
  clearTimeout(_syncTimer);
  const doPush = () => {
    S._ts = Date.now();
    fetch(SYNC_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) })
      .then(r => {
        if (r.status === 404) {
          return fetch('https://jsonblob.com/api/jsonBlob', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) })
            .then(rr => { const loc = rr.headers.get('Location'); if (loc) { SYNC_URL = 'https://jsonblob.com' + loc; } return 'recreated'; });
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

function curLedger() { const L = S.life; return L.ledgers.find(l => l.id === L.activeLedger) || L.ledgers[0] || null; }
function tagById(id) { return S.life.ledgerTags.find(t => t.id === id); }
function ledgerBalance(l) { let inc = 0, exp = 0; l.txns.forEach(t => { if (t.type === 'inc') inc += t.amount; else exp += t.amount; }); return inc - exp; }

/* 视图1：账本图标列表 */
function renderLedgerHome() {
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
function renderLedgerList() {
  const c = curLedger(); const list = $('ledgerList');
  if (!c || !c.txns.length) { list.innerHTML = '<div class="empty">还没有账目，记一笔吧</div>'; return; }
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
$('ledgerExport').onclick = () => {
  const c = curLedger(); if (!c) return;
  const rows = [...c.txns].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)).map(t => {
    const tg = tagById(t.tagId); const pg = payById(t.payId);
    return { 日期: t.date, 类型: t.type === 'inc' ? '收入' : '支出', 金额: t.amount, 标签: tg ? tg.name : '未分类', 支付方式: pg ? pg.name : '未填', 备注: t.note || '' };
  });
  const sumRows = ledgerTagSummaryRows(c);
  if (window.XLSX) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 日期: '', 类型: '', 金额: '', 标签: '', 支付方式: '', 备注: '' }]), '账目');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sumRows.length ? sumRows : [{ 标签: '', 支出: 0, 收入: 0, 净额: 0 }]), '标签汇总');
    XLSX.writeFile(wb, `${c.name}_账本.xlsx`);
    toast('已导出 Excel');
  } else {
    const csv = '﻿日期,类型,金额,标签,支付方式,备注\n' + rows.map(r => `${r.日期},${r.类型},${r.金额},${r.标签},${r.支付方式 || ''},${r.备注 || ''}`).join('\n');
    downloadFile(csv, `${c.name}_账本.csv`, 'text/csv');
    toast('已导出 CSV（可用 Excel 打开）');
  }
};
let pendingImport = null;
$('ledgerImport').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const c = curLedger(); if (!c) { e.target.value = ''; return; }
  const isXlsx = /\.xlsx$/i.test(f.name);
  if (isXlsx && !window.XLSX) { toast('导入 xlsx 需联网加载组件，或用 .csv 文件'); e.target.value = ''; return; }
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
      const card = document.createElement('div'); card.className = 'ledger-card';
      card.innerHTML = `<div class="lc-icon">${c.icon || '✅'}</div><div class="lc-name">${esc(c.name)}</div><div class="lc-bal">🔥 连续 ${streakOf(Object.keys(c.records))} 天 · 共 ${total} 天</div>`;
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
  return { total, month, streak: streakOf(keys), avg, startedAt: c.startedAt };
}
function renderCheckinDetail() {
  const c = curCheckin(); if (!c) { closeCheckin(); return; }
  $('checkinDetailTitle').textContent = (c.icon || '✅') + ' ' + c.name;
  const st = checkinStats(c);
  $('checkinStats').innerHTML =
    `<div class="stat"><div class="sv">${st.total}</div><div class="sl">累计打卡(天)</div></div>` +
    `<div class="stat"><div class="sv">${st.month}</div><div class="sl">本月打卡(天)</div></div>` +
    `<div class="stat"><div class="sv">${st.streak}</div><div class="sl">连续打卡(天)</div></div>` +
    `<div class="stat"><div class="sv">${st.avg}</div><div class="sl">日均时长(分)</div></div>` +
    `<div class="stat"><div class="sv" style="font-size:14px;">${st.startedAt}</div><div class="sl">开始日期</div></div>`;
  const today = todayStr(); const t = c.records[today];
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
    wrap.innerHTML = `<div class="bar" style="height:${h}%;" title="${d} · ${vals[i]}分"></div><div class="bar-lbl">${d.slice(5)}</div>`;
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
  const v = $('checkinNewName').value.trim(); if (!v) return;
  const c = { id: uid(), name: v, icon: '✅', startedAt: todayStr(), records: {}, remind: { on: false, time: '20:00' } };
  S.life.checkins.push(c); $('checkinNewName').value = ''; save(); openCheckin(c.id);
};
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
function renderNotes() {
  const list = $('noteList');
  if (!S.life.notes.length) { list.innerHTML = '<div class="empty">还没有随想</div>'; return; }
  list.innerHTML = '';
  [...S.life.notes].reverse().forEach(n => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="body"><div class="txt">${esc(n.text)}</div><div class="meta">${esc(n.date)}</div></div>`;
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.onclick = () => { S.life.notes = S.life.notes.filter(y => y.id !== n.id); save(); renderNotes(); };
    item.append(x); list.append(item);
  });
}
$('noteAdd').onclick = () => {
  const v = $('noteInput').value.trim(); if (!v) return;
  S.life.notes.push({ id: uid(), text: v, date: todayStr() }); $('noteInput').value = ''; save(); renderNotes();
};

/* ===================== 生活·孩子学习激励 ===================== */
const CHEERS = [
  '你今天又进步了一点点，超棒的！🌟', '努力的样子，就是最好的你 ✨', '不怕慢，就怕站，你一直在往前走 💪',
  '错了也没关系，那是大脑在长大 🧠', '爸爸妈妈为你骄傲，真的！❤️', '再试一次，你比昨天更强 🚀',
  '专注当下的你，闪闪发光 🌈', '今天的坚持，是明天惊喜的种子 🌱', '你认真的时候，全世界都在帮你 👏',
  '爱学习的你，未来有无限可能 🔭'
];
function renderChild() {
  $('childPoints').textContent = S.life.child.points;
  const list = $('childGoalList');
  if (!S.life.child.goals.length) { list.innerHTML = '<div class="empty">添加孩子的小目标</div>'; return; }
  list.innerHTML = '';
  S.life.child.goals.forEach(g => {
    const item = document.createElement('div'); item.className = 'item' + (g.done ? ' done' : '');
    const ck = document.createElement('div'); ck.className = 'check' + (g.done ? ' on' : ''); ck.textContent = g.done ? '✓' : '';
    ck.onclick = () => { g.done = !g.done; save(); renderChild(); };
    const b = document.createElement('div'); b.className = 'body'; b.innerHTML = `<div class="txt">${esc(g.text)}</div>`;
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.onclick = () => { S.life.child.goals = S.life.child.goals.filter(y => y.id !== g.id); save(); renderChild(); };
    item.append(ck, b, x); list.append(item);
  });
}
$('childPointAdd').onclick = () => { S.life.child.points++; save(); renderChild(); toast('奖励 +1 分 🌟'); };
$('childMsgBtn').onclick = () => {
  let m; do { m = CHEERS[Math.floor(Math.random() * CHEERS.length)]; } while (m === $('childMsg').textContent && CHEERS.length > 1);
  $('childMsg').textContent = m;
};
$('childGoalAdd').onclick = () => {
  const v = $('childGoal').value.trim(); if (!v) return;
  S.life.child.goals.push({ id: uid(), text: v, done: false }); $('childGoal').value = ''; save(); renderChild();
};

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

/* ===================== 生活·股市学习 ===================== */
function renderStocks() {
  const wl = $('stockWatchList');
  if (!S.life.stocks.watch.length) wl.innerHTML = '<div class="empty">添加自选观察标的</div>';
  else {
    wl.innerHTML = '';
    S.life.stocks.watch.forEach(s => {
      const item = document.createElement('div'); item.className = 'item';
      const b = document.createElement('div'); b.className = 'body';
      const a = document.createElement('a'); a.href = `https://so.eastmoney.com/web/s?keyword=${encodeURIComponent(s.code)}`; a.target = '_blank'; a.rel = 'noopener';
      a.style.cssText = 'color:var(--text);text-decoration:none;'; a.innerHTML = `<div class="txt"><b>${esc(s.name)}</b> <span style="color:var(--text-faint);font-size:12px;">${esc(s.code)}</span></div>`;
      b.append(a);
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.onclick = () => { S.life.stocks.watch = S.life.stocks.watch.filter(y => y.id !== s.id); save(); renderStocks(); };
      item.append(b, x); wl.append(item);
    });
  }
  const nl = $('stockNoteList');
  if (!S.life.stocks.notes.length) nl.innerHTML = '<div class="empty">记一条学习笔记</div>';
  else {
    nl.innerHTML = '';
    [...S.life.stocks.notes].reverse().forEach(n => {
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div class="body"><div class="txt">${esc(n.text)}</div><div class="meta">${esc(n.date)}</div></div>`;
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.onclick = () => { S.life.stocks.notes = S.life.stocks.notes.filter(y => y.id !== n.id); save(); renderStocks(); };
      item.append(x); nl.append(item);
    });
  }
}
$('stockAdd').onclick = () => {
  const code = $('stockCode').value.trim(); const name = $('stockName').value.trim(); if (!code) { toast('请输入代码'); return; }
  S.life.stocks.watch.push({ id: uid(), code, name: name || code }); $('stockCode').value = ''; $('stockName').value = ''; save(); renderStocks();
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
  renderWork(); renderLedger(); renderLedgerHome(); renderCheckinHome(); renderNotes();
  renderChild(); renderEnglish(); renderStocks();
}
ensureSeeds();
$('txnDate').value = todayStr();
renderAll();                 // 先用本地数据渲染
pushToCloud(true);           // 把种子数据同步上去
pullFromCloud().then(renderAll);  // 再从云端拉取最新，覆盖渲染
checkReminders(); setInterval(checkReminders, 60000);  // 打卡提醒：每分钟检查一次
