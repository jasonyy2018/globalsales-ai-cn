import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

aside_match = re.search(r'(<aside class="sidebar">.*?</aside>)', text, re.DOTALL)
if aside_match:
    print("=== ASIDE HTML ===")
    print(aside_match.group(1))

print("\n=== CSS FOR SIDEBAR & NAV-ITEM ===")
css_matches = re.findall(r'(\.[a-zA-Z0-9_-]*(?:sidebar|nav-item|nav-divider|nav-badge|nav-icon|logo)[^\{]*\{[^\}]*\})', text)
for c in css_matches:
    print(c)
