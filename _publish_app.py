#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把最新版本号登记到云端「安装包」blob（仅版本 + 文件名，不存 HTML，规避匿名 10KB 上限）。
完整新版 HTML 在本地生成的 /downloads 副本里，由用户点击下载。
用法：python _publish_app.py  （需先跑 _build_single.py）
"""
import json, pathlib, urllib.request, urllib.error, datetime, sys

BASE = pathlib.Path(__file__).resolve().parent
BLOB_ID = '019fb66b-321a-7c45-9520-56f68e87b0bd'
BLOB_URL = f'https://jsonblob.com/api/jsonBlob/{BLOB_ID}'

APP_VERSION = '20260731n7'  # 与 app.js 中 APP_VERSION 保持一致
DOWNLOAD_NAME = 'workstation_single.html'  # 与本地副本同名，便于覆盖

def main():
    payload = {
        'version': APP_VERSION,
        'updatedAt': datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'file': DOWNLOAD_NAME,
    }
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(BLOB_URL, data=data, method='PUT',
                                  headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print('published OK ->', resp.status, BLOB_URL)
            print('version:', APP_VERSION, '| download:', DOWNLOAD_NAME)
    except urllib.error.HTTPError as e:
        print('HTTPError:', e.code, e.read().decode('utf-8', 'replace'))
        sys.exit(1)

if __name__ == '__main__':
    main()
