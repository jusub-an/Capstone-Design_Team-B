import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Ruler, RefreshCw, Heart, ShoppingBag, ChevronDown, ChevronUp, ChevronLeft } from 'lucide-react';
import './ProductList.css';
import './MyReviews.css';

const BASE = 'http://localhost:8000';

const MEASURE_LABELS = {
  shoulder:            { label: '어깨 너비',   unit: 'cm' },
  chest:               { label: '가슴 너비',   unit: 'cm' },
  waist:               { label: '허리 너비',   unit: 'cm' },
  hip:                 { label: '골반 너비',   unit: 'cm' },
  thigh:               { label: '허벅지 너비', unit: 'cm' },
  chest_circumference: { label: '가슴 둘레',   unit: 'cm' },
  waist_circumference: { label: '허리 둘레',   unit: 'cm' },
  hip_circumference:   { label: '골반 둘레',   unit: 'cm' },
  thigh_circumference: { label: '허벅지 둘레', unit: 'cm' },
  sleeve:              { label: '팔 길이', unit: 'cm' },
  arm_width:           { label: '팔 너비',     unit: 'cm' },
  inseam:              { label: '인심',        unit: 'cm' },
  neck:                { label: '목 둘레',     unit: 'cm' },
  top_length:          { label: '상체 길이',   unit: 'cm' },
  bottom_length:       { label: '하반신 길이', unit: 'cm' },
  rise:                { label: '밑위 길이',   unit: 'cm' },
  hem:                 { label: '밑단 너비',   unit: 'cm' },
  left_arm_angle:      { label: '왼팔 각도', unit: '°' },
  right_arm_angle:     { label: '오른팔 각도', unit: '°' },
  leg_angle:           { label: '다리 벌림 각도', unit: '°' },
};

function AvatarManage() {
  const navigate = useNavigate();
  const userEmail = sessionStorage.getItem('userEmail');
  const username = sessionStorage.getItem('username') || 'User';
  const isLoggedIn = !!sessionStorage.getItem('token');
  const [cartCount, setCartCount] = useState(0);

  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
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
    if (!userEmail) { setLoading(false); return; }
    fetch(`${BASE}/api/avatar/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setAvatar(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userEmail]);

  useEffect(() => {
    refreshCart();
  }, [userEmail]);

  const parsedMeasurements = (() => {
    if (!avatar?.measurements) return { items: [], height_ratio: 1 };
    try {
      const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
      if (Array.isArray(m)) return { items: m, height_ratio: 1 };
      return { items: m?.items ?? [], height_ratio: m?.height_ratio ?? 1 };
    } catch(e) { return { items: [], height_ratio: 1 }; }
  })();
  const measurements = parsedMeasurements.items;

  const imgUrl = avatar ? avatar.gray_mask_url : null;

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  return (
    <div className="product-list-container" style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif" }}>
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
      <div className="my-reviews-container">
        <div className="my-reviews-header" style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 16px 0', textAlign: 'left', boxSizing: 'border-box' }}>
          <button onClick={() => navigate('/mypage')} className="back-btn" style={{ marginBottom: '16px' }}>
            <ChevronLeft size={20} />
            <span>마이페이지</span>
          </button>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.5px' }}>
            내 아바타
          </h1>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>
            {avatar ? '저장된 아바타 정보입니다. 재측정을 통해 업데이트할 수 있습니다.' : '신체 측정을 통해 아바타를 생성하고 관리하세요.'}
          </p>
        </div>
        <main style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px 32px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '60px' }}>불러오는 중...</p>
          ) : !avatar ? (
            /* ── No avatar saved ── */
            <div style={{
              background: 'white', borderRadius: '20px', padding: '48px 24px',
              textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              <User size={52} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
              <p style={{ fontWeight: 700, fontSize: '1.05rem', color: '#334155', margin: '0 0 8px' }}>
                저장된 아바타가 없습니다
              </p>
              <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '0 0 24px' }}>
                신체 측정을 진행한 후 아바타를 저장해 주세요
              </p>
              <button
                onClick={() => {
                  localStorage.removeItem('bodyMeasureGuideShown');
                  navigate('/mypage/body-measure');
                }}
                style={{
                  padding: '11px 28px', borderRadius: '12px', border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                }}
              >
                신체 측정 하러 가기
              </button>
            </div>
          ) : (
            <>
              {/* ── Avatar image card ── */}
              <div style={{
                background: 'white', borderRadius: '20px', overflow: 'hidden',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              }}>
  
                {/* Avatar image */}
                <div style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  padding: '24px', background: '#f8fafc', minHeight: '280px',
                }}>
                  {imgUrl ? (
                    <img
                      src={`${BASE}${imgUrl}`}
                      alt="아바타"
                      style={{
                        maxHeight: '280px', maxWidth: '100%',
                        objectFit: 'contain', borderRadius: '12px',
                        background: '#e2e8f0',
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <User size={48} style={{ marginBottom: '8px' }} />
                      <p style={{ fontSize: '0.85rem' }}>이미지가 없습니다</p>
                    </div>
                  )}
                </div>
              </div>

            {/* ── Measurements card ── */}
            <div style={{
              background: 'white', borderRadius: '20px', padding: '24px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: isExpanded ? '20px' : '0' }}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ruler size={18} color="#6366f1" />
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>신체 치수</h2>
              </div>
              {isExpanded ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
            </div>

            {isExpanded && (
              <>
                {/* Height */}
                {avatar.height_cm && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                    border: '1px solid #c4b5fd', marginBottom: '12px',
                  }}>
                    <span style={{ fontWeight: 700, color: '#4f46e5', fontSize: '0.95rem' }}>키</span>
                    <span style={{ fontWeight: 700, color: '#4f46e5', fontSize: '1.1rem' }}>
                      {Number(avatar.height_cm).toFixed(1)} cm
                    </span>
                  </div>
                )}

                {/* Measurements grid */}
                {measurements.length > 0 ? (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {measurements.map((m, i) => {
                      const info = MEASURE_LABELS[m.key] || { unit: m.key.includes('angle') ? '°' : 'cm' };
                      const displayLabel = m.label || info.label || m.key;
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '11px 16px', borderRadius: '10px',
                            background: '#f8fafc', border: '1px solid #e2e8f0',
                          }}
                        >
                          <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                            {displayLabel}
                          </span>
                          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                            {typeof m.value_cm === 'number' ? m.value_cm.toFixed(1) : m.value_cm} {info.unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                    저장된 치수 정보가 없습니다
                  </p>
                )}

                {avatar.updated_at && (
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '16px', textAlign: 'right' }}>
                    마지막 측정: {new Date(avatar.updated_at).toLocaleDateString('ko-KR')}
                  </p>
                )}
              </>
            )}
              </div>
  
              {/* ── Re-measure button ── */}
              <button
                onClick={() => {
                  localStorage.removeItem('bodyMeasureGuideShown');
                  navigate('/mypage/body-measure');
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                }}
              >
                <RefreshCw size={18} />
                재측정하기
              </button>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default AvatarManage;
