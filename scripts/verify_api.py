import urllib.request
import json

base = "http://localhost:8766"

endpoints = [
    "/api/auth/me",
    "/api/data/models",
    "/api/data/prompts",
    "/api/data/assets",
    "/api/data/module_defaults",
    "/api/data/accounts"
]

for ep in endpoints:
    try:
        req = urllib.request.urlopen(base + ep)
        data = json.loads(req.read().decode('utf-8'))
        print(f"[PASS] {ep}: HTTP {req.status} | Data size: {len(data) if isinstance(data, list) else len(str(data))}")
    except Exception as e:
        print(f"[FAIL] {ep}: {e}")
