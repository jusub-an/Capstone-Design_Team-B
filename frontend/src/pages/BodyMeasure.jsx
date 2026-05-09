import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Upload, Ruler, AlertTriangle, CheckCircle, Heart, ShoppingBag } from 'lucide-react';
import './MyReviews.css';
import './ProductList.css';

const TAB_LABELS = [
  { key: 'debug',      label: '📏 측정 분석' },
  { key: 'gray_debug', label: '📐 실루엣+측정' },
  { key: 'extracted',  label: '✂️ 누끼'     },
  { key: 'gray',       label: '🪄 실루엣'   },
];

const cardStyle = {
  background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)',
  borderRadius: '20px', padding: '28px',
  boxShadow: '0 8px 32px rgba(31,38,135,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
};

function BodyMeasure() {
  const navigate = useNavigate();
  const username = sessionStorage.getItem('username') || 'User';
  const isLoggedIn = !!sessionStorage.getItem('token');
  const fileInputRef = useRef(null);

  // 기존 상태
  const [image, setImage] = useState(null);
  const [heightCm, setHeightCm] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('debug');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [cartCount, setCartCount] = useState(0);

  // 캔버스 드래그 크롭 상태
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [cropStep, setCropStep] = useState(0); // 0: 업로드 전, 1: 영역 드래그, 2: 영역 확정
  const [rectBody, setRectBody] = useState(null);
  const [currentRect, setCurrentRect] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const imagePreview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);

  // --- 캔버스 로직 (ProductRegister 패턴 재사용) ---
  const redrawCanvas = useCallback((w, h, scale, rb, cr) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imgRef.current, 0, 0, w, h);

    const drawRect = (r, color, text) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.font = "bold 14px sans-serif";
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(r.x, r.y - 22, textWidth + 10, 22);
      ctx.fillStyle = color;
      ctx.fillText(text, r.x + 5, r.y - 6);
    };

    if (rb) drawRect(rb, "#6e8efb", "신체 영역");

    if (cr) {
      ctx.strokeStyle = "#6e8efb";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
      ctx.setLineDash([]);
    }
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setResult(null);
    setError('');
    setRectBody(null);
    setCurrentRect(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        const MAX_WIDTH = 700;
        const MAX_HEIGHT = Math.max(window.innerHeight * 0.5, 350);
        let w = img.width, h = img.height;
        let scale = 1;
        if (w > MAX_WIDTH || h > MAX_HEIGHT) {
          scale = Math.min(MAX_WIDTH / w, MAX_HEIGHT / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        setScaleFactor(scale);

        setCropStep(1);
        // React가 캔버스를 DOM에 렌더링할 시간을 충분히 부여
        setTimeout(() => {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = w;
            canvas.height = h;
            redrawCanvas(w, h, scale, null, null);
          }
        }, 100);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onDown = (e) => {
    if (cropStep !== 1) return;
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
      h: Math.abs(pos.y - startPos.y),
    };
    setCurrentRect(newRect);
    redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectBody, newRect);
  };

  const onUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentRect && currentRect.w > 30 && currentRect.h > 30) {
      setRectBody({ ...currentRect });
      setCropStep(2);
      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, currentRect, null);
    } else {
      redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, rectBody, null);
    }
    setCurrentRect(null);
  };

  const cropToBlob = (rect) => {
    const temp = document.createElement('canvas');
    const sx = rect.x / scaleFactor;
    const sy = rect.y / scaleFactor;
    const sw = rect.w / scaleFactor;
    const sh = rect.h / scaleFactor;
    temp.width = Math.round(sw);
    temp.height = Math.round(sh);
    temp.getContext('2d').drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, temp.width, temp.height);
    return new Promise((res) => temp.toBlob(res, 'image/jpeg', 0.92));
  };

  const handleAnalyze = async () => {
    if (!image) { setError('전신 사진을 업로드해주세요.'); return; }
    if (!heightCm || Number(heightCm) <= 0) { setError('올바른 키(cm)를 입력해주세요.'); return; }
    if (cropStep < 2 || !rectBody) { setError('사진에서 신체 영역을 드래그하여 지정해주세요.'); return; }

    setLoading(true);
    setError('');
    setResult(null);
    setActiveTab('debug');

    try {
      const bodyBlob = await cropToBlob(rectBody);
      const formData = new FormData();
      formData.append('image', bodyBlob, 'body_crop.jpg');
      formData.append('height_cm', parseFloat(heightCm));

      const res = await axios.post('http://localhost:8000/api/measure', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshCart(); }, []);

  const base64ToBlob = (base64, mime = 'image/jpeg') => {
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const handleSaveAvatar = async () => {
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) { alert('로그인이 필요합니다.'); return; }
    if (!result) return;
    setAvatarSaving(true);
    try {
      const fd = new FormData();
      fd.append('user_email', userEmail);
      fd.append('height_cm', heightCm);
      fd.append('measurements', JSON.stringify(result.measurements));
      fd.append('gray_mask', base64ToBlob(result.gray_mask_base64), 'gray_mask.jpg');
      fd.append('person_extracted', base64ToBlob(result.person_extracted_base64), 'person_extracted.jpg');
      const res = await axios.post('http://localhost:8000/api/avatar/save', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.status === 200) {
        setAvatarSaved(true);
        setTimeout(() => setAvatarSaved(false), 3000);
      }
    } catch (err) {
      alert('아바타 저장 실패: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

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
                      style={{
                        width: '100%', padding: '10px', borderRadius: '10px', border: 'none',
                        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                        color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                      }}>
                      ✨ 가상 피팅룸에서 착용해보기
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
          <h1>신체 측정</h1>
          <p>의류 사이즈와 비교하기 위한 신체 치수를 측정합니다.</p>
        </div>
      <main className="product-main" style={{ maxWidth: '760px', margin: '0 auto', padding: '30px 20px' }}>

        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          {/* Step Indicator */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px',
          }}>
            {['📷 사진 업로드', '✋ 영역 지정', '🚀 분석'].map((label, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center', padding: '8px 0',
                borderRadius: '10px', fontSize: '0.82rem', fontWeight: 600,
                background: cropStep > i || (cropStep === 2 && i === 2)
                  ? 'linear-gradient(135deg, #6e8efb, #a777e3)' : '#f0f0f5',
                color: cropStep > i || (cropStep === 2 && i === 2) ? 'white' : '#999',
                transition: 'all 0.3s',
              }}>
                {label}
              </div>
            ))}
          </div>

          {/* 사진 업로드 영역 */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '10px', color: '#333' }}>
              전신 사진 (정면 A-포즈 권장)
            </label>

            {cropStep === 0 ? (
              /* 업로드 전: 클릭하여 업로드 */
              <div
                onClick={() => fileInputRef.current.click()}
                style={{
                  border: '2px dashed #c0c8e8', borderRadius: '14px',
                  padding: '40px', textAlign: 'center', cursor: 'pointer',
                  background: '#f5f7ff', transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#6e8efb'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#c0c8e8'}
              >
                <Upload size={32} color="#999" style={{ marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#999' }}>클릭하여 사진 업로드</p>
              </div>
            ) : (
              /* 업로드 후: 캔버스에서 드래그 */
              <>
                <div style={{
                  background: cropStep === 1 ? '#e8f0fe' : '#e8fbe8',
                  borderRadius: '10px', padding: '10px 14px', marginBottom: '10px',
                  fontSize: '0.88rem', fontWeight: 500,
                  color: cropStep === 1 ? '#1a56db' : '#27ae60',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  {cropStep === 1 && '👆 사진에서 신체 영역을 드래그하여 박스를 그려주세요.'}
                  {cropStep === 2 && <><CheckCircle size={16} /> 신체 영역이 지정되었습니다. 아래에서 분석을 시작하세요.</>}
                </div>

                <div style={{
                  display: 'flex', justifyContent: 'center',
                  background: '#fafafa', borderRadius: '14px', padding: '8px',
                  border: '1px solid #e8e8e8',
                }}>
                  <canvas
                    ref={canvasRef}
                    style={{ maxWidth: '100%', borderRadius: '10px', cursor: cropStep === 1 ? 'crosshair' : 'default', touchAction: 'none' }}
                    onMouseDown={onDown}
                    onMouseMove={onMove}
                    onMouseUp={onUp}
                    onTouchStart={onDown}
                    onTouchMove={onMove}
                    onTouchEnd={onUp}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={() => fileInputRef.current.click()}
                    style={{
                      fontSize: '0.8rem', color: '#6e8efb',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    사진 변경
                  </button>
                  {rectBody && (
                    <button
                      onClick={() => {
                        setRectBody(null);
                        setCropStep(1);
                        redrawCanvas(canvasRef.current.width, canvasRef.current.height, scaleFactor, null, null);
                      }}
                      style={{
                        fontSize: '0.8rem', color: '#e67e22',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      }}
                    >
                      다시 그리기
                    </button>
                  )}
                </div>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#333' }}>
              키 (cm)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Ruler size={18} color="#6e8efb" />
              <input
                type="number"
                min="100"
                max="250"
                placeholder="예: 175"
                value={heightCm}
                onChange={e => setHeightCm(e.target.value)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #ddd', fontSize: '1rem', outline: 'none',
                }}
              />
              <span style={{ color: '#888', fontSize: '0.9rem' }}>cm</span>
            </div>
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              color: '#e74c3c', background: '#fdf0f0', borderRadius: '10px',
              padding: '10px 14px', marginBottom: '16px', fontSize: '0.9rem',
            }}>
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading || cropStep < 2}
            style={{
              width: '100%', padding: '13px',
              background: (loading || cropStep < 2) ? '#b0bec5' : 'linear-gradient(135deg, #6e8efb, #a777e3)',
              color: 'white', border: 'none', borderRadius: '12px',
              fontSize: '1rem', fontWeight: 600,
              cursor: (loading || cropStep < 2) ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'AI 분석 중... (10~30초 소요)' : cropStep < 2 ? '신체 영역을 먼저 지정해주세요' : '🚀 측정 시작'}
          </button>
        </div>

        {result && (
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 700 }}>측정 결과</h3>

            {result.warnings.length > 0 && (
              <div style={{
                background: '#fff8e1', borderRadius: '10px', padding: '12px 16px',
                marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px',
              }}>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e67e22', fontSize: '0.88rem' }}>
                    <AlertTriangle size={14} /> {w}
                  </div>
                ))}
              </div>
            )}

            {result.pose_valid && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#27ae60', marginBottom: '16px', fontSize: '0.9rem' }}>
                <CheckCircle size={16} /> 포즈 감지 성공
              </div>
            )}

            {(() => {
              const CLOTHING_MAP = {
                top_length: { category: 'top', field: 'length (총장)', color: '#00FF00' },
                shoulder: { category: 'top', field: 'shoulder', color: '#FFA500' },
                chest:    { category: 'top', field: 'chest', color: '#C800C8' },
                sleeve:   { category: 'top', field: 'sleeve', color: '#00BFFF' },
                arm_width: { category: 'top', field: 'arm_width (이두)', color: '#FF4500' },
                bottom_length: { category: 'bottom', field: 'length (총장)', color: '#FFFF00' },
                waist:    { category: 'bottom', field: 'waist', color: '#FF0000' },
                thigh:    { category: 'bottom', field: 'thigh', color: '#00FFFF' },
                rise:     { category: 'bottom', field: 'rise', color: '#FF69B4' },
                hem:      { category: 'bottom', field: 'hem', color: '#32CD32' },
              };
              const topItems = result.measurements.filter(m => CLOTHING_MAP[m.key]?.category === 'top');
              const bottomItems = result.measurements.filter(m => CLOTHING_MAP[m.key]?.category === 'bottom');

              const renderSection = (title, icon, color, items) => (
                items.length > 0 && (
                  <div key={title} style={{ marginBottom: '16px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 14px', background: color, borderRadius: '10px',
                      marginBottom: '4px', fontWeight: 700, fontSize: '0.95rem', color: '#fff',
                    }}>
                      <span>{icon}</span> {title}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f0f4ff' }}>
                          <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: '#444', fontSize: '0.85rem' }}>신체 항목</th>
                          <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 600, color: '#444', fontSize: '0.85rem' }}>의류 대응</th>
                          <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#444', fontSize: '0.85rem' }}>측정값</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((m, i) => (
                          <tr key={m.key} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                            <td style={{ padding: '10px 14px', color: '#555' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: CLOTHING_MAP[m.key]?.color || '#ccc', flexShrink: 0 }}></div>
                                {m.label}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', color: '#888', fontSize: '0.82rem' }}>
                              <span style={{
                                background: '#f0f4ff', padding: '2px 10px', borderRadius: '8px',
                                fontWeight: 500, color: '#6e8efb',
                              }}>
                                {CLOTHING_MAP[m.key]?.field}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#333' }}>{m.value_cm} cm</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              );

              return (
                <div style={{ marginBottom: '24px' }}>
                  {renderSection('👕 상의 대응 항목', '', 'linear-gradient(135deg, #6e8efb, #a777e3)', topItems)}
                  {renderSection('👖 하의 대응 항목', '', 'linear-gradient(135deg, #43b89c, #38a0d0)', bottomItems)}
                </div>
              );
            })()}

            <div>
              <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#444', fontSize: '0.95rem' }}>분석 이미지</p>

              {/* 탭 버튼 */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {TAB_LABELS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: '0.82rem', fontWeight: 600,
                      borderRadius: '10px', border: 'none', cursor: 'pointer',
                      background: activeTab === t.key
                        ? 'linear-gradient(135deg, #6e8efb, #a777e3)'
                        : '#f0f0f5',
                      color: activeTab === t.key ? 'white' : '#666',
                      transition: 'all 0.2s',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 탭 이미지 */}
              {activeTab === 'debug' && (
                <img
                  src={`data:image/jpeg;base64,${result.debug_image_base64}`}
                  alt="측정 분석"
                  style={{ width: '100%', borderRadius: '12px', objectFit: 'contain' }}
                />
              )}
              {activeTab === 'gray_debug' && (
                <img
                  src={`data:image/jpeg;base64,${result.gray_debug_image_base64}`}
                  alt="실루엣+측정"
                  style={{ width: '100%', borderRadius: '12px', objectFit: 'contain' }}
                />
              )}
              {activeTab === 'extracted' && (
                <img
                  src={`data:image/jpeg;base64,${result.person_extracted_base64}`}
                  alt="누끼"
                  style={{ width: '100%', borderRadius: '12px', objectFit: 'contain', background: '#f5f5f5' }}
                />
              )}
              {activeTab === 'gray' && (
                <img
                  src={`data:image/jpeg;base64,${result.gray_mask_base64}`}
                  alt="그레이 실루엣"
                  style={{ width: '100%', borderRadius: '12px', objectFit: 'contain' }}
                />
              )}
            </div>

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handleSaveAvatar}
                disabled={avatarSaving || avatarSaved}
                style={{
                  width: '100%', padding: '13px',
                  background: avatarSaved
                    ? 'linear-gradient(135deg, #27ae60, #2ecc71)'
                    : avatarSaving
                    ? '#b0bec5'
                    : 'linear-gradient(135deg, #6e8efb, #a777e3)',
                  color: 'white', border: 'none', borderRadius: '12px',
                  fontSize: '1rem', fontWeight: 600,
                  cursor: (avatarSaving || avatarSaved) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s',
                }}
              >
                {avatarSaved ? '✅ 아바타 저장 완료!' : avatarSaving ? '저장 중...' : '🧍 아바타로 저장 (피팅룸에서 사용)'}
              </button>
              {avatarSaved && (
                <button
                  onClick={() => navigate('/mypage/avatar')}
                  style={{
                    width: '100%', padding: '11px',
                    background: 'white', border: '1.5px solid #6e8efb',
                    borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600,
                    color: '#6366f1', cursor: 'pointer',
                  }}
                >
                  📏 저장된 치수 확인하기
                </button>
              )}
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

export default BodyMeasure;
