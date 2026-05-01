from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Any

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class ProductImageResponse(BaseModel):
    id: int
    image_url: str
    class Config:
        from_attributes = True

class ProductSizeBase(BaseModel):
    size_name: str
    length: float | None = None
    chest: float | None = None
    sleeve: float | None = None
    neck: float | None = None
    waist: float | None = None
    thigh: float | None = None
    rise: float | None = None
    hem: float | None = None

class ProductSizeCreate(ProductSizeBase):
    pass

class ProductSizeResponse(ProductSizeBase):
    id: int
    product_id: int
    class Config:
        from_attributes = True

class ProductResponse(BaseModel):
    id: int
    name: str
    brand: str | None = None
    price: int
    description: str | None = None
    image_url: str
    desc_images: list[ProductImageResponse] = []
    sizes: list[ProductSizeResponse] = []
    owner_email: str | None = None
    category: 'CategoryResponse'
    avg_rating: float = 0.0
    review_count: int = 0
    wish_count: int = 0
    is_wished: bool = False
    class Config:
        from_attributes = True

class CategoryResponse(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str

class ReviewCreate(BaseModel):
    product_id: int
    rating: int
    comment: str
    user_email: str

class ReviewImageResponse(BaseModel):
    id: int
    image_url: str
    class Config:
        from_attributes = True

class ReviewResponse(BaseModel):
    id: int
    product_id: int
    user_email: str
    rating: int
    comment: str
    image_url: str | None = None
    images: list[ReviewImageResponse] = []
    created_at: Any | None = None
    product: 'ProductResponse'
    class Config:
        from_attributes = True

ProductResponse.model_rebuild()
ReviewResponse.model_rebuild()

class WishResponse(BaseModel):
    id: int
    user_email: str
    product_id: int
    product: ProductResponse
    class Config:
        from_attributes = True
