// 账本增强（筛选 + 趋势图）端到端测试：jsdom 加载构建版，mock canvas / fetch
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '个人工作台_单文件版.html'), 'utf8');

let fillRectCalls = 0, strokeCalls = 0;
const mockCtx = new Proxy({}, {
  get(t, p) {
    if (p === 'fillRect') return () => { fillRectCalls++; };
    if (p === 'stroke') return () => { strokeCalls++; };
    if (['setTransform','clearRect','beginPath','moveTo','lineTo','fill','arc','fillText','save','restore'].includes(p)) return () => {};
    return undefined;
  },
  set() { return true; }
});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(window) {
    window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ _ts: 0, version: 'x' }), headers: { get: () => null } });
    window.HTMLCanvasElement.prototype.getContext = () => mockCtx;
    window.devicePixelRatio = 1;
  }
});
const { window } = dom;
const { document } = window;

let done = false;
function assert(cond, msg) { if (!cond) throw new Error('断言失败: ' + msg); }

function run() {
  if (done) return; done = true;
  try {
    const card = document.querySelector('#ledgerCards .ledger-card');
    assert(card, '没有账本卡片（seed 失败）');
    card.click();

    function addTxn(type, tagIdx, amount, date, note) {
      document.getElementById('txnType').value = type;
      const tagSel = document.getElementById('txnTag');
      tagSel.value = tagSel.options[tagIdx].value;
      document.getElementById('txnAmount').value = String(amount);
      document.getElementById('txnDate').value = date;
      document.getElementById('txnNote').value = note || '';
      document.getElementById('txnAdd').click();
    }
    const today = new Date().toISOString().slice(0, 10);
    addTxn('exp', 1, 30, today, '午饭');   // 餐饮
    addTxn('exp', 2, 12, today, '地铁');    // 交通
    addTxn('inc', 4, 5000, today, '工资');  // 工资

    const listCount = () => document.querySelectorAll('#ledgerList .item').length;
    const total = listCount();
    console.log('记账后总数:', total);
    assert(total === 3, '期望 3 笔，实际 ' + total);

    const ft = document.getElementById('fltType');
    ft.value = 'exp'; ft.dispatchEvent(new window.Event('change'));
    console.log('仅支出:', listCount());
    assert(listCount() === 2, '仅支出应 2 笔');
    ft.value = 'inc'; ft.dispatchEvent(new window.Event('change'));
    assert(listCount() === 1, '仅收入应 1 笔');
    ft.value = ''; ft.dispatchEvent(new window.Event('change'));

    const ftg = document.getElementById('fltTag');
    ftg.value = ftg.options[1].value; ftg.dispatchEvent(new window.Event('change'));
    console.log('餐饮标签:', listCount());
    assert(listCount() === 1, '餐饮应 1 笔');
    ftg.value = ''; ftg.dispatchEvent(new window.Event('change'));

    const fk = document.getElementById('fltKw');
    fk.value = '工资'; fk.dispatchEvent(new window.Event('input'));
    console.log('关键词「工资」:', listCount());
    assert(listCount() === 1, '关键词工资应 1 笔');
    fk.value = ''; fk.dispatchEvent(new window.Event('input'));

    const ff = document.getElementById('fltFrom'), fto = document.getElementById('fltTo');
    ff.value = today; fto.value = today;
    ff.dispatchEvent(new window.Event('change')); fto.dispatchEvent(new window.Event('change'));
    console.log('今日区间:', listCount());
    assert(listCount() === 3, '今日区间应 3 笔');

    document.getElementById('fltClear').click();
    assert(listCount() === 3, '清空后应 3 笔');
    console.log('清空后 fltInfo:', document.getElementById('fltInfo').textContent);

    console.log('趋势图 fillRect:', fillRectCalls, 'stroke:', strokeCalls);
    assert(fillRectCalls > 0, '趋势图未绘制（fillRect 未调用）');

    console.log('LEDGER_TEST_PASS ✅');
  } catch (e) {
    console.error('LEDGER_TEST_FAIL ❌', e.message);
    process.exit(1);
  }
}

window.addEventListener('load', () => setTimeout(run, 30));
setTimeout(run, 200);
