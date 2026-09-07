import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')

main = soup.find('main', id='mainContent')
main_inner = "".join(str(c) for c in main.children)
print(f"main inner HTML length: {len(main_inner)}")

# Save to public or src
with open('src/components/layout/legacy_main_html.json', 'w', encoding='utf-8') as f:
    import json
    json.dump({'html': main_inner}, f, ensure_ascii=False)

# Also check modals HTML
overlays = []
for mid in ['authGate', 'editorModal', 'bindModal', 'dashboardModal', 'toastContainer']:
    el = soup.find(id=mid)
    if el:
        overlays.append(str(el))
        print(f"Overlay {mid}: {len(str(el))} chars")

overlays_html = "\n".join(overlays)
with open('src/components/layout/legacy_overlays_html.json', 'w', encoding='utf-8') as f:
    json.dump({'html': overlays_html}, f, ensure_ascii=False)

print("Saved legacy main and overlays HTML successfully!")
