from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
import models
import schemas
from database import engine, get_db
import os
import shutil
import uuid
import base64
import numpy as np
import cv2
from body_measure_engine import BodyMeasureEngine

_measure_engine: BodyMeasureEngine = None

def get_measure_engine() -> BodyMeasureEngine:
    global _measure_engine
    if _measure_engine is None:
        _measure_engine = BodyMeasureEngine()
    return _measure_engine

# DB 테이블 자동 생성
try:
    if engine:
        models.Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"DB Table creation error: {e}")

app = FastAPI(title="Capstone Design FastAPI", version="1.0.0")

# 서버 시작 시 초기 카테고리(상의, 바지) 생성
@app.on_event("startup")
def startup():
    get_measure_engine()
    seed_data()

def seed_data():
    from database import SessionLocal
    db = SessionLocal()
    try:
        categories = ["상의 (Top)", "바지 (Pants)"]
        for cat_name in categories:
            exists = db.query(models.Category).filter(models.Category.name == cat_name).first()
            if not exists:
                new_cat = models.Category(name=cat_name)
                db.add(new_cat)
        db.commit()
    except Exception as e:
        print(f"Seeding error: {e}")
    finally:
        db.close()

# 이미지 업로드 설정 및 정적 파일 서빙
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# CORS 설정: React 프론트엔드 도메인 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Backend API"}

# --- 사용자 인증 ---

@app.post("/api/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # MVP 수준의 구현으로 패스워드 평문 저장 (운영 시 passlib 등으로 해싱 필수)
    new_user = models.User(username=user.username, email=user.email, password=user.password)
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username or Email already registered")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

@app.post("/api/login")
def login_user(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user or db_user.password != user.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"username": db_user.username, "email": db_user.email, "access_token": "fake-jwt-token"}

# --- 신체 측정 엔진 관리 ---
_measure_engine = None

def get_measure_engine():
    global _measure_engine
    if _measure_engine is None:
        _measure_engine = BodyMeasureEngine()
    return _measure_engine

# --- 신체 측정 엔드포인트 ---
@app.post("/api/measure")
async def measure_body(
    image: UploadFile = File(...),
    height_cm: float = Form(...),
):
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image_bgr is None:
        raise HTTPException(status_code=400, detail="이미지를 읽을 수 없습니다.")

    try:
        engine = get_measure_engine()
        # rembg(u2net) CPU 추론이 동기 블로킹이므로 스레드풀에서 실행
        result = await run_in_threadpool(engine.analyze, image_bgr, height_cm)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류 발생: {str(e)}")

    def _encode(img):
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buf).decode("utf-8")

    return {
        "pose_valid":              result["pose_valid"],
        "warnings":                result["warnings"],
        "measurements":            result["measurements"],
        "cm_per_pixel":            result["cm_per_pixel"],
        "debug_image_base64":      _encode(result["debug_image"]),
        "person_extracted_base64": _encode(result["person_extracted"]),
        "gray_mask_base64":        _encode(result["gray_mask"]),
    }



# --- 상품 및 통계 관리 ---

# 리뷰/찜 변경 시 상품의 평균 별점과 카운트 동기화
def update_product_stats(product_id: int, db: Session):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if product:
        reviews = product.reviews
        if reviews:
            product.avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 1)
            product.review_count = len(reviews)
        else:
            product.avg_rating = 0.0
            product.review_count = 0
        product.wish_count = db.query(models.Wish).filter(models.Wish.product_id == product_id).count()
        db.commit()

@app.get("/api/products", response_model=list[schemas.ProductResponse])
def get_products(user_email: str = None, db: Session = Depends(get_db)):
    products = db.query(models.Product).order_by(models.Product.id.desc()).all()
    results = []
    for p in products:
        item = schemas.ProductResponse.from_orm(p)
        if user_email:
            item.is_wished = db.query(models.Wish).filter(models.Wish.product_id == p.id, models.Wish.user_email == user_email).first() is not None
        results.append(item)
    return results

