/* 灵感随想模块端到端测试：便签墙 / 分类 / 搜索筛选 / 按月归档 / 孵化状态 / 统计 */
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
    // 预置一条上个月的老格式随想（无 cat/st），验证兼容 + 跨月归档
    w.localStorage.setItem('workstation_v1', JSON.stringify({
      life: { notes: [{ id: 'old1', text: '老格式随想：做一个家庭菜谱', date: '2026-06-15' }] }
    }));
    w.addEventListener('error', e => errs.push(e.message));
  }
});
setTimeout(() => {
  const d = dom.window.document;
  let pass = 0, fail = 0;
  const ck = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); };

  ck('页面无报错', errs.length === 0 || (console.log('  errs:', errs.join('|')), false));

  // 1) 老数据兼容：能显示且默认 ✨其他 / 💭闪念
  ck('老格式随想显示', d.getElementById('noteWall').textContent.includes('家庭菜谱'));
  ck('老数据默认分类为其他', d.querySelector('.note-card.cat-other') !== null);

  // 2) 选分类记两条新随想
  const catBtns = [...d.querySelectorAll('.note-cat-btn')];
  ck('分类按钮 5 个', catBtns.length === 5);
  catBtns.find(b => b.textContent.includes('生意')).onclick();
  d.getElementById('noteInput').value = '在店里加一个自助收银台';
  d.getElementById('noteAdd').onclick();
  d.getElementById('noteInput').value = '给孩子做英语单词卡片';
  [...d.querySelectorAll('.note-cat-btn')].find(b => b.textContent.includes('学习')).onclick();
  d.getElementById('noteAdd').onclick();
  ck('新增后共 3 条', d.querySelectorAll('.note-card').length === 3);
  ck('生意分类便签存在', d.querySelector('.note-card.cat-biz') !== null);

  // 3) 空内容保存有提示
  d.getElementById('noteInput').value = '';
  d.getElementById('noteAdd').onclick();
  ck('空内容有提示', d.getElementById('toast').textContent.includes('先写点什么'));

  // 4) 按月归档：两个月份分组，最近月默认展开
  const months = d.querySelectorAll('.note-month');
  ck('按月分成 2 组', months.length === 2);
  ck('最近月默认展开', months[0].open === true && months[0].querySelector('summary').textContent.includes('7月'));
  ck('归档条数正确', months[1].querySelector('summary').textContent.includes('6月') && months[1].querySelector('summary').textContent.includes('1条'));

  // 5) 关键词搜索
  const kw = d.getElementById('noteKw');
  kw.value = '收银台'; kw.oninput();
  ck('关键词搜出 1 条', d.querySelectorAll('.note-card').length === 1 && d.getElementById('noteFltInfo').textContent.includes('1 / 3'));

  // 6) 分类筛选
  kw.value = ''; kw.oninput();
  const fc = d.getElementById('noteFltCat'); fc.value = 'study'; fc.onchange();
  ck('学习分类筛出 1 条', d.querySelectorAll('.note-card').length === 1 && d.getElementById('noteWall').textContent.includes('单词卡片'));

  // 7) 清空筛选
  d.getElementById('noteFltClear').onclick();
  ck('清空恢复 3 条', d.querySelectorAll('.note-card').length === 3);

  // 8) 孵化状态切换：闪念→孵化中→已实现
  let stBtn = [...d.querySelectorAll('.note-card')].find(c => c.textContent.includes('收银台')).querySelector('.nc-status');
  stBtn.onclick(); // idea -> grow
  stBtn = [...d.querySelectorAll('.note-card')].find(c => c.textContent.includes('收银台')).querySelector('.nc-status');
  ck('切到孵化中', stBtn.textContent.includes('孵化中'));
  stBtn.onclick(); // grow -> done
  ck('切到已实现', [...d.querySelectorAll('.note-card')].find(c => c.textContent.includes('收银台')).querySelector('.nc-status').textContent.includes('已实现'));

  // 9) 状态筛选 + 统计
  const fsSel = d.getElementById('noteFltStatus'); fsSel.value = 'done'; fsSel.onchange();
  ck('已实现筛出 1 条', d.querySelectorAll('.note-card').length === 1);
  d.getElementById('noteFltClear').onclick();
  const stats = d.getElementById('noteStats').textContent;
  ck('统计正确', stats.includes('共 3') && stats.includes('已实现 1') && stats.includes('33%'));

  // 10) 删除
  const delBtn = [...d.querySelectorAll('.note-card')].find(c => c.textContent.includes('菜谱')).querySelector('.nc-op.del');
  delBtn.onclick();
  ck('删除后剩 2 条', d.querySelectorAll('.note-card').length === 2);

  console.log('=== 结果: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  dom.window.close();
}, 300);
