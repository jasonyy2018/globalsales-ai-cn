with open('_legacy/server.py', 'r', encoding='utf-8') as f:
    code = f.read()

import re
pos = code.find('def _hash_password')
if pos != -1:
    print(code[pos:pos+500])

pos2 = code.find('def _verify_password')
if pos2 != -1:
    print(code[pos2:pos2+500])
