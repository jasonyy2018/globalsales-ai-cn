with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, 'html.parser')
main = soup.find('main')
print("Main attributes:", main.attrs)

sections = main.find_all('div', class_='section')
print(f"Total sections: {len(sections)}")

for i, sec in enumerate(sections):
    sec_id = sec.get('id', '')
    sec_classes = sec.get('class', [])
    header = sec.find('div', class_='section-header')
    h2 = header.find('h2') if header else None
    h2_text = h2.text.strip() if h2 else ''
    p = header.find('p') if header else None
    p_text = p.text.strip() if p else ''
    children_classes = [c.get('class', []) for c in sec.children if hasattr(c, 'get')]
    print(f"[{i+1}] id={sec_id} | class={sec_classes} | h2={h2_text[:20]} | p={p_text[:40]}")
