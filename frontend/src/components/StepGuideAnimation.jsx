import React from 'react';
import './StepGuideAnimation.css';

const StepGuideAnimation = ({ step, categoryType, isAnalyzing }) => {
  if (step === 0 || step === 5) return null;

  return (
    <div className="step-guide-container">
      <div className="step-guide-header">
        <h3>💡 측정 가이드</h3>
        <p>{getGuideText(step, categoryType, isAnalyzing)}</p>
      </div>
      
      <div className="step-guide-animation-area">
        {step === 1 && <ClothingDragAnimation categoryType={categoryType} />}
        {step === 2 && <A4DragAnimation categoryType={categoryType} />}
        {step === 3 && <ShoulderClickAnimation categoryType={categoryType} />}
        {step === 4 && !isAnalyzing && <ReadyAnimation categoryType={categoryType} />}
        {step === 4 && isAnalyzing && <ScanningAnimation categoryType={categoryType} />}
      </div>
    </div>
  );
};

const getGuideText = (step, categoryType, isAnalyzing) => {
  if (step === 1) return "마우스를 드래그하여 의류가 모두 포함되도록 붉은색 박스를 그려주세요.";
  if (step === 2) return "A4 용지가 모두 포함되도록 초록색 박스를 그려주세요. (구김 주의)";
  if (step === 3) return "의류의 양쪽 어깨 재봉선 끝부분을 차례대로 정확히 클릭해주세요.";
  if (step === 4) {
    return isAnalyzing 
      ? "이미지를 스캔하여 각 부위의 치수를 자동으로 분석하고 있습니다..." 
      : "분석 준비가 완료되었습니다. 하단의 '치수 분석 시작' 버튼을 눌러주세요.";
  }
  return "";
}

const isTop = (type) => type && type.toLowerCase() === 'top';

const Cursor = () => (
  <svg className="cursor-svg" viewBox="0 0 24 24" width="28" height="28">
    <path fill="#ffffff" stroke="#000000" strokeWidth="1" d="M4 0l16 16-6 1.5 4 6-3 1.5-4-6-4 4z" />
  </svg>
);

const TshirtSVG = ({ className }) => (
  <svg className={`clothing-svg ${className}`} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tshirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#5A6775" />
        <stop offset="100%" stopColor="#3C4550" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.3" />
      </filter>
    </defs>
    <path 
      d="M 38 16 C 44 24, 56 24, 62 16 L 82 20 L 96 36 L 86 48 L 72 38 L 72 85 C 65 88, 35 88, 28 85 L 28 38 L 14 48 L 4 36 L 18 20 Z" 
      fill="url(#tshirtGrad)" stroke="#1E2328" strokeWidth="1" strokeLinejoin="round" filter="url(#shadow)"
    />
    <path d="M 38 16 C 44 24, 56 24, 62 16 C 56 13, 44 13, 38 16 Z" fill="#252A30" />
    <path d="M 38 16 C 44 24, 56 24, 62 16" stroke="#1E2328" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M 18 20 Q 22 30 28 38" stroke="#1E2328" strokeWidth="0.8" strokeDasharray="2,2" />
    <path d="M 82 20 Q 78 30 72 38" stroke="#1E2328" strokeWidth="0.8" strokeDasharray="2,2" />
    <path d="M 28 81 C 42 84, 58 84, 72 81" stroke="#1E2328" strokeWidth="0.8" strokeDasharray="2,2" />
  </svg>
);

const PantsSVG = ({ className }) => (
  <svg className={`clothing-svg ${className}`} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pantsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#4A5B70" />
        <stop offset="100%" stopColor="#2E3846" />
      </linearGradient>
      <filter id="shadowPants" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.3" />
      </filter>
    </defs>
    <path 
      d="M32 15 Q50 17 68 15 C72 30, 80 70, 82 85 C83 88, 80 90, 77 90 L60 90 C57 90, 55 88, 54 85 C52 75, 50 50, 50 45 C50 50, 48 75, 46 85 C45 88, 43 90, 40 90 L23 90 C20 90, 17 88, 18 85 C20 70, 28 30, 32 15 Z" 
      fill="url(#pantsGrad)" stroke="#1A2028" strokeWidth="1.2" strokeLinejoin="round" filter="url(#shadowPants)"
    />
    <path d="M30 22 Q50 24 70 22" stroke="#1A2028" strokeWidth="1" strokeDasharray="2,2" />
    <path d="M32 15 Q50 17 68 15 L70 22 Q50 24 30 22 Z" fill="#3D4A5C" stroke="#1A2028" strokeWidth="1" />
  </svg>
);

const ClothingDragAnimation = ({ categoryType }) => (
  <div className="animation-box clothing-animation">
    {categoryType === 'Top' ? <TshirtSVG className="clothing-icon" /> : <PantsSVG className="clothing-icon" />}
    <div className="drag-rect clothing-rect"></div>
    <Cursor />
  </div>
);

const A4DragAnimation = ({ categoryType }) => (
  <div className="animation-box a4-animation">
    {categoryType === 'Top' ? <TshirtSVG className="clothing-icon-blurred" /> : <PantsSVG className="clothing-icon-blurred" />}
    <div className="a4-icon"></div>
    <div className="drag-rect a4-rect"></div>
    <Cursor />
  </div>
);

const ShoulderClickAnimation = ({ categoryType }) => {
  if (!isTop(categoryType)) return null;

  return (
    <div className="animation-box shoulder-animation">
      <TshirtSVG className="clothing-icon" />
      <div className="shoulder-point left">
        <div className="click-ripple left-ripple"></div>
      </div>
      <div className="shoulder-point right">
        <div className="click-ripple right-ripple"></div>
      </div>
      <Cursor />
    </div>
  );
};

const ReadyAnimation = ({ categoryType }) => (
  <div className="animation-box ready-animation">
    {isTop(categoryType) ? <TshirtSVG className="clothing-icon" /> : <PantsSVG className="clothing-icon" />}
    <div className="ready-pulse"></div>
  </div>
);

const ScanningAnimation = ({ categoryType }) => (
  <div className="animation-box scan-animation">
    {isTop(categoryType) ? <TshirtSVG className="clothing-icon" /> : <PantsSVG className="clothing-icon" />}
    <div className="scan-line"></div>
  </div>
);

export default StepGuideAnimation;
