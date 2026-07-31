/* 孩子激励·宠物陪玩动作特效 端到端测试（jsdom）：验证点击动作后猫身动画类 + 道具特效层注入 */
const fs = require('fs');
const { JSDOM } = require('C:/Users/新锦动力/.workbuddy/binaries/node/workspace/node_modules/jsdom');
const html = fs.readFileSync('个人工作台_单文件版.html', 'utf8');
const errs = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://localhost/', pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, k) => k === 'canvas' ? this : () => {}, set: () => true }); };
    w.alert = () => {}; w.confirm = () => true; w.prompt = () => '喵喵';
    w.addEventListener('error', e => errs.push(e.message));
    // 预置已破壳宠物（exp=50），可直接玩全部动作
    w.localStorage.setItem('workstation_v1', JSON.stringify({
      profile: {}, work: { projects: [] },
      life: {
        ledgers: [], ledgerTags: [], payMethods: [], checkins: [], notes: [],
        child: {
          points: 99, goals: [], days: {},
          pet: { name: '小猫咪', exp: 50, hunger: 80, mood: 80, lastCare: '2026-07-30', album: [] }
        },
        english: [], stocks: { watch: [], notes: [] }
      }
    }));
  }
});

setTimeout(() => {
  const d = dom.window.document; const w = dom.window;
  let pass = 0, fail = 0;
  const ck = (n, c, e) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c ? '' : ('  [' + (e || '') + ']'))); };

  ck('页面无报错', errs.length === 0, errs.join('|'));

  // 进入孩子激励面板
  const nav = [...d.querySelectorAll('.nav-item')].find(n => n.dataset.panel === 'child');
  if (nav) nav.click();

  // 宠物应为 AI 生成的 3D 风格图片角色（内嵌 webp，非静态占位 emoji）
  const petImg = d.querySelector('#petVisual img.pet-img');
  ck('宠物为 AI 生成的 3D 风格图片角色', !!petImg, (d.querySelector('#petVisual') || {}).innerHTML ? d.querySelector('#petVisual').innerHTML.slice(0, 40) : '(无)');
  ck('图片已内嵌(非外链/非占位 emoji)', !!petImg && /^data:image\/webp/.test(petImg.src || ''), '');

  // 星星由预设 points:99 迁移而来，无需直接改 S

  const acts = [...d.querySelectorAll('#petActs .pet-act')];
  const bodyCls = () => { const b = d.querySelector('#petVisual .pet-body'); return b ? b.className : '(无)'; };
  const propInfo = () => { const p = d.getElementById('petProp'); return p ? (p.className + ' | ' + p.innerHTML.slice(0, 60)) : '(无)'; };

  // 1) 丢球捡球 → chase 动画 + pp-ball 道具
  const ball = acts.find(a => a.querySelector('.pa-name').textContent.includes('丢球'));
  ck('找到丢球动作', !!ball);
  if (ball) ball.click();
  ck('ball 触发猫身 chase 动画类', d.querySelector('#petVisual .pet-body').classList.contains('chase'), bodyCls());
  const ballProp = d.getElementById('petProp');
  ck('ball 道具层进入 run', ballProp && ballProp.classList.contains('run'), propInfo());
  ck('ball 道具层含 pp-ball', ballProp && ballProp.innerHTML.includes('pp-ball'), propInfo());

  // 2) 逗猫棒 → pounce 动画 + pp-feather 道具
  const poke = acts.find(a => a.querySelector('.pa-name').textContent.includes('逗猫棒'));
  if (poke) poke.click();
  ck('poke 触发猫身 pounce 动画类', d.querySelector('#petVisual .pet-body').classList.contains('pounce'), bodyCls());
  ck('poke 道具层含 pp-feather', d.getElementById('petProp') && d.getElementById('petProp').innerHTML.includes('pp-feather'), propInfo());

  // 3) 梳毛 → brush 动画 + pp-comb 道具
  const comb = acts.find(a => a.querySelector('.pa-name').textContent.includes('梳毛'));
  if (comb) comb.click();
  ck('comb 触发猫身 brush 动画类', d.querySelector('#petVisual .pet-body').classList.contains('brush'), bodyCls());
  ck('comb 道具层含 pp-comb', d.getElementById('petProp') && d.getElementById('petProp').innerHTML.includes('pp-comb'), propInfo());

  // 4) 晒太阳 → sun 动画 + pp-sun 道具 + 光晕
  const sun = acts.find(a => a.querySelector('.pa-name').textContent.includes('晒太阳'));
  if (sun) sun.click();
  ck('sun 触发猫身 sun 动画类', d.querySelector('#petVisual .pet-body').classList.contains('sun'), bodyCls());
  ck('sun 道具层含 pp-sun+pp-glow', d.getElementById('petProp') && d.getElementById('petProp').innerHTML.includes('pp-sun') && d.getElementById('petProp').innerHTML.includes('pp-glow'), propInfo());

  // 5) 散步 → walk 动画 + 脚印/草丛道具
  const walk = acts.find(a => a.querySelector('.pa-name').textContent.includes('散步'));
  if (walk) walk.click();
  ck('walk 触发猫身 walk 动画类', d.querySelector('#petVisual .pet-body').classList.contains('walk'), bodyCls());
  ck('walk 道具层含 pp-foot+pp-bush', d.getElementById('petProp') && d.getElementById('petProp').innerHTML.includes('pp-foot') && d.getElementById('petProp').innerHTML.includes('pp-bush'), propInfo());

  // 6) 拍合照 → 存相册 + 拍立得白框特效
  const photo = acts.find(a => a.querySelector('.pa-name').textContent.includes('拍合照'));
  if (photo) photo.click();
  ck('拍照后相册新增记录', d.querySelectorAll('#petAlbumList .pet-photo').length > 0, String(d.querySelectorAll('#petAlbumList .pet-photo').length));
  ck('拍照特效含 pp-frame 拍立得框', d.getElementById('petProp') && d.getElementById('petProp').innerHTML.includes('pp-frame'), propInfo());

  // 7) 点击宠物本体 → bounce 轻互动 + 说话
  const pv = d.getElementById('petVisual'); if (pv) pv.click();
  ck('点击宠物本体触发 bounce', d.querySelector('#petVisual .pet-body').classList.contains('bounce'), bodyCls());
  ck('点击宠物有对话文案', (d.getElementById('petTalk').textContent || '').length > 0, d.getElementById('petTalk').textContent);

  console.log('=== 结果: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  dom.window.close();
}, 300);
