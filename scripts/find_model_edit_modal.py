import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

m = soup.find(id='modelEditModal')
if m:
    print(f"modelEditModal found! Parent: {m.parent.name}, length: {len(str(m))}")
else:
    print("modelEditModal not found in HTML, might be inside section-models or created dynamically")
