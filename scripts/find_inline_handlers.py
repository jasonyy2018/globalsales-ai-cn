import sys
import re
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Match on[a-z]+="something" or on[a-z]+='something'
matches = re.findall(r'on[a-z]+\s*=\s*["\']([^"\']+)["\']', html)
funcs = set()
ignore = {'if', 'event', 'alert', 'confirm', 'console', 'e', 'this', 'Boolean', 'Number', 'String', 'encodeURIComponent', 'decodeURIComponent'}

for m in matches:
    found = re.findall(r'([a-zA-Z0-9_$]+)\s*\(', m)
    for fn in found:
        if fn not in ignore:
            funcs.add(fn)

print(f"Total inline functions found: {len(funcs)}")
sorted_funcs = sorted(list(funcs))
for fn in sorted_funcs:
    print(f"  {fn}")

with open('scripts/inline_functions.json', 'w', encoding='utf-8') as f:
    import json
    json.dump(sorted_funcs, f, indent=2)
