import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/inline_functions.json', 'r', encoding='utf-8') as f:
    funcs = json.load(f)

with open('public/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Generate window bindings
binding_lines = ["\n\n// ============ 显式导出所有全局方法至 window 作用域，确保内联 onclick 100% 可用 ============"]
for fn in funcs:
    binding_lines.append(f"if (typeof {fn} === 'function') window.{fn} = {fn};")

binding_code = "\n".join(binding_lines) + "\n"

# Check if already appended
if "window.authLogin = authLogin" not in code:
    code += binding_code
    with open('public/app.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print(f"Appended {len(funcs)} window bindings to public/app.js successfully!")
else:
    print("Window bindings already present in public/app.js")
