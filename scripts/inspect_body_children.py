import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

body = soup.find('body')
for child in body.children:
    if child.name:
        cls = child.get('class', [])
        cid = child.get('id', '')
        print(f"<{child.name} id='{cid}' class='{cls}'> (length: {len(str(child))})")
