from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from urllib.parse import quote_plus
import oracledb

# --- 오라클 DB 설정 ---
DB_USER = "capston"
DB_PASSWORD = "1q2w3e"
DB_HOST = "localhost"
DB_PORT = "1521"
# Mac os는 "FREEPDB1" 입력, windows는 "XE" 입력
DB_SERVICE_NAME = "FREEPDB1"

# 비밀번호 URL 인코딩
encoded_password = quote_plus(DB_PASSWORD) 

# URI 방식 사용
SQLALCHEMY_DATABASE_URL = f"oracle+oracledb://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/?service_name={DB_SERVICE_NAME}"

# SQLAlchemy 엔진 생성

try:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, echo=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    print("DB 연결을 시도할 수 없습니다 (설정값을 확인하세요):", e)
    engine = None
    SessionLocal = None

Base = declarative_base()

# DB 세션 의존성 주입
def get_db():
    if not SessionLocal:
        raise Exception("Database not configured yet. Please update the DB settings in database.py")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()