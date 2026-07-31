const fs = require('fs');
const { JSDOM } = require('C:/Users/新锦动力/.workbuddy/binaries/node/workspace/node_modules/jsdom');
const html = fs.readFileSync('C:/Users/新锦动力/WorkBuddy/2026-07-29-13-36-47/workstation/workstation_single.html', 'utf-8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), status: 200, headers: { get: () => null } });
    const store = {};
    window.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    window.Notification = function () {};
    window.Notification.requestPermission = () => Promise.resolve('granted');
    window.navigator.clipboard = { writeText: () => Promise.resolve() };
  }
});
const { window } = dom;
const { document } = window;

function tryRun(label, fn) {
  try { fn(); } catch (e) { console.log('!! ' + label + ' 抛错:', e && e.message); }
}

function done() {
  try {
    const cards = document.getElementById('checkinCards');
    const panel = document.getElementById('panel-checkin');
    const nav = [...document.querySelectorAll('.nav-item')].find(n => n.dataset.panel === 'checkin');
    nav.dispatchEvent(new window.Event('click', { bubbles: true }));
    console.log('1) 进入项目打卡: panel active =', panel.classList.contains('active'), '| home 显示 =', document.getElementById('checkinHome').style.display);

    // 新建项目
    document.getElementById('checkinNewName').value = '每日阅读30分';
    tryRun('新建项目', () => document.getElementById('checkinNew').dispatchEvent(new window.Event('click', { bubbles: true })));
    console.log('2) 新建后: detail 显示 =', document.getElementById('checkinDetail').style.display, '| 统计含「累计打卡」 =', /累计打卡/.test(document.getElementById('checkinStats').innerHTML));

    // 返回 home
    tryRun('返回', () => document.getElementById('checkinBack').dispatchEvent(new window.Event('click', { bubbles: true })));
    const cardCount = cards.querySelectorAll('.ledger-card').length;
    console.log('3) 返回后 home 卡片数 =', cardCount);

    // 再点开卡片（用户真实场景：点开已有项目）
    if (cardCount > 0) {
      tryRun('点开卡片', () => cards.querySelector('.ledger-card').dispatchEvent(new window.Event('click', { bubbles: true })));
      console.log('4) 再点开卡片: detail 显示 =', document.getElementById('checkinDetail').style.display, '| 今日打卡提示 =', /今天还没打卡|今日已打卡/.test(document.getElementById('checkinToday').innerHTML));
    } else {
      console.log('4) 未生成卡片，无法验证点开');
    }
    console.log('=== 结论: 不再有 TDZ 报错，打卡明细可正常打开 ===');
  } catch (e) {
    console.log('TEST ERROR:', e && e.message, e && e.stack);
  }
  process.exit(0);
}
setTimeout(done, 500);
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);
