from sqlalchemy import Column, Integer, String, Text, DateTime, Identity, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False) # 저장 시에는 해시된 값을 넣는 것을 권장합니다.

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, Identity(start=1), primary_key=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    
    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, Identity(start=1), primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    name = Column(String(200), index=True, nullable=False)
    price = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=False)
    desc_image_url = Column(String(500), nullable=True)
    owner_email = Column(String(100), ForeignKey("users.email"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("Category", back_populates="products")
