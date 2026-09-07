import re

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('API_ROUTES = {')
end = content.find('}', start + 1)
# find full dict
brace_count = 0
for i in range(start, len(content)):
    if content[i] == '{':
        brace_count += 1
    elif content[i] == '}':
        brace_count -= 1
        if brace_count == 0:
            end = i + 1
            break

routes_block = content[start:end]

# Extract each route
for m in re.finditer(r"'(/(?:api)/[a-zA-Z0-9_]+)':\s*\{([^}]+)\}", routes_block, re.DOTALL):
    route_name = m.group(1)
    body = m.group(2)
    url_m = re.search(r"'url':\s*'([^']+)'", body)
    method_m = re.search(r"'method':\s*'([^']+)'", body)
    auth_m = re.search(r"'auth_type':\s*'([^']+)'", body)
    key_m = re.search(r"'auth_key':\s*([A-Za-z0-9_]+)", body)
    url = url_m.group(1) if url_m else ''
    method = method_m.group(1) if method_m else 'POST'
    key = key_m.group(1) if key_m else ''
    auth = auth_m.group(1) if auth_m else ''
    print(f"{route_name:30} | {method:6} | {auth:10} | {key:22} | {url}")
