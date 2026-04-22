import sys
sys.path.append('c:/Users/AJS/Desktop/Project/backend')
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    res = conn.execute(text("SELECT table_name, column_name, data_default, identity_column FROM user_tab_columns WHERE table_name IN ('USERS', 'PRODUCTS')"))
    for r in res:
        print(r)
