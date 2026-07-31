const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('个人工作台_单文件版.html', 'utf8');
const errs = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://localhost/',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    w.HTMLCanvasElement.prototype.getContext = function () {
      return new Proxy({}, { get: (t, k) => k === 'canvas' ? this : () => {}, set: () => true });
    };
    w.alert = () => {};
    w.prompt = () => null;
    w.confirm = () => true;
    w.addEventListener('error', e => errs.push(e.message));
  }
});

setTimeout(() => {
  const d = dom.window.document;
  const w = dom.window;
  let pass = 0, fail = 0;
  const ck = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };

  ck('页面无报错', errs.length === 0);

  // 直接渲染孩子激励面板
  w.renderChild();

  const visual = d.getElementById('petVisual');
  ck('宠物视觉区存在', !!visual);
  ck('蛋阶段显示为图片', visual.innerHTML.includes('<img') && visual.innerHTML.includes('data:image/webp'));

  // 验证 APP_ICONS 包含全部 5 个宠物阶段（顶层 const 不挂 window，用 eval 读取）
  const icons = w.eval('APP_ICONS') || {};
  ck('APP_ICONS 包含 pet_egg', !!icons.pet_egg);
  ck('APP_ICONS 包含 pet_baby', !!icons.pet_baby);
  ck('APP_ICONS 包含 pet_kid', !!icons.pet_kid);
  ck('APP_ICONS 包含 pet_teen', !!icons.pet_teen);
  ck('APP_ICONS 包含 pet_adult', !!icons.pet_adult);

  // 验证 petVisualHtml 各阶段都返回对应图片
  const petVisualHtml = w.petVisualHtml;
  ck('petVisualHtml(egg) 使用 pet_egg', typeof petVisualHtml === 'function' && petVisualHtml({ key: 'egg', name: '神秘蛋', emoji: '🥚' }).includes(icons.pet_egg));
  ck('petVisualHtml(baby) 使用 pet_baby', typeof petVisualHtml === 'function' && petVisualHtml({ key: 'baby', name: '破壳喵', emoji: '🐣' }).includes(icons.pet_baby));
  ck('petVisualHtml(kid) 使用 pet_kid', typeof petVisualHtml === 'function' && petVisualHtml({ key: 'kid', name: '幼年喵', emoji: '🐱' }).includes(icons.pet_kid));
  ck('petVisualHtml(teen) 使用 pet_teen', typeof petVisualHtml === 'function' && petVisualHtml({ key: 'teen', name: '少年喵', emoji: '😺' }).includes(icons.pet_teen));
  ck('petVisualHtml(adult) 使用 pet_adult', typeof petVisualHtml === 'function' && petVisualHtml({ key: 'adult', name: '威风大喵', emoji: '🐈' }).includes(icons.pet_adult));

  // 点击宠物触发弹跳动画
  const beforeBounce = visual.classList.contains('bounce');
  visual.click();
  ck('点击宠物触发弹跳动画', visual.classList.contains('bounce') !== beforeBounce);

  console.log('=== 结果: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  dom.window.close();
}, 400);
