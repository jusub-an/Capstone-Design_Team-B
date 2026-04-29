import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Edit2, Trash2, ChevronLeft, MessageSquare, ExternalLink } from 'lucide-react';
import axios from 'axios';
import './MyReviews.css';

export default function MyReviews() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const userEmail = sessionStorage.getItem('userEmail');

  useEffect(() => {
    if (!userEmail) {
      navigate('/login');
      return;
    }
    fetchMyReviews();
  }, [userEmail]);

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

  if (loading) return <div className="my-reviews-loading">로딩 중...</div>;

  return (
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
  );
}
