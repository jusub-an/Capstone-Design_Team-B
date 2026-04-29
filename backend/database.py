from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from urllib.parse import quote_plus
import oracledb

# --- 오라클 DB 설정 (사용자가 실제 값으로 변경할 부분) ---
DB_USER = "C##CAPSTON"
DB_PASSWORD = "1q2w3e"
DB_HOST = "localhost"
DB_PORT = "1521"
DB_SERVICE_NAME = "XE" # 혹은 orel 등의 SID 나 서비스 이름

# Python의 oracledb를 SQLAlchemy 로 사용하기 위한 설정
# 비밀번호에 특수문자가 있을 수 있으므로 quote_plus 사용권장
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

# DB 세션을 가져오기 위한 의존성 주입 함수
def get_db():
    if not SessionLocal:
        raise Exception("Database not configured yet. Please update the DB settings in database.py")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
