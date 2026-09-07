import sys
import json
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
main = soup.find('main', id='mainContent')
sections = main.find_all('section', class_='section')

print(f"Found {len(sections)} sections in mainContent.")

# Strictly join only the section elements, NO top-level loose comment texts!
clean_sections_html = "\n".join(str(s) for s in sections)

print(f"Total clean HTML length: {len(clean_sections_html)}")
print("Check start of clean HTML:")
print(clean_sections_html[:200])

with open('src/components/layout/legacy_main_html.json', 'w', encoding='utf-8') as f:
    json.dump({'html': clean_sections_html}, f, ensure_ascii=False)

print("Saved clean legacy_main_html.json successfully!")
