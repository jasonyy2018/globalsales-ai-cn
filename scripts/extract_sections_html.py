import sys
import os
import json
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
main = soup.find('main', id='mainContent')
sections = main.find_all('section', class_='section')

os.makedirs('scripts/legacy_sections', exist_ok=True)
section_dict = {}

for s in sections:
    sec_id = s.get('id')
    sec_html = str(s)
    section_dict[sec_id] = sec_html
    with open(f'scripts/legacy_sections/{sec_id}.html', 'w', encoding='utf-8') as sf:
        sf.write(sec_html)
    print(f"Extracted {sec_id} ({len(sec_html)} chars)")

with open('scripts/all_sections.json', 'w', encoding='utf-8') as jf:
    json.dump(section_dict, jf, ensure_ascii=False, indent=2)

print("Done extracting all 24 sections!")
