import React, { useState, useEffect } from 'react';
import './ErrorToast.css';

const ERROR_MESSAGES = {
  A4_NOT_FOUND: {
    title: 'A4 용지를 찾을 수 없습니다',
    detail: 'A4 용지가 사진에 포함되어 있는지 확인해주세요. 용지 위에 물건이 올라가 있거나, 배경과 색이 비슷한 경우 인식이 어려울 수 있습니다.',
    icon: '📄',
  },
  A4_TOO_SMALL: {
    title: 'A4 영역이 너무 작습니다',
    detail: 'A4 용지 영역을 더 크게 지정해주세요. 용지가 너무 멀리 있거나 영역이 부정확할 수 있습니다.',
    icon: '🔍',
  },
  A4_NOT_QUAD: {
    title: 'A4 꼭짓점을 찾을 수 없습니다',
    detail: 'A4 용지의 4개 모서리가 모두 보여야 합니다. 용지가 접혀있거나 일부가 가려져 있지 않은지 확인해주세요.',
    icon: '📐',
  },
  WARP_TOO_LARGE: {
    title: 'A4 형태가 심하게 왜곡되었습니다',
    detail: 'A4 용지 영역 박스를 용지에만 딱 맞게 다시 그려주세요. 주변 배경이 많이 포함되면 왜곡이 심해질 수 있습니다.',
    icon: '⚠️',
  },
  SHIRT_NOT_FOUND: {
    title: '의류 실루엣을 찾을 수 없습니다',
    detail: '옷의 색상이 배경과 너무 비슷하거나 영역 지정이 부정확할 수 있습니다. 밝은 배경 위에 옷을 놓고 다시 촬영해주세요.',
    icon: '👔',
  },
};

function ErrorToast({ errorCode, errorDetail, onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const info = ERROR_MESSAGES[errorCode] || {
    title: '분석 중 오류 발생',
    detail: errorDetail || '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.',
    icon: '❌',
  };

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    const timer = setTimeout(() => handleClose(), 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose && onClose();
    }, 350);
  };

  return (
    <div className={`et-overlay ${isVisible && !isExiting ? 'et-visible' : ''} ${isExiting ? 'et-exiting' : ''}`}>
      <div className="et-toast">
        <div className="et-header">
          <span className="et-icon">{info.icon}</span>
          <span className="et-title">{info.title}</span>
          <button className="et-close" onClick={handleClose}>✕</button>
        </div>
        <p className="et-detail">{info.detail}</p>
        <div className="et-actions">
          <button className="et-btn" onClick={handleClose}>확인</button>
        </div>
        <div className="et-progress" />
      </div>
    </div>
  );
}

export default ErrorToast;
