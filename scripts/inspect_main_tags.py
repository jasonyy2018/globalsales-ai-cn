with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

# Let's search for <section or id="section-
matches = re.findall(r'<[^>]+id=[\'"]section-[^\'"]+[\'"][^>]*>', html)
print(f"Total id=section- matches: {len(matches)}")
for m in matches[:10]:
    print(m)

# Also check class="section
cls_matches = re.findall(r'<([a-zA-Z0-9]+)[^>]+class=[\'"][^\'"]*section[^\'"]*[\'"][^>]*>', html)
print(f"Total class=section matches: {len(cls_matches)}")
for m in cls_matches[:10]:
    print(m)
