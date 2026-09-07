import sqlite3
import hashlib
import binascii

conn = sqlite3.connect('data/app.db')
c = conn.cursor()
c.execute("SELECT username, pass_hash, salt FROM users WHERE role='admin'")
row = c.fetchone()
u, h, s = row
salt_bytes = binascii.unhexlify(s)

candidates = [
    'sunny520', 'admin', 'admin123', 'admin888', '123456', '12345678',
    'martinxie', 'martinxie123', 'martinxie520', 'password', 'root',
    'sunny', 'sunny123'
]

found = None
for cand in candidates:
    computed = hashlib.pbkdf2_hmac('sha256', cand.encode('utf-8'), salt_bytes, 200000).hex()
    if computed == h:
        found = cand
        break

print("Found password:", found)
