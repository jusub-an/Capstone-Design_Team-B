import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Image as ImageIcon, X, Send, Loader2, Camera, RefreshCw, RotateCcw, ChevronDown, ChevronUp, Heart, ShoppingBag, AlertTriangle, FileText, MoveHorizontal, Shirt, User, Ruler } from 'lucide-react';
import axios from 'axios';
import ErrorToast from '../components/ErrorToast';
import MeasurementWarning, { validateMeasurements } from '../components/MeasurementWarning';
import './ReviewRegister.css';
import './ProductList.css';
import '../components/MeasurementGuide.css';
import StepGuideAnimation from '../components/StepGuideAnimation';

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
  const [initialLoading, setInitialLoading] = useState(true);

  // Size Review toggle & state
  const [product, setProduct] = useState(null);
  const [includeSizeReview, setIncludeSizeReview] = useState(false);
  const [selectedSize, setSelectedSize] = useState('');
  
  const [cvStep, setCvStep] = useState(0); 
  const [cvImage, setCvImage] = useState(null);
  const [rectShirt, setRectShirt] = useState(null);
  const [rectA4, setRectA4] = useState(null);
  const [shoulderPts, setShoulderPts] = useState([]);
  const [currentRect, setCurrentRect] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [cvLoading, setCvLoading] = useState(false);
  const [errorToast, setErrorToast] = useState(null);
  const [measurementWarnings, setMeasurementWarnings] = useState([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [cvResultData, setCvResultData] = useState(null);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [scaleFactor, setScaleFactor] = useState(1);

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
    refreshCart();
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  useEffect(() => {
    if (!userEmail) {
      alert('로그인이 필요한 페이지입니다.');
      navigate('/login');
    }

    if (isEdit) {
      fetchReviewDetail();
    } else {
      fetchProduct();
    }
  }, [reviewId, productId]);

  const fetchProduct = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/products/${productId}`);
      setProduct(response.data);
    } catch (error) {
      console.error('Error fetching product:', error);
    } finally {
      setInitialLoading(false);
    }
  };

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
      
      const prodRes = await axios.get(`http://localhost:8000/api/products/${data.product_id}`);
      setProduct(prodRes.data);
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

  const handleCvImageUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          imgRef.current = img;
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;
          let w = img.width, h = img.height;
          let scale = 1;
          
          if (w > MAX_WIDTH || h > MAX_HEIGHT) {
            const scaleW = MAX_WIDTH / w;
            const scaleH = MAX_HEIGHT / h;
            scale = Math.min(scaleW, scaleH);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          setScaleFactor(scale);
          
          const canvas = canvasRef.current;
          if(canvas) {
            canvas.width = w;
            canvas.height = h;
          }
          
          setCvImage(img.src);
          setCvStep(1);
          setRectShirt(null);
          setRectA4(null);
          setShoulderPts([]);
          setCurrentRect(null);
          setTimeout(() => redrawCanvas(w, h, scale, null, null, null, []), 50);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const redrawCanvas = (w, h, scale, rs, ra, cr, sPts = []) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imgRef.current, 0, 0, w, h);

    const drawRect = (r, color, text) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.font = "bold 16px sans-serif";
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(r.x, r.y - 25, textWidth + 10, 25);
      ctx.fillStyle = color;
      ctx.fillText(text, r.x + 5, r.y - 8);
    };

    if (rs) drawRect(rs, "#ff4444", "의류 (Shirt)");
    if (ra) drawRect(ra, "#4CAF50", "A4 용지");
    
    if (sPts && sPts.length > 0) {
      sPts.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffeb3b";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000";
        ctx.stroke();
      });
      if (sPts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(sPts[0].x, sPts[0].y);
        ctx.lineTo(sPts[1].x, sPts[1].y);
        ctx.strokeStyle = "#ffeb3b";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    if (cr) {
      let color = cvStep === 1 ? "#ff4444" : "#4CAF50";
      ctx.strokeStyle = color;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
      ctx.setLineDash([]);
    }
  };

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const onDown = (e) => {
    const pos = getPos(e);
    const isTopItem = product?.category?.name.includes('상의');
    if (cvStep === 3 && isTopItem) {
      const newPts = [...shoulderPts, pos];
      setShoulderPts(newPts);
      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, rectA4, null, newPts);
      if (newPts.length === 2) {
        setTimeout(() => setCvStep(4), 300);
      }
      return;
    }

    if (cvStep !== 1 && cvStep !== 2) return;
    setStartPos(pos);
    setIsDrawing(true);
    setCurrentRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const onMove = (e) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    const newRect = {
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y)
    };
    setCurrentRect(newRect);
    redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, rectA4, newRect, shoulderPts);
  };

  const onUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const isTopItem = product?.category?.name.includes('상의');
    if (currentRect && currentRect.w > 30 && currentRect.h > 30) {
      if (cvStep === 1) {
        setRectShirt({ ...currentRect });
        setCvStep(2);
        redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, currentRect, rectA4, null, shoulderPts);
      } else if (cvStep === 2) {
        setRectA4({ ...currentRect });
        if (isTopItem) {
          setCvStep(3);
          setShoulderPts([]);
        } else {
          setCvStep(4);
        }
        redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, currentRect, null, shoulderPts);
      }
    } else {
      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, rectA4, null, shoulderPts);
    }
    setCurrentRect(null);
  };

  const cropToBlob = (rect) => {
    const temp = document.createElement('canvas');
    const sx = rect.x / scaleFactor;
    const sy = rect.y / scaleFactor;
    const sw = rect.w / scaleFactor;
    const sh = rect.h / scaleFactor;
    temp.width = sw; 
    temp.height = sh;
    temp.getContext('2d').drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
    return new Promise(res => temp.toBlob(res, 'image/jpeg'));
  };

  const handleAnalyze = async () => {
    if (!rectShirt || !rectA4) return;
    setCvLoading(true);
    
    try {
      const shirtBlob = await cropToBlob(rectShirt);
      const a4Blob = await cropToBlob(rectA4);

      const reqFormData = new FormData();
      reqFormData.append('shirt_image', shirtBlob, 'shirt.jpg');
      reqFormData.append('a4_image', a4Blob, 'a4.jpg');
      reqFormData.append('shirt_x', (rectShirt.x / scaleFactor).toString());
      reqFormData.append('shirt_y', (rectShirt.y / scaleFactor).toString());
      reqFormData.append('shirt_w', (rectShirt.w / scaleFactor).toString());
      reqFormData.append('shirt_h', (rectShirt.h / scaleFactor).toString());
      reqFormData.append('a4_x', (rectA4.x / scaleFactor).toString());
      reqFormData.append('a4_y', (rectA4.y / scaleFactor).toString());
      reqFormData.append('a4_w', (rectA4.w / scaleFactor).toString());
      reqFormData.append('a4_h', (rectA4.h / scaleFactor).toString());
      reqFormData.append('orig_w', (canvasRef.current.width / scaleFactor).toString());
      reqFormData.append('orig_h', (canvasRef.current.height / scaleFactor).toString());
      
      const category_type = product?.category?.name.includes('상의') ? 'Top' : 'Bottom';
      reqFormData.append('category_type', category_type);

      if (category_type === 'Top' && shoulderPts.length === 2) {
        reqFormData.append('shoulder_x1', (shoulderPts[0].x / scaleFactor).toString());
        reqFormData.append('shoulder_y1', (shoulderPts[0].y / scaleFactor).toString());
        reqFormData.append('shoulder_x2', (shoulderPts[1].x / scaleFactor).toString());
        reqFormData.append('shoulder_y2', (shoulderPts[1].y / scaleFactor).toString());
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const response = await fetch('http://localhost:8000/api/measure/clothing', {
        method: 'POST',
        body: reqFormData,
        signal: abortControllerRef.current.signal
      });

      if (response.ok) {
        const data = await response.json();
        setCvResultData(data);
        setCvStep(5);
        setMeasurementWarnings(validateMeasurements(data, category_type).warnings);
      } else {
        const err = await response.json();
        setErrorToast({ code: null, detail: err.detail });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Analysis aborted by user');
        return;
      }
      console.error(error);
      setErrorToast({ code: null, detail: '네트워크 오류가 발생했습니다.' });
    } finally {
      setCvLoading(false);
    }
  };

  useEffect(() => {
    if (!includeSizeReview) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setCvLoading(false);
      setCvStep(0);
      setCvImage(null);
      setRectShirt(null);
      setRectA4(null);
      setCurrentRect(null);
      setShoulderPts([]);
      setCvResultData(null);
      setMeasurementWarnings([]);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [includeSizeReview]);

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

    if (includeSizeReview && !isEdit) {
      if (!selectedSize) {
        alert('사이즈 실측 후기를 위한 사이즈를 선택해주세요.');
        return;
      }
      if (cvStep !== 5 || !cvResultData) {
        alert('사이즈 실측 분석을 완료해주세요.');
        return;
      }
      if (measurementWarnings.length > 0) {
        alert('추출된 치수가 정상 범위를 크게 벗어나 사이즈 후기로 등록할 수 없습니다. 다시 시도해주세요.');
        return;
      }
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('rating', rating);
      formData.append('comment', comment);
      formData.append('user_email', userEmail);
      if (images.length > 0) {
        images.forEach(img => {
          formData.append('images', img);
        });
      }

      if (isEdit) {
        await axios.put(`http://localhost:8000/api/reviews/${reviewId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        formData.append('product_id', productId);
        await axios.post('http://localhost:8000/api/reviews', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      if (includeSizeReview && !isEdit && cvResultData) {
        const isTop = product?.category?.name.includes('상의');
        const submitData = new FormData();
        submitData.append('product_id', productId);
        submitData.append('user_email', userEmail);
        submitData.append('size_name', selectedSize);
        
        submitData.append('length', cvResultData.length_cm);
        if (isTop) {
          submitData.append('chest_or_waist', cvResultData.chest_cm);
          submitData.append('shoulder_or_thigh', cvResultData.shoulder_width_cm || 0);
          submitData.append('sleeve_or_rise', cvResultData.sleeve_width_cm);
          submitData.append('sleeve_length', cvResultData.sleeve_length_cm > 0 ? cvResultData.sleeve_length_cm : 0);
          submitData.append('neck_or_hem', cvResultData.neck_width_cm);
        } else {
          submitData.append('chest_or_waist', cvResultData.waist_cm);
          submitData.append('shoulder_or_thigh', cvResultData.thigh_cm);
          submitData.append('sleeve_or_rise', cvResultData.rise_cm);
          submitData.append('neck_or_hem', cvResultData.hem_cm);
        }

        const debugResp = await fetch(`data:image/jpeg;base64,${cvResultData.debug_image_base64}`);
        const debugBlob = await debugResp.blob();
        submitData.append('debug_image', debugBlob, 'result.jpg');

        await axios.post('http://localhost:8000/api/size-reviews', submitData);
      }

      alert('리뷰가 등록되었습니다.');
      navigate(-1);
    } catch (error) {
      console.error('Error saving review:', error);
      alert('리뷰 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading || !product) return <div className="review-register-container">Loading...</div>;

  const isTopItem = product?.category?.name.includes('상의');
  const availableSizes = isTopItem ? product.top_sizes : product.bottom_sizes;

  return (
    <div className="product-list-container" style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* 공통 헤더 */}
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
                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</p>
                            {item.size_name && <span style={{ fontSize: '0.72rem', color: '#6366f1' }}>{item.size_name}</span>}
                          </div>
                          <button onClick={() => removeCartItem(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: '2px 4px', flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: '12px 16px' }}>
                    <button onClick={() => { setCartOpen(false); navigate('/mypage/fitting'); }}
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
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

      <div className="review-register-container" style={{ maxWidth: '1000px', margin: '40px auto' }}>
        <div className="review-register-header">
          <h1>{isEdit ? '리뷰 수정하기' : '리뷰 작성하기'}</h1>
          <p>상품에 대한 솔직한 의견을 들려주세요!</p>
        </div>

        <form className="review-form" onSubmit={handleSubmit}>
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

          <div className="form-section">
            <div className="image-upload-wrapper multi">
              <div 
                className="upload-button-small"
                onClick={() => fileInputRef.current.click()}
              >
                <Camera size={24} />
                <span>사진 추가</span>
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

          {!isEdit && (
            <div className="form-section size-review-toggle-section" style={{ marginTop: '20px', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div 
                className="size-review-toggle-header" 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setIncludeSizeReview(!includeSizeReview)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    checked={includeSizeReview} 
                    onChange={() => {}} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label className="form-label" style={{ margin: 0, cursor: 'pointer', color: includeSizeReview ? '#4f46e5' : '#475569' }}>
                    [선택] 실측 사이즈 후기 함께 남기기
                  </label>
                </div>
                {includeSizeReview ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
              </div>

            {includeSizeReview && (
              <div className="size-review-content" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '10px', color: '#334155' }}>구매하신 사이즈를 선택해주세요</label>
                  <div className="size-selector" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {availableSizes?.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        className={`size-chip ${selectedSize === s.size_name ? 'active' : ''}`}
                        onClick={() => setSelectedSize(s.size_name)}
                      >
                        {s.size_name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ai-section">
                  <div className="ai-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>치수 자동 추출</h3>
                    <button type="button" className="guide-btn" onClick={() => setIsGuideOpen(!isGuideOpen)}>{isGuideOpen ? '가이드 닫기' : '? 촬영 가이드'}</button>
                  </div>

                  {isGuideOpen && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <div className="mg-section" style={{ flex: '1 1 250px', marginBottom: 0 }}>
                        <div className="mg-section-title">
                          <span className="mg-badge mg-badge-common">공통</span>
                          준비 사항
                        </div>
                        <ul className="mg-list">
                          <li className="mg-item">
                            <span className="mg-item-icon"><FileText size={18} /></span>
                            <span className="mg-item-text">A4 용지(21×29.7cm)를 옷과 겹치지 않게 옆에 반듯하게 놓아주세요.</span>
                          </li>
                          <li className="mg-item">
                            <span className="mg-item-icon"><Camera size={18} /></span>
                            <span className="mg-item-text">카메라는 바닥과 수평이 되도록 위에서 정면으로 찍어주세요.</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mg-section" style={{ flex: '1 1 250px', marginBottom: 0 }}>
                        <div className="mg-section-title">
                          <span className={`mg-badge ${isTopItem ? 'mg-badge-top' : 'mg-badge-bottom'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {isTopItem ? <Shirt size={18} /> : null} {isTopItem ? '상의' : '하의'}
                          </span>
                          펼쳐놓기 팁
                        </div>
                        <ul className="mg-list">
                          {isTopItem ? (
                            <>
                              <li className="mg-item"><span className="mg-item-icon"><MoveHorizontal size={18} /></span><span className="mg-item-text">겨드랑이 굴곡이 잘 보이도록 양소매를 살짝 벌려주세요.</span></li>
                              <li className="mg-item"><span className="mg-item-icon"><Shirt size={18} /></span><span className="mg-item-text">목 부분과 밑단이 구겨지지 않게 쫙 펴주세요.</span></li>
                            </>
                          ) : (
                            <>
                              <li className="mg-item"><span className="mg-item-icon"><User size={18} /></span><span className="mg-item-text">사타구니가 명확히 보이도록 두 다리를 겹치지 않게 A자 형태로 살짝 벌려주세요.</span></li>
                              <li className="mg-item"><span className="mg-item-icon"><Ruler size={18} /></span><span className="mg-item-text">허리선이 겹치거나 울지 않게 반듯하게 펴주세요.</span></li>
                            </>
                          )}
                        </ul>
                      </div>

                      <div className="mg-warn" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%', marginTop: '10px' }}>
                        <AlertTriangle size={18} className="mg-warn-icon" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span className="mg-warn-text">
                          의류가 아닌 사진이나 카테고리({isTopItem ? '상의' : '하의'})와 다른 옷을 업로드하면 측정 결과가 부정확합니다.
                        </span>
                      </div>
                    </div>
                  )}

                  {cvStep === 0 && (
                    <label htmlFor="sr-upload" className="upload-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', width: '100%', border: '2px dashed #cbd5e1', borderRadius: '12px', height: '200px', background: '#fff' }}>
                      <input type="file" id="sr-upload" style={{ display: 'none' }} accept="image/*" onChange={handleCvImageUpload} />
                      <Camera size={40} color="#64748b" />
                      <span style={{ fontWeight: 600, marginTop: '0.5rem', color: '#64748b' }}>의류 실루엣 사진 업로드</span>
                      <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#64748b' }}>A4 용지가 함께 나오도록 촬영해주세요</p>
                    </label>
                  )}

                  <div className="cv-extract-container" style={{ display: (cvStep > 0 && cvStep < 5) ? 'flex' : 'none', gap: '20px', alignItems: 'stretch', width: '100%' }}>
                    <div className="canvas-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                      <div className="canvas-instruction" style={{ background: '#ffffff', color: '#1e293b', padding: '16px', borderBottom: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, textAlign: 'center' }}>
                        {cvStep === 1 ? "1. 의류 영역을 드래그하세요" : 
                         cvStep === 2 ? "2. A4 용지 영역을 드래그하세요" : 
                         cvStep === 3 ? "3. 어깨 재봉선 상단 양끝을 2번 클릭하세요" : ""}
                      </div>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', background: '#f1f5f9' }}>
                        <canvas
                          ref={canvasRef}
                          onMouseDown={onDown}
                          onMouseMove={onMove}
                          onMouseUp={onUp}
                          onTouchStart={onDown}
                          onTouchMove={onMove}
                          onTouchEnd={onUp}
                          style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                        />
                      </div>
                      <div className="canvas-actions" style={{ display: 'flex', gap: '10px', width: '100%', padding: '16px', background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
                        <button type="button" disabled={cvLoading} onClick={() => setCvStep(0)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', cursor: cvLoading ? 'not-allowed' : 'pointer', opacity: cvLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap' }} onMouseOver={(e) => { if(!cvLoading) e.currentTarget.style.background='#f1f5f9' }} onMouseOut={(e) => { if(!cvLoading) e.currentTarget.style.background='#f8fafc' }}>
                          <RefreshCw size={18} /> 다시 업로드
                        </button>
                        <button type="button" disabled={cvLoading} onClick={() => {
                          setRectShirt(null);
                          setRectA4(null);
                          setShoulderPts([]);
                          setCvStep(1);
                          redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null, []);
                        }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', cursor: cvLoading ? 'not-allowed' : 'pointer', opacity: cvLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap' }} onMouseOver={(e) => { if(!cvLoading) e.currentTarget.style.background='#f1f5f9' }} onMouseOut={(e) => { if(!cvLoading) e.currentTarget.style.background='#f8fafc' }}>
                          <RotateCcw size={18} /> 영역 초기화
                        </button>
                        {cvStep === 4 && (
                          <button type="button" onClick={handleAnalyze} disabled={cvLoading} style={{ flex: 1.5, padding: '12px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#ffffff', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', whiteSpace: 'nowrap' }} onMouseOver={(e) => e.currentTarget.style.background='#4f46e5'} onMouseOut={(e) => e.currentTarget.style.background='#6366f1'}>
                            {cvLoading ? '분석 중...' : '치수 분석 시작'}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="guide-wrapper" style={{ width: '340px', flexShrink: 0 }}>
                      <StepGuideAnimation step={cvStep} categoryType={isTopItem ? 'Top' : 'bottom'} isAnalyzing={cvLoading} />
                    </div>
                  </div>

                  {cvStep === 5 && cvResultData && (
                    <div className="sr-result-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                      <div className="result-img-box">
                        <img src={`data:image/jpeg;base64,${cvResultData.debug_image_base64}`} alt="Result" style={{ width: '100%', display: 'block' }} />
                      </div>
                      <div className="result-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: '#e2e8f0' }}>
                        <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>총장</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.length_cm}cm</strong></div>
                        {isTopItem ? (
                          <>
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>어깨</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.shoulder_width_cm}cm</strong></div>
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>가슴</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.chest_cm}cm</strong></div>
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>소매단면</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.sleeve_width_cm}cm</strong></div>
                            {cvResultData.sleeve_length_cm > 0 && <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>소매길이</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.sleeve_length_cm}cm</strong></div>}
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>목폭</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.neck_width_cm}cm</strong></div>
                          </>
                        ) : (
                          <>
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>허리</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.waist_cm}cm</strong></div>
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>허벅지</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.thigh_cm}cm</strong></div>
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>밑위</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.rise_cm}cm</strong></div>
                            <div className="res-item" style={{ background: '#fff', padding: '15px' }}><span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>밑단</span><strong style={{ fontSize: '1.1rem' }}>{cvResultData.hem_cm}cm</strong></div>
                          </>
                        )}
                      </div>
                      <button type="button" onClick={() => setCvStep(0)} style={{ width: '100%', padding: '12px', border: 'none', background: '#f1f5f9', color: '#64748b', fontWeight: 500, cursor: 'pointer' }}>
                        다시 측정하기
                      </button>
                      
                      {measurementWarnings.length > 0 && (
                        <div style={{ padding: '15px' }}>
                          <MeasurementWarning warnings={measurementWarnings} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
              disabled={loading || (includeSizeReview && measurementWarnings.length > 0)}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Send size={20} />
              )}
              <span>{isEdit ? '리뷰 수정 완료' : (includeSizeReview ? '리뷰 및 사이즈 후기 등록' : '리뷰 등록 완료')}</span>
            </button>
          </div>
        </form>
        {errorToast && (
          <ErrorToast
            errorCode={null}
            errorDetail={errorToast.detail}
            onClose={() => setErrorToast(null)}
          />
        )}
      </div>
    </div>
  );
}
