import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ShoppingCart, Heart, Share2, Star, MessageSquare, Plus, Edit2, Trash2 } from 'lucide-react';
import axios from 'axios';
import './ProductDetail.css';

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [reviews, setReviews] = useState([]);
  const [expandedReviewId, setExpandedReviewId] = useState(null);

  const isLoggedIn = !!sessionStorage.getItem('token');
  const userEmail = sessionStorage.getItem('userEmail');
  const username = sessionStorage.getItem('username') || 'User';

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  const handleToggleWish = async () => {
    if (!isLoggedIn) {
      alert('로그인이 필요한 서비스입니다.');
      navigate('/login');
      return;
    }
    const formData = new FormData();
    formData.append('product_id', id);
    formData.append('user_email', userEmail);
    try {
      await axios.post('http://localhost:8000/api/wishes/toggle', formData);
      fetchProduct();
    } catch (error) {
      console.error('Error toggling wish:', error);
    }
  };

  useEffect(() => {
    fetchProduct();
    fetchReviews();
  }, [id]);

  const fetchReviews = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}/reviews`);
      if (response.ok) {
        const data = await response.json();
        setReviews(data);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('정말 리뷰를 삭제하시겠습니까?')) return;
    try {
      const response = await fetch(`http://localhost:8000/api/reviews/${reviewId}?user_email=${userEmail}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        alert('리뷰가 삭제되었습니다.');
        fetchReviews();
      }
    } catch (error) {
      console.error('Error deleting review:', error);
    }
  };

  const averageRating = reviews.length > 0
    ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1)
    : 0;

  const fetchProduct = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}${isLoggedIn ? `?user_email=${userEmail}` : ''}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      } else {
        navigate('/products');
      }
    } catch (error) {
      console.error('Network error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return dateString.split('T')[0];
  };

  if (loading) return <div className="detail-loading">Loading...</div>;
  if (!product) return null;

  return (
    <div className="product-detail-container">
      <header className="product-header">
        <div className="logo-section" onClick={() => navigate('/products')} style={{ cursor: 'pointer' }}>
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
                  <li onClick={() => alert('Coming soon')}>내 아바타</li>
                  <li onClick={handleLogout} className="logout-action">로그아웃</li>
                </ul>
              </div>
            </div>
          ) : (
            <button className="login-header-button" onClick={() => navigate('/login')}>로그인</button>
          )}
        </div>
      </header>

      <main className="detail-content">
        <div className="detail-top">
          <div className="detail-image-section">
            <img
              src={`http://localhost:8000${product.image_url}`}
              alt={product.name}
              className="main-product-image"
              onError={(e) => { e.target.src = 'https://via.placeholder.com/500x600?text=No+Image'; }}
            />
          </div>

          <div className="detail-info-section">
            <div className="info-header">
              <div className="category-brand-wrapper">
                {product.brand && <span className="info-brand">{product.brand}</span>}
                <span className="info-category">{product.category.name}</span>
              </div>
              <div className="info-actions">
                <Heart
                  className={`action-icon ${product.is_wished ? 'wished' : ''}`}
                  size={24}
                  fill={product.is_wished ? "#ff4d4f" : "none"}
                  color={product.is_wished ? "#ff4d4f" : "#aaa"}
                  onClick={handleToggleWish}
                />
                <Share2 className="action-icon" size={24} />
              </div>
            </div>

            <h1 className="info-name">{product.name}</h1>

            <div className="info-stats-row">
              <div className="info-stat-item">
                <Star size={18} fill="#ffc107" color="#ffc107" />
                <span className="stat-value">{product.avg_rating || 0}</span>
                <span className="stat-label">({product.review_count || 0}개의 후기)</span>
              </div>
              <div className="stat-divider"></div>
              <div className="info-stat-item">
                <Heart size={18} fill="#ff4d4f" color="#ff4d4f" />
                <span className="stat-value">{product.wish_count || 0}</span>
                <span className="stat-label">명이 찜함</span>
              </div>
            </div>

            <div className="info-price-row">
              <span className="info-price">{product.price.toLocaleString()}</span>
              <span className="currency">원</span>
            </div>

            <div className="info-divider"></div>


            <div className="purchase-actions">
              <button className="btn-cart">
                <ShoppingCart size={20} />
                <span>장바구니</span>
              </button>
              <button className="btn-buy">바로 구매하기</button>
              <button className="btn-wish" onClick={handleToggleWish}>
                <Heart size={20} fill={product.is_wished ? "#ff4d4f" : "none"} color={product.is_wished ? "#ff4d4f" : "#aaa"} />
              </button>
            </div>
          </div>
        </div>

        <div className="detail-bottom">
          <div className="detail-tabs">
            <button className={`tab-item ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>상세정보</button>
            <button className={`tab-item ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>리뷰 ({reviews.length})</button>
          </div>

          {activeTab === 'details' ? (
            <div className="detail-description-content">
              <h3 className="desc-title">PRODUCT INFO</h3>
              {product.desc_images && product.desc_images.length > 0 && (
                <div className="desc-image-wrapper">
                  {product.desc_images.map((img) => (
                    <img
                      key={img.id}
                      src={`http://localhost:8000${img.image_url}`}
                      alt="Detail"
                      className="desc-image"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="detail-reviews-content">
              <div className="reviews-summary">
                <div className="avg-rating-box">
                  <span className="avg-score">{averageRating}</span>
                  <div className="avg-stars">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={18} fill={s <= Math.round(averageRating) ? "#ffc107" : "none"} color={s <= Math.round(averageRating) ? "#ffc107" : "#cbd5e1"} />
                    ))}
                  </div>
                  <span className="review-count">총 {reviews.length}개의 리뷰</span>
                </div>
                <div className="reviews-action-header">
                  <button className="btn-write-review" onClick={() => isLoggedIn ? navigate(`/reviews/new/${id}`) : (alert('로그인이 필요합니다.'), navigate('/login'))}>
                    <Plus size={18} />
                    <span>리뷰 작성하기</span>
                  </button>
                </div>
              </div>

              <div className="reviews-list">
                {reviews.length === 0 ? (
                  <div className="empty-reviews"><p>아직 작성된 리뷰가 없습니다.</p></div>
                ) : (
                  reviews.map((review) => (
                    <div key={review.id} className="review-item">
                      <div className="review-meta">
                        <span className="review-user">{review.user_email.split('@')[0]}</span>
                        <div className="review-stars">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} size={14} fill={s <= review.rating ? "#ffc107" : "none"} color={s <= review.rating ? "#ffc107" : "#cbd5e1"} />
                          ))}
                        </div>
                        <span className="review-date">{formatDate(review.created_at)}</span>
                        {userEmail === review.user_email && (
                          <div className="review-owner-actions">
                            <button onClick={() => navigate(`/reviews/edit/${review.id}`)}><Edit2 size={14} /></button>
                            <button onClick={() => handleDeleteReview(review.id)}><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                      <div className="review-body">
                        <div className="review-images-list">
                          {review.images && review.images.length > 0 ? (
                            review.images.map((img) => (
                              <div
                                key={img.id}
                                className={`review-image-container ${expandedReviewId === img.id ? 'expanded' : ''}`}
                              >
                                <img
                                  src={`http://localhost:8000${img.image_url}`}
                                  alt="Review"
                                  className={`review-image ${expandedReviewId === img.id ? 'expanded' : ''}`}
                                  onClick={() => setExpandedReviewId(expandedReviewId === img.id ? null : img.id)}
                                />
                              </div>
                            ))
                          ) : (
                            review.image_url && (
                              <div className={`review-image-container ${expandedReviewId === review.id ? 'expanded' : ''}`}>
                                <img
                                  src={`http://localhost:8000${review.image_url}`}
                                  alt="Review"
                                  className={`review-image ${expandedReviewId === review.id ? 'expanded' : ''}`}
                                  onClick={() => setExpandedReviewId(expandedReviewId === review.id ? null : review.id)}
                                />
                              </div>
                            )
                          )}
                        </div>
                        <p className="review-comment">{review.comment}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default ProductDetail;
