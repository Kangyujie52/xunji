/* 陪玩动作端到端测试：6 个动作、效果、限次、相册、破壳限制 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('个人工作台_单文件版.html', 'utf8');
const errs = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://localhost/', pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, k) => k === 'canvas' ? this : () => { }, set: () => true }); };
    w.alert = () => { }; w.prompt = () => null; w.confirm = () => true;
    w.addEventListener('error', e => errs.push(e.message));
  }
});

setTimeout(() => {
  const w = dom.window, d = w.document;
  let pass = 0, fail = 0;
  const ck = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n); };
  const ev = s => w.eval(s);

  ck('页面无报错', errs.length === 0);

  // 动作区已渲染 6 个
  const acts = d.querySelectorAll('#petActs .pet-act');
  ck('陪玩动作渲染 6 个', acts.length === 6);
  const names = [...acts].map(a => a.querySelector('.pa-name').textContent);
  ck('包含逗猫棒/丢球捡球/梳毛', names.includes('逗猫棒') && names.includes('丢球捡球') && names.includes('梳毛'));
  ck('包含晒太阳/散步/拍合照', names.includes('晒太阳') && names.includes('散步') && names.includes('拍合照'));
  ck('晒太阳标记免费', [...acts].find(a => a.querySelector('.pa-name').textContent === '晒太阳').classList.contains('free'));
  ck('旧的单一陪玩按钮已移除', !d.getElementById('petPlay'));

  // 蛋阶段：非晒太阳动作被拦截
  ev('S.life.child.stars = 50; S.life.child.pet.exp = 0; S.life.child.pet.mood = 50; S.life.child.pet.hunger = 50; renderChild();');
  ev('doPetAct("poke")');
  ck('蛋阶段逗猫棒被拦截', ev('S.life.child.pet.mood') === 50 && ev('S.life.child.stars') === 50);
  ck('拦截有提示', d.getElementById('toast').textContent.includes('还没破壳'));

  // 破壳后各动作生效
  ev('S.life.child.pet.exp = 30; renderChild();');   // 幼年喵
  ev('doPetAct("poke")');
  ck('逗猫棒 心情+25', ev('S.life.child.pet.mood') === 75);
  ck('逗猫棒 饱食-5', ev('S.life.child.pet.hunger') === 45);
  ck('逗猫棒 扣1⭐', ev('S.life.child.stars') === 49);
  ck('逗猫棒 成长+3', ev('S.life.child.pet.exp') === 33);
  ck('宠物说专属文案', ['喵！差一点就抓到了！', '嗖——羽毛跑哪儿去了？', '扑！这次一定抓住你！', '我的爪子快得像闪电喵～'].includes(d.getElementById('petTalk').textContent));

  ev('doPetAct("comb")');
  ck('梳毛 饱食+5', ev('S.life.child.pet.hunger') === 50);

  // 免费动作不扣星
  const starBefore = ev('S.life.child.stars');
  ev('doPetAct("sun")');
  ck('晒太阳不扣星星', ev('S.life.child.stars') === starBefore);

  // 每日限次：晒太阳 limit=1，第二次被拦
  const moodBefore = ev('S.life.child.pet.mood');
  ev('doPetAct("sun")');
  ck('晒太阳每日限1次生效', ev('S.life.child.pet.mood') === moodBefore);
  ck('限次有提示', d.getElementById('toast').textContent.includes('已经玩过'));
  ck('用完的动作置灰', [...d.querySelectorAll('#petActs .pet-act')].find(a => a.querySelector('.pa-name').textContent === '晒太阳').classList.contains('used'));

  // 散步 limit=1、cost=2
  const s2 = ev('S.life.child.stars');
  ev('doPetAct("walk")');
  ck('散步扣2⭐', ev('S.life.child.stars') === s2 - 2);
  ck('散步计数显示 1/1', [...d.querySelectorAll('#petActs .pet-act')].find(a => a.querySelector('.pa-name').textContent === '散步').querySelector('.pa-cost').textContent.includes('1/1'));

  // 拍合照进相册
  ev('doPetAct("photo")');
  ck('相册新增 1 张', ev('S.life.child.pet.album.length') === 1);
  ck('相册计数显示 1', d.getElementById('petAlbumCount').textContent === '1');
  ck('相册列表渲染', d.querySelectorAll('#petAlbumList .item').length === 1);
  ck('相册记录含阶段名', ev('S.life.child.pet.album[0].stage').length > 0);
  ev('doPetAct("photo"); doPetAct("photo"); doPetAct("photo")');
  ck('拍合照每日限3次', ev('S.life.child.pet.album.length') === 3);

  // 星星不足
  ev('S.life.child.stars = 0; renderChild();');
  const m3 = ev('S.life.child.pet.mood');
  ev('doPetAct("poke")');
  ck('星星不足时不生效', ev('S.life.child.pet.mood') === m3);

  // 跨天重置
  ev('S.life.child.pet.actDay = "2020-01-01"; S.life.child.stars = 20; renderChild();');
  ck('跨天后晒太阳可用', !([...d.querySelectorAll('#petActs .pet-act')].find(a => a.querySelector('.pa-name').textContent === '晒太阳').classList.contains('used')));

  // 心情上限
  ev('S.life.child.pet.mood = 95; doPetAct("poke");');
  ck('心情不超过100', ev('S.life.child.pet.mood') === 100);

  console.log('=== 结果: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  dom.window.close();
}, 400);
