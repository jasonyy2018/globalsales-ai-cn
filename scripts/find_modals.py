import sys
import re
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

modals = soup.find_all(class_=re.compile(r'modal', re.I))
print(f"Found {len(modals)} elements with class modal:")
for m in modals:
    print(f"Tag: <{m.name} id='{m.get('id')}' class='{m.get('class')}'>")
