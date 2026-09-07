import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('_legacy/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

aside_match = re.search(r'<aside class="sidebar">(.*?)</aside>', text, re.DOTALL)
if aside_match:
    with open('scripts/aside_extracted.html', 'w', encoding='utf-8') as out:
        out.write(aside_match.group(1))
    print("Extracted aside to scripts/aside_extracted.html, size:", len(aside_match.group(1)))

# Extract CSS style block
style_match = re.search(r'<style>(.*?)</style>', text, re.DOTALL)
if style_match:
    style_content = style_match.group(1)
    with open('scripts/style_extracted.css', 'w', encoding='utf-8') as out:
        out.write(style_content)
    print("Extracted style to scripts/style_extracted.css, size:", len(style_content))
