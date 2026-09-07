with open('scripts/style_extracted.css', 'r', encoding='utf-8') as f:
    orig_css = f.read()

header = '@import "tailwindcss";\n\n'

with open('src/app/globals.css', 'w', encoding='utf-8') as f:
    f.write(header + orig_css)

print('Updated src/app/globals.css successfully!')
