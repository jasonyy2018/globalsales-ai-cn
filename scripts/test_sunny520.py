import sqlite3
import hashlib

conn = sqlite3.connect('data/app.db')
c = conn.cursor()
c.execute("SELECT username, pass_hash, salt FROM users WHERE role='admin'")
row = c.fetchone()
u, h, s = row

computed = hashlib.pbkdf2_hmac('sha256', 'sunny520'.encode('utf-8'), s.encode('utf-8'), 200000).hex()
print('Admin username:', u)
print('Password sunny520 matches:', computed == h)
