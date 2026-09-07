import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/legacy_script.js', 'r', encoding='utf-8') as f:
    js = f.read()

import re
# check fetch or XMLHttpRequest endpoints in js
fetches = re.findall(r'fetch\([\'"]([^\'"]+)[\'"]', js)
unique_fetches = sorted(list(set(fetches)))
print(f"Total unique fetch endpoints: {len(unique_fetches)}")
for ep in unique_fetches:
    print("  ", ep)
