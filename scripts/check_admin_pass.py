import sqlite3
import hashlib
import binascii

conn = sqlite3.connect('data/app.db')
c = conn.cursor()
c.execute("SELECT username, pass_hash, salt FROM users WHERE role='admin'")
row = c.fetchone()
if row:
    u, h, s = row
    salt_bytes = binascii.unhexlify(s)
    computed = hashlib.pbkdf2_hmac('sha256', 'sunny520'.encode('utf-8'), salt_bytes, 200000).hex()
    print('Admin username:', u)
    print('Password sunny520 matches:', computed == h)
