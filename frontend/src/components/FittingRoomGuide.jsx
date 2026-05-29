import React, { useState } from 'react';
import './FittingRoomGuide.css';

/* ── Step animations ── */

const AvatarAnim = () => (
  <div className="frg-anim-scene">
    <div className="frg-canvas-frame">
      <svg className="frg-human-float" viewBox="0 0 80 170" fill="none">
        <defs>
          <linearGradient id="frgHg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#818cf8"/>
            <stop offset="100%" stopColor="#6366f1"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="10" r="9" fill="url(#frgHg)"/>
        <rect x="37" y="18" width="6" height="7" rx="2" fill="url(#frgHg)"/>
        <path d="M22 24 C28 22,52 22,58 24 C58 36,59 53,59 65 C58 73,58 79,58 82 C52 85,28 85,22 82 C22 79,22 73,21 65 C21 53,22 36,22 24Z" fill="url(#frgHg)"/>
        <path d="M22 26 C16 34,8 50,7 64 C7 67,8 69,10 70 L15 69 C15 66,16 62,18 56 C20 46,22 36,27 30Z" fill="url(#frgHg)"/>
        <path d="M58 26 C64 34,72 50,73 64 C73 67,72 69,70 70 L65 69 C65 66,64 62,62 56 C60 46,58 36,53 30Z" fill="url(#frgHg)"/>
        <path d="M22 83 C20 100,16 130,15 165 L25 165 C26 130,30 100,34 83Z" fill="url(#frgHg)"/>
        <path d="M46 83 C50 100,54 130,55 165 L65 165 C64 130,62 100,58 83Z" fill="url(#frgHg)"/>
      </svg>
      <div className="frg-avatar-pulse"/>
    </div>
  </div>
);

const WearAnim = () => (
  <div className="frg-anim-scene frg-wear-scene">
    {/* 장바구니 상품 카드 */}
    <div className="frg-cart-card">
      <div className="frg-shirt-icon">
        <svg viewBox="0 0 40 36" fill="none" width="36" height="36">
          <path d="M14 4 C16 9,24 9,26 4 L36 8 L40 16 L34 20 L30 14 L30 33 L10 33 L10 14 L6 20 L0 16 L4 8Z" fill="#818cf8"/>
        </svg>
      </div>
      <div className="frg-wear-btn">착용</div>
    </div>
    {/* 화살표 */}
    <div className="frg-arrow-fly">→</div>
    {/* 캔버스 */}
    <div className="frg-mini-canvas">
      <div className="frg-shirt-landing">
        <svg viewBox="0 0 40 36" fill="none" width="30" height="30">
          <path d="M14 4 C16 9,24 9,26 4 L36 8 L40 16 L34 20 L30 14 L30 33 L10 33 L10 14 L6 20 L0 16 L4 8Z" fill="rgba(99,102,241,0.35)" stroke="#6366f1" strokeWidth="1.5"/>
        </svg>
      </div>
    </div>
  </div>
);

const DragAnim = () => (
  <div className="frg-anim-scene">
    <div className="frg-drag-box">
      <div className="frg-drag-clothing"/>
      <svg className="frg-drag-cursor" viewBox="0 0 24 24" width="22" height="22">
        <path fill="#ffffff" stroke="#000" strokeWidth="1" d="M4 0l16 16-6 1.5 4 6-3 1.5-4-6-4 4z"/>
      </svg>
    </div>
  </div>
);

const LayerAnim = () => (
  <div className="frg-anim-scene">
    <div className="frg-layer-stack">
      <div className="frg-layer-card frg-layer-3">
        <span>하의 · M</span>
      </div>
      <div className="frg-layer-card frg-layer-2">
        <span>상의 · L</span>
      </div>
      <div className="frg-layer-card frg-layer-1">
        <span>아우터 · M</span>
      </div>
    </div>
  </div>
);

const SizeAnim = () => (
  <div className="frg-anim-scene">
    <div className="frg-size-scene">
      <div className="frg-size-layer-card">
        <div className="frg-size-thumb">
          <svg viewBox="0 0 40 36" fill="none" width="28" height="28">
            <path d="M14 4 C16 9,24 9,26 4 L36 8 L40 16 L34 20 L30 14 L30 33 L10 33 L10 14 L6 20 L0 16 L4 8Z"
              fill="rgba(99,102,241,0.25)" stroke="#6366f1" strokeWidth="1.5"/>
          </svg>
        </div>
        <div className="frg-size-details">
          <span className="frg-size-pname">반팔 티셔츠</span>
          <div className="frg-size-selector">
            <span className="frg-size-badge frg-size-badge-s">S</span>
            <span className="frg-size-badge frg-size-badge-m">M</span>
            <span className="frg-size-badge frg-size-badge-l">L</span>
          </div>
        </div>
        <span className="frg-size-arrow">▾</span>
      </div>
      <p className="frg-size-caption">레이어 패널 드롭다운에서 사이즈를 변경할 수 있어요</p>
    </div>
  </div>
);

