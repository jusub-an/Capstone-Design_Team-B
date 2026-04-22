import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductList.css';

function ProductList() {
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();
  // 사용자명은 localStorage 등에서 가져온다고 가정
  const username = sessionStorage.getItem('username') || 'User';

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        console.error('Failed to fetch products');
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  return (
    <div className="product-list-container">
      {/* Header */}
      <header className="product-header">
        <div className="logo-section">
          <h2>Virtual Fitting</h2>
        </div>
        
        <div className="header-actions">

          <div className="user-profile-wrapper">
            <div className="user-avatar" title="사용자 프로필">
              {username.charAt(0).toUpperCase()}
            </div>
            {/* 드롭다운 메뉴 (호버 시 표시) */}
            <div className="dropdown-menu">
              <ul>
                <li onClick={() => navigate('/mypage')}>마이페이지</li>
                <li onClick={() => alert('내 아바타 구현 예정')}>내 아바타</li>
                <li onClick={handleLogout} className="logout-action">로그아웃</li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="product-main">
        <h3 className="section-title">상품 목록</h3>
        
        {products.length === 0 ? (
          <div className="empty-state">
            <p>등록된 상품이 없습니다.</p>
            <p>첫 번째 상품을 등록해보세요!</p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <div key={product.id} className="product-card" onClick={() => navigate(`/products/${product.id}`)}>
                <div className="product-image-container">
                  {/* http://localhost:8000 은 백엔드 주소 */}
                  <img 
                    src={`http://localhost:8000${product.image_url}`} 
                    alt={product.name} 
                    className="product-image" 
                    onError={(e) => { e.target.src = 'https://via.placeholder.com/250x300?text=No+Image'; }}
                  />
                </div>
                <div className="product-info">
                  <span className="product-category">{product.category.name}</span>
                  <h4 className="product-name">{product.name}</h4>
                  <p className="product-price">
                    {product.price.toLocaleString()} 원
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default ProductList;