@app.get("/api/products/{product_id}", response_model=schemas.ProductResponse)
def get_product_detail(product_id: int, user_email: str = None, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    item = schemas.ProductResponse.from_orm(product)
    if user_email:
        item.is_wished = db.query(models.Wish).filter(models.Wish.product_id == product.id, models.Wish.user_email == user_email).first() is not None
    return item

@app.post("/api/products", response_model=schemas.ProductResponse)
def create_product(
    category_id: int = Form(...), name: str = Form(...), brand: str = Form(...), price: int = Form(...),
    description: Optional[str] = Form(None), image: UploadFile = File(...), desc_images: List[UploadFile] = File([]),
    owner_email: str = Form(...), db: Session = Depends(get_db)
):
    try:
        # 메인 이미지 저장
        file_ext = image.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4().hex}.{file_ext}"
        image_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = f"/{UPLOAD_DIR}/{unique_filename}"
        
        new_product = models.Product(
            category_id=category_id, name=name, brand=brand, price=price, description=description,
            image_url=image_url, owner_email=owner_email
        )
        db.add(new_product)
        # Flush to get ID without committing yet
        db.flush()

        # 상세 이미지 다중 저장
        if desc_images:
            for d_img in desc_images:
                if d_img and d_img.filename:
                    d_img.file.seek(0)
                    d_file_ext = d_img.filename.split(".")[-1]
                    d_unique_filename = f"{uuid.uuid4().hex}.{d_file_ext}"
                    d_image_path = os.path.join(UPLOAD_DIR, d_unique_filename)
                    with open(d_image_path, "wb") as buffer:
                        shutil.copyfileobj(d_img.file, buffer)
                    new_img = models.ProductImage(product_id=new_product.id, image_url=f"/{UPLOAD_DIR}/{d_unique_filename}")
                    db.add(new_img)
        
        db.commit()
        db.refresh(new_product)
        return new_product
    except Exception as e:
        db.rollback()
        print(f"ERROR creating product: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create product: {str(e)}")

