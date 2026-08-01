import re, pathlib, shutil

base = pathlib.Path(r'F:/2026-07-29-13-36-47/workstation')
html = (base / 'index.html').read_text(encoding='utf-8')
css = (base / 'style.css').read_text(encoding='utf-8')
js = (base / 'app.js').read_text(encoding='utf-8')
three_bundle = (base / '_three_extracted.js').read_text(encoding='utf-8')

# 公开部署版不注入旧同步密钥（更安全）
LEGACY_SYNC_ID = ''
js_pub = js.replace("const LEGACY_SYNC_ID = '';",
                      "const LEGACY_SYNC_ID = '%s';" % LEGACY_SYNC_ID)

# 本地单文件版注入旧密钥用于老用户迁移（这里也用空，避免误带）
js_local = js_pub


def inline(js_src):
    h = html
    # 内联 style.css
    h = re.sub(r'<link rel="stylesheet" href="style\.css\?v=[^"]*" />',
               '<style>\n' + css + '\n</style>', h, count=1)
    # 内联 icons.js
    icons_path = base / 'icons.js'
    if icons_path.exists():
        icons_js = icons_path.read_text(encoding='utf-8')
        _mi = re.search(r'<script src="icons\.js[^"]*"></script>', h)
        if _mi:
            h = h[:_mi.start()] + '<script>\n' + icons_js + '\n</script>' + h[_mi.end():]
    # 内联 three.js 全家桶（用已抽取的版本，本机无 three 源文件）
    _m3 = re.search(r'<script src="app\.js[^"]*"></script>', h)
    if _m3:
        h = h[:_m3.start()] + '<script>\n' + three_bundle + '\n</script>\n' + h[_m3.start():]
    else:
        print('WARNING: app.js script tag not found')
    # 内联 app.js（保留 xlsx CDN）
    _m = re.search(r'<script src="app\.js[^"]*"></script>', h)
    if _m:
        h = h[:_m.start()] + '<script>\n' + js_src + '\n</script>' + h[_m.end():]
    return h


out_pub = base / 'deploy' / 'index.html'
out_pub.write_text(inline(js_pub), encoding='utf-8')
print('written deploy/index.html bytes:', len(inline(js_pub)))

out_dl = base / 'workstation_single.html'
out_dl.write_text(inline(js_pub), encoding='utf-8')
print('written workstation_single.html bytes:', len(inline(js_pub)))

out_dl_deploy = base / 'deploy' / 'workstation_single.html'
out_dl_deploy.write_text(inline(js_pub), encoding='utf-8')
print('written deploy/workstation_single.html bytes:', len(inline(js_pub)))

# 复制 3D GLB 资源
assets_src = base / 'assets'
assets_dst = base / 'deploy' / 'assets'
assets_dst.mkdir(parents=True, exist_ok=True)
for glb in ['cat_sit.glb', 'cat_loaf.glb', 'cat_walk.glb']:
    src = assets_src / glb
    dst = assets_dst / glb
    if src.exists():
        shutil.copy(str(src), str(dst))
        print('copied asset:', glb, 'bytes:', dst.stat().st_size)
    else:
        print('WARNING: missing asset', src)

# 校验：HTML 含新模块元素 + JS 含对应函数
for name, fn in [('deploy/index.html', out_pub)]:
    txt = fn.read_text(encoding='utf-8')
    for needed in ['childStats', 'childArchiveBtn', 'childArchiveList', 'childArchiveCount',
                   'renderChildStats', 'renderArchive', 'archiveToday']:
        assert needed in txt, name + ' missing ' + needed
    assert 'THREE' in txt and 'GLTFLoader' in txt, name + ' missing three'
print('ALL_OK: 孩子激励（含任务归档）HTML + JS + three 全家桶 已正确整包内联')
