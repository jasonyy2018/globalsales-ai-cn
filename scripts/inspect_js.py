import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/legacy_script.js', 'r', encoding='utf-8') as f:
    js = f.read()

print(f"Total JS length: {len(js)}")
print("First 1000 chars:")
print(js[:1000])

print("\nLast 1000 chars:")
print(js[-1000:])
