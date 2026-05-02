import React from 'react';
import './MeasurementGuide.css';

const COMMON_TIPS = [
  { icon: '📄', text: 'A4 용지(21×29.7cm)를 옷과 겹치지 않게 옆에 반듯하게 놓아주세요.' },
  { icon: '📷', text: '카메라는 바닥과 수평이 되도록 위에서 정면으로 찍어주세요.' },
];

const TOP_TIPS = [
  { icon: '🤲', text: '겨드랑이 굴곡이 잘 보이도록 양소매를 살짝 벌려주세요.' },
  { icon: '👔', text: '목 부분과 밑단이 구겨지지 않게 쫙 펴주세요.' },
];

const BOTTOM_TIPS = [
  { icon: '🦵', text: '사타구니가 명확히 보이도록 두 다리를 겹치지 않게 A자 형태로 살짝 벌려주세요.' },
  { icon: '📏', text: '허리선이 겹치거나 울지 않게 반듯하게 펴주세요.' },
];

function MeasurementGuide({ categoryType, isOpen, onClose }) {
  const categoryTips = categoryType === 'Top' ? TOP_TIPS : BOTTOM_TIPS;
  const categoryLabel = categoryType === 'Top' ? '상의' : '하의';
  const categoryIcon = categoryType === 'Top' ? '👕' : '👖';

  return (
    <div className={`mg-panel ${isOpen ? 'mg-panel-open' : ''}`}>
      <div className="mg-panel-inner">
        <div className="mg-panel-header">
          <span className="mg-panel-title">📋 촬영 가이드</span>
          <button type="button" className="mg-panel-close" onClick={onClose}>✕</button>
        </div>

        <div className="mg-section">
          <div className="mg-section-title">
            <span className="mg-badge mg-badge-common">공통</span>
            준비 사항
          </div>
          <ul className="mg-list">
            {COMMON_TIPS.map((tip, i) => (
              <li key={`common-${i}`} className="mg-item">
                <span className="mg-item-icon">{tip.icon}</span>
                <span className="mg-item-text">{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mg-section">
          <div className="mg-section-title">
            <span className={`mg-badge ${categoryType === 'Top' ? 'mg-badge-top' : 'mg-badge-bottom'}`}>
              {categoryIcon} {categoryLabel}
            </span>
            펼쳐놓기 팁
          </div>
          <ul className="mg-list">
            {categoryTips.map((tip, i) => (
              <li key={`cat-${i}`} className="mg-item">
                <span className="mg-item-icon">{tip.icon}</span>
                <span className="mg-item-text">{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mg-warn">
          <span className="mg-warn-icon">⚠️</span>
          <span className="mg-warn-text">
            의류가 아닌 사진이나 카테고리({categoryLabel})와 다른 옷을 업로드하면 측정 결과가 부정확합니다.
          </span>
        </div>
      </div>
    </div>
  );
}

export default MeasurementGuide;
