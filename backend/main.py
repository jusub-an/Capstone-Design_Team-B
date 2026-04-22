from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import models
import schemas
from database import engine, get_db
import os
import shutil
import uuid

# 테이블 생성
try:
    if engine:
        models.Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"DB Table creation error: {e}")

app = FastAPI(title="Capstone Design FastAPI", description="Backend APIs for Capstone", version="1.0.0")

# --- 초기 데이터 시딩 (카테고리) ---
@app.on_event("startup")
def seed_data():
    from database import SessionLocal
    db = SessionLocal()
    try:
        # 상의(Top), 바지(Pants) 초기 생성
        categories = ["상의 (Top)", "바지 (Pants)"]
        for cat_name in categories:
            exists = db.query(models.Category).filter(models.Category.name == cat_name).first()
            if not exists:
                new_cat = models.Category(name=cat_name)
                db.add(new_cat)
        db.commit()
        print("Initial categories seeded.")
    except Exception as e:
        print(f"Seeding error: {e}")
    finally:
        db.close()

# Uploads directory setup
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# CORS 설정 (React 프론트엔드가 접근할 수 있도록 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ], # React 서버 주소
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Backend API"}

# --- 회원가입 엔드포인트 ---
@app.post("/api/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # 보안을 위해 원래 패스워드는 해싱해야 하지만, MVP 형태이므로 평문 혹은 단순 저장 구조
    # 실제로는 passlib 활용하여 hashing 로직 삽입 권장
    new_user = models.User(
        username=user.username,
        email=user.email,
        password=user.password 
    )
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or Email already registered"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection failed or other internal error"
        )

# --- 로그인 엔드포인트 ---
@app.post("/api/login")
def login_user(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # 단순 문자열 비교 (보안상 취약하지만 구현 단순화를 목적)
    if db_user.password != user.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
        
    return {"access_token": "fake-jwt-token-for-mvp", "token_type": "bearer", "username": db_user.username, "email": db_user.email}

# --- 카테고리 관련 엔드포인트 ---
@app.get("/api/categories", response_model=list[schemas.CategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    return db.query(models.Category).all()

# --- 상품 관련 엔드포인트 ---
@app.get("/api/products", response_model=list[schemas.ProductResponse])
def get_products(db: Session = Depends(get_db)):
    products = db.query(models.Product).order_by(models.Product.id.desc()).all()
    return products

@app.post("/api/products", response_model=schemas.ProductResponse)
def create_product(
    category_id: int = Form(...),
    name: str = Form(...),
    price: int = Form(...),
    description: str = Form(""),
    image: UploadFile = File(...),
    desc_image: UploadFile = File(None),
    owner_email: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        # Check if category exists
        cat = db.query(models.Category).filter(models.Category.id == category_id).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Invalid category ID")

        # Save main image
        file_ext = image.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4().hex}.{file_ext}"
        image_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = f"/{UPLOAD_DIR}/{unique_filename}"
        
        # Save optional description image
        desc_image_url = None
        if desc_image and desc_image.filename:
            d_file_ext = desc_image.filename.split(".")[-1]
            d_unique_filename = f"{uuid.uuid4().hex}.{d_file_ext}"
            d_image_path = os.path.join(UPLOAD_DIR, d_unique_filename)
            with open(d_image_path, "wb") as buffer:
                shutil.copyfileobj(desc_image.file, buffer)
            desc_image_url = f"/{UPLOAD_DIR}/{d_unique_filename}"
            
        new_product = models.Product(
            category_id=category_id,
            name=name,
            price=price,
            description=description,
            image_url=image_url,
            desc_image_url=desc_image_url,
            owner_email=owner_email
        )
        db.add(new_product)
        db.commit()
        db.refresh(new_product)
        return new_product
    except Exception as e:
        db.rollback()
        print(f"Error saving product: {e}")
        raise HTTPException(status_code=500, detail="Failed to create product")

# --- 추가된 상품 관련 엔드포인트 ---

@app.get("/api/products/user/{email}", response_model=list[schemas.ProductResponse])
def get_user_products(email: str, db: Session = Depends(get_db)):
    products = db.query(models.Product).filter(models.Product.owner_email == email).order_by(models.Product.id.desc()).all()
    return products

@app.get("/api/products/{product_id}", response_model=schemas.ProductResponse)
def get_product_detail(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, owner_email: str, db: Session = Depends(get_db)):
    print(f"DEBUG: Deletion request for ID {product_id} by {owner_email}")
    
    # Check if product exists and belongs to user
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    
    if not product:
        print(f"DEBUG: Product {product_id} not found")
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")
    
    # Trim for comparison just in case
    db_owner = product.owner_email.strip() if product.owner_email else None
    req_owner = owner_email.strip()
    
    if db_owner != req_owner:
        print(f"DEBUG: Permission denied. DB Owner: '{db_owner}', Req Owner: '{req_owner}'")
        raise HTTPException(status_code=403, detail="본인이 등록한 상품만 삭제할 수 있습니다.")
    
    try:
        # Use query-level delete for direct DB impact
        num_deleted = db.query(models.Product).filter(models.Product.id == product_id).delete()
        db.commit()
        print(f"DEBUG: Successfully deleted {num_deleted} row(s) for ID {product_id}")
        
        if num_deleted == 0:
            return {"message": "No rows were deleted", "status": "warning"}
            
        return {"message": "Product deleted successfully"}
    except Exception as e:
        db.rollback()
        print(f"DEBUG: DB Error during deletion: {e}")
        raise HTTPException(status_code=500, detail=f"데이터베이스 삭제 중 오류 발생: {str(e)}")

@app.put("/api/products/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int,
    category_id: int = Form(...),
    name: str = Form(...),
    price: int = Form(...),
    description: str = Form(""),
    image: UploadFile = File(None),
    desc_image: UploadFile = File(None),
    owner_email: str = Form(...),
    db: Session = Depends(get_db)
):
    db_product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if db_product.owner_email != owner_email:
        raise HTTPException(status_code=403, detail="Not authorized to update this product")
    
    # Update fields
    db_product.category_id = category_id
    db_product.name = name
    db_product.price = price
    db_product.description = description
    
    # Save new images if provided
    if image and image.filename:
        file_ext = image.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4().hex}.{file_ext}"
        image_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        db_product.image_url = f"/{UPLOAD_DIR}/{unique_filename}"
        
    if desc_image and desc_image.filename:
        d_file_ext = desc_image.filename.split(".")[-1]
        d_unique_filename = f"{uuid.uuid4().hex}.{d_file_ext}"
        d_image_path = os.path.join(UPLOAD_DIR, d_unique_filename)
        with open(d_image_path, "wb") as buffer:
            shutil.copyfileobj(desc_image.file, buffer)
        db_product.desc_image_url = f"/{UPLOAD_DIR}/{d_unique_filename}"
        
    db.commit()
    db.refresh(db_product)
    return db_product
