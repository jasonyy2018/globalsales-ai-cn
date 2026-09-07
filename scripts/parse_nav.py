import json
from bs4 import BeautifulSoup

with open('scripts/aside_extracted.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
nav = soup.find('nav')

groups = []
current_group = []

for child in nav.children:
    if child.name == 'button':
        nav_id = child.get('id', '')
        onclick = child.get('onclick', '')
        sec_id = onclick.replace("scrollToSection('", "").replace("')", "") if 'scrollToSection' in onclick else nav_id.replace('nav-', '')
        
        svg = child.find('svg')
        svg_html = str(svg) if svg else ''
        
        spans = child.find_all('span')
        title = ''
        badge = ''
        badge_id = ''
        for s in spans:
            cls = s.get('class', [])
            if 'nav-badge' in cls:
                badge = s.text.strip()
                badge_id = s.get('id', '')
            else:
                title = s.text.strip()
                
        style = child.get('style', '')
        admin_only = ('display:none' in style) or (sec_id == 'users')
        
        item = {
            'id': sec_id,
            'navId': nav_id,
            'title': title,
            'badge': badge,
            'badgeId': badge_id,
            'svgHtml': svg_html,
            'adminOnly': admin_only
        }
        current_group.append(item)
    elif child.name == 'div' and 'nav-divider' in child.get('class', []):
        if current_group:
            groups.append(current_group)
            current_group = []

if current_group:
    groups.append(current_group)

print(f"Total groups: {len(groups)}")
for i, g in enumerate(groups):
    items_str = ", ".join([f"{x['id']}({x['title']})" for x in g])
    print(f"Group {i+1} ({len(g)} items): {items_str}")

with open('src/components/layout/navData.json', 'w', encoding='utf-8') as f:
    json.dump(groups, f, ensure_ascii=False, indent=2)

print("Saved successfully to src/components/layout/navData.json")
