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
    sec_id = s.get('id', '')
    length = len(str(s))
    print(f"{sec_id:30} : {length} chars")
