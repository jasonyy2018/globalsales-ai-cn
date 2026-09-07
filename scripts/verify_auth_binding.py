import urllib.request

html = urllib.request.urlopen('http://localhost:8766').read().decode('utf-8')
print("Has app.js in head:", '/app.js' in html)
print("Has authLogin in DOM:", 'authLogin()' in html)
