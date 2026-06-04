import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Edit2, Trash2, ChevronLeft, MessageSquare, ExternalLink, Search, Heart, ShoppingBag, Ruler } from 'lucide-react';
import './ProductList.css';
import axios from 'axios';
import './MyReviews.css';

export default function MyReviews() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [sizeReviews, setSizeReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const userEmail = sessionStorage.getItem('userEmail');
  const username = sessionStorage.getItem('username') || 'User';
  const isLoggedIn = !!sessionStorage.getItem('token');
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

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

  useEffect(() => {
    if (!userEmail) {
      navigate('/login');
      return;
    }
    fetchMyReviews();
    fetchMySizeReviews();
    refreshCart();
  }, [userEmail]);

  const fetchMySizeReviews = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/size-reviews/user/${userEmail}`);
      setSizeReviews(response.data);
    } catch (error) {
      console.error('Error fetching size reviews:', error);
    }
  };

  const fetchMyReviews = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/reviews/user/${userEmail}`);
      setReviews(response.data);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('정말 리뷰를 삭제하시겠습니까?')) return;
    try {
      await axios.delete(`http://localhost:8000/api/reviews/${reviewId}?user_email=${userEmail}`);
      alert('리뷰가 삭제되었습니다.');
      fetchMyReviews();
    } catch (error) {
      console.error('Error deleting review:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return dateString.split('T')[0];
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  if (loading) return <div className="my-reviews-loading">로딩 중...</div>;

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

      <div className="my-reviews-container">
        <div className="my-reviews-header">
          <button onClick={() => navigate('/mypage')} className="back-btn">
            <ChevronLeft size={20} />
            <span>마이페이지</span>
          </button>
          <h1>내 리뷰 관리</h1>
          <p>작성하신 {reviews.length}개의 소중한 리뷰들이 있습니다.</p>
        </div>

      {reviews.length === 0 ? (
        <div className="empty-reviews">
          <MessageSquare size={60} color="#cbd5e1" />
          <p>아직 작성하신 리뷰가 없습니다.</p>
          <button onClick={() => navigate('/products')} className="btn-go-shopping">쇼핑하러 가기</button>
        </div>
      ) : (
        <div className="reviews-grid">
          {reviews.map((review) => (
            <div key={review.id} className="my-review-card">
              <div className="review-product-info" onClick={() => navigate(`/products/${review.product.id}`)}>
                <img 
                  src={`http://localhost:8000${review.product.image_url}`} 
                  alt={review.product.name} 
                  className="product-thumb"
                />
                <div className="product-details">
                  <span className="product-brand">{review.product.brand}</span>
                  <h3 className="product-name">{review.product.name}</h3>
                  {sizeReviews.some(sr => sr.product_id === review.product.id) && (
                    <div style={{ marginBottom: '12px' }}>
                      <span className="size-review-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #6366f1, #a855f7)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)' }}>
                        <Ruler size={12} />
                        사이즈 리뷰
                      </span>
                    </div>
                  )}
                  <div className="go-product">
                    <span>상품 보기</span>
                    <ExternalLink size={14} />
                  </div>
                </div>
              </div>

              <div className="review-content-box">
                <div className="review-meta">
                  <div className="review-stars">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star 
                        key={s} 
                        size={16} 
                        fill={s <= review.rating ? "#ffc107" : "none"} 
                        color={s <= review.rating ? "#ffc107" : "#cbd5e1"} 
                      />
                    ))}
                  </div>
                  <span className="review-date">{formatDate(review.created_at)}</span>
                </div>
                
                <p className="review-text">{review.comment}</p>
                
                {review.images && review.images.length > 0 && (
                  <div className="review-images-preview">
                    {review.images.map((img) => (
                      <img key={img.id} src={`http://localhost:8000${img.image_url}`} alt="Review" className="thumb" />
                    ))}
                  </div>
                )}

                <div className="review-actions">
                  <button onClick={() => navigate(`/reviews/edit/${review.id}`)} className="btn-edit">
                    <Edit2 size={16} />
                    <span>수정</span>
                  </button>
                  <button onClick={() => handleDeleteReview(review.id)} className="btn-delete">
                    <Trash2 size={16} />
                    <span>삭제</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
