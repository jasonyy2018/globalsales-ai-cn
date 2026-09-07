import urllib.request

html = urllib.request.urlopen('http://localhost:8766').read().decode('utf-8')
print("Has 'SECTION 0: 选品':", 'SECTION 0: 选品' in html)
print("Has '链条上游：先定卖什么':", '链条上游：先定卖什么' in html)
print("Section count in HTML:", html.count('class="section"'))
