import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Ruler, RefreshCw } from 'lucide-react';

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
  sleeve:              { label: '소매 길이',   unit: 'cm' },
  inseam:              { label: '인심',        unit: 'cm' },
  neck:                { label: '목 둘레',     unit: 'cm' },
  torso_length:        { label: '상체 길이',   unit: 'cm' },
  leg_length:          { label: '다리 길이',   unit: 'cm' },
};

function AvatarManage() {
  const navigate = useNavigate();
  const userEmail = sessionStorage.getItem('userEmail');

  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgMode, setImgMode] = useState('gray'); // 'gray' | 'photo'

  useEffect(() => {
    if (!userEmail) { setLoading(false); return; }
    fetch(`${BASE}/api/avatar/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setAvatar(data); setLoading(false); })
      .catch(() => setLoading(false));
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

  const imgUrl = avatar
    ? (imgMode === 'gray' ? avatar.gray_mask_url : avatar.person_extracted_url)
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '12px 24px', background: 'white',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <button
          onClick={() => navigate('/mypage')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>아바타 관리</h1>
      </header>

      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
              onClick={() => navigate('/mypage/body-measure')}
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
              {/* Image toggle tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
                {[
                  { key: 'gray',  label: '🪄 실루엣' },
                  { key: 'photo', label: '📷 누끼' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setImgMode(key)}
                    style={{
                      flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
                      background: imgMode === key ? '#f5f3ff' : 'white',
                      color: imgMode === key ? '#6366f1' : '#64748b',
                      fontWeight: imgMode === key ? 700 : 500,
                      fontSize: '0.88rem',
                      borderBottom: imgMode === key ? '2px solid #6366f1' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

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
                      background: imgMode === 'gray' ? '#e2e8f0' : 'white',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <Ruler size={18} color="#6366f1" />
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>신체 치수</h2>
              </div>

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
                    const info = MEASURE_LABELS[m.key] || { unit: 'cm' };
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
            </div>

            {/* ── Re-measure button ── */}
            <button
              onClick={() => navigate('/mypage/body-measure')}
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
  );
}

export default AvatarManage;
