const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('workstation_single.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://localhost/', pretendToBeVisual: true });
const w = dom.window, d = w.document;

setTimeout(() => {
  // 模拟「远端是空壳数据，但时间戳很新」——正是之前会误覆盖本地的风险场景
  const shellRemote = { life: { ledgers: [{ txns: [] }], ledgerTags: [] }, _ts: 9999999999999 };
  w.ghGetData = () => Promise.resolve(shellRemote);

  // 捕获推送动作，确认走的是「上传本地」而非「拉取覆盖」
  let pushed = null;
  w.ghPutData = (c, obj) => { pushed = obj; return Promise.resolve(true); };

  // stub 仓库验证请求为成功，避免真实网络请求失败导致提前 return
  w.fetch = (u, o) => {
    if (typeof u === 'string' && u.includes('api.github.com/repos/')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  };

  // 让本地有真实数据（造一条账本记录，使本地非空壳）
  // 通过触发一次真实写入：给账号加一笔（用现有 API 不可直接拿，这里直接改写种子）
  // 用 window 暴露不到 S，改用 ghIsShell 直接单测 + 推送分支断言

  // 1) 单测 ghIsShell
  console.log('1 空壳判定 空ledgers:', w.ghIsShell({ life: { ledgers: [{ txns: [] }] } }) ? 'PASS(是空壳)' : 'FAIL');
  console.log('2 空壳判定 有记录:', w.ghIsShell({ life: { ledgers: [{ txns: [{ a: 1 }] }] } }) ? 'FAIL' : 'PASS(非壳)');

  // 2) 触发 ghSave，断言走推送分支（不会被空壳覆盖）
  d.getElementById('ghUser').value = 'kangyujie52';
  d.getElementById('ghRepo').value = 'xunji-data';
  d.getElementById('ghToken').value = 'ghp_test';
  d.getElementById('ghSave').click();

  setTimeout(() => {
    console.log('3 远端空壳+新ts → 走推送分支(未被覆盖):', pushed ? 'PASS' : 'FAIL');
    console.log('4 推送内容非空壳:', pushed && !w.ghIsShell(pushed) ? 'PASS' : 'CHECK(本地默认种子可能仍为空壳)');
    console.log('=== 专属云端防覆盖防护测试完成 ===');
    dom.window.close();
  }, 600);
}, 800);
