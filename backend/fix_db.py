from database import engine
from sqlalchemy import text

def add_column():
    print("Checking and adding missing columns...")
    with engine.connect() as conn:
        try:
            conn.execute(text('ALTER TABLE products ADD (owner_email VARCHAR2(100))'))
            conn.commit()
            print("Successfully added owner_email column to products table.")
        except Exception as e:
            print(f"Error or column already exists: {e}")
            
        try:
            # Also ensure users.email has a unique constraint if we use it as a FK
            # But users.email is already unique in models.py
            pass
        except Exception as e:
            print(f"Error checking users table: {e}")

if __name__ == "__main__":
    add_column()
