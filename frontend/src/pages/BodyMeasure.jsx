import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Upload, Ruler, AlertTriangle, CheckCircle } from 'lucide-react';
import './ProductList.css';

const TAB_LABELS = [
  { key: 'debug',     label: '📏 측정 분석' },
  { key: 'extracted', label: '✂️ 누끼'     },
  { key: 'gray',      label: '🪄 실루엣'   },
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
  const fileInputRef = useRef(null);

  const [image, setImage] = useState(null);
  const [heightCm, setHeightCm] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('debug');

  const imagePreview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setResult(null);
    setError('');
  };

  const handleAnalyze = async () => {
    if (!image) { setError('전신 사진을 업로드해주세요.'); return; }
    if (!heightCm || Number(heightCm) <= 0) { setError('올바른 키(cm)를 입력해주세요.'); return; }

    setLoading(true);
    setError('');
    setResult(null);
    setActiveTab('debug');

    const formData = new FormData();
    formData.append('image', image);
    formData.append('height_cm', parseFloat(heightCm));

    try {
      const res = await axios.post('http://localhost:8000/api/measure', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="product-list-container">
      <header className="product-header">
        <div className="logo-section" onClick={() => navigate('/products')} style={{ cursor: 'pointer' }}>
          <h2>Virtual Fitting</h2>
        </div>
        <div className="header-actions">
          <div className="user-profile-wrapper">
            <div className="user-avatar">{username.charAt(0).toUpperCase()}</div>
          </div>
        </div>
      </header>

      <main className="product-main" style={{ maxWidth: '760px', margin: '0 auto', padding: '30px 20px' }}>
        <button
          onClick={() => navigate('/mypage')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#555', fontSize: '0.9rem', marginBottom: '20px', padding: 0,
          }}
        >
          <ChevronLeft size={16} /> 마이페이지로
        </button>

        <h2 style={{ margin: '0 0 24px', fontSize: '1.6rem', fontWeight: 700 }}>신체 측정</h2>

        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '10px', color: '#333' }}>
              전신 사진 (정면 A-포즈 권장)
            </label>
            <div
              onClick={() => fileInputRef.current.click()}
              style={{
                border: '2px dashed #c0c8e8', borderRadius: '14px',
                padding: '24px', textAlign: 'center', cursor: 'pointer',
                background: imagePreview ? 'transparent' : '#f5f7ff',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6e8efb'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#c0c8e8'}
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="preview"
                  style={{ maxHeight: '320px', maxWidth: '100%', borderRadius: '10px', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ color: '#999' }}>
                  <Upload size={32} style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>클릭하여 사진 업로드</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageChange}
            />
            {imagePreview && (
              <button
                onClick={() => fileInputRef.current.click()}
                style={{
                  marginTop: '8px', fontSize: '0.8rem', color: '#6e8efb',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                사진 변경
              </button>
            )}
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
            disabled={loading}
            style={{
              width: '100%', padding: '13px',
              background: loading ? '#b0bec5' : 'linear-gradient(135deg, #6e8efb, #a777e3)',
              color: 'white', border: 'none', borderRadius: '12px',
              fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? '분석 중...' : '측정 시작'}
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

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <thead>
                <tr style={{ background: '#f0f4ff' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', borderRadius: '8px 0 0 8px', fontWeight: 600, color: '#444' }}>항목</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', borderRadius: '0 8px 8px 0', fontWeight: 600, color: '#444' }}>측정값</th>
                </tr>
              </thead>
              <tbody>
                {result.measurements.map((m, i) => (
                  <tr key={m.key} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px', color: '#555' }}>{m.label}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#333' }}>{m.value_cm} cm</td>
                  </tr>
                ))}
              </tbody>
            </table>

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
          </div>
        )}
      </main>
    </div>
  );
}

export default BodyMeasure;
