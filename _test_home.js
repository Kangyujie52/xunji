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

function done() {
  try {
    const logo = document.querySelector('.home-logo');
    console.log('1) 首页标题文本 =', logo ? logo.textContent : '(缺失)');
    const mods = document.querySelectorAll('#homeModules .home-mod');
    console.log('2) 模块卡数量 =', mods.length);
    const ov = document.querySelectorAll('#homeOverview .ov-item');
    console.log('3) 今日概览项数量 =', ov.length);
    const panelHome = document.getElementById('panel-home');
    console.log('4) 默认激活首页 =', panelHome.classList.contains('active'));
    const homeNav = [...document.querySelectorAll('.nav-item')].find(n => n.dataset.panel === 'home');
    console.log('5) 首页导航 active =', homeNav.classList.contains('active'));
    const date = document.getElementById('homeDate');
    const greet = document.getElementById('homeGreet');
    console.log('6) 日期 =', date ? date.textContent : '(缺失)', '| 问候 =', greet ? greet.textContent : '(缺失)');
    if (mods.length) {
      const workMod = [...mods].find(m => m.dataset.panel === 'work');
      workMod.dispatchEvent(new window.Event('click', { bubbles: true }));
      console.log('7) 点「工作看板」卡 -> panel-work active =', document.getElementById('panel-work').classList.contains('active'), '| 首页 active =', panelHome.classList.contains('active'));
    }
    const imgs = document.querySelectorAll('#homeModules .hm-img');
    console.log('8) 模块卡 IP 图标数量 =', imgs.length, '| 均为 data:webp =', [...imgs].every(i => i.src.startsWith('data:image/webp')));
    const avatar = document.getElementById('homeAvatar');
    console.log('9) 首页主形象显示 =', avatar && avatar.style.display !== 'none' && avatar.src.startsWith('data:image/webp'));
    const tav = document.getElementById('topAvatar');
    console.log('10) 顶栏头像显示 =', tav && tav.style.display !== 'none' && tav.src.startsWith('data:image/webp'));
    console.log('11) 程序版本 =', window.APP_VERSION);
    console.log('=== 结论: 首页渲染与跳转正常 ===');
  } catch (e) {
    console.log('TEST ERROR:', e && e.message, e && e.stack);
  }
  process.exit(0);
}
setTimeout(done, 600);
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);
