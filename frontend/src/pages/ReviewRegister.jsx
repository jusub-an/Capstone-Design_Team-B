import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Image as ImageIcon, X, Send, Loader2, Camera } from 'lucide-react';
import axios from 'axios';
import './ReviewRegister.css';

export default function ReviewRegister() {
  const { productId, reviewId } = useParams();
  const isEdit = !!reviewId;
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  const userEmail = sessionStorage.getItem('userEmail');

  useEffect(() => {
    if (!userEmail) {
      alert('로그인이 필요한 페이지입니다.');
      navigate('/login');
    }

    if (isEdit) {
      fetchReviewDetail();
    }
  }, [reviewId]);

  const fetchReviewDetail = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/reviews/${reviewId}`);
      const data = response.data;

      if (data.user_email !== userEmail) {
        alert('본인의 리뷰만 수정할 수 있습니다.');
        navigate('/products');
        return;
      }

      setRating(data.rating);
      setComment(data.comment);
      if (data.images && data.images.length > 0) {
        setPreviews(data.images.map(img => `http://localhost:8000${img.image_url}`));
      } else if (data.image_url) {
        setPreviews([`http://localhost:8000${data.image_url}`]);
      }
    } catch (error) {
      console.error('Error fetching review:', error);
      alert('리뷰 정보를 가져오는 데 실패했습니다.');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setImages((prev) => [...prev, ...files]);
      
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviews((prev) => [...prev, reader.result]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      alert('평점을 최소 1점 이상 선택해주세요.');
      return;
    }
    if (!comment.trim()) {
      alert('리뷰 내용을 입력해주세요.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('rating', rating);
    formData.append('comment', comment);
    formData.append('user_email', userEmail);
    if (images.length > 0) {
      images.forEach(img => {
        formData.append('images', img);
      });
    }

    try {
      if (isEdit) {
        await axios.put(`http://localhost:8000/api/reviews/${reviewId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert('리뷰가 수정되었습니다.');
      } else {
        formData.append('product_id', productId);
        await axios.post('http://localhost:8000/api/reviews', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert('리뷰가 등록되었습니다.');
      }
      navigate(-1);
    } catch (error) {
      console.error('Error saving review:', error);
      alert('리뷰 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) return <div className="review-register-container">Loading...</div>;

  return (
    <div className="review-register-container">
      <div className="review-register-header">
        <h1>{isEdit ? '리뷰 수정하기' : '리뷰 작성하기'}</h1>
        <p>상품에 대한 솔직한 의견을 들려주세요!</p>
      </div>

      <form className="review-form" onSubmit={handleSubmit}>
        {/* Rating Section */}
        <div className="form-section">
          <label className="form-label">평점</label>
          <div className="star-rating-input">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                size={32}
                className="star-icon"
                fill={s <= rating ? "#ffc107" : "none"}
                color={s <= rating ? "#ffc107" : "#cbd5e1"}
                onClick={() => setRating(s)}
              />
            ))}
          </div>
        </div>

        {/* Comment Section */}
        <div className="form-section">
          <label className="form-label">리뷰 내용</label>
          <textarea
            className="review-textarea"
            placeholder="착용감, 색상, 사이즈 등 다른 고객들에게 도움이 될 수 있는 내용을 적어주세요."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
          />
        </div>

        {/* Image Upload Section */}
        <div className="form-section">
          <div className="image-upload-wrapper multi">
            <div 
              className="upload-button-small"
              onClick={() => fileInputRef.current.click()}
            >
              <Camera size={24} />
              <span>추가</span>
            </div>
            
            <div className="previews-list">
              {previews.map((src, idx) => (
                <div key={idx} className="preview-item">
                  <img src={src} alt={`Preview ${idx}`} className="image-preview-thumb" />
                  <button
                    type="button"
                    className="remove-image-badge"
                    onClick={() => removeImage(idx)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              multiple
              onChange={handleImageChange}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button
            type="button"
            className="btn-cancel"
            onClick={() => navigate(-1)}
          >
            취소
          </button>
          <button
            type="submit"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Send size={20} />
            )}
            <span>{isEdit ? '리뷰 수정 완료' : '리뷰 등록 완료'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
