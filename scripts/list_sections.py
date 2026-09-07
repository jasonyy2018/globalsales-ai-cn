import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

sections = re.findall(r'<section class="section[^"]*" id="(section-[^"]+)">(.*?)(?=<section class="section|</main>)', text, re.DOTALL)
for s_id, body in sections:
    h2 = re.search(r'<h2[^>]*>(.*?)</h2>', body, re.DOTALL)
    p = re.search(r'<p[^>]*>(.*?)</p>', body, re.DOTALL)
    h2_text = re.sub(r'<[^>]+>', '', h2.group(1)).strip() if h2 else ''
    p_text = re.sub(r'<[^>]+>', '', p.group(1)).strip() if p else ''
    print(f"{s_id:25} | {h2_text:25} | {p_text[:50]}...")
