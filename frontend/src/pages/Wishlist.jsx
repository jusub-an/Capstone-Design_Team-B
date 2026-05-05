import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Heart, ChevronLeft, Search, ShoppingBag } from 'lucide-react';
import axios from 'axios';
import './MyReviews.css'; // Reusing styles
import './ProductList.css'; // Reusing styles

function Wishlist() {
  const [wishes, setWishes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const isLoggedIn = !!sessionStorage.getItem('token');
  const userEmail = sessionStorage.getItem('userEmail');
  const username = sessionStorage.getItem('username') || 'User';

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    fetchWishes();
  }, [isLoggedIn]);

  const fetchWishes = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/wishes/${userEmail}`);
      setWishes(response.data);
    } catch (error) {
      console.error('Failed to fetch wishlist:', error);
    }
  };

  const handleToggleWish = async (e, productId) => {
    e.stopPropagation();
    const formData = new FormData();
    formData.append('product_id', productId);
    formData.append('user_email', userEmail);

    try {
      await axios.post('http://localhost:8000/api/wishes/toggle', formData);
      fetchWishes(); // Refresh
    } catch (error) {
      console.error('Error toggling wish:', error);
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
        <div className="logo-section" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <h2>Virtual Fitting</h2>
        </div>


        <div className="header-actions">
          <button className="action-icon-btn" onClick={() => navigate('/mypage/wishes')}>
            <Heart size={22} />
          </button>
          <button className="action-icon-btn">
            <ShoppingBag size={22} />
            <span className="badge">0</span>
          </button>

          {isLoggedIn ? (
            <div className="user-profile-wrapper">
              <div className="user-avatar" title="User Profile">
                {username.charAt(0).toUpperCase()}
              </div>
              <div className="dropdown-menu">
                <ul>
                  <li onClick={() => navigate('/mypage')}>마이페이지</li>
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
        <div className="my-reviews-header">
          <button onClick={() => navigate('/mypage')} className="back-btn">
            <ChevronLeft size={20} />
            <span>마이페이지</span>
          </button>
          <h1>찜한 상품</h1>
          <p>{wishes.length}개의 찜한 상품이 있습니다.</p>
        </div>

        {wishes.length === 0 ? (
          <div className="empty-state">
            <Heart size={48} color="#e2e8f0" style={{ marginBottom: '15px' }} />
            <p>찜한 상품이 없습니다.</p>
            <p>마음에 드는 상품을 찜해보세요!</p>
          </div>
        ) : (
          <div className="product-grid wishlist-grid">
            {wishes.map((wish) => {
              const product = wish.product;
              return (
                <div key={product.id} className="product-card" onClick={() => navigate(`/products/${product.id}`)}>
                  <div className="product-image-container">
                    <img
                      src={`http://localhost:8000${product.image_url}`}
                      alt={product.name}
                      className="product-image"
                      onError={(e) => { e.target.src = 'https://via.placeholder.com/300x400?text=No+Image'; }}
                    />
                    <button
                      className="wish-button wished"
                      onClick={(e) => handleToggleWish(e, product.id)}
                    >
                      <Heart size={20} fill="#ff4d4f" color="#ff4d4f" />
                    </button>
                  </div>
                  <div className="product-info">
                    <span className="product-category">{product.category.name}</span>
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
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default Wishlist;
