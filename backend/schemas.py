from pydantic import BaseModel, EmailStr

# 요청(Request)을 위한 스키마
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

# 응답(Response)을 위한 스키마
class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class ProductResponse(BaseModel):
    id: int
    name: str
    price: int
    description: str | None = None
    image_url: str
    desc_image_url: str | None = None
    owner_email: str | None = None
    category: 'CategoryResponse'

    class Config:
        from_attributes = True

class CategoryResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str

# Re-resolve forward references
ProductResponse.model_rebuild()
