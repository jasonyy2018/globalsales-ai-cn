import sqlite3
conn = sqlite3.connect('data/app.db')
c = conn.cursor()
c.execute("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username='testadmin')")
c.execute("DELETE FROM user_prompts WHERE user_id IN (SELECT id FROM users WHERE username='testadmin')")
c.execute("DELETE FROM user_models WHERE user_id IN (SELECT id FROM users WHERE username='testadmin')")
c.execute("DELETE FROM users WHERE username='testadmin'")
conn.commit()
print("Cleaned up testadmin successfully.")
