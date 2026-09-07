import re
import sys
import json
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/aside_extracted.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's extract items and dividers in order
lines = text.splitlines()

items = []
current_group = []

for line in lines:
    if '<button class="nav-item' in line:
        sec_m = re.search(r"scrollToSection\('([^']+)'\)", line)
        id_m = re.search(r'id="([^"]+)"', line)
        title_m = re.search(r'<span data-i18n="[^"]*">(.*?)</span>', line)
        badge_m = re.search(r'<span class="nav-badge"[^>]*>(.*?)</span>', line)
        svg_m = re.search(r'<svg[^>]*>(.*?)</svg>', line)
        
        sec_id = sec_m.group(1) if sec_m else ''
        nav_id = id_m.group(1) if id_m else ''
        title = title_m.group(1) if title_m else ''
        badge = badge_m.group(1) if badge_m else ''
        svg_inner = svg_m.group(1) if svg_m else ''
        admin_only = 'display:none' in line or sec_id in ('accounts', 'ip-stats', 'users')
        
        current_group.append({
            'id': sec_id,
            'navId': nav_id,
            'title': title,
            'badge': badge,
            'svgInner': svg_inner,
            'adminOnly': admin_only
        })
    elif '<div class="nav-divider"></div>' in line:
        if current_group:
            items.append(current_group)
            current_group = []

if current_group:
    items.append(current_group)

print("Groups count:", len(items))
with open('scripts/nav_groups.json', 'w', encoding='utf-8') as out:
    json.dump(items, out, ensure_ascii=False, indent=2)
print("Saved to scripts/nav_groups.json")