@app.put("/api/products/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int, category_id: int = Form(...), name: str = Form(...), brand: str = Form(...), price: int = Form(...),
    description: Optional[str] = Form(None), image: UploadFile = File(None), desc_images: List[UploadFile] = File([]),
    owner_email: str = Form(...), db: Session = Depends(get_db)
):
    db_product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not db_product or db_product.owner_email != owner_email:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    db_product.category_id = category_id
    db_product.name = name
    db_product.brand = brand
    db_product.price = price
    db_product.description = description
    
    if image and image.filename:
        file_ext = image.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4().hex}.{file_ext}"
        with open(os.path.join(UPLOAD_DIR, unique_filename), "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        db_product.image_url = f"/{UPLOAD_DIR}/{unique_filename}"
        
    if desc_images:
        db.query(models.ProductImage).filter(models.ProductImage.product_id == product_id).delete()
        for d_img in desc_images:
            if d_img and d_img.filename:
                d_img.file.seek(0)
                d_file_ext = d_img.filename.split(".")[-1]
                d_unique_filename = f"{uuid.uuid4().hex}.{d_file_ext}"
                with open(os.path.join(UPLOAD_DIR, d_unique_filename), "wb") as buffer:
                    shutil.copyfileobj(d_img.file, buffer)
                new_img = models.ProductImage(product_id=product_id, image_url=f"/{UPLOAD_DIR}/{d_unique_filename}")
                db.add(new_img)
        
    db.commit()
    db.refresh(db_product)
    return db_product

@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, owner_email: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product or product.owner_email != owner_email:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    db.delete(product)
    db.commit()
    return {"message": "Deleted"}

# --- 찜(Wish) ---

@app.post("/api/wishes/toggle")
def toggle_wish(product_id: int = Form(...), user_email: str = Form(...), db: Session = Depends(get_db)):
    existing = db.query(models.Wish).filter(models.Wish.product_id == product_id, models.Wish.user_email == user_email).first()
    if existing:
        db.delete(existing)
        db.commit()
        update_product_stats(product_id, db)
        return {"status": "removed"}
    else:
        db.add(models.Wish(product_id=product_id, user_email=user_email))
        db.commit()
        update_product_stats(product_id, db)
        return {"status": "added"}

@app.get("/api/wishes/{user_email}", response_model=list[schemas.WishResponse])
def get_user_wishes(user_email: str, db: Session = Depends(get_db)):
    wishes = db.query(models.Wish).filter(models.Wish.user_email == user_email).all()
    results = []
    for w in wishes:
        p_item = schemas.ProductResponse.from_orm(w.product)
        p_item.is_wished = True
        results.append({"id": w.id, "user_email": w.user_email, "product_id": w.product_id, "product": p_item})
    return results

# --- 리뷰(Review) ---

@app.post("/api/reviews", response_model=schemas.ReviewResponse)
def create_review(
    product_id: int = Form(...), user_email: str = Form(...), rating: int = Form(...),
    comment: str = Form(...), images: List[UploadFile] = File([]), db: Session = Depends(get_db)
):
    try:
        new_review = models.Review(product_id=product_id, user_email=user_email, rating=rating, comment=comment)
        db.add(new_review)
        db.flush()

        if images:
            for img in images:
                if img and img.filename:
                    img.file.seek(0)
                    file_ext = img.filename.split(".")[-1]
                    unique_filename = f"review_{uuid.uuid4().hex}.{file_ext}"
                    with open(os.path.join(UPLOAD_DIR, unique_filename), "wb") as buffer:
                        shutil.copyfileobj(img.file, buffer)
                    
                    new_img = models.ReviewImage(review_id=new_review.id, image_url=f"/{UPLOAD_DIR}/{unique_filename}")
                    db.add(new_img)
                    
                    # 호환성을 위해 첫 번째 이미지를 메인 image_url에 저장
                    if not new_review.image_url:
                        new_review.image_url = f"/{UPLOAD_DIR}/{unique_filename}"

        db.commit()
        db.refresh(new_review)
        update_product_stats(product_id, db)
        return new_review
    except Exception as e:
        db.rollback()
        print(f"Error creating review: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reviews/{review_id}", response_model=schemas.ReviewResponse)
def get_review_detail(review_id: int, db: Session = Depends(get_db)):
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return review

@app.put("/api/reviews/{review_id}", response_model=schemas.ReviewResponse)
def update_review(
    review_id: int, rating: int = Form(...), comment: str = Form(...),
    images: List[UploadFile] = File([]), user_email: str = Form(...), db: Session = Depends(get_db)
):
    db_review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not db_review or db_review.user_email != user_email:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    db_review.rating = rating
    db_review.comment = comment

    if images:
        # 기존 이미지 기록 삭제
        db.query(models.ReviewImage).filter(models.ReviewImage.review_id == review_id).delete()
        db_review.image_url = None # 초기화
        
        for img in images:
            if img and img.filename:
                img.file.seek(0)
                file_ext = img.filename.split(".")[-1]
                unique_filename = f"review_{uuid.uuid4().hex}.{file_ext}"
                with open(os.path.join(UPLOAD_DIR, unique_filename), "wb") as buffer:
                    shutil.copyfileobj(img.file, buffer)
                
                new_img = models.ReviewImage(review_id=review_id, image_url=f"/{UPLOAD_DIR}/{unique_filename}")
                db.add(new_img)
                
                if not db_review.image_url:
                    db_review.image_url = f"/{UPLOAD_DIR}/{unique_filename}"
        
    db.commit()
    db.refresh(db_review)
    update_product_stats(db_review.product_id, db)
    return db_review

@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: int, user_email: str, db: Session = Depends(get_db)):
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review or review.user_email != user_email:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    product_id = review.product_id
    db.delete(review)
    db.commit()
    update_product_stats(product_id, db)
    return {"message": "Deleted"}

@app.get("/api/reviews/user/{email}", response_model=list[schemas.ReviewResponse])
def get_user_reviews(email: str, db: Session = Depends(get_db)):
    return db.query(models.Review).options(joinedload(models.Review.images), joinedload(models.Review.product)).filter(models.Review.user_email == email).order_by(models.Review.created_at.desc()).all()

@app.get("/api/products/{product_id}/reviews", response_model=list[schemas.ReviewResponse])
def get_product_reviews(product_id: int, db: Session = Depends(get_db)):
    return db.query(models.Review).options(joinedload(models.Review.images), joinedload(models.Review.product)).filter(models.Review.product_id == product_id).order_by(models.Review.created_at.desc()).all()

@app.get("/api/categories", response_model=list[schemas.CategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    return db.query(models.Category).all()

@app.get("/api/products/user/{email}", response_model=list[schemas.ProductResponse])
def get_user_products(email: str, db: Session = Depends(get_db)):
    return db.query(models.Product).filter(models.Product.owner_email == email).order_by(models.Product.id.desc()).all()
