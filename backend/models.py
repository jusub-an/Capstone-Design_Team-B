from sqlalchemy import Column, Integer, String, Text, DateTime, Identity, ForeignKey, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, Identity(start=1), primary_key=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)
    
    __table_args__ = (UniqueConstraint('email', name='ux_user_email'),)

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
    brand = Column(String(100), index=True, nullable=True)
    price = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=False)
    owner_email = Column(String(100), ForeignKey("users.email"), nullable=True)
    avg_rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    wish_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("Category", back_populates="products")
    reviews = relationship("Review", back_populates="product", cascade="all, delete-orphan")
    wishes = relationship("Wish", back_populates="product", cascade="all, delete-orphan")
    desc_images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")

class ProductImage(Base):
    __tablename__ = "product_images"
    id = Column(Integer, Identity(start=1), primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    image_url = Column(String(500), nullable=False)
    product = relationship("Product", back_populates="desc_images")

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, Identity(start=1), primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    user_email = Column(String(100), ForeignKey("users.email"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=False)
    # 기존 단일 이미지 필드는 유지하되, 다중 이미지 관계 추가
    image_url = Column(String(500), nullable=True) 
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    product = relationship("Product", back_populates="reviews")
    images = relationship("ReviewImage", back_populates="review", cascade="all, delete-orphan")

class ReviewImage(Base):
    __tablename__ = "review_images"
    id = Column(Integer, Identity(start=1), primary_key=True)
    review_id = Column(Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False)
    image_url = Column(String(500), nullable=False)
    review = relationship("Review", back_populates="images")

class Wish(Base):
    __tablename__ = "wishes"
    id = Column(Integer, Identity(start=1), primary_key=True)
    user_email = Column(String(100), ForeignKey("users.email"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    product = relationship("Product", back_populates="wishes")
    user = relationship("User")
