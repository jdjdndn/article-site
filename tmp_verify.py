# -*- coding: utf-8 -*-
"""线上验证：首页置灰 + 详情纠错 + 反馈处理"""
import sys, json, re, urllib.request

def get(url):
    with urllib.request.urlopen(url, timeout=25) as r:
        return r.status, r.read()

def post(url, data=None, method='POST'):
    req = urllib.request.Request(url, method=method)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
    else:
        body = None
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.status, r.read()

k = open(r'E:\code\article-site\.env.manage-key', encoding='utf-8').read().strip().replace('MANAGE_KEY=', '')

s, html = get('https://www.wcbblll.cc/')
h = html.decode('utf-8', 'ignore')
tabs = re.findall(r'class="tab[^"]*"[^>]*>([^<]+)', h)
print('首页 status:', s)
print('tabs:', tabs)
print('disabled count:', h.count('disabled'))

s2, html2 = get('https://www.wcbblll.cc/article/a-20260927-46294200')
h2 = html2.decode('utf-8', 'ignore')
print('详情 status:', s2, '| 纠错按钮:', h2.count('report-btn'), '| 弹窗:', h2.count('report-mask'))

s3, _ = post(f'https://www.wcbblll.cc/api/admin/reports/1?key={k}', method='PUT')
print('PUT 标记处理:', s3)

s4, st = get(f'https://www.wcbblll.cc/api/admin/stats?key={k}')
d = json.loads(st)
print('stats status:', s4, '| openReports now:', d.get('openReports'))
