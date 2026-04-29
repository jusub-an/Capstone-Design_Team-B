import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Heart } from 'lucide-react';
import './ProductList.css';
import axios from 'axios';

function ProductList() {
  const [products, setProducts] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(!!sessionStorage.getItem('token'));
  const navigate = useNavigate();
  const username = sessionStorage.getItem('username') || 'User';

  useEffect(() => {
    setIsLoggedIn(!!sessionStorage.getItem('token'));
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const userEmail = sessionStorage.getItem('userEmail');
      const url = userEmail
        ? `http://localhost:8000/api/products?user_email=${userEmail}`
        : 'http://localhost:8000/api/products';

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  const handleToggleWish = async (e, productId) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      alert('로그인이 필요한 서비스입니다.');
      navigate('/login');
      return;
    }

    const userEmail = sessionStorage.getItem('userEmail');

    // Optimistic Update: Update UI immediately for better UX
    setProducts(prevProducts =>
      prevProducts.map(p =>
        p.id === productId
          ? { ...p, is_wished: !p.is_wished, wish_count: p.is_wished ? p.wish_count - 1 : p.wish_count + 1 }
          : p
      )
    );

    const formData = new FormData();
    formData.append('product_id', productId);
    formData.append('user_email', userEmail);

    try {
      await axios.post('http://localhost:8000/api/wishes/toggle', formData);
    } catch (error) {
      console.error('Error toggling wish:', error);
      fetchProducts(); // Rollback on error
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
      <header className="product-header">
        <div className="logo-section">
          <h2>Virtual Fitting</h2>
        </div>

        <div className="header-actions">
          {isLoggedIn ? (
            <div className="user-profile-wrapper">
              <div className="user-avatar" title="User Profile">
                {username.charAt(0).toUpperCase()}
              </div>
              <div className="dropdown-menu">
                <ul>
                  <li onClick={() => navigate('/mypage')}>마이페이지</li>
                  <li onClick={() => navigate('/mypage/body-measure')}>내 아바타</li>
                  <li onClick={handleLogout} className="logout-action">로그아웃</li>
                </ul>
              </div>
            </div>
          ) : (
            <button className="login-header-button" onClick={() => navigate('/login')}>로그인</button>
          )}
        </div>
      </header>

      <main className="product-main">
        <h3 className="section-title">상품 목록</h3>

        {products.length === 0 ? (
          <div className="empty-state">
            <p>등록된 상품이 없습니다.</p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <div key={product.id} className="product-card" onClick={() => navigate(`/products/${product.id}`)}>
                <div className="product-image-container">
                  <img
                    src={`http://localhost:8000${product.image_url}`}
                    alt={product.name}
                    className="product-image"
                    onError={(e) => { e.target.src = 'https://via.placeholder.com/300x400?text=No+Image'; }}
                  />
                  <button
                    className={`wish-button ${product.is_wished ? 'wished' : ''}`}
                    onClick={(e) => handleToggleWish(e, product.id)}
                  >
                    <Heart size={20} fill={product.is_wished ? "#ff4d4f" : "none"} color={product.is_wished ? "#ff4d4f" : "white"} />
                  </button>
                </div>
                <div className="product-info">
                  <div className="category-brand-row">
                    {product.brand && <span className="product-brand">{product.brand}</span>}
                    <span className="product-category">{product.category.name}</span>
                  </div>
                  <h4 className="product-name">{product.name}</h4>
                  <div className="product-price-row">
                    <p className="product-price">{product.price.toLocaleString()}원</p>
                  </div>
                  <div className="product-stats">
                    <div className="stat-item rating">
                      <Star size={14} fill="#ffc107" color="#ffc107" />
                      <span>{product.avg_rating || 0}</span>
                      <span className="stat-count">({product.review_count || 0})</span>
                    </div>
                    <div className="stat-item wish">
                      <Heart size={14} fill="#ff4d4f" color="#ff4d4f" />
                      <span>{product.wish_count || 0}</span>
                    </div>
                  </div>
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
