import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './ProductRegister.css'; // Reuse some styles
import './SizeReviewRegister.css';
import ErrorToast from '../components/ErrorToast';
import MeasurementWarning, { validateMeasurements } from '../components/MeasurementWarning';
import { ChevronLeft, Camera, RefreshCw, CheckCircle2, RotateCcw } from 'lucide-react';

function SizeReviewRegister() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [loading, setLoading] = useState(false);
  const userEmail = sessionStorage.getItem('userEmail')?.trim();

  // CV Algorithm State
  const [cvStep, setCvStep] = useState(0); // 0: select size & upload, 1: draw shirt, 2: draw a4, 3: ready, 4: result
  const [cvImage, setCvImage] = useState(null);
  const [rectShirt, setRectShirt] = useState(null);
  const [rectA4, setRectA4] = useState(null);
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
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      }
    } catch (error) {
      console.error('Error fetching product:', error);
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
    const pos = getPos(e);
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
    redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectShirt, rectA4, newRect);
  };

  const onUp = () => {
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
      
      const category_type = product?.category?.name.includes('상의') ? 'Top' : 'Bottom';
      reqFormData.append('category_type', category_type);

      const response = await fetch('http://localhost:8000/api/measure/clothing', {
        method: 'POST',
        body: reqFormData,
      });

      if (response.ok) {
        const data = await response.json();
        setCvResultData(data);
        setCvStep(4);
        setMeasurementWarnings(validateMeasurements(data, category_type).warnings);
      } else {
        const err = await response.json();
        setErrorToast({ code: null, detail: err.detail });
      }
    } catch (error) {
      console.error(error);
      setErrorToast({ code: null, detail: '네트워크 오류가 발생했습니다.' });
    } finally {
      setCvLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!cvResultData || !selectedSize || !userEmail) {
      alert('필수 정보가 누락되었습니다.');
      return;
    }

    setLoading(true);
    try {
      const isTop = product?.category?.name.includes('상의');
      const submitData = new FormData();
      submitData.append('product_id', productId);
      submitData.append('user_email', userEmail);
      submitData.append('size_name', selectedSize);
      
      submitData.append('length', cvResultData.length_cm);
      if (isTop) {
        submitData.append('chest_or_waist', cvResultData.chest_cm);
        submitData.append('shoulder_or_thigh', cvResultData.shoulder_width_cm || 0); // 어깨너비 추가 대응 필요시
        submitData.append('sleeve_or_rise', cvResultData.sleeve_width_cm);
        submitData.append('neck_or_hem', cvResultData.neck_width_cm);
      } else {
        submitData.append('chest_or_waist', cvResultData.waist_cm);
        submitData.append('shoulder_or_thigh', cvResultData.thigh_cm);
        submitData.append('sleeve_or_rise', cvResultData.rise_cm);
        submitData.append('neck_or_hem', cvResultData.hem_cm);
      }

      // 최종 결과 이미지를 파일로 변환하여 전송
      const debugResp = await fetch(`data:image/jpeg;base64,${cvResultData.debug_image_base64}`);
      const debugBlob = await debugResp.blob();
      submitData.append('debug_image', debugBlob, 'result.jpg');

      const response = await fetch('http://localhost:8000/api/size-reviews', {
        method: 'POST',
        body: submitData,
      });

      if (response.ok) {
        alert('사이즈 후기가 등록되었습니다.');
        navigate(`/products/${productId}`);
      } else {
        alert('등록 실패');
      }
    } catch (error) {
      console.error(error);
      alert('오류 발생');
    } finally {
      setLoading(false);
    }
  };

  if (!product) return <div className="sr-loading">Loading...</div>;

  const isTop = product.category.name.includes('상의');
  const availableSizes = isTop ? product.top_sizes : product.bottom_sizes;

  return (
    <div className="sr-container">
      <header className="sr-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h2>실측 사이즈 후기 남기기</h2>
        <div style={{ width: 24 }}></div>
      </header>

      <main className="sr-content">
        <div className="sr-product-brief">
          <img src={`http://localhost:8000${product.image_url}`} alt={product.name} />
          <div className="brief-info">
            <span className="brand">{product.brand}</span>
            <span className="name">{product.name}</span>
          </div>
        </div>

        <section className="sr-form-section">
          <div className="form-group">
            <label>구매하신 사이즈를 선택해주세요</label>
            <div className="size-selector">
              {availableSizes.map((s) => (
                <button
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
            <div className="ai-header">
              <h3>AI 치수 추출</h3>
              <button className="guide-btn" onClick={() => setIsGuideOpen(!isGuideOpen)}>{isGuideOpen ? '가이드 닫기' : '? 촬영 가이드'}</button>
            </div>

            {isGuideOpen && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#334155', fontSize: '0.95rem' }}>📷 이렇게 촬영해주세요</h4>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#475569', fontSize: '0.9rem', lineHeight: '1.6' }}>
                  <li style={{ marginBottom: '0.5rem' }}><strong>공통:</strong> A4 용지(21×29.7cm)를 옷과 겹치지 않게 옆에 반듯하게 놓고 정면으로 찍어주세요.</li>
                  {isTop ? (
                    <>
                      <li style={{ marginBottom: '0.5rem' }}><strong>상의:</strong> 겨드랑이 굴곡이 잘 보이도록 양소매를 살짝 벌려주세요.</li>
                      <li style={{ marginBottom: '0.5rem' }}><strong>상의:</strong> 목 부분과 밑단이 구겨지지 않게 쫙 펴주세요.</li>
                    </>
                  ) : (
                    <>
                      <li style={{ marginBottom: '0.5rem' }}><strong>하의:</strong> 사타구니가 명확히 보이도록 두 다리를 겹치지 않게 A자 형태로 벌려주세요.</li>
                      <li style={{ marginBottom: '0.5rem' }}><strong>하의:</strong> 허리선이 겹치거나 울지 않게 반듯하게 펴주세요.</li>
                    </>
                  )}
                </ul>
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span>⚠️</span>
                  <span>의류가 아닌 사진이나 카테고리와 다른 옷을 업로드하면 측정 결과가 부정확합니다.</span>
                </div>
              </div>
            )}

            {cvStep === 0 && (
              <label htmlFor="sr-upload" className="upload-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', width: '100%', border: '2px dashed #cbd5e1', borderRadius: '12px', height: '200px', background: '#f1f5f9' }}>
                <input type="file" id="sr-upload" style={{ display: 'none' }} accept="image/*" onChange={handleCvImageUpload} />
                <Camera size={40} color="#64748b" />
                <span style={{ fontWeight: 600, marginTop: '0.5rem', color: '#64748b' }}>의류 실루엣 사진 업로드</span>
                <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#64748b' }}>A4 용지가 함께 나오도록 촬영해주세요</p>
              </label>
            )}

            <div className="canvas-wrapper" style={{ display: (cvStep > 0 && cvStep < 4) ? 'flex' : 'none' }}>
              <div className="canvas-instruction">
                {cvStep === 1 ? "1. 의류 영역을 드래그하세요" : "2. A4 용지 영역을 드래그하세요"}
              </div>
              <canvas
                ref={canvasRef}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onTouchStart={onDown}
                onTouchMove={onMove}
                onTouchEnd={onUp}
              />
              <div className="canvas-actions">
                <button onClick={() => setCvStep(0)}><RefreshCw size={16} /> 다시 업로드</button>
                <button onClick={() => {
                  setRectShirt(null);
                  setRectA4(null);
                  setCvStep(1);
                  redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null);
                }}><RotateCcw size={16} /> 영역 다시 그리기</button>
                {cvStep === 3 && (
                  <button className="btn-analyze" onClick={handleAnalyze} disabled={cvLoading}>
                    {cvLoading ? '분석 중...' : '분석 시작'}
                  </button>
                )}
              </div>
            </div>

            {cvStep === 4 && cvResultData && (
              <div className="sr-result-card">
                <div className="result-img-box">
                  <img src={`data:image/jpeg;base64,${cvResultData.debug_image_base64}`} alt="Result" />
                </div>
                <div className="result-grid">
                  <div className="res-item"><span>총장</span><strong>{cvResultData.length_cm}cm</strong></div>
                  {isTop ? (
                    <>
                      <div className="res-item"><span>가슴</span><strong>{cvResultData.chest_cm}cm</strong></div>
                      <div className="res-item"><span>소매</span><strong>{cvResultData.sleeve_width_cm}cm</strong></div>
                      <div className="res-item"><span>목폭</span><strong>{cvResultData.neck_width_cm}cm</strong></div>
                    </>
                  ) : (
                    <>
                      <div className="res-item"><span>허리</span><strong>{cvResultData.waist_cm}cm</strong></div>
                      <div className="res-item"><span>허벅지</span><strong>{cvResultData.thigh_cm}cm</strong></div>
                      <div className="res-item"><span>밑위</span><strong>{cvResultData.rise_cm}cm</strong></div>
                      <div className="res-item"><span>밑단</span><strong>{cvResultData.hem_cm}cm</strong></div>
                    </>
                  )}
                </div>
                <button className="btn-retry" onClick={() => setCvStep(0)}>다시 측정하기</button>
                
                {measurementWarnings.length > 0 && (
                  <div style={{ padding: '1rem' }}>
                    <MeasurementWarning warnings={measurementWarnings} />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="sr-actions">
          {measurementWarnings.length > 0 && cvStep === 4 && (
            <div style={{ textAlign: 'center', color: '#dc2626', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>
              추출된 치수가 정상 범위를 크게 벗어나 사이즈 후기로 등록할 수 없습니다.<br/>영역 지정이나 사진 구도를 확인하고 다시 시도해주세요.
            </div>
          )}
          <button
            className="btn-submit-sr"
            disabled={cvStep !== 4 || !selectedSize || loading || measurementWarnings.length > 0}
            onClick={handleSubmitReview}
          >
            {loading ? '등록 중...' : '사이즈 후기 등록 완료'}
          </button>
        </div>
      </main>

      {errorToast && (
        <ErrorToast
          errorCode={null}
          errorDetail={errorToast.detail}
          onClose={() => setErrorToast(null)}
        />
      )}
    </div>
  );
}

export default SizeReviewRegister;
