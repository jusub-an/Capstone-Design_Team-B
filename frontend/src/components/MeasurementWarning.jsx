import React from 'react';
import './MeasurementWarning.css';

/**
 * 측정 결과의 기하학적/논리적 모순을 검증합니다.
 * 옷의 절대적인 크기(아동복 vs 성인복)와 무관하게,
 * 카테고리 불일치/비의류 이미지/특징점 오검출을 비율로 판별합니다.
 *
 * @param {Object} data - 백엔드에서 반환된 측정 결과 (cm 단위)
 * @param {'Top'|'Bottom'} categoryType - 의류 카테고리
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateMeasurements(data, categoryType) {
  const warnings = [];

  if (categoryType === 'Bottom') {
    const { rise_cm, length_cm, thigh_cm, waist_cm, hem_cm } = data;

    // --- 기존 조건: 기하학적 불가능 ---
    if (rise_cm >= length_cm) {
      warnings.push(
        `밑위(${rise_cm}cm)가 총장(${length_cm}cm)보다 길거나 같습니다. 사타구니 점이 밑단 아래로 잘못 잡혔을 수 있습니다.`
      );
    }

    if (thigh_cm >= waist_cm * 1.2) {
      warnings.push(
        `허벅지 단면(${thigh_cm}cm)이 허리 단면(${waist_cm}cm)의 1.2배 이상입니다. 다리가 겹쳐서 통이 하나로 합쳐져 측정되었을 수 있습니다.`
      );
    }

    if (length_cm > 0 && rise_cm / length_cm > 0.8) {
      warnings.push(
        `총장 대비 밑위 비율이 ${Math.round((rise_cm / length_cm) * 100)}%로 비정상적으로 높습니다. 사타구니를 못 찾았을 수 있습니다.`
      );
    }

    if (length_cm < 5) {
      warnings.push(`총장(${length_cm}cm)이 5cm 미만으로 측정되었습니다. 특징점이 한곳에 뭉쳐 측정에 실패했을 수 있습니다.`);
    }
    if (waist_cm < 5) {
      warnings.push(`허리단면(${waist_cm}cm)이 5cm 미만으로 측정되었습니다. 특징점이 한곳에 뭉쳐 측정에 실패했을 수 있습니다.`);
    }

    // --- 추가 조건: 카테고리 불일치 / 비의류 검출 ---
    // 상의를 바지로 측정하면: 허리(양소매 끝 포함)가 극단적으로 넓고, 밑단이 매우 좁아짐
    if (hem_cm > 0 && waist_cm / hem_cm > 3.0) {
      warnings.push(
        `허리단면(${waist_cm}cm)이 밑단(${hem_cm}cm)의 ${(waist_cm / hem_cm).toFixed(1)}배입니다. 바지가 아닌 상의(티셔츠)를 촬영한 것은 아닌지 확인해주세요.`
      );
    }

    // 바지는 보통 총장이 허리단면의 1.2배~4배 정도. 허리가 총장보다 넓으면 비정상
    if (waist_cm > length_cm * 1.5) {
      warnings.push(
        `허리단면(${waist_cm}cm)이 총장(${length_cm}cm)의 1.5배를 초과합니다. 카테고리(하의)와 다른 의류를 촬영한 것은 아닌지 확인해주세요.`
      );
    }

    // 밑위가 총장의 10% 미만이면 사타구니를 최상단에 잡아버린 것
    if (length_cm > 0 && rise_cm / length_cm < 0.1 && rise_cm > 0) {
      warnings.push(
        `밑위(${rise_cm}cm)가 총장 대비 ${Math.round((rise_cm / length_cm) * 100)}%로 비정상적으로 짧습니다. 사타구니 특징점이 허리 부근에 잘못 잡혔을 수 있습니다.`
      );
    }
  }

  if (categoryType === 'Top') {
    const { sleeve_width_cm, chest_cm, neck_width_cm, length_cm } = data;

    // --- 기존 조건: 기하학적 불가능 ---
    if (sleeve_width_cm >= chest_cm) {
      warnings.push(
        `소매끝단면(${sleeve_width_cm}cm)이 가슴단면(${chest_cm}cm)보다 넓습니다. 겨드랑이를 못 찾고 소매가 몸통에 파묻혀 측정되었을 수 있습니다.`
      );
    }

    if (neck_width_cm >= chest_cm) {
      warnings.push(
        `넥라인(${neck_width_cm}cm)이 가슴단면(${chest_cm}cm)보다 넓습니다. 목 끝점이 어깨 너머로 잘못 잡혔을 수 있습니다.`
      );
    }

    if (length_cm < 5) {
      warnings.push(`총장(${length_cm}cm)이 5cm 미만으로 측정되었습니다. 특징점이 한곳에 뭉쳐 측정에 실패했을 수 있습니다.`);
    }
    if (chest_cm < 5) {
      warnings.push(`가슴단면(${chest_cm}cm)이 5cm 미만으로 측정되었습니다. 특징점이 한곳에 뭉쳐 측정에 실패했을 수 있습니다.`);
    }

    // --- 추가 조건: 카테고리 불일치 / 비의류 검출 ---
    // 바지를 상의로 측정하면: 총장이 가슴단면에 비해 극단적으로 길어짐
    // 일반 상의는 총장/가슴 비율이 1.0~1.8 정도. 2.0 이상이면 비정상
    if (chest_cm > 0 && length_cm / chest_cm > 2.0) {
      warnings.push(
        `총장(${length_cm}cm)이 가슴단면(${chest_cm}cm)의 ${(length_cm / chest_cm).toFixed(1)}배입니다. 상의가 아닌 하의(바지)를 촬영한 것은 아닌지 확인해주세요.`
      );
    }

    // 넥라인이 가슴의 40% 이상이면 비정상 (일반 티셔츠 넥 비율 10~30% 정도)
    if (chest_cm > 0 && neck_width_cm / chest_cm > 0.4) {
      warnings.push(
        `넥라인(${neck_width_cm}cm)이 가슴단면의 ${Math.round((neck_width_cm / chest_cm) * 100)}%입니다. 목 끝점이 잘못 잡혔거나 의류가 아닌 이미지를 촬영한 것은 아닌지 확인해주세요.`
      );
    }

    // 소매폭이 가슴의 50% 이상이면 비정상 (소매가 파묻힘)
    if (chest_cm > 0 && sleeve_width_cm / chest_cm > 0.5) {
      warnings.push(
        `소매끝단면(${sleeve_width_cm}cm)이 가슴단면의 ${Math.round((sleeve_width_cm / chest_cm) * 100)}%입니다. 겨드랑이 특징점이 잘못 잡혔거나 소매가 펴지지 않은 상태로 촬영된 것은 아닌지 확인해주세요.`
      );
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}


function MeasurementWarning({ warnings, onShowGuide }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="mw-container">
      <div className="mw-header">
        <span className="mw-icon">⚠️</span>
        <span className="mw-title">옷의 비율이 기형적으로 측정되었습니다</span>
      </div>
      <p className="mw-desc">
        다리나 소매가 겹치지 않았는지, 바닥에 쫙 펴져 있는지{' '}
        <button type="button" className="mw-link" onClick={onShowGuide}>촬영 가이드라인</button>
        을 다시 확인해 주세요.
      </p>
      <ul className="mw-list">
        {warnings.map((w, i) => (
          <li key={i} className="mw-item">
            <span className="mw-bullet">•</span>
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MeasurementWarning;
