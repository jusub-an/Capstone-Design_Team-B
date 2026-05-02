import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './ProductRegister.css';
import MeasurementGuide from '../components/MeasurementGuide';
import ErrorToast from '../components/ErrorToast';
import MeasurementWarning, { validateMeasurements } from '../components/MeasurementWarning';

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
    { id: Date.now(), size_name: 'Free', length: '', chest: '', sleeve: '', neck: '', waist: '', thigh: '', rise: '', hem: '' }
  ]);
  const [activeSizeId, setActiveSizeId] = useState(null);

  const [mainImage, setMainImage] = useState(null);
  const [descImages, setDescImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const userEmail = sessionStorage.getItem('userEmail')?.trim();

  // CV Algorithm State
  const [showCvModal, setShowCvModal] = useState(false);
  const [cvImage, setCvImage] = useState(null);
  const [cvStep, setCvStep] = useState(0); // 0: upload, 1: draw shirt, 2: draw a4, 3: ready
  const [rectShirt, setRectShirt] = useState(null);
  const [rectA4, setRectA4] = useState(null);
  const [currentRect, setCurrentRect] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [cvLoading, setCvLoading] = useState(false);
  const [errorToast, setErrorToast] = useState(null);
  const [measurementWarnings, setMeasurementWarnings] = useState([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [devDebugOpen, setDevDebugOpen] = useState(false);
  
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    fetchCategories();
    if (isEditMode) {
      fetchProductData();
    }
  }, [id]);

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
        if (data.sizes && data.sizes.length > 0) {
          setSizes(data.sizes.map(s => ({ ...s, id: Math.random() })));
        } else {
          setSizes([{ id: Date.now(), size_name: 'Free', length: '', chest: '', sleeve: '', neck: '', waist: '', thigh: '', rise: '', hem: '' }]);
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

  // --- CV Canvas Logic ---
  const handleCvImageUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          imgRef.current = img;
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = Math.max(window.innerHeight * 0.55, 300); // Prevent overflow on various screens
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
          setCurrentRect(null);
          redrawCanvas(w, h, scale, null, null, null);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const redrawCanvas = (w, h, scale, rs, ra, cr) => {
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
    if (cvStep !== 1 && cvStep !== 2) return;
    e.preventDefault();
    const pos = getPos(e);
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
    redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, rectA4, newRect);
  };

  const onUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentRect && currentRect.w > 30 && currentRect.h > 30) {
      if (cvStep === 1) {
        setRectShirt({ ...currentRect });
        setCvStep(2);
        redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, currentRect, rectA4, null);
      } else if (cvStep === 2) {
        setRectA4({ ...currentRect });
        setCvStep(3);
        redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, currentRect, null);
      }
    } else {
      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, rectA4, null);
    }
    setCurrentRect(null);
  };

  const cropToBlob = (rect) => {
    const temp = document.createElement('canvas');
    temp.width = rect.w; 
    temp.height = rect.h;
    const sx = rect.x / scaleFactor;
    const sy = rect.y / scaleFactor;
    const sw = rect.w / scaleFactor;
    const sh = rect.h / scaleFactor;
    temp.getContext('2d').drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, rect.w, rect.h);
    return new Promise(res => temp.toBlob(res, 'image/jpeg'));
  };

  const [cvResultData, setCvResultData] = useState(null);

  const handleAnalyze = async () => {
    if (!rectShirt || !rectA4) return;
    setCvLoading(true);
    
    try {
      const shirtBlob = await cropToBlob(rectShirt);
      const a4Blob = await cropToBlob(rectA4);

      const reqFormData = new FormData();
      reqFormData.append('shirt_image', shirtBlob, 'shirt.jpg');
      reqFormData.append('a4_image', a4Blob, 'a4.jpg');
      reqFormData.append('shirt_x', rectShirt.x.toString());
      reqFormData.append('shirt_y', rectShirt.y.toString());
      reqFormData.append('shirt_w', rectShirt.w.toString());
      reqFormData.append('shirt_h', rectShirt.h.toString());
      reqFormData.append('a4_x', rectA4.x.toString());
      reqFormData.append('a4_y', rectA4.y.toString());
      reqFormData.append('a4_w', rectA4.w.toString());
      reqFormData.append('a4_h', rectA4.h.toString());
      reqFormData.append('orig_w', canvasRef.current.width.toString());
      reqFormData.append('orig_h', canvasRef.current.height.toString());
      reqFormData.append('category_type', formData.category_type);

      const response = await fetch('http://localhost:8000/api/measure/clothing', {
        method: 'POST',
        body: reqFormData,
      });

      if (response.ok) {
        const data = await response.json();
        setCvResultData(data);
        setCvStep(4);

        // 비율 기반 비정상 치수 검증
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
            sleeve: cvResultData.sleeve_width_cm,
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
    setShowCvModal(false);
    alert('치수가 적용되었습니다.');
  };

  const handleCloseCvModal = () => {
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
    <div className="register-container">
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
          <div className={`cv-modal ${isGuideOpen ? 'cv-modal-expanded' : ''} ${devDebugOpen ? 'cv-modal-debug-open' : ''}`}>

            {/* 왼쪽: 가이드 패널 (모달 너비를 확장하면서 나타남) */}
            <MeasurementGuide
              categoryType={formData.category_type}
              isOpen={isGuideOpen}
              onClose={() => setIsGuideOpen(false)}
            />

            {/* 오른쪽: 메인 콘텐츠 */}
            <div className="cv-main">
              {/* 헤더 */}
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
                  {formData.category_type === 'Top' ? '👕' : '👖'} AI 자동 치수 추출
                </h3>
                <button className="cv-close-btn" onClick={handleCloseCvModal}>✕</button>
              </div>

              {/* 단계 표시줄 */}
              <div className="cv-stepper">
                {['업로드', '의류 영역', 'A4 영역', '분석', '결과'].map((label, i) => (
                  <div key={i} className={`cv-step-dot ${cvStep >= i ? 'cv-step-active' : ''} ${cvStep === i ? 'cv-step-current' : ''}`}>
                    <div className="cv-dot-circle">{cvStep > i ? '✓' : i + 1}</div>
                    <span className="cv-dot-label">{label}</span>
                  </div>
                ))}
              </div>

              {/* 안내 메시지 */}
              <div className="cv-instructions">
                {cvStep === 0 && "사진을 업로드 해주세요."}
                {cvStep === 1 && <span>원본 이미지에서 <span style={{color:'#f87171'}}>의류 영역</span>을 드래그하여 박스를 쳐주세요.</span>}
                {cvStep === 2 && <span>원본 이미지에서 <span style={{color:'#4ade80'}}>A4 용지 영역</span>을 드래그하여 박스를 쳐주세요.</span>}
                {cvStep === 3 && "영역 지정 완료! 분석을 시작하세요."}
                {cvStep === 4 && "치수 추출 완료! 결과를 확인하고 적용하세요."}
              </div>

              {/* Step 0: 업로드 */}
              {cvStep === 0 && (
                <div className="cv-upload-area">
                  <input type="file" accept="image/*" onChange={handleCvImageUpload} id="cvImageInput" style={{display: 'none'}} />
                  <label htmlFor="cvImageInput" className="cv-upload-label">
                    <span className="cv-upload-icon">📸</span>
                    <span className="cv-upload-text">사진 선택하기</span>
                    <span className="cv-upload-sub">JPG, PNG 파일을 선택하세요</span>
                  </label>
                </div>
              )}

              {/* Step 1~3: 캔버스 */}
              <div className="cv-canvas-container" style={{ display: (cvStep > 0 && cvStep < 4) ? 'flex' : 'none' }}>
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

              {/* Step 4: 결과 */}
              {cvStep === 4 && cvResultData && (
                <div className="cv-result-container">
                  <div className="cv-result-image">
                    <img src={`data:image/jpeg;base64,${cvResultData.debug_image_base64}`} alt="AI 추출 결과 시각화" />
                  </div>
                  <div className="cv-result-values">
                    <div className="val-box"><span>총장</span><strong>{cvResultData.length_cm} cm</strong></div>
                    {formData.category_type === 'Top' ? (
                      <>
                        <div className="val-box"><span>가슴단면</span><strong>{cvResultData.chest_cm} cm</strong></div>
                        <div className="val-box"><span>소매끝단면</span><strong>{cvResultData.sleeve_width_cm} cm</strong></div>
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

                  {/* 🔧 Developer Debug Visualization Panel */}
                  {cvResultData.debug_stages && (
                    <div className="dev-debug-panel">
                      <button
                        type="button"
                        className="dev-debug-toggle"
                        onClick={() => setDevDebugOpen(!devDebugOpen)}
                      >
                        <span className="dev-debug-toggle-icon">{devDebugOpen ? '▼' : '▶'}</span>
                        <span>🔧 개발자 디버그 시각화</span>
                        <span className="dev-debug-badge">{Object.keys(cvResultData.debug_stages).length} stages</span>
                      </button>
                      {devDebugOpen && (
                        <div className="dev-debug-content">
                          {Object.entries(cvResultData.debug_stages)
                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                            .map(([key, base64Img]) => {
                              const labels = {
                                '0_shirt_crop_original': '0. 의류 크롭 원본 (Shirt Crop Original)',
                                '1_a4_crop_original': '1. A4 크롭 원본 (A4 Crop Original)',
                                '2_shirt_rembg_rgba': '2. 의류 배경 제거 결과 (Shirt rembg RGBA)',
                                '3_a4_rembg_rgba': '3. A4 배경 제거 결과 (A4 rembg RGBA)',
                                '4_a4_alpha_mask': '4. A4 알파 채널 마스크 (A4 Alpha Mask)',
                                '5_a4_quad_detection': '5. A4 사각형 꼭짓점 검출 (A4 Quad Detection)',
                                '6_shirt_alpha_mask': '6. 의류 알파 채널 마스크 (Shirt Alpha Mask)',
                                '7_full_mask_on_canvas': '7. 전체 캔버스 마스크 배치 (Full Canvas Mask)',
                                '8_warped_shirt_mask': '8. 원근 보정된 마스크 (Warped Mask)',
                                '9_silhouette_contour': '9. 실루엣 윤곽선 (Silhouette Contour)',
                                '10_convex_hull': '10. 볼록 껍질 (Convex Hull)',
                                '11_convexity_defects': '11. 오목 결함점 (Convexity Defects)',
                                '12_final_debug': '12. 최종 특징점 + 치수선 (Final Debug)',
                              };
                              const descs = {
                                '0_shirt_crop_original': '프론트엔드에서 사용자가 드래그한 의류 영역을 잘라낸 원본 이미지입니다. rembg에 입력되는 원본 크롭.',
                                '1_a4_crop_original': '프론트엔드에서 사용자가 드래그한 A4 용지 영역을 잘라낸 원본 이미지입니다. 스케일 기준 계산에 사용.',
                                '2_shirt_rembg_rgba': 'rembg(U²-Net)로 배경을 제거한 의류 RGBA 결과. 체커보드 위에 합성하여 알파 채널 품질을 확인합니다.',
                                '3_a4_rembg_rgba': 'rembg로 배경을 제거한 A4 용지 RGBA 결과. A4가 깨끗하게 분리되었는지 확인합니다.',
                                '4_a4_alpha_mask': 'A4 RGBA의 알파 채널만 추출 후 이진화(threshold=10)한 마스크. 흰색=전경, 검정=배경.',
                                '5_a4_quad_detection': 'A4 마스크에서 최대 윤곽선(초록)을 찾고 approxPolyDP로 4꼭짓점(빨강)을 검출한 결과.',
                                '6_shirt_alpha_mask': '의류 RGBA의 알파 채널을 이진화한 마스크. 의류 실루엣이 정확히 분리되었는지 확인.',
                                '7_full_mask_on_canvas': '크롭된 의류 마스크를 원본 전체 캔버스(orig_w × orig_h) 위에 올바른 좌표로 배치한 결과.',
                                '8_warped_shirt_mask': 'A4 기반 원근 변환 행렬(M)을 적용하여 투시 왜곡을 보정한 의류 마스크.',
                                '9_silhouette_contour': '보정된 마스크에서 findContours로 추출한 최대 윤곽선. 이후 모든 특징점 검출의 기반.',
                                '10_convex_hull': '윤곽선(흰색)과 볼록 껍질(노란색)을 겹쳐서 표시. 껍질과 윤곽선의 차이가 오목 결함점이 됩니다.',
                                '11_convexity_defects': '볼록 껍질 결함점 시각화. 빨간 점=깊이 10px 이상(유의미), 회색=미달. 숫자는 깊이(px).',
                                '12_final_debug': '모든 특징점(겨드랑이, 목, 밑단 등)과 치수 측정선을 최종 합성한 디버그 이미지.',
                              };
                              return (
                                <div key={key} className="dev-debug-item">
                                  <div className="dev-debug-label">{labels[key] || key}</div>
                                  <img
                                    src={`data:image/jpeg;base64,${base64Img}`}
                                    alt={key}
                                    className="dev-debug-img"
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

              {/* 액션 버튼 */}
              <div className="cv-actions">
                {(cvStep > 0 && cvStep < 4) && (
                  <>
                    <button className="cv-btn tertiary" onClick={() => {
                      setCvStep(0); setCvImage(null); setRectShirt(null); setRectA4(null); setCurrentRect(null);
                      imgRef.current = null;
                      if (canvasRef.current) { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }
                    }} disabled={cvLoading}>사진 변경</button>
                    <button className="cv-btn secondary" onClick={() => {
                      setCvStep(1); setRectShirt(null); setRectA4(null); setCurrentRect(null);
                      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null);
                    }} disabled={cvLoading}>다시 그리기</button>
                  </>
                )}
                {cvStep === 3 && (
                  <button className="cv-btn primary" onClick={handleAnalyze} disabled={cvLoading}>
                    {cvLoading ? '분석 중...' : '🚀 AI 분석 시작'}
                  </button>
                )}
                {cvStep === 4 && (
                  <>
                    <button className="cv-btn tertiary" onClick={() => {
                      setCvStep(0); setCvImage(null); setRectShirt(null); setRectA4(null); setCurrentRect(null);
                      setCvResultData(null); setMeasurementWarnings([]);
                      imgRef.current = null;
                      if (canvasRef.current) { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }
                    }}>사진 변경</button>
                    <button className="cv-btn secondary" onClick={() => {
                      setCvStep(1); setRectShirt(null); setRectA4(null); setCurrentRect(null);
                      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null);
                    }}>다시 측정</button>
                    <button className="cv-btn primary" onClick={handleApplyMeasurements}>✅ 치수 적용</button>
                  </>
                )}
              </div>

              {cvLoading && (
                <div className="cv-loader">
                  <div className="spinner"></div>
                  <p>AI 누끼 추출 및 텐서 기하학 분석 중...</p>
                </div>
              )}
            </div> {/* cv-main end */}
          </div>
        </div>
      )}

      <div className="register-header-wrapper">
        <button onClick={() => navigate('/mypage/products')} className="back-btn">&larr; 목록으로</button>
        <h2>{isEditMode ? '상품 수정' : '상품 등록'}</h2>
        <div style={{ width: '80px' }}></div>
      </div>

      <div className="register-card">
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label>브랜드 <span className="required">*</span></label>
            <input type="text" name="brand" value={formData.brand} onChange={handleInputChange} required />
          </div>

          <div className="form-group">
            <label>카테고리 <span className="required">*</span></label>
            <select name="category_id" value={formData.category_id} onChange={handleInputChange} required>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Dynamic Measurements Section */}
          <div className="measurements-section">
            <div className="measurements-header">
              <label>사이즈별 치수 (cm)</label>
              <button 
                type="button" 
                className="add-size-btn"
                onClick={() => setSizes(prev => [...prev, { id: Date.now(), size_name: '', length: '', chest: '', sleeve: '', neck: '', waist: '', thigh: '', rise: '', hem: '' }])}
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
                      <div className="ai-btn-wrapper">
                        <button 
                          type="button" 
                          className="ai-extract-btn active"
                          onClick={() => {
                            setActiveSizeId(size.id);
                            setShowCvModal(true);
                          }}
                        >
                          ✨ AI 측정
                        </button>
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
                          <span>가슴단면</span>
                          <input type="number" step="0.1" value={size.chest || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, chest: e.target.value} : s))} placeholder="0.0" />
                        </div>
                        <div className="m-input">
                          <span>소매끝단면</span>
                          <input type="number" step="0.1" value={size.sleeve || ''} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, sleeve: e.target.value} : s))} placeholder="0.0" />
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
            <div className="file-input-wrapper">
              <input type="file" accept="image/*" onChange={handleMainImageChange} className="file-input" />
              <span className="file-name">{mainImage ? mainImage.name : '파일 선택'}</span>
            </div>
          </div>

          <div className="form-group">
            <label>상품 상세 이미지(여러장 가능) <span className="required">*</span></label>
            <div className="file-input-wrapper alternate">
              <input type="file" accept="image/*" onChange={handleDescImageChange} className="file-input" multiple required={!isEditMode} />
              <span className="file-name">{descImages.length > 0 ? `${descImages.length}개 선택됨` : '파일 선택'}</span>
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
