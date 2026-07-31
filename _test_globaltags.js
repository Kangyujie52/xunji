/* 测试：标签/支付方式管理移至账本首页（全账本通用） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '个人工作台_单文件版.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://kangyujie52.github.io/xunji/',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    window.HTMLCanvasElement.prototype.getContext = function () {
      const noop = () => {};
      return new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : noop), set: () => true });
    };
    window.confirm = () => true;
    window.prompt = () => null;
  }
});

const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);

setTimeout(() => {
  let pass = 0, fail = 0;
  const chk = (name, cond) => { cond ? (pass++, console.log('PASS -', name)) : (fail++, console.log('FAIL -', name)); };

  // 1) 管理区位置：应在 ledgerHome 内、不在 ledgerDetail 内
  const home = $('ledgerHome'), detail = $('ledgerDetail');
  chk('标签管理位于账本首页', home.contains($('tagAdd')) && home.contains($('tagList')));
  chk('支付方式管理位于账本首页', home.contains($('payAdd')) && home.contains($('payList')));
  chk('明细页不再有标签管理', !detail.contains($('tagAdd')));
  chk('明细页不再有支付方式管理', !detail.contains($('payAdd')));

  // 2) 首页管理区可用：图标面板已渲染
  chk('图标快速填入面板已渲染', $('tagPalettePresets').querySelectorAll('.tag-ic').length >= 10);

  // 3) 在首页添加标签 + 支付方式
  $('tagIcon').value = '🍜'; $('tagName').value = '测试餐饮';
  $('tagAdd').click();
  $('payIcon').value = '💳'; $('payName').value = '测试微信';
  $('payAdd').click();
  chk('首页添加标签成功', [...$('tagList').querySelectorAll('.item')].some(i => i.textContent.includes('测试餐饮')));
  chk('首页添加支付方式成功', [...$('payList').querySelectorAll('.item')].some(i => i.textContent.includes('测试微信')));

  // 4) 新建两个账本，验证标签/支付方式在两个账本中都可选（通用）
  $('ledgerNewName').value = '账本甲'; $('ledgerNew').click();   // 进入明细
  const tagOptA = [...$('txnTag').options].some(o => o.textContent.includes('测试餐饮'));
  const payOptA = [...$('txnPay').options].some(o => o.textContent.includes('测试微信'));
  chk('账本甲可选到通用标签', tagOptA);
  chk('账本甲可选到通用支付方式', payOptA);

  // 记一笔验证引用正常
  const tagId = [...$('txnTag').options].find(o => o.textContent.includes('测试餐饮')).value;
  $('txnType').value = 'exp'; $('txnAmount').value = '12'; $('txnTag').value = tagId;
  $('txnAdd').click();
  chk('账本甲记账引用通用标签成功', $('ledgerList').textContent.includes('测试餐饮'));

  $('ledgerBack').click();                                       // 返回首页
  $('ledgerNewName').value = '账本乙'; $('ledgerNew').click();   // 第二个账本
  const tagOptB = [...$('txnTag').options].some(o => o.textContent.includes('测试餐饮'));
  const payOptB = [...$('txnPay').options].some(o => o.textContent.includes('测试微信'));
  chk('账本乙也可选到同一批标签', tagOptB);
  chk('账本乙也可选到同一批支付方式', payOptB);

  // 5) 返回首页后管理区仍正常渲染
  $('ledgerBack').click();
  chk('返回首页后标签列表仍在', [...$('tagList').querySelectorAll('.item')].some(i => i.textContent.includes('测试餐饮')));

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}, 600);
