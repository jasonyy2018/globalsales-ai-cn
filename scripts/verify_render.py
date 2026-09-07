import urllib.request

html = urllib.request.urlopen('http://localhost:8766').read().decode('utf-8')

print("1. Logo check:")
print("   - Has class 'logo':", 'class="logo"' in html)
print("   - Has Logo.png image:", 'Logo.png' in html)

print("2. Dividers check:")
print("   - Has 'nav-divider':", 'nav-divider' in html)
print("   - 'nav-divider' occurrences:", html.count('nav-divider'))

print("3. Active highlighting & Nav Items check:")
print("   - Has 'nav-item active':", 'nav-item active' in html)
print("   - Has 'nav-sourcing':", 'nav-sourcing' in html)
print("   - Has 'nav-hotspot':", 'nav-hotspot' in html)
print("   - Has 'nav-product':", 'nav-product' in html)
print("   - Has 'nav-article':", 'nav-article' in html)
print("   - Has 'nav-video':", 'nav-video' in html)
print("   - Total nav-item buttons:", html.count('nav-item'))

print("4. User Badge & Status check:")
print("   - Has userBadge:", 'userBadge' in html)
print("   - Has '所有服务正常运行':", '所有服务正常运行' in html)

print("5. Sections check:")
print("   - Has main-content:", 'main-content' in html)
print("   - Has section-sourcing:", 'section-sourcing' in html)
print("   - Has section-hotspot:", 'section-hotspot' in html)
print("   - Has section-video:", 'section-video' in html)
