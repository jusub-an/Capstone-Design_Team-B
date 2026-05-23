import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Edit2, Trash2, ChevronLeft, MessageSquare, ExternalLink, Search, Heart, ShoppingBag } from 'lucide-react';
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

  useEffect(() => {
    if (!userEmail) {
      navigate('/login');
      return;
    }
    fetchMyReviews();
    fetchMySizeReviews();
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
                    <span className="size-review-badge" style={{ display: 'inline-block', marginTop: '4px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600, color: '#4f46e5', backgroundColor: '#eef2ff', borderRadius: '4px', border: '1px solid #c7d2fe' }}>
                      AI 실측 사이즈 포함
                    </span>
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