const DimAnim = () => (
  <div className="frg-anim-scene">
    <div className="frg-dim-box">
      {/* 반팔 상의 실루엣 */}
      <svg viewBox="0 0 80 62" fill="none" width="92" height="71" style={{ position: 'absolute' }}>
        <path
          d="M28 8 C30 15,50 15,52 8 L64 12 L71 26 L63 30 L56 18 L56 54 L24 54 L24 18 L17 30 L9 26 L16 12 Z"
          fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.5"/>
      </svg>
      {/* 치수선들 */}
      <div className="frg-dim-line frg-dim-shoulder"/>
      <div className="frg-dim-line frg-dim-chest"/>
      <div className="frg-dim-line frg-dim-length"/>
      <div className="frg-dim-label frg-dim-label-s">어깨 42cm</div>
      <div className="frg-dim-label frg-dim-label-c">가슴 48cm</div>
    </div>
  </div>
);

/* ── Step data ── */
const STEPS = [
  {
    title: '내 아바타가 표시돼요',
    desc: '신체 측정을 완료하면 왼쪽 캔버스에 내 아바타 실루엣이 나타납니다. 아바타를 기준으로 의류의 크기와 위치가 자동으로 맞춰집니다.',
    animation: <AvatarAnim />,
  },
  {
    title: '상품을 착용해 보세요',
    desc: '오른쪽 패널 장바구니 상품에서 착용 버튼을 누르면 의류가 아바타에 오버레이됩니다. 같은 버튼을 다시 누르면 제거됩니다.',
    animation: <WearAnim />,
  },
  {
    title: '드래그로 위치를 조절하세요',
    desc: '착용한 옷을 클릭해 선택한 후 드래그하여 위치를 이동할 수 있습니다.',
    animation: <DragAnim />,
  },
  {
    title: '여러 옷을 겹쳐 입어 보세요',
    desc: '여러 상품을 착용하면 레이어로 쌓입니다. 레이어 패널에서 개별 선택·숨기기·위치 초기화가 가능합니다.',
    animation: <LayerAnim />,
  },
  {
    title: '레이어에서 사이즈를 바꿔보세요',
    desc: '오른쪽 레이어 패널에서 착용 중인 옷의 사이즈를 드롭다운으로 변경할 수 있습니다. 사이즈를 바꾸면 장바구니에도 즉시 반영됩니다.',
    animation: <SizeAnim />,
  },
  {
    title: '치수선으로 사이즈를 확인하세요',
    desc: '레이어 패널의 치수선 표시 토글을 켜면 선택한 의류의 각 부위 치수를 확인할 수 있습니다. 내 신체 치수와 비교해 보세요.',
    animation: <DimAnim />,
  },
];

function FittingRoomGuide({ onClose }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const prev = () => setStep(s => Math.max(0, s - 1));
  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="frg-overlay">
      <div className="frg-modal">

        {/* 단계 점 표시 */}
        <div className="frg-dots">
          {STEPS.map((_, i) => (
            <div key={i} className={`frg-dot ${i === step ? 'frg-dot-active' : ''}`} onClick={() => setStep(i)} />
          ))}
        </div>

        {/* 애니메이션 영역 */}
        <div className="frg-anim-area" key={step}>
          {STEPS[step].animation}
        </div>

        {/* 텍스트 */}
        <div className="frg-content">
          <h3 className="frg-title">{STEPS[step].title}</h3>
          <p className="frg-desc">{STEPS[step].desc}</p>
        </div>

        {/* 네비게이션 */}
        <div className="frg-nav">
          <button className="frg-nav-btn" onClick={prev} disabled={step === 0}>
            ‹
          </button>

          <span className="frg-step-count">{step + 1} / {STEPS.length}</span>

          {isLast ? (
            <button className="frg-start-btn" onClick={handleClose}>
              시작하기
            </button>
          ) : (
            <button className="frg-nav-btn" onClick={next}>
              ›
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

export default FittingRoomGuide;
