import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

sections = soup.find_all('section', class_='section')
print(f"Found {len(sections)} sections")

for s in sections:
    sec_id = s.get('id', '')
    sec_class = s.get('class', [])
    header = s.find('div', class_='section-header')
    h2 = header.find('h2').text.strip() if header and header.find('h2') else 'NO H2'
    p = header.find('p').text.strip() if header and header.find('p') else 'NO P'
    first_children = [c.name + ('.' + '.'.join(c.get('class', [])) if c.get('class') else '') for c in s.children if c.name]
    print(f"ID: {sec_id}")
    print(f"  Header H2: {h2}")
    print(f"  Header P:  {p[:60]}...")
    print(f"  Top children: {first_children}")
    print("-" * 50)
