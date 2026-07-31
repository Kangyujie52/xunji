/* 测试：全局流水搜索（账本首页，跨账本 + 账本筛选） */
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
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

setTimeout(() => {
  let pass = 0, fail = 0;
  const chk = (name, cond) => { cond ? (pass++, console.log('PASS -', name)) : (fail++, console.log('FAIL -', name)); };
  const gsItems = () => [...$('gsList').querySelectorAll('.item')];

  // 1) 位置：搜索区在首页、明细页无筛选栏
  const home = $('ledgerHome'), detail = $('ledgerDetail');
  chk('搜索区位于账本首页', home.contains($('fltKw')) && home.contains($('gsList')) && home.contains($('fltLedger')));
  chk('明细页不再有筛选栏', !detail.querySelector('.lg-filter'));

  // 2) 准备：加一个标签，两个账本各记账
  $('tagIcon').value = '🍜'; $('tagName').value = '餐饮'; $('tagAdd').click();
  const today = new Date().toISOString().slice(0, 10);

  $('ledgerNewName').value = '家庭账'; $('ledgerNew').click();
  const tagId = [...$('txnTag').options].find(o => o.textContent.includes('餐饮')).value;
  // 家庭账：支出12(餐饮) + 收入5000(工资备注)
  $('txnType').value = 'exp'; $('txnAmount').value = '12'; $('txnTag').value = tagId; $('txnDate').value = today; $('txnNote').value = '早饭'; $('txnAdd').click();
  $('txnType').value = 'inc'; $('txnAmount').value = '5000'; $('txnTag').value = ''; $('txnDate').value = today; $('txnNote').value = '工资'; $('txnAdd').click();
  $('ledgerBack').click();

  $('ledgerNewName').value = '生意账'; $('ledgerNew').click();
  // 生意账：支出200
  $('txnType').value = 'exp'; $('txnAmount').value = '200'; $('txnTag').value = ''; $('txnDate').value = today; $('txnNote').value = '进货'; $('txnAdd').click();
  $('ledgerBack').click();   // 回到首页 → renderGlobalSearch 已刷新

  // 3) 无条件：应显示全部（默认账本可能有0笔，两个新账本共3笔）
  chk('默认显示全部账本流水（3笔）', gsItems().length === 3);
  chk('结果里标注所属账本', gsItems().some(i => i.textContent.includes('家庭账')) && gsItems().some(i => i.textContent.includes('生意账')));
  chk('账本下拉包含新账本', [...$('fltLedger').options].some(o => o.textContent.includes('家庭账')));

  // 4) 按账本筛选
  const famId = [...$('fltLedger').options].find(o => o.textContent.includes('家庭账')).value;
  $('fltLedger').value = famId; fire($('fltLedger'), 'change');
  chk('按账本筛选：家庭账=2笔', gsItems().length === 2 && gsItems().every(i => i.textContent.includes('家庭账')));

  // 5) 账本+类型组合
  $('fltType').value = 'exp'; fire($('fltType'), 'change');
  chk('家庭账+仅支出=1笔(12)', gsItems().length === 1 && gsItems()[0].textContent.includes('12'));

  // 6) 清空 → 恢复全部
  $('fltClear').click();
  chk('清空后恢复3笔', gsItems().length === 3 && $('fltLedger').value === '');

  // 7) 跨账本关键词搜索
  $('fltKw').value = '进货'; fire($('fltKw'), 'input');
  chk('跨账本搜「进货」=1笔(生意账)', gsItems().length === 1 && gsItems()[0].textContent.includes('生意账'));

  // 8) 跨账本分类筛选
  $('fltClear').click();
  $('fltTag').value = tagId; fire($('fltTag'), 'change');
  chk('跨账本按分类餐饮=1笔', gsItems().length === 1 && gsItems()[0].textContent.includes('餐饮'));

  // 9) 统计信息
  $('fltClear').click();
  chk('统计含收入/支出', $('fltInfo').textContent.includes('收入') && $('fltInfo').textContent.includes('支出'));

  // 10) 明细页流水仍正常（无筛选的简单列表）
  const famCard = [...doc.querySelectorAll('.ledger-card')].find(c => c.textContent.includes('家庭账'));
  famCard.click();
  chk('明细页流水正常显示2笔', $('ledgerList').querySelectorAll('.item').length === 2);

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}, 600);
