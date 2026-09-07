import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

# Inspect section-hotspot
hotspot = soup.find('section', id='section-hotspot')
print("=== section-hotspot HTML (first 1500 chars) ===")
print(str(hotspot)[:1500])

# Inspect section-sourcing
sourcing = soup.find('section', id='section-sourcing')
print("=== section-sourcing HTML (first 1500 chars) ===")
print(str(sourcing)[:1500])
