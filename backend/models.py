from sqlalchemy import Column, Integer, String, Text, DateTime, Identity, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("email", name="uq_users_email"),
    )

    id = Column(Integer, Identity(start=1), primary_key=True)
    username = Column(String(50), nullable=False)
    email = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)

    products = relationship("Product", back_populates="owner")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("name", name="uq_categories_name"),
    )

    id = Column(Integer, Identity(start=1), primary_key=True)
    name = Column(String(100), nullable=False)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, Identity(start=1), primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    name = Column(String(200), nullable=False)
    price = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=False)
    desc_image_url = Column(String(500), nullable=True)
    owner_email = Column(String(100), ForeignKey("users.email"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("Category", back_populates="products")
    owner = relationship("User", back_populates="products")