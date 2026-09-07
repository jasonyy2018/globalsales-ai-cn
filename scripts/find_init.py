import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/legacy_script.js', 'r', encoding='utf-8') as f:
    js = f.read()

import re
pos = js.rfind('function init(')
if pos != -1:
    print(js[pos:pos+2000])
else:
    print("function init( not found directly")
