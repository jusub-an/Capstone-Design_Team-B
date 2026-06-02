import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, ShoppingBag, ChevronLeft, Upload, Tag, LayoutGrid, ChevronDown, ChevronRight, Check, Camera } from 'lucide-react';
import './ProductRegister.css';
import './ProductList.css';
import MeasurementGuide from '../components/MeasurementGuide';
import ErrorToast from '../components/ErrorToast';
import MeasurementWarning, { validateMeasurements } from '../components/MeasurementWarning';
import StepGuideAnimation from '../components/StepGuideAnimation';

function ProductRegister() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;

  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    brand: '',
    price: '',
    category_type: '' // To determine Top/Bottom
  });

  const [sizes, setSizes] = useState([
    { id: Date.now(), size_name: 'Free', length: '', chest: '', shoulder: '', sleeve: '', neck: '', waist: '', thigh: '', rise: '', hem: '' }
  ]);
  const [activeSizeId, setActiveSizeId] = useState(null);

  const [mainImage, setMainImage] = useState(null);
  const [descImages, setDescImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const userEmail = sessionStorage.getItem('userEmail')?.trim();
  const username = sessionStorage.getItem('username') || 'User';
  const isLoggedIn = !!sessionStorage.getItem('token');
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [showCvModal, setShowCvModal] = useState(false);
  const [cvImage, setCvImage] = useState(null);
  const [cvStep, setCvStep] = useState(0);
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
  const [devDebugOpen, setDevDebugOpen] = useState(false);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [selectedAiModel, setSelectedAiModel] = useState("sam_hq");
  
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [scaleFactor, setScaleFactor] = useState(1);

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
    fetchCategories();
    refreshCart();
    if (isEditMode) {
      fetchProductData();
    }
  }, [id]);

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
        if (data.length > 0 && !isEditMode) {
          setFormData((prev) => ({ 
            ...prev, 
            category_id: data[0].id,
            category_type: data[0].name.includes('상의') ? 'Top' : 'Bottom'
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProductData = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}`);
      if (response.ok) {
        const data = await response.json();
        setFormData({
          category_id: data.category.id,
          category_type: data.category.name.includes('상의') ? 'Top' : 'Bottom',
          name: data.name,
          brand: data.brand || '',
          price: data.price
        });
        const productSizes = (data.top_sizes && data.top_sizes.length > 0) 
          ? data.top_sizes 
          : (data.bottom_sizes && data.bottom_sizes.length > 0) 
            ? data.bottom_sizes 
            : [];

        if (productSizes.length > 0) {
          setSizes(productSizes.map(s => ({ ...s, id: Math.random() })));
        } else {
          setSizes([{ id: Date.now(), size_name: 'Free', length: '', chest: '', shoulder: '', sleeve: '', sleeve_length: '', neck: '', waist: '', thigh: '', rise: '', hem: '' }]);
        }
      }
    } catch (error) {
      console.error('Error fetching product data:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };
      if (name === 'category_id') {
        const cat = categories.find(c => c.id.toString() === value);
        newData.category_type = cat?.name.includes('상의') ? 'Top' : 'Bottom';
      }
      return newData;
    });
  };

  const handleMainImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setMainImage(e.target.files[0]);
    }
  };

  const handleDescImageChange = (e) => {
    if (e.target.files) {
      setDescImages(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const currentEmail = sessionStorage.getItem('userEmail')?.trim();

    if (!mainImage && !isEditMode) {
      alert('상품 대표 이미지를 선택해주세요.');
      return;
    }

    if (!formData.category_id) {
      alert('카테고리를 선택해주세요.');
      return;
    }

    if (!currentEmail) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
      const submitData = new FormData();
      submitData.append('category_id', formData.category_id);
      submitData.append('name', formData.name);
      submitData.append('brand', formData.brand);
      submitData.append('price', formData.price);
      submitData.append('owner_email', currentEmail);
      
      submitData.append('sizes', JSON.stringify(sizes));

      if (mainImage) submitData.append('image', mainImage);
      if (cvFittingImageUrl) submitData.append('fitting_image_url', cvFittingImageUrl);
      if (descImages.length > 0) {
        descImages.forEach((img) => submitData.append('desc_images', img));
      }

      const url = isEditMode ? `http://localhost:8000/api/products/${id}` : 'http://localhost:8000/api/products';
      const response = await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        body: submitData,
      });

      if (response.ok) {
        alert(isEditMode ? '상품이 수정되었습니다.' : '상품이 성공적으로 등록되었습니다.');
        navigate('/mypage/products');
      } else {
        const errData = await response.json();
        const detail = typeof errData.detail === 'object'
          ? JSON.stringify(errData.detail, null, 2)
          : errData.detail;
        alert(`실패: ${detail || '서버 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      console.error(error);
      alert('네트워크 오류');
    } finally {
      setLoading(false);
    }
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
          const MAX_HEIGHT = Math.max(window.innerHeight * 0.55, 300);
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
          canvas.width = w;
          canvas.height = h;
          
          setCvImage(img.src);
          setCvStep(1);
          setRectShirt(null);
          setRectA4(null);
          setShoulderPts([]);
          setCurrentRect(null);
          redrawCanvas(w, h, scale, null, null, null, []);
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
      sPts.forEach((pt, idx) => {
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
    e.preventDefault();
    const pos = getPos(e);
    const isTopItem = formData.category_type === 'Top';
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
    e.preventDefault();
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

  const onUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const isTopItem = formData.category_type === 'Top';
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

  const [cvResultData, setCvResultData] = useState(null);
  const [cvFittingImageUrl, setCvFittingImageUrl] = useState(null);

  const handleAnalyze = async () => {
    if (!rectShirt) return;
    if (!rectA4) return;
    setCvLoading(true);
    
    try {
      const shirtBlob = await cropToBlob(rectShirt);
      const a4Blob = rectA4 ? await cropToBlob(rectA4) : null;

      const reqFormData = new FormData();
      reqFormData.append('shirt_image', shirtBlob, 'shirt.jpg');
      reqFormData.append('shirt_x', (rectShirt.x / scaleFactor).toString());
      reqFormData.append('shirt_y', (rectShirt.y / scaleFactor).toString());
      reqFormData.append('shirt_w', (rectShirt.w / scaleFactor).toString());
      reqFormData.append('shirt_h', (rectShirt.h / scaleFactor).toString());
      
      if (rectA4) {
        reqFormData.append('a4_image', a4Blob, 'a4.jpg');
        reqFormData.append('a4_x', (rectA4.x / scaleFactor).toString());
        reqFormData.append('a4_y', (rectA4.y / scaleFactor).toString());
        reqFormData.append('a4_w', (rectA4.w / scaleFactor).toString());
        reqFormData.append('a4_h', (rectA4.h / scaleFactor).toString());
      }
      
      reqFormData.append('orig_w', (canvasRef.current.width / scaleFactor).toString());
      reqFormData.append('orig_h', (canvasRef.current.height / scaleFactor).toString());
      reqFormData.append('category_type', formData.category_type);

      if (formData.category_type === 'Top' && shoulderPts.length === 2) {
        reqFormData.append('shoulder_x1', (shoulderPts[0].x / scaleFactor).toString());
        reqFormData.append('shoulder_y1', (shoulderPts[0].y / scaleFactor).toString());
        reqFormData.append('shoulder_x2', (shoulderPts[1].x / scaleFactor).toString());
        reqFormData.append('shoulder_y2', (shoulderPts[1].y / scaleFactor).toString());
      }
      
      // 디버그 모드: 체크박스 선택 시에만 디버그 이미지 생성 요청
      reqFormData.append('debug_mode', debugModeEnabled.toString());


      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const response = await fetch(`http://localhost:8000/api/measure/clothing`, {
        method: 'POST',
        body: reqFormData,
        signal: abortControllerRef.current.signal
      });

      if (response.ok) {
        const data = await response.json();
        setCvResultData(data);
        if (data.fitting_image_url) setCvFittingImageUrl(data.fitting_image_url);
        setCvStep(5);

        const validation = validateMeasurements(data, formData.category_type);
        setMeasurementWarnings(validation.warnings);
      } else {
        const err = await response.json();
        const errMsg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
        // 알려진 에러 코드인지 확인
        const knownCodes = ['A4_NOT_FOUND', 'A4_TOO_SMALL', 'A4_NOT_QUAD', 'WARP_TOO_LARGE', 'SHIRT_NOT_FOUND'];
        const matchedCode = knownCodes.find(code => errMsg.includes(code));
        setErrorToast({ code: matchedCode || null, detail: errMsg });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Analysis aborted by user');
        return;
      }
      console.error(error);
      setErrorToast({ code: null, detail: '네트워크 오류가 발생했습니다. 서버 연결 상태를 확인해주세요.' });
    } finally {
      setCvLoading(false);
    }
  };

  const handleApplyMeasurements = () => {
    if (!cvResultData || !activeSizeId) return;
    setSizes(prev => prev.map(s => {
      if (s.id === activeSizeId) {
        if (formData.category_type === 'Top') {
          return {
            ...s,
            length: cvResultData.length_cm,
            chest: cvResultData.chest_cm,
            shoulder: cvResultData.shoulder_width_cm,
            sleeve: cvResultData.sleeve_width_cm,
            sleeve_length: cvResultData.sleeve_length_cm > 0 ? cvResultData.sleeve_length_cm : '',
            neck: cvResultData.neck_width_cm
          };
        } else {
          return {
            ...s,
            length: cvResultData.length_cm,
            waist: cvResultData.waist_cm,
            thigh: cvResultData.thigh_cm,
            rise: cvResultData.rise_cm,
            hem: cvResultData.hem_cm
          };
        }
      }
      return s;
    }));
    handleCloseCvModal();
    alert('치수가 적용되었습니다.');
  };

  const handleCloseCvModal = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setCvLoading(false);
    setShowCvModal(false);
    setCvStep(0);
    setCvImage(null);
    setRectShirt(null);
    setRectA4(null);
    setCurrentRect(null);
    setCvResultData(null);
    setMeasurementWarnings([]);
    setIsGuideOpen(false);
    setDevDebugOpen(false);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const scrollToGuide = () => {
    setIsGuideOpen(true);
  };

  return (
    <div className="register-container product-list-container" style={{ paddingBottom: '60px' }}>
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

      {/* CV Modal */}
      {/* ErrorToast 오버레이 */}
      {errorToast && (
        <ErrorToast
          errorCode={errorToast.code}
          errorDetail={errorToast.detail}
          onClose={() => setErrorToast(null)}
        />
      )}

      {showCvModal && (
        <div className="cv-modal-overlay">
          <div className={`cv-modal ${isGuideOpen ? 'cv-modal-expanded' : ''} ${devDebugOpen ? 'cv-modal-debug-open' : ''} ${(cvStep >= 1 && cvStep <= 4) ? 'cv-modal-split' : ''}`}>

            <MeasurementGuide
              categoryType={formData.category_type}
              isOpen={isGuideOpen}
              onClose={() => setIsGuideOpen(false)}
            />

            <div className="cv-main">
              <div className="cv-header">
                <button
                  type="button"
                  className="cv-help-btn"
                  onClick={() => setIsGuideOpen(!isGuideOpen)}
                  title="촬영 가이드라인"
                >
                  ?
                </button>
                <h3 className="cv-title">
                {formData.category_type === 'Top' ? '상의' : '하의'} 치수 자동 추출
                </h3>
                <button className="cv-close-btn" onClick={handleCloseCvModal}>✕</button>
              </div>

              <div className="cv-stepper">
                {['업로드', '의류 영역', 'A4 영역', '분석', '결과'].map((label, i) => (
                  <div key={i} className={`cv-step-dot ${cvStep >= i ? 'cv-step-active' : ''} ${cvStep === i ? 'cv-step-current' : ''}`}>
                  <div className="cv-dot-circle">{cvStep > i ? <Check size={14} /> : i + 1}</div>
                    <span className="cv-dot-label">{label}</span>
                  </div>
                ))}
              </div>

              <div className="cv-instructions">
                {cvStep === 0 && <span style={{marginBottom: '10px', display: 'block', textAlign: 'center'}}>분석할 의류 사진을 업로드해 주세요.</span>}
                {cvStep === 1 && <span>원본 이미지에서 <span style={{color:'#f87171'}}>의류 영역</span>을 드래그해 주세요.</span>}
                {cvStep === 2 && <span>원본 이미지에서 <span style={{color:'#4ade80'}}>A4 용지 영역</span>을 드래그하여 박스를 쳐주세요.</span>}
                {cvStep === 3 && <span>상의 <span style={{color:'#eab308'}}>어깨 양끝 재봉선 상단</span> 2곳을 각각 클릭해주세요.</span>}
                {cvStep === 4 && "영역 지정 완료! 분석을 시작하세요."}
                {cvStep === 5 && "치수 추출 완료! 결과를 확인하고 적용하세요."}
              </div>

              {cvStep === 0 && (
                <div className="cv-upload-area">
                  <input type="file" accept="image/*" onChange={handleCvImageUpload} id="cvImageInput" style={{display: 'none'}} />
                  <label htmlFor="cvImageInput" className="cv-upload-label">
                <Camera size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                    <span className="cv-upload-text">사진 선택하기</span>
                    <span className="cv-upload-sub">JPG, PNG 파일을 선택하세요</span>
                  </label>
                </div>
              )}

              <div className="cv-canvas-container" style={{ display: (cvStep > 0 && cvStep < 5) ? 'flex' : 'none' }}>
                <canvas
                  ref={canvasRef}
                  className="cv-canvas"
                  onMouseDown={onDown}
                  onMouseMove={onMove}
                  onMouseUp={onUp}
                  onTouchStart={onDown}
                  onTouchMove={onMove}
                  onTouchEnd={onUp}
                ></canvas>
              </div>

              {cvStep === 5 && cvResultData && (
                <div className="cv-result-container">
                  <div className="cv-result-image">
                    <img src={`data:image/jpeg;base64,${cvResultData.debug_image_base64}`} alt="AI 추출 결과 시각화" />
                  </div>
                  <div className="cv-result-values">
                    <div className="val-box"><span>총장</span><strong>{cvResultData.length_cm} cm</strong></div>
                    {formData.category_type === 'Top' ? (
                      <>
                        <div className="val-box"><span>어깨너비</span><strong>{cvResultData.shoulder_width_cm} cm</strong></div>
                        <div className="val-box"><span>가슴단면</span><strong>{cvResultData.chest_cm} cm</strong></div>
                        <div className="val-box"><span>소매단면</span><strong>{cvResultData.sleeve_width_cm} cm</strong></div>
                        {cvResultData.sleeve_length_cm > 0 && <div className="val-box"><span>소매길이</span><strong>{cvResultData.sleeve_length_cm} cm</strong></div>}
                        <div className="val-box"><span>넥라인</span><strong>{cvResultData.neck_width_cm} cm</strong></div>
                      </>
                    ) : (
                      <>
                        <div className="val-box"><span>허리단면</span><strong>{cvResultData.waist_cm} cm</strong></div>
                        <div className="val-box"><span>허벅지단면</span><strong>{cvResultData.thigh_cm} cm</strong></div>
                        <div className="val-box"><span>밑위</span><strong>{cvResultData.rise_cm} cm</strong></div>
                        <div className="val-box"><span>밑단단면</span><strong>{cvResultData.hem_cm} cm</strong></div>
                      </>
                    )}
                  </div>
                  <MeasurementWarning warnings={measurementWarnings} onShowGuide={scrollToGuide} />

                  {cvResultData.debug_stages && (
                    <div className="dev-debug-panel">
                      <button
                        type="button"
                        className="dev-debug-toggle"
                        onClick={() => setDevDebugOpen(!devDebugOpen)}
                      >
                        {devDebugOpen ? <ChevronDown size={14} color="#f59e0b" /> : <ChevronRight size={14} color="#f59e0b" />}
                        <span>개발자 디버그 시각화</span>
                        <span className="dev-debug-badge">{Object.keys(cvResultData.debug_stages).length} stages</span>
                      </button>
                      {devDebugOpen && (
                        <div className="dev-debug-content">
                          {Object.entries(cvResultData.debug_stages)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, base64Img]) => {
                              const isFullWidth = key.includes('edge_matrix');
                              const labels = {
                                '1_1_shirt_crop_original': '1-1. 크롭된 의류 원본',
                                '1_2_a4_crop_original':    '1-2. 크롭된 A4 용지 원본',
                                '2_1_shirt_sam_prompt':    '2-1. 의류 SAM-HQ 힌트 점 (T자 패턴)',
                                '2_2_a4_sam_prompt':       '2-2. A4 SAM-HQ 힌트 점 (중앙 분포)',
                                '3_1_shirt_sam_raw':       '3-1. SAM-HQ 배경제거 결과 — 의류',
                                '3_2_a4_sam_raw':          '3-2. SAM-HQ 배경제거 결과 — A4',
                                '4_1_shirt_cascade_diff':  '4-1. CascadePSP 차이점 — 의류 (빨강=삭제, 초록=추가)',
                                '4_2_a4_cascade_diff':     '4-2. CascadePSP 차이점 — A4',
                                '5_1_shirt_edge_matrix':   '5-1. 의류 테두리 픽셀 알파값 변화 검증 행렬 (4단계)',
                                '5_2_a4_edge_matrix':      '5-2. A4 테두리 픽셀 알파값 변화 검증 행렬 (4단계)',
                                '6_1_shirt_cascade_final': '6-1. CascadePSP 최종 결과물 — 의류',
                                '6_2_a4_cascade_final':    '6-2. CascadePSP 최종 결과물 — A4',
                                '7_a4_quad_detection':     '7. A4 꼭짓점 검출 결과',
                                '8_warped_shirt_mask':     '8. 카메라 화각 왜곡 보정 완료 (정면화)',
                              };
                              const descs = {
                                '1_1_shirt_crop_original': '사용자가 화면에서 드래그해 지정한 의류 영역을 잘라낸 원본 크롭입니다. 이 이미지가 SAM-HQ의 첫 번째 입력 재료가 됩니다.',
                                '1_2_a4_crop_original': '사용자가 화면에서 드래그해 지정한 A4 용지 영역을 잘라낸 원본 크롭입니다. 이 이미지로부터 실제 cm 크기를 역산하는 절대 기준(ppcm)이 계산됩니다.',
                                '2_1_shirt_sam_prompt': '상의(Top)의 경우: T자 형태에 맞춰 ①칼라 아래 중앙, ②왼쪽 소매 끝, ③오른쪽 소매 끝, ④몸통 중단, ⑤밑단 중앙에 힌트 점을 찍습니다. 하의(Bottom)는 A자 패턴으로 ①허리 중앙, ②허벅지(허복시), ③왼쪽 무릎, ④오른쪽 무릎, ⑤밑단 중앙에 찍습니다. SAM-HQ는 이 5개 좌표를 신호로 받아 경계를 추론합니다.',
                                '2_2_a4_sam_prompt': 'A4 용지의 경우: 중앙과 상하좌우로 균등하게 퍼진 5개 힌트 좌표를 찍습니다. 흰색 A4가 명도 차이로 쉽게 분리되도록 범위를 넓게 잡습니다.',
                                '3_1_shirt_sam_raw': 'SAM-HQ 모델이 힌트 5점을 보고 1차로 뽑아낸 의류 마스크입니다. 이 단계는 아직 원본 해상도와 다를 수 있고 테두리가 다소 뭉툭합니다. 이후 CascadePSP가 이 마스크를 원본 해상도에서 재정밀화합니다.',
                                '3_2_a4_sam_raw': 'SAM-HQ가 1차로 뽑아낸 A4 용지 마스크입니다. 의류와 마찬가지로 CascadePSP가 뒤이어 정밀화합니다.',
                                '4_1_shirt_cascade_diff': 'CascadePSP가 의류 테두리를 재정밀화한 결과를 SAM-HQ 결과와 비교한 차이점 시각화입니다. 배경으로 재분류돼 삭제된 픽셀은 빨간색, 새로 옷감으로 확보된 픽셀은 초록색으로 표시됩니다.',
                                '4_2_a4_cascade_diff': 'CascadePSP가 A4 테두리를 재정밀화한 결과와의 차이점입니다. A4 모서리 처리가 어떻게 바뀌었는지 확인할 수 있습니다.',
                                '5_1_shirt_edge_matrix': '의류 테두리에서 가장 경계가 급격히 변하는 지점 1곳을 찾아 15×15픽셀 영역을 60px 격자로 확대한 4단계 검증 행렬입니다. ① 4K 원본 픽셀 색상 ② SAM-HQ Raw 알파값(0 또는 255) ③ CascadePSP Soft 알파값(0~255 연속) ④ Threshold 250 이진화 최종값(치수 계산에 사용).',
                                '5_2_a4_edge_matrix': 'A4 테두리에서 경계가 급격한 지점의 4단계 검증 행렬입니다. A4는 Threshold 5(매우 낮음)로 이진화하여 종이가 약간만 찍혀도 포함됩니다.',
                                '6_1_shirt_cascade_final': 'CascadePSP가 원본 4K 해상도에서 테두리를 재추론한 최종 의류 이미지입니다. 이후 Threshold 250으로 이진화하여 치수 계산용 마스크로 사용됩니다.',
                                '6_2_a4_cascade_final': 'CascadePSP가 재정밀화한 최종 A4 용지 이미지입니다. 이후 Threshold 5로 이진화하여 A4 윤곽선 검출에 사용됩니다.',
                                '7_a4_quad_detection': 'CascadePSP로 완성된 A4 마스크에서 윤곽선을 추출한 뒤, 각 변에 fitLine을 적용해 4개 직선 방정식의 교점(intersection)을 꼭짓점으로 계산합니다. 이 4점이 실제 210×297mm 기준이 되어 ppcm을 산출합니다.',
                                '8_warped_shirt_mask': 'A4 꼭짓점 4개로 getPerspectiveTransform 행렬을 계산한 뒤 warpPerspective로 전체 이미지에 적용한 결과입니다. 카메라가 비스듬히 찍어도 옷을 정면 위에서 내려다본 것처럼 펼쳐집니다. 이 상태에서 각 특징점(겨드랑이·목·밑단 등)간 픽셀 거리를 ppcm으로 나눠 cm를 얻습니다.',
                              };
                              return (
                                <div
                                  key={key}
                                  className="dev-debug-item"
                                  style={isFullWidth ? { gridColumn: '1 / -1' } : {}}
                                >
                                  <div className="dev-debug-label">{labels[key] || key}</div>
                                  <img
                                    src={`data:image/jpeg;base64,${base64Img}`}
                                    alt={key}
                                    className="dev-debug-img"
                                    style={isFullWidth ? { width: '100%', maxWidth: '100%' } : {}}
                                  />
                                  <div className="dev-debug-desc">{descs[key] || ''}</div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="cv-actions">
                {(cvStep > 0 && cvStep < 5) && (
                  <>
                    <button className="cv-btn tertiary" onClick={() => {
                      setCvStep(0); setCvImage(null); setRectShirt(null); setRectA4(null); setCurrentRect(null); setShoulderPts([]);
                      imgRef.current = null;
                      if (canvasRef.current) { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }
                    }} disabled={cvLoading}>사진 변경</button>
                    <button className="cv-btn secondary" onClick={() => {
                      setCvStep(1); setRectShirt(null); setRectA4(null); setCurrentRect(null); setShoulderPts([]);
                      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null, []);
                    }} disabled={cvLoading}>다시 그리기</button>
                  </>
                )}
                {cvStep === 4 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>

                    <label style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 14px', borderRadius: '8px',
                      background: debugModeEnabled ? 'rgba(234,179,8,0.12)' : 'rgba(100,116,139,0.08)',
                      border: `1px solid ${debugModeEnabled ? '#ca8a04' : '#e2e8f0'}`,
                      cursor: 'pointer', transition: 'all 0.2s',
                      fontSize: '0.82rem', fontWeight: 600,
                      color: debugModeEnabled ? '#92400e' : '#64748b',
                    }}>
                      <input
                        type="checkbox"
                        checked={debugModeEnabled}
                        onChange={e => setDebugModeEnabled(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ca8a04' }}
                      />
                      🔍 디버그 이미지 생성 (분석 과정 단계별 시각화 — 느려짐)
                    </label>
                    <button className="cv-btn primary" style={{ flex: 1, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }} onClick={() => handleAnalyze()} disabled={cvLoading}>
                      {cvLoading ? '분석 중...' : '자동 치수 추출 시작'}
                    </button>
                  </div>
                )}
                {cvStep === 5 && (
                  <>
                    <button className="cv-btn tertiary" onClick={() => {
                      setCvStep(0); setCvImage(null); setRectShirt(null); setRectA4(null); setCurrentRect(null); setShoulderPts([]);
                      setCvResultData(null); setMeasurementWarnings([]);
                      imgRef.current = null;
                      if (canvasRef.current) { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }
                    }}>사진 변경</button>
                    <button className="cv-btn secondary" onClick={() => {
                      setCvStep(1); setRectShirt(null); setRectA4(null); setCurrentRect(null); setShoulderPts([]);
                      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null, []);
                    }}>다시 측정</button>
                  <button className="cv-btn primary" onClick={handleApplyMeasurements}>치수 적용</button>
                  </>
                )}
              </div>

              {cvLoading && (
                <div className="cv-loader">
                  <div className="spinner"></div>
                  <p>이미지 분석 및 치수 추출 중...</p>
                </div>
              )}
            </div> {/* cv-main end */}

            {/* 측정 가이드 패널 (우측 배치) */}
            {(cvStep >= 1 && cvStep <= 4) && (
              <div className="cv-guide-panel right-panel">
                <StepGuideAnimation step={cvStep} categoryType={formData.category_type} isAnalyzing={cvLoading} />
              </div>
            )}

          </div>
        </div>
      )}

      <div style={{ maxWidth: '600px', margin: '40px auto 0', padding: '0 20px', boxSizing: 'border-box' }}>
        <button onClick={() => navigate('/mypage/products')} className="back-btn" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0', marginBottom: '16px', background: 'transparent' }}>
          <ChevronLeft size={20} />
          <span>상품 관리</span>
        </button>
        <h1 style={{ margin: '0 0 8px', fontSize: '2rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.5px' }}>
          {isEditMode ? '상품 수정' : '상품 등록'}
        </h1>
        <p style={{ margin: 0, color: '#64748b' }}>판매할 상품의 상세 정보 및 사이즈를 입력해 주세요.</p>
      </div>

      <div className="register-card" style={{ marginTop: '24px' }}>
        <form onSubmit={handleSubmit} className="register-form">
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ color: '#334155', fontWeight: 600 }}>브랜드 <span className="required">*</span></label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Tag size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px' }} />
                <input 
                  type="text" 
                  name="brand" 
                  value={formData.brand} 
                  onChange={handleInputChange} 
                  placeholder="예: 나이키"
                  style={{ paddingLeft: '40px', width: '100%', boxSizing: 'border-box' }}
                  required 
                />
              </div>
            </div>

            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ color: '#334155', fontWeight: 600 }}>카테고리 <span className="required">*</span></label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <LayoutGrid size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px' }} />
                <select 
                  name="category_id" 
                  value={formData.category_id} 
                  onChange={handleInputChange} 
                  style={{ paddingLeft: '40px', appearance: 'none', width: '100%', boxSizing: 'border-box' }}
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <ChevronDown size={18} color="#94a3b8" style={{ position: 'absolute', right: '14px', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>

          {/* Dynamic Measurements Section */}
          <div className="measurements-section">
            <div className="measurements-header">
              <label>사이즈별 치수 (cm)</label>
              <button 
                type="button" 
                className="add-size-btn"
                onClick={() => setSizes(prev => [...prev, { id: Date.now(), size_name: '', length: '', chest: '', shoulder: '', sleeve: '', sleeve_length: '', neck: '', waist: '', thigh: '', rise: '', hem: '' }])}
              >
                + 사이즈 추가
              </button>
            </div>
            
            <div className="sizes-container">
              {sizes.map((size, index) => (
                <div key={size.id} className="size-row-card">
                  <div className="size-row-header">
                    <input 
                      type="text" 
                      placeholder="사이즈명 (예: S, M, Free)" 
                      value={size.size_name}
                      onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, size_name: e.target.value} : s))}
                      required
                      className="size-name-input"
                    />
                    <div className="size-actions">
                      <div className="ai-btn-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          type="button" 
                          className="ai-extract-btn active"
                          style={{ color: '#ffffff' }}
                          onClick={() => {
                            setActiveSizeId(size.id);
                            setShowCvModal(true);
                          }}
                        >
                          자동 측정
                        </button>
                        <div className="tooltip-container" style={{ position: 'relative', display: 'inline-flex' }}>
                          <span className="help-icon" style={{ cursor: 'pointer', background: '#e2e8f0', color: '#475569', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>?</span>
                          <span className="tooltip" style={{ width: '220px', lineHeight: '1.4' }}>의류 사진을 업로드하면 이미지 분석을 통해 자동으로 각 부위의 치수를 추출해주는 기능입니다.</span>
                        </div>
                      </div>
                      {sizes.length > 1 && (
                        <button 
                          type="button" 
                          className="remove-size-btn"
                          onClick={() => setSizes(prev => prev.filter(s => s.id !== size.id))}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="measurements-grid">
                    <div className="m-input">
                      <span>총장</span>
                      <input type="number" step="0.1" value={size.length} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, length: e.target.value} : s))} placeholder="0.0" />
                    </div>
                    {formData.category_type === 'Top' ? (
                      <>
                        <div className="m-input">
                          <span>어깨너비</span>
                          <input type="number" step="0.1" value={size.shoulder || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, shoulder: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>가슴단면</span>
                          <input type="number" step="0.1" value={size.chest || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, chest: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>소매단면</span>
                          <input type="number" step="0.1" value={size.sleeve || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, sleeve: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>소매길이</span>
                          <input type="number" step="0.1" value={size.sleeve_length || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, sleeve_length: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>넥라인</span>
                          <input type="number" step="0.1" value={size.neck || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, neck: e.target.value} : s))} placeholder="0.0" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="m-input">
                          <span>허리단면</span>
                          <input type="number" step="0.1" value={size.waist || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, waist: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>허벅지단면</span>
                          <input type="number" step="0.1" value={size.thigh || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, thigh: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>밑위</span>
                          <input type="number" step="0.1" value={size.rise || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, rise: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>밑단단면</span>
                          <input type="number" step="0.1" value={size.hem || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, hem: e.target.value} : s))} placeholder="0.0" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>상품명 <span className="required">*</span></label>
            <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
          </div>

          <div className="form-group">
            <label>가격 (원) <span className="required">*</span></label>
            <input type="number" name="price" value={formData.price} onChange={handleInputChange} required />
          </div>

          <div className="form-group">
            <label>상품 이미지 (대표) <span className="required">*</span></label>
            <div
              onClick={() => document.getElementById('mainImageInput').click()}
              style={{
                border: '2px dashed #cbd5e1', borderRadius: '14px',
                padding: '40px', textAlign: 'center', cursor: 'pointer',
                background: '#f8fafc', transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
            >
              <Upload size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                {mainImage ? mainImage.name : '클릭하여 대표 사진 업로드'}
              </p>
              <input id="mainImageInput" type="file" accept="image/*" onChange={handleMainImageChange} style={{ display: 'none' }} />
            </div>
          </div>

          <div className="form-group">
            <label>상품 상세 이미지(여러장 가능) <span className="required">*</span></label>
            <div
              onClick={() => document.getElementById('descImageInput').click()}
              style={{
                border: '2px dashed #cbd5e1', borderRadius: '14px',
                padding: '40px', textAlign: 'center', cursor: 'pointer',
                background: '#f8fafc', transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
            >
              <Upload size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                {descImages.length > 0 ? `${descImages.length}개 파일 선택됨` : '클릭하여 상세 사진 업로드'}
              </p>
              <input id="descImageInput" type="file" accept="image/*" onChange={handleDescImageChange} style={{ display: 'none' }} multiple required={!isEditMode} />
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '처리 중...' : (isEditMode ? '수정하기' : '등록하기')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProductRegister;
