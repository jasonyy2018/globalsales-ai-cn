import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

main = soup.find('main', id='mainContent')
sections = main.find_all('section', class_='section')

print(f"Total sections: {len(sections)}")
for s in sections:
    sec_id = s.get('id')
    header = s.find('div', class_='section-header')
    title = header.find('h2').text.strip() if header and header.find('h2') else ''
    subtitle = header.find('p').text.strip() if header and header.find('p') else ''
    print(f"[{sec_id}] Title: {title} | Subtitle: {subtitle[:40]}...")
