import pathlib
base = pathlib.Path(r'F:/2026-07-29-13-36-47/workstation')
js = (base / 'app.js').read_text(encoding='utf-8')
old = (base / 'deploy' / 'index.html').read_text(encoding='utf-8')

# app.js 内联块以 "const APP_VERSION = '" 开头；往回找最近的 <script> 即其块起点
pos = old.find("const APP_VERSION = '")
assert pos != -1, "app.js block anchor not found in deploy/index.html"
open_tag = old.rfind('<script>', 0, pos)
assert open_tag != -1
last_close = old.rfind('</script>')
assert last_close > open_tag

new_block = '<script>\n' + js + '\n</script>'
new = old[:open_tag] + new_block + old[last_close:]

out = base / 'deploy' / 'index.html'
out.write_text(new, encoding='utf-8')

# 校验
txt = out.read_text(encoding='utf-8')
for fn in ['renderChildStats', 'renderRewards', 'redeemReward', 'APP_VERSION = \'20260731n13\'']:
    assert fn in txt, 'MISSING: ' + fn
print('REBUILD_OK bytes=', len(txt))
print('contains new child functions:', 'renderRewards' in txt and 'renderChildStats' in txt)
