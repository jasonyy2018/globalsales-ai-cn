import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/aside_extracted.html', 'r', encoding='utf-8') as f:
    text = f.read()

items = re.findall(r'<button class="nav-item[^"]*" onclick="scrollToSection\(\'([^\']+)\'\)" id="([^"]+)"([^>]*)>(.*?)</button>', text, re.DOTALL)
print(f"Total nav items found: {len(items)}")

for section_id, nav_id, extra_attrs, inner in items:
    svg_m = re.search(r'(<svg.*?</svg>)', inner, re.DOTALL)
    title_m = re.search(r'<span data-i18n="[^"]*">(.*?)</span>', inner)
    badge_m = re.search(r'<span class="nav-badge"[^>]*>(.*?)</span>', inner)
    
    svg = svg_m.group(1) if svg_m else ''
    title = title_m.group(1) if title_m else ''
    badge = badge_m.group(1) if badge_m else ''
    is_admin = 'display:none' in extra_attrs or section_id in ('accounts', 'ip-stats', 'users')
    
    print(f"ID: {section_id} | NavID: {nav_id} | Title: {title} | Badge: {badge} | Admin: {is_admin}")
