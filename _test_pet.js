/* 孩子激励·养宠物玩法 端到端测试（jsdom） */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('个人工作台_单文件版.html', 'utf8');
const errs = [];

function today(offset) {
  const d = new Date(); d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://localhost/', pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, k) => k === 'canvas' ? this : () => {}, set: () => true }); };
    w.alert = () => {}; w.confirm = () => true; w.prompt = () => '喵喵';
    w.addEventListener('error', e => errs.push(e.message));
    // 预置旧版数据：points=5、goals 两条（一条已完成）、streak 前2天有记录、宠物3天没照顾
    w.localStorage.setItem('workstation_v1', JSON.stringify({
      profile: {}, work: { projects: [] },
      life: {
        ledgers: [], ledgerTags: [], payMethods: [], checkins: [], notes: [],
        child: {
          points: 5,
          goals: [{ id: 'g1', text: '连续背诗7天', done: false }, { id: 'g2', text: '练字', done: true }],
          days: { [today(-1)]: 2, [today(-2)]: 1 },
          pet: { name: '小猫咪', exp: 8, hunger: 80, mood: 80, lastCare: today(-3) }
        },
        english: [], stocks: { watch: [], notes: [] }
      }
    }));
  }
});

setTimeout(() => {
  const d = dom.window.document;
  let pass = 0, fail = 0;
  const ck = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (cond ? '' : ('  [' + (extra || '') + ']'))); };

  ck('页面无报错', errs.length === 0, errs.join('|'));

  // 进入孩子激励面板
  const nav = [...d.querySelectorAll('.nav-item')].find(n => n.dataset.panel === 'child');
  if (nav) nav.click();

  // 1) 旧数据迁移
  ck('旧积分5迁移为星星', d.getElementById('childStars').textContent === '5', d.getElementById('childStars').textContent);
  const taskTexts = [...d.querySelectorAll('#childTaskList .item .txt')].map(x => x.textContent);
  ck('旧目标迁移为任务', taskTexts.some(t => t.includes('连续背诗7天')) && taskTexts.some(t => t.includes('练字')), taskTexts.join(','));

  // 2) 离线衰减：3天没照顾 → 饱食 80-30=50，心情 80-24=56
  const hv = d.getElementById('petHungerVal').textContent, mv = d.getElementById('petMoodVal').textContent;
  ck('饱食衰减到50', hv === '50/100', hv);
  ck('心情衰减到56', mv === '56/100', mv);

  // 3) 宠物阶段：exp=8 → 神秘蛋（<10）
  ck('exp=8 显示神秘蛋', d.getElementById('petLv').textContent.includes('神秘蛋'), d.getElementById('petLv').textContent);

  // 4) 完成任务赚星星：点第一个未完成任务
  const firstCk = d.querySelector('#childTaskList .item:not(.done) .check');
  firstCk.click();
  const stars2 = +d.getElementById('childStars').textContent;
  ck('完成任务后星星增加', stars2 > 5, String(stars2));
  ck('进度条显示完成数', d.getElementById('childTaskProg').textContent.includes('今日完成'), d.getElementById('childTaskProg').textContent);

  // 5) 连续打卡：前2天+今天 → streak=3，解锁🥉徽章
  ck('连续打卡=3天', d.getElementById('childStreak').textContent === '3', d.getElementById('childStreak').textContent);
  const unlocked = d.querySelectorAll('#childBadges .pet-badge.unlocked').length;
  ck('解锁1枚徽章', unlocked === 1, String(unlocked));

  // 6) 喂食：花1⭐ → 饱食+20、exp+2（8+2=10 → 破壳进化）
  d.getElementById('petFeed').onclick();
  ck('喂食后饱食+20', d.getElementById('petHungerVal').textContent === '70/100', d.getElementById('petHungerVal').textContent);
  ck('exp到10进化破壳喵', d.getElementById('petLv').textContent.includes('破壳喵'), d.getElementById('petLv').textContent);
  ck('喂食扣星', +d.getElementById('childStars').textContent === stars2 - 1, d.getElementById('childStars').textContent);

  // 7) 陪玩：心情+20
  d.getElementById('petPlay').onclick();
  ck('陪玩后心情+20', d.getElementById('petMoodVal').textContent === '76/100', d.getElementById('petMoodVal').textContent);

  // 8) 星星不足拦截：清空星星后喂食
  const w = dom.window;
  // 连点喂食直到星星不足
  let guard = 20;
  while (+d.getElementById('childStars').textContent > 0 && guard--) d.getElementById('petFeed').onclick();
  const starsZero = +d.getElementById('childStars').textContent;
  const hungerBefore = d.getElementById('petHungerVal').textContent;
  d.getElementById('petFeed').onclick();
  ck('���星不足时喂食被拦截', d.getElementById('petHungerVal').textContent === hungerBefore && starsZero === 0, starsZero + '|' + hungerBefore);

  // 9) 添加新任务（回车）
  d.getElementById('childTaskName').value = '帮忙倒垃圾';
  d.getElementById('childTaskStars').value = '2';
  d.getElementById('childTaskName').onkeydown({ key: 'Enter' });
  const t2 = [...d.querySelectorAll('#childTaskList .item .txt')].map(x => x.textContent);
  ck('回车添加任务成功', t2.some(t => t.includes('帮忙倒垃圾') && t.includes('⭐×2')), t2.join(','));

  // 10) 取消完成收回星星
  const doneCk = d.querySelector('#childTaskList .item.done .check');
  const starsBefore = +d.getElementById('childStars').textContent;
  doneCk.click();
  ck('取消完成收回星星', +d.getElementById('childStars').textContent <= starsBefore, d.getElementById('childStars').textContent);

  // 11) 宠物改名
  d.getElementById('petRename').onclick();
  ck('宠物改名生效', d.getElementById('petName').textContent === '喵喵', d.getElementById('petName').textContent);

  console.log('=== 结果: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  dom.window.close();
}, 300);
