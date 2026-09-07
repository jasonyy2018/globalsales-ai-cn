import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

scripts = soup.find_all('script')
for i, s in enumerate(scripts):
    src = s.get('src')
    content = s.string or s.text or ''
    print(f"Script {i}: src={src}, length={len(content)}")
    if not src and len(content) > 100:
        with open('scripts/legacy_script.js', 'w', encoding='utf-8') as sf:
            sf.write(content)
        print("Saved script to scripts/legacy_script.js")
