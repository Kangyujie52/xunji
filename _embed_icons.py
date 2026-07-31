# -*- coding: utf-8 -*-
"""把 assets/ 下的 8 张 IP 图标压缩为 160px WebP，生成 icons.js（APP_ICONS base64 字典）"""
import base64, io, pathlib
from PIL import Image

base = pathlib.Path(r'C:/Users/新锦动力/WorkBuddy/2026-07-29-13-36-47/workstation')
assets = base / 'assets'

# key -> 源文件名
ICONS = {
    'main':       '图标_主图标_寻己.png',
    'work':       '图标_工作.png',
    'ledger':     '图标_账本.png',
    'checkin':    '图标_项目打卡.png',
    'notes':      '图标_灵感随想.png',
    'child':      '图标_孩子激励.png',
    'english':    '图标_英语学习.png',
    'stocks':     '图标_股市学习.png',
    'life':       '图标_生活.png',
    'self':       '图标_自身.png',
    'pet_egg':    '宠物_1_神秘蛋.png',
    'pet_baby':   '宠物_2_破壳喵.png',
    'pet_kid':    '宠物_3_幼年喵.png',
    'pet_teen':   '宠物_4_少年喵.png',
    'pet_adult':  '宠物_5_威风大喵.png',
}

SIZE = 256      # 内嵌尺寸（宠物图为主视觉，放大到 256 更清晰）
QUALITY = 82    # WebP 质量

entries = []
total = 0
for key, fname in ICONS.items():
    src = assets / fname
    img = Image.open(src).convert('RGB')
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=QUALITY, method=6)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    total += len(b64)
    entries.append("  %s: 'data:image/webp;base64,%s'" % (key, b64))
    print('%-8s %s -> %d bytes (b64 %d)' % (key, fname, buf.tell(), len(b64)))

js = '/* 自动生成：寻己 IP 图标（160px WebP base64），由 _embed_icons.py 生成，勿手改 */\n'
js += 'const APP_ICONS = {\n' + ',\n'.join(entries) + '\n};\n'
(base / 'icons.js').write_text(js, encoding='utf-8')
print('icons.js written, total b64 chars:', total)
