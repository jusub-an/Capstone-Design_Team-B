from database import engine
import models
from sqlalchemy import text

def recreate_tables_with_cascade():
    with engine.connect() as conn:
        print("Dropping all existing tables for clean cascade setup...")
        # Drop in order of dependency
        table_names = ["review_images", "product_images", "wishes", "reviews", "products", "categories", "users"]
        for table in table_names:
            try:
                conn.execute(text(f"DROP TABLE {table} CASCADE CONSTRAINTS"))
                conn.commit()
                print(f"Dropped table {table}.")
            except Exception as e:
                print(f"Note during drop {table}: {e}")
                conn.rollback()
        
        print("Creating all tables with new constraints...")
        models.Base.metadata.create_all(bind=engine)
        conn.commit()
        print("All tables recreated successfully.")

if __name__ == "__main__":
    recreate_tables_with_cascade()
