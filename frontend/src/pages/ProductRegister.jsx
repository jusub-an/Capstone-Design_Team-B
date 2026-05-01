import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './ProductRegister.css';

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
    { id: Date.now(), size_name: 'Free', length: '', chest: '', sleeve: '', neck: '' }
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
          setSizes([{ id: Date.now(), size_name: 'Free', length: '', chest: '', sleeve: '', neck: '' }]);
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

      const formData = new FormData();
      formData.append('shirt_image', shirtBlob, 'shirt.jpg');
      formData.append('a4_image', a4Blob, 'a4.jpg');
      formData.append('shirt_x', rectShirt.x.toString());
      formData.append('shirt_y', rectShirt.y.toString());
      formData.append('shirt_w', rectShirt.w.toString());
      formData.append('shirt_h', rectShirt.h.toString());
      formData.append('a4_x', rectA4.x.toString());
      formData.append('a4_y', rectA4.y.toString());
      formData.append('a4_w', rectA4.w.toString());
      formData.append('a4_h', rectA4.h.toString());
      formData.append('orig_w', canvasRef.current.width.toString());
      formData.append('orig_h', canvasRef.current.height.toString());

      const response = await fetch('http://localhost:8000/api/measure/clothing', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setCvResultData(data);
        setCvStep(4);
      } else {
        const err = await response.json();
        alert(`분석 실패: ${err.detail}`);
      }
    } catch (error) {
      console.error(error);
      alert('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setCvLoading(false);
    }
  };

  const handleApplyMeasurements = () => {
    if (!cvResultData || !activeSizeId) return;
    setSizes(prev => prev.map(s => {
      if (s.id === activeSizeId) {
        return {
          ...s,
          length: cvResultData.length_cm,
          chest: cvResultData.chest_cm,
          sleeve: cvResultData.sleeve_width_cm,
          neck: cvResultData.neck_width_cm
        };
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
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  return (
    <div className="register-container">
      {/* CV Modal */}
      {showCvModal && (
        <div className="cv-modal-overlay">
          <div className="cv-modal">
            <button className="close-btn" onClick={handleCloseCvModal}>✕</button>
            <h3>👕 AI 자동 치수 추출</h3>
            <div className="cv-instructions">
              {cvStep === 0 && "1️⃣ 사진을 업로드 해주세요."}
              {cvStep === 1 && <span>2️⃣ 원본 이미지에서 <span style={{color:'#ff4444'}}>의류 영역</span>을 드래그하여 박스를 쳐주세요.</span>}
              {cvStep === 2 && <span>3️⃣ 원본 이미지에서 <span style={{color:'#4CAF50'}}>A4 용지 영역</span>을 드래그하여 박스를 쳐주세요.</span>}
              {cvStep === 3 && "✅ 영역 지정 완료! 하단의 분석 시작 버튼을 눌러주세요."}
              {cvStep === 4 && "🎉 치수 추출 완료! 결과를 확인하고 적용하세요."}
            </div>

            {cvStep === 0 && (
              <div className="cv-upload-area">
                <input type="file" accept="image/*" onChange={handleCvImageUpload} id="cvImageInput" style={{display: 'none'}} />
                <label htmlFor="cvImageInput" className="cv-btn">📸 사진 선택하기</label>
              </div>
            )}

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

            {cvStep === 4 && cvResultData && (
              <div className="cv-result-container">
                <div className="cv-result-image">
                  <img src={`data:image/jpeg;base64,${cvResultData.debug_image_base64}`} alt="AI 추출 결과 시각화" />
                </div>
                <div className="cv-result-values">
                  <div className="val-box"><span>총장</span><strong>{cvResultData.length_cm} cm</strong></div>
                  <div className="val-box"><span>가슴단면</span><strong>{cvResultData.chest_cm} cm</strong></div>
                  <div className="val-box"><span>소매끝단면</span><strong>{cvResultData.sleeve_width_cm} cm</strong></div>
                  <div className="val-box"><span>넥라인</span><strong>{cvResultData.neck_width_cm} cm</strong></div>
                </div>
              </div>
            )}

            <div className="cv-actions">
              {(cvStep > 0 && cvStep < 4) && (
                <button className="cv-btn secondary" onClick={() => {
                  setCvStep(1); setRectShirt(null); setRectA4(null); setCurrentRect(null);
                  redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null);
                }} disabled={cvLoading}>다시 그리기</button>
              )}
              {cvStep === 3 && (
                <button className="cv-btn primary" onClick={handleAnalyze} disabled={cvLoading}>
                  {cvLoading ? '분석 중...' : '🚀 AI 분석 시작'}
                </button>
              )}
              {cvStep === 4 && (
                <>
                  <button className="cv-btn secondary" onClick={() => {
                    setCvStep(1); setRectShirt(null); setRectA4(null); setCurrentRect(null);
                    redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null, null);
                  }}>다시 측정하기</button>
                  <button className="cv-btn primary" onClick={handleApplyMeasurements}>✅ 이 치수 적용하기</button>
                </>
              )}
            </div>
            
            {cvLoading && (
              <div className="cv-loader">
                <div className="spinner"></div>
                <p>AI 누끼 추출 및 텐서 기하학 분석 중...</p>
              </div>
            )}
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
                onClick={() => setSizes(prev => [...prev, { id: Date.now(), size_name: '', length: '', chest: '', sleeve: '', neck: '' }])}
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
                          className={`ai-extract-btn ${formData.category_type === 'Top' ? 'active' : 'disabled'}`}
                          onClick={() => {
                            if (formData.category_type === 'Top') {
                              setActiveSizeId(size.id);
                              setShowCvModal(true);
                            }
                          }}
                          disabled={formData.category_type !== 'Top'}
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
                    <div className="m-input">
                      <span>가슴단면</span>
                      <input type="number" step="0.1" value={size.chest} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, chest: e.target.value} : s))} placeholder="0.0" />
                    </div>
                    <div className="m-input">
                      <span>소매끝단면</span>
                      <input type="number" step="0.1" value={size.sleeve} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, sleeve: e.target.value} : s))} placeholder="0.0" />
                    </div>
                    <div className="m-input">
                      <span>넥라인</span>
                      <input type="number" step="0.1" value={size.neck} onChange={(e) => setSizes(prev => prev.map(s => s.id === size.id ? {...s, neck: e.target.value} : s))} placeholder="0.0" />
                    </div>
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
