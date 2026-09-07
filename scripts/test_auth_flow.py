import urllib.request
import json
import http.cookiejar

cookie_jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

# 1. Login with testadmin
login_url = "http://localhost:8766/api/auth/login"
login_payload = json.dumps({"username": "testadmin", "password": "password123"}).encode('utf-8')
req = urllib.request.Request(login_url, data=login_payload, headers={"Content-Type": "application/json"})

resp = opener.open(req)
print("1. Login response:", resp.status, resp.read().decode('utf-8'))

# 2. Check cookies stored
for cookie in cookie_jar:
    print(f"Cookie received: {cookie.name} = {cookie.value[:10]}...")

# 3. Call /api/auth/me
me_url = "http://localhost:8766/api/auth/me"
req_me = urllib.request.Request(me_url)
resp_me = opener.open(req_me)
print("2. /api/auth/me:", resp_me.status, resp_me.read().decode('utf-8'))

# 4. Call /api/data/assets
assets_url = "http://localhost:8766/api/data/assets"
req_assets = urllib.request.Request(assets_url)
resp_assets = opener.open(req_assets)
print("3. /api/data/assets:", resp_assets.status, resp_assets.read().decode('utf-8'))

# 5. Call /api/data/models
models_url = "http://localhost:8766/api/data/models"
req_models = urllib.request.Request(models_url)
resp_models = opener.open(req_models)
print("4. /api/data/models:", resp_models.status, "Length:", len(json.loads(resp_models.read().decode('utf-8'))))
