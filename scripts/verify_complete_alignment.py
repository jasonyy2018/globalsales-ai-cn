import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

html = urllib.request.urlopen('http://localhost:8766').read().decode('utf-8')

print("1. Menu / Sidebar Check:")
print("   - Has Logo.png:", 'Logo.png' in html)
print("   - Has 6 nav-dividers:", html.count('nav-divider') == 6)
print("   - Has nav-hotspot active:", 'nav-item active' in html and 'nav-hotspot' in html)
print("   - Has userBadge:", 'userBadge' in html)

print("\n2. Right Functional Area Check:")
print("   - Has mainContent:", 'id="mainContent"' in html)
print("   - Section count:", html.count('class="section"'))
print("   - Section Header count:", html.count('class="section-header"'))
print("   - Has topicGrid:", 'id="topicGrid"' in html)
print("   - Has statTotal & statMaxHot:", 'id="statTotal"' in html and 'id="statMaxHot"' in html)
print("   - Has searchInput:", 'id="searchInput"' in html)
print("   - Has app.js script:", '/app.js' in html)

print("\n3. Overlays & Modals Check:")
print("   - Has authGate:", 'id="authGate"' in html)
print("   - Has editorModal:", 'id="editorModal"' in html)
print("   - Has bindModal:", 'id="bindModal"' in html)
print("   - Has dashboardModal:", 'id="dashboardModal"' in html)
print("   - Has toastContainer:", 'id="toastContainer"' in html)
print("   - Has modelEditModal:", 'id="modelEditModal"' in html)
