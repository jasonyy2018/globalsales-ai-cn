with open('_legacy/server.py', 'r', encoding='utf-8') as f:
    code = f.read()

import re
matches = re.findall(r'[^\n]*hashlib[^\n]*', code)
for m in matches:
    print(m)
