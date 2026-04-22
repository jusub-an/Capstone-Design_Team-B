import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ShoppingCart, Heart, Share2 } from 'lucide-react';
import './ProductDetail.css';

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      } else {
        console.error('Failed to fetch product');
        alert('상품을 찾을 수 없습니다.');
        navigate('/products');
      }
    } catch (error) {
      console.error('Network error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="detail-loading">Loading...</div>;
  if (!product) return null;

  return (
    <div className="product-detail-container">
      <header className="detail-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
          <span>목록으로</span>
        </button>
      </header>

      <main className="detail-content">
        <div className="detail-top">
          {/* Left: Product Image */}
          <div className="detail-image-section">
            <img 
              src={`http://localhost:8000${product.image_url}`} 
              alt={product.name} 
              className="main-product-image"
              onError={(e) => { e.target.src = 'https://via.placeholder.com/500x600?text=No+Image'; }}
            />
          </div>

          {/* Right: Product Info */}
          <div className="detail-info-section">
            <div className="info-header">
              <span className="info-category">{product.category.name}</span>
              <div className="info-actions">
                <Share2 size={20} className="action-icon" />
              </div>
            </div>
            
            <h1 className="info-name">{product.name}</h1>
            
            <div className="info-price-row">
              <span className="info-price">{product.price.toLocaleString()}</span>
              <span className="currency">원</span>
            </div>

            <div className="info-divider"></div>

            <div className="info-summary">
              <p>{product.description?.split('\n')[0] || '상품 상세 정보를 확인하세요.'}</p>
            </div>

            <div className="purchase-actions">
              <button className="btn-cart">
                <ShoppingCart size={20} />
                <span>장바구니</span>
              </button>
              <button className="btn-buy">
                바로 구매하기
              </button>
              <button className="btn-wish">
                <Heart size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom: Detailed Description */}
        <div className="detail-bottom">
          <div className="detail-tabs">
            <button className="tab-item active">상세정보</button>
            <button className="tab-item">리뷰</button>
            <button className="tab-item">Q&A</button>
          </div>

          <div className="detail-description-content">
            <h3 className="desc-title">PRODUCT INFO</h3>
            <div className="desc-text">
              {product.description?.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>

            {product.desc_image_url && (
              <div className="desc-image-wrapper">
                <img 
                  src={`http://localhost:8000${product.desc_image_url}`} 
                  alt="상세 이미지" 
                  className="desc-image"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default ProductDetail;
