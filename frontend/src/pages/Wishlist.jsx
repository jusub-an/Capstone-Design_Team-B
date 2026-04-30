import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Heart, ChevronLeft } from 'lucide-react';
import axios from 'axios';
import './MyReviews.css'; // Reusing styles
import './ProductList.css'; // Reusing styles

function Wishlist() {
  const [wishes, setWishes] = useState([]);
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
    <div className="wishlist-container">
          <div className="wishlist-header">
            <button onClick={() => navigate('/mypage')} className="back-btn">
              <ChevronLeft size={20} />
              <span>마이페이지</span>
            </button>
            <h1>찜한 상품</h1>
            <p>찜한 {wishes.length}개의 상품이 있습니다.</p>
          </div>
        <main className="product-main">
        {wishes.length === 0 ? (
          <div className="empty-state">
            <Heart size={48} color="#e2e8f0" style={{ marginBottom: '15px' }} />
            <p>찜한 상품이 없습니다.</p>
            <p>마음에 드는 상품을 찜해보세요!</p>
          </div>
        ) : (
          <div className="product-grid">
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
