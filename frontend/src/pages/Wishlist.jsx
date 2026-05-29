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
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    fetchWishes();
    refreshCart();
  }, [isLoggedIn]);

  const refreshCart = () => {
    const email = sessionStorage.getItem('userEmail');
    if (!email) return;
    fetch(`http://localhost:8000/api/cart/${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : [])
      .then(items => { setCartItems(items); setCartCount(items.length); })
      .catch(() => {});
  };

  const removeCartItem = async (itemId) => {
    const email = sessionStorage.getItem('userEmail');
    if (!email) return;
    await fetch(`http://localhost:8000/api/cart/${itemId}?user_email=${encodeURIComponent(email)}`, { method: 'DELETE' });
    refreshCart();
  };

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
          <div style={{ position: 'relative' }}>
            <button className="action-icon-btn" onClick={() => setCartOpen(o => !o)}>
              <ShoppingBag size={22} />
              {cartCount > 0 && <span className="badge">{cartCount}</span>}
            </button>
            {cartOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setCartOpen(false)} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: '300px', background: 'white', borderRadius: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid #e2e8f0',
                  zIndex: 99, overflow: 'hidden',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                    장바구니 {cartCount > 0 ? `(${cartCount})` : ''}
                  </div>
                  {cartItems.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>장바구니가 비어있습니다</div>
                  ) : (
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                      {cartItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
                          <img src={`http://localhost:8000${item.product.image_url}`} alt={item.product.name}
                            onClick={() => { setCartOpen(false); navigate(`/products/${item.product.id}`); }}
                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, cursor: 'pointer' }} />
                          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                            onClick={() => { setCartOpen(false); navigate(`/products/${item.product.id}`); }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</p>
                            {item.size_name && <span style={{ fontSize: '0.72rem', color: '#6366f1' }}>{item.size_name}</span>}
                          </div>
                          <button onClick={() => removeCartItem(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: '2px 4px', flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button onClick={() => { setCartOpen(false); navigate('/cart'); }}
                      style={{ width: '100%', padding: '9px', borderRadius: '10px', border: '1.5px solid #6366f1', background: 'white', color: '#6366f1', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      장바구니 보기
                    </button>
                    <button onClick={() => { setCartOpen(false); navigate('/mypage/fitting'); }}
                      style={{ width: '100%', padding: '9px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      가상 피팅룸에서 착용해보기
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

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
