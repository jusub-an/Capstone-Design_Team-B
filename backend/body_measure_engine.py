import math
import os
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision as mp_vision
from PIL import Image as PILImage, ImageDraw, ImageFont
from rembg import new_session, remove as rembg_remove

_POSE_MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker_heavy.task")
_POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_heavy/float16/latest/"
    "pose_landmarker_heavy.task"
)


class BodyMeasureEngine:
    """
    전신 이미지 1장 + 키(cm) → 2D 기반 신체 치수 추출.

    알고리즘 출처: CV로 신체 치수 추출 3.0 (HTML) + app.py (Streamlit)
    - 어깨: 마스크 상단 엣지 기준 (findShoulderTop)
    - 가슴: 겨드랑이 앵커 간 유클리드 거리 (chestSpan = AR_pt ~ AL_pt)
    - 겨드랑이: Gap Vanishing Raycast (SEARCHING→TRACKING→VANISHED 상태 기계)
    - 허리: 겨드랑이 Y ~ 골반 Y 구간에서 최소 폭
    - M1 Mac 충돌 방지: PoseLandmarker(세그없음) + 별도 ImageSegmenter 사용
    """

    def __init__(self) -> None:
        if not os.path.exists(_POSE_MODEL_PATH):
            print("[BodyMeasureEngine] 포즈 랜드마커 모델 다운로드 중...")
            urllib.request.urlretrieve(_POSE_MODEL_URL, _POSE_MODEL_PATH)
            print("[BodyMeasureEngine] 포즈 랜드마커 다운로드 완료.")

        cpu = mp_tasks.BaseOptions.Delegate.CPU

        self._landmarker = mp_vision.PoseLandmarker.create_from_options(
            mp_vision.PoseLandmarkerOptions(
                base_options=mp_tasks.BaseOptions(model_asset_path=_POSE_MODEL_PATH, delegate=cpu),
                output_segmentation_masks=False,
                num_poses=1,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        )

        # rembg: u2net_human_seg 모델 (첫 실행 시 자동 다운로드 ~170MB)
        print("[BodyMeasureEngine] rembg 세그멘테이션 세션 초기화 중...")
        self._rembg_session = new_session("u2net_human_seg")
        print("[BodyMeasureEngine] rembg 초기화 완료.")

    # =========================================================
    # 공개 메서드
    # =========================================================

    def analyze(self, image_bgr: np.ndarray, user_height_cm: float, side_image_bgr: Optional[np.ndarray] = None) -> Dict[str, Any]:
        if image_bgr is None or image_bgr.size == 0:
            raise ValueError("유효한 이미지가 아닙니다.")
        if user_height_cm <= 0:
            raise ValueError("키(cm)는 0보다 커야 합니다.")

        h, w = image_bgr.shape[:2]
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)

        pose_result = self._landmarker.detect(mp_image)
        if not pose_result.pose_landmarks:
            raise ValueError("사람의 포즈를 감지하지 못했습니다.")

        landmarks = self._landmarks_to_dicts(pose_result.pose_landmarks[0], w, h)
        pose_valid, warnings = self._validate_pose(landmarks, w, h)

        # rembg: 높은 해상도 입력으로 깨끗한 실루엣 확보
        _REMBG_MAX = 1024
        scale = min(1.0, _REMBG_MAX / max(h, w))
        rw, rh = int(w * scale), int(h * scale)
        pil_input = PILImage.fromarray(image_rgb).resize((rw, rh), PILImage.LANCZOS)

        rembg_rgba = rembg_remove(pil_input, session=self._rembg_session, only_mask=False)
        alpha_small = np.array(rembg_rgba)[:, :, 3].astype(np.float32)

        # 원본 크기로 복원
        if scale < 1.0:
            alpha_arr = cv2.resize(alpha_small, (w, h), interpolation=cv2.INTER_LINEAR)
        else:
            alpha_arr = alpha_small

        seg_float = alpha_arr / 255.0
        raw_mask  = (alpha_arr > 128).astype(np.uint8) * 255
        mask = self._build_binary_mask(raw_mask, w)

        # ── 스케일 계산 (사용자 요청: 정수리 ~ 발꿈치) ──
        top_y = self._find_top_head_y(mask, landmarks)
        bottom_y = self._find_bottom_foot_y(mask, landmarks)
        pixel_height = float(bottom_y - top_y)
        if pixel_height <= 0:
            raise ValueError("신체 높이 픽셀 계산에 실패했습니다.")
        cm_per_pixel = float(user_height_cm / pixel_height)

        # ── 전체 실루엣(정수리 ~ 발끝) 높이 비율 계산 (프론트엔드 가상 피팅 보정용) ──
        actual_bottom_y = h - 1
        for y in range(h - 1, -1, -1):
            if np.any(mask[y, :] > 0):
                actual_bottom_y = y
                break
        total_pixel_height = float(actual_bottom_y - top_y)
        if total_pixel_height <= 0:
            total_pixel_height = pixel_height
        height_ratio = total_pixel_height / pixel_height

        # ── 랜드마크 픽셀 좌표 ──
        lm11, lm12 = landmarks[11], landmarks[12]   # 어깨
        lm13, lm14 = landmarks[13], landmarks[14]   # 팔꿈치
        lm15, lm16 = landmarks[15], landmarks[16]   # 손목
        lm23, lm24 = landmarks[23], landmarks[24]   # 골반
        lm25, lm26 = landmarks[25], landmarks[26]   # 무릎
        lm27, lm28 = landmarks[27], landmarks[28]   # 발목
        lm29, lm30 = landmarks[29], landmarks[30]   # 발꿈치

        shoulder_y = int((lm11["y"] + lm12["y"]) / 2)
        hip_y      = int((lm23["y"] + lm24["y"]) / 2)
        knee_y     = int((lm25["y"] + lm26["y"]) / 2)
        ankle_y    = int((lm27["y"] + lm28["y"]) / 2)
        spine_x    = int((lm11["x"] + lm12["x"]) / 2)

        # ── 팔/다리 벌림 각도 계산 (가상 피팅 옷 렌더링 시 사용) ──
        def _calc_angle_from_horizontal(pt1, pt2):
            dx = abs(pt2["x"] - pt1["x"])
            dy = pt2["y"] - pt1["y"]
            return math.degrees(math.atan2(dy, dx))

        def _calc_angle_from_vertical(pt1, pt2):
            dx = abs(pt2["x"] - pt1["x"])
            dy = pt2["y"] - pt1["y"]
            return math.degrees(math.atan2(dx, dy))

        arm_angle = (_calc_angle_from_horizontal(lm11, lm13) + _calc_angle_from_horizontal(lm12, lm14)) / 2
        leg_angle = (_calc_angle_from_vertical(lm23, lm25) + _calc_angle_from_vertical(lm24, lm26)) / 2

        # ══════════════════════════════════════
        # 1. 어깨너비 (→ 상의 shoulder)
        #    어깨 관절 Y에서 외측 X를 찾은 후, 그 X에서 위로 올라가
        #    마스크 상단 엣지(어깨 윤곽선)를 찾아 대각선 포인트 생성
        # ══════════════════════════════════════
        sh_outer_left  = self._find_shoulder_contour_point(mask, lm11["x"], lm11["y"], direction=+1)
        sh_outer_right = self._find_shoulder_contour_point(mask, lm12["x"], lm12["y"], direction=-1)
        shoulder_width_px = math.hypot(
            sh_outer_right["x"] - sh_outer_left["x"],
            sh_outer_right["y"] - sh_outer_left["y"],
        )

        # ══════════════════════════════════════
        # 2. 겨드랑이 앵커 (Gap Vanishing Raycast)
        # ══════════════════════════════════════
        armpits = self._find_armpits_scan(mask, spine_x, shoulder_y, hip_y)

        if armpits["left_armpit"] is None or armpits["right_armpit"] is None:
            fallback_y = int(shoulder_y + (hip_y - shoulder_y) * 0.15)
            if armpits["left_armpit"] is None:
                armpits["left_armpit"]  = {"x": float(lm11["x"]), "y": float(fallback_y)}
            if armpits["right_armpit"] is None:
                armpits["right_armpit"] = {"x": float(lm12["x"]), "y": float(fallback_y)}
            warnings.append("겨드랑이 자동 감지 실패 — 어깨 랜드마크 기반 추정값 사용. A자 포즈를 권장합니다.")

        # ══════════════════════════════════════
        # 3. 가슴너비 (→ 상의 chest)
        #    겨드랑이 Y 레벨에서 몸통 마스크의 수평 폭을 측정
        #    겨드랑이 앵커의 내측 x좌표 범위로 팔 영역을 제외
        # ══════════════════════════════════════
        chest_width_px = None
        chest_p_start  = chest_p_end = None
        armpit_y = None
        if armpits["left_armpit"] is not None and armpits["right_armpit"] is not None:
            armpit_y = int((armpits["left_armpit"]["y"] + armpits["right_armpit"]["y"]) / 2)
            # 겨드랑이 앵커 X를 하드 바운더리로 사용 → 팔 영역 확실히 제외
            left_bound_x = int(armpits["left_armpit"]["x"])
            right_bound_x = int(armpits["right_armpit"]["x"])
            chest_width_px = float(abs(right_bound_x - left_bound_x))
            chest_p_start = {"x": float(min(left_bound_x, right_bound_x)), "y": float(armpit_y)}
            chest_p_end = {"x": float(max(left_bound_x, right_bound_x)), "y": float(armpit_y)}

        # ══════════════════════════════════════
        # 4. 사타구니 앵커
        # ══════════════════════════════════════
        crotch = self._find_crotch_scan(mask, spine_x, hip_y, knee_y)

        # ══════════════════════════════════════
        # 5. 골반너비 (→ 하의 waist) — 바지 허리선 기준
        #    hip_y에서 위로 약 15% 지점 (골반 약간 위쪽)
        # ══════════════════════════════════════
        pants_waist_y = int(hip_y - (hip_y - shoulder_y) * 0.15)
        hip_span = self._find_torso_width_at_y(mask, spine_x, pants_waist_y, band=5)
        if hip_span is None:
            hip_span = {"width_px": 10, "p_start": {"x": float(spine_x - 5), "y": float(pants_waist_y)}, "p_end": {"x": float(spine_x + 5), "y": float(pants_waist_y)}}

        # ══════════════════════════════════════
        # 5b. 허리너비 (→ 상의 waist) — 겨드랑이~골반 사이 55% 지점
        #     상의(셔츠/재킷) 허리 핏 기준
        # ══════════════════════════════════════
        _waist_y = int(armpit_y + (pants_waist_y - armpit_y) * 0.55) if armpit_y is not None \
            else int(shoulder_y + (pants_waist_y - shoulder_y) * 0.6)
        waist_span = self._find_torso_width_at_y(mask, spine_x, _waist_y, band=5)
        if waist_span is None:
            waist_span = {"width_px": 10, "p_start": {"x": float(spine_x - 5), "y": float(_waist_y)}, "p_end": {"x": float(spine_x + 5), "y": float(_waist_y)}}

        # ══════════════════════════════════════
        # 7. 허벅지너비 (→ 하의 thigh)
        #    사타구니~무릎 구간(상위 30%) 스캔 → 최대 단일 다리 폭
        # ══════════════════════════════════════
        thigh_span = None
        thigh_y = None
        if crotch is not None:
            thigh_span = self._find_max_thigh_width(
                mask, crotch, lm25, lm26, knee_y)
            if thigh_span is not None:
                thigh_y = thigh_span["p_start"]["y"]

        # ══════════════════════════════════════
        # 8. 밑위길이 (→ 하의 rise)
        #    바지 허리선(pants_waist_y) ~ 사타구니 Y 수직 거리
        # ══════════════════════════════════════
        rise_px = None
        rise_p_start = rise_p_end = None

        if crotch is not None:
            rise_px = abs(crotch["y"] - pants_waist_y)
            rise_p_start = {"x": float(spine_x), "y": float(pants_waist_y)}
            rise_p_end   = {"x": float(spine_x), "y": float(crotch["y"])}

        # ══════════════════════════════════════
        # 9. 밑단너비 (→ 하의 hem)
        # ══════════════════════════════════════
        hem_span = self._find_hem_width(mask, lm27, lm28, lm25, lm26)

        # ══════════════════════════════════════
        # 10. 팔길이 (→ 상의 sleeve)
        #     어깨 관절(lm11/12) → 팔꿈치(lm13/14) → 손목(lm15/16)
        # ══════════════════════════════════════
        left_arm_px  = self._dist(lm11, lm13) + self._dist(lm13, lm15)
        right_arm_px = self._dist(lm12, lm14) + self._dist(lm14, lm16)
        arm_length_px = (left_arm_px + right_arm_px) / 2

        # ══════════════════════════════════════
        # 10.5. 팔 너비 (→ 상의 arm_width)
        #       이두 부분 (어깨~팔꿈치 사이 두께)
        # ══════════════════════════════════════
        left_bicep = self._find_bicep_width(mask, lm11, lm13)
        right_bicep = self._find_bicep_width(mask, lm12, lm14)
        
        arm_width_px = None
        arm_width_p_start = arm_width_p_end = None
        
        if left_bicep and right_bicep:
            arm_width_px = (left_bicep["width_px"] + right_bicep["width_px"]) / 2
            arm_width_p_start = left_bicep["p_start"]
            arm_width_p_end = left_bicep["p_end"]
        elif left_bicep:
            arm_width_px = left_bicep["width_px"]
            arm_width_p_start = left_bicep["p_start"]
            arm_width_p_end = left_bicep["p_end"]
        elif right_bicep:
            arm_width_px = right_bicep["width_px"]
            arm_width_p_start = right_bicep["p_start"]
            arm_width_p_end = right_bicep["p_end"]

        # ══════════════════════════════════════
        # 11. 상체 길이 (→ 상의 length)
        #     승모근 상부(HPS, 옆목점) → 골반(hip_y, 배꼽 아래) 수직 거리
        # ══════════════════════════════════════
        # 척추 중심에서 어깨 관절까지의 약 70% 지점에서 마스크 상단 엣지 탐색
        neck_base_l_x = spine_x + (lm11["x"] - spine_x) * 0.7
        neck_base_r_x = spine_x + (lm12["x"] - spine_x) * 0.7
        trap_left = self._find_shoulder_edge(mask, neck_base_l_x, shoulder_y)
        trap_right = self._find_shoulder_edge(mask, neck_base_r_x, shoulder_y)
        hps_y = (trap_left["y"] + trap_right["y"]) / 2

        # 상의 총장: HPS(승모근) → 골반(hip_y = 배꼽 아래)
        line_x = float(trap_right["x"])
        top_length_px = abs(hip_y - hps_y)
        top_length_p_start = {"x": line_x, "y": float(trap_right["y"])}
        top_length_p_end   = {"x": line_x, "y": float(hip_y)}

        # ══════════════════════════════════════
        # 12. 하반신 길이 (→ 하의 length)
        #     골반(lm23/24) → 무릎(lm25/26) → 발목(lm27/28) 꺾인 경로 길이 합산
        #     (다리를 벌리고 촬영해도 실제 다리 길이를 측정하도록 보완)
        # ══════════════════════════════════════
        left_leg_px  = self._dist(lm23, lm25) + self._dist(lm25, lm27)
        right_leg_px = self._dist(lm24, lm26) + self._dist(lm26, lm28)
        bottom_length_px = (left_leg_px + right_leg_px) / 2
        
        bottom_length_p_start = self._xy(lm24)
        bottom_length_p_end   = self._xy(lm28)

        # ── 측정값 목록 조립 (의류 사이즈 대응 항목) ──
        measurements: List[Dict[str, Any]] = []

        # ── 상의 대응 항목 ──
        measurements.append(
            self._item("shoulder", "어깨너비", shoulder_width_px, cm_per_pixel,
                       sh_outer_left, sh_outer_right))

        if chest_width_px is not None:
            measurements.append(self._item(
                "chest", "가슴너비", chest_width_px, cm_per_pixel,
                chest_p_start, chest_p_end,
            ))

        measurements.append(
            self._item("sleeve", "팔길이", arm_length_px, cm_per_pixel,
                       self._xy(lm11), self._xy(lm15)))

        if arm_width_px is not None:
            measurements.append(
                self._item("arm_width", "팔너비(이두)", arm_width_px, cm_per_pixel,
                           arm_width_p_start, arm_width_p_end))

        measurements.append(
            self._item("top_length", "상체길이", top_length_px, cm_per_pixel,
                       top_length_p_start, top_length_p_end))

        # ── 상의 허리 / 하의 골반 ──
        if waist_span is not None:
            measurements.append(self._item(
                "waist", "허리너비", waist_span["width_px"], cm_per_pixel,
                waist_span["p_start"], waist_span["p_end"],
            ))
        if hip_span is not None:
            measurements.append(self._item(
                "hip", "골반너비", hip_span["width_px"], cm_per_pixel,
                hip_span["p_start"], hip_span["p_end"],
            ))



        if thigh_span is not None:
            measurements.append(self._item(
                "thigh", "허벅지너비", thigh_span["width_px"], cm_per_pixel,
                thigh_span["p_start"], thigh_span["p_end"],
            ))

        if rise_px is not None:
            measurements.append(self._item(
                "rise", "밑위길이", rise_px, cm_per_pixel,
                rise_p_start, rise_p_end,
            ))

        if hem_span is not None:
            measurements.append(self._item(
                "hem", "밑단너비", hem_span["width_px"], cm_per_pixel,
                hem_span["p_start"], hem_span["p_end"],
            ))

        measurements.append(
            self._item("bottom_length", "하반신길이", bottom_length_px, cm_per_pixel,
                       bottom_length_p_start, bottom_length_p_end))

        # ══════════════════════════════════════
        # 13. 측면 사진 기반 둘레 측정 (선택)
        #     가슴둘레 = 2π√((a²+b²)/2), a=가슴폭/2, b=측면깊이/2
        # ══════════════════════════════════════
        side_debug_image = None
        if side_image_bgr is not None:
            try:
                # 정면과 측면 모두 mask_bottom 기준으로 비율을 통일
                # cm 변환 후 역변환 시 heel 랜드마크 vs mask_bottom 참조점 불일치가 발생하므로
                # 비율(ratio)로 직접 매핑하면 신발 보정 없이 일관성 유지됨
                _front_total = total_pixel_height if total_pixel_height > 0 else pixel_height
                # 가슴선을 겨드랑이 위치보다 살짝 위로 조정 (0.90 계수 = 약 3~4% 상향)
                chest_ratio = (armpit_y - top_y) / _front_total * 0.90 if armpit_y is not None else 0.26
                waist_ratio = (_waist_y - top_y) / _front_total   # 상의 허리
                hip_ratio   = (pants_waist_y - top_y) / _front_total  # 골반
                thigh_ratio = (thigh_y - top_y) / _front_total if thigh_y is not None else None
                side_depths = self._extract_depth_measurements(
                    side_image_bgr, chest_ratio, waist_ratio, hip_ratio, thigh_ratio, user_height_cm)
                if side_depths:
                    side_debug_image = side_depths.get("debug_image")
                    chest_d = side_depths.get("chest_depth_cm")
                    waist_d = side_depths.get("waist_depth_cm")
                    hip_d   = side_depths.get("hip_depth_cm")
                    chest_w = (chest_width_px * cm_per_pixel) if chest_width_px is not None else None
                    waist_w = (waist_span["width_px"] * cm_per_pixel) if waist_span is not None else None
                    hip_w   = (hip_span["width_px"]   * cm_per_pixel) if hip_span   is not None else None
                    if chest_d is not None and chest_w is not None:
                        a, b = chest_w / 2, chest_d / 2
                        chest_circ = 2 * math.pi * math.sqrt((a ** 2 + b ** 2) / 2)
                        measurements.append({
                            "key": "chest_circumference", "label": "가슴둘레",
                            "value_cm": round(chest_circ, 1),
                            "width_px": None, "p_start": None, "p_end": None,
                        })
                    if waist_d is not None and waist_w is not None:
                        a, b = waist_w / 2, waist_d / 2
                        waist_circ = 2 * math.pi * math.sqrt((a ** 2 + b ** 2) / 2)
                        measurements.append({
                            "key": "waist_circumference", "label": "허리둘레",
                            "value_cm": round(waist_circ, 1),
                            "width_px": None, "p_start": None, "p_end": None,
                        })
                    if hip_d is not None and hip_w is not None:
                        a, b = hip_w / 2, hip_d / 2
                        hip_circ = 2 * math.pi * math.sqrt((a ** 2 + b ** 2) / 2)
                        measurements.append({
                            "key": "hip_circumference", "label": "골반둘레",
                            "value_cm": round(hip_circ, 1),
                            "width_px": None, "p_start": None, "p_end": None,
                        })
                    thigh_d = side_depths.get("thigh_depth_cm")
                    thigh_w = (thigh_span["width_px"] * cm_per_pixel) if thigh_span is not None else None
                    if thigh_d is not None and thigh_w is not None:
                        a, b = thigh_w / 2, thigh_d / 2
                        thigh_circ = 2 * math.pi * math.sqrt((a ** 2 + b ** 2) / 2)
                        measurements.append({
                            "key": "thigh_circumference", "label": "허벅지둘레",
                            "value_cm": round(thigh_circ, 1),
                            "width_px": None, "p_start": None, "p_end": None,
                        })
            except Exception as _side_err:
                warnings.append(f"측면 사진 분석 실패: {str(_side_err)[:60]}")

        measurements.append({
            "key": "arm_angle", "label": "팔 벌림 각도",
            "value_cm": round(arm_angle, 1),
            "width_px": None, "p_start": None, "p_end": None,
        })
        measurements.append({
            "key": "leg_angle", "label": "다리 벌림 각도",
            "value_cm": round(leg_angle, 1),
            "width_px": None, "p_start": None, "p_end": None,
        })

        debug_image = self._draw_debug(image_bgr, landmarks, top_y, bottom_y,
                                       armpits, crotch, measurements)
        person_extracted, gray_mask = self._build_visual_images(image_bgr, seg_float, raw_mask)
        gray_debug_image = self._draw_debug(gray_mask, landmarks, top_y, bottom_y,
                                            armpits, crotch, measurements)

        return {
            "pose_valid":  pose_valid,
            "warnings":    warnings,
            "image_width": w,
            "image_height": h,
            "pixel_height": round(pixel_height, 1),
            "cm_per_pixel": round(cm_per_pixel, 4),
            "height_ratio": round(height_ratio, 4),
            "anchors": {
                "left_armpit":  armpits["left_armpit"],
                "right_armpit": armpits["right_armpit"],
                "crotch":       crotch,
                "arm_angle":    round(arm_angle, 1),
                "leg_angle":    round(leg_angle, 1),
            },
            "measurements":      measurements,
            "debug_image":       debug_image,
            "person_extracted":  person_extracted,
            "gray_mask":         gray_mask,
            "gray_debug_image":  gray_debug_image,
            "side_debug_image":  side_debug_image,
        }

    # =========================================================
    # 내부 유틸
    # =========================================================

    def _landmarks_to_dicts(self, lm_list, w: int, h: int) -> Dict[int, Dict]:
        return {
            idx: {
                "x": float(lm.x * w),
                "y": float(lm.y * h),
                "z": float(lm.z),
                "visibility": float(getattr(lm, "visibility", 0.0)),
            }
            for idx, lm in enumerate(lm_list)
        }

    def _validate_pose(self, landmarks, w: int, h: int) -> Tuple[bool, List[str]]:
        warnings = []
        shoulder_slope = abs(landmarks[11]["y"] - landmarks[12]["y"]) / max(h, 1)
        hip_slope      = abs(landmarks[23]["y"] - landmarks[24]["y"]) / max(h, 1)
        ankle_gap      = abs(landmarks[27]["x"] - landmarks[28]["x"]) / max(w, 1)

        if shoulder_slope > 0.05:
            warnings.append("어깨 기울어짐이 큽니다. 정면 자세로 다시 촬영하세요.")
        if hip_slope > 0.05:
            warnings.append("골반 기울어짐이 큽니다. 정면 자세로 다시 촬영하세요.")
        if ankle_gap < 0.03:
            warnings.append("다리 간격이 너무 좁습니다. A-포즈로 다시 촬영하세요.")

        return len(warnings) == 0, warnings

    def _build_binary_mask(self, raw_mask: np.ndarray, w: int) -> np.ndarray:
        """
        계산용 타이트 마스크:
        1. 가장 큰 윤곽선만 남겨 배경 노이즈 제거
        2. MORPH_OPEN으로 외부 돌출 노이즈 제거
        3. MORPH_CLOSE로 내부 구멍 메우기
        Gaussian blur는 사용하지 않음: 팔-몸통 갭 보존 필요
        """
        contours, _ = cv2.findContours(raw_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            clean = np.zeros_like(raw_mask)
            # 가장 큰 윤곽선만 유지 (배경 잡음 제거)
            cv2.drawContours(clean, [max(contours, key=cv2.contourArea)], -1, 255, cv2.FILLED)
        else:
            clean = raw_mask.copy()

        # OPEN: 외부 노이즈 제거 (작은 커널)
        k_open = max(3, int(w * 0.003)) | 1
        kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_open, k_open))
        clean = cv2.morphologyEx(clean, cv2.MORPH_OPEN, kernel_open)

        # CLOSE: 내부 구멍 메우기
        k_close = max(3, int(w * 0.008)) | 1
        kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_close, k_close))
        return cv2.morphologyEx(clean, cv2.MORPH_CLOSE, kernel_close)

    def _build_visual_images(
        self, image_bgr: np.ndarray,
        seg_float: np.ndarray,
        raw_mask: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        - person_extracted: float confidence로 소프트 알파 블렌딩 → 자연스러운 경계
        - gray_mask: contour fill 없이 raw_mask + 가벼운 morph → 팔/다리 갭 보존
        """
        _BG = np.array([245, 245, 245], dtype=np.float32)  # 밝은 회색 배경
        _FG = 60                                            # 어두운 회색 인물

        # ── 누끼: float confidence를 알파로 직접 사용 ──
        alpha = np.clip(seg_float, 0.0, 1.0)[:, :, np.newaxis]
        extracted = (image_bgr.astype(np.float32) * alpha
                     + _BG * (1.0 - alpha)).astype(np.uint8)

        # ── 실루엣: raw_mask 기반, 정교한 morph → 깨끗한 경계 + 갭 보존 ──
        w_sil = image_bgr.shape[1]
        k_o = max(3, int(w_sil * 0.004)) | 1
        k_c = max(5, int(w_sil * 0.010)) | 1
        ke_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_o, k_o))
        ke_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_c, k_c))
        sil = cv2.morphologyEx(raw_mask, cv2.MORPH_OPEN,  ke_open)
        sil = cv2.morphologyEx(sil,      cv2.MORPH_CLOSE, ke_close)
        # 스무딩: 계단 현상 제거하되 갭은 보존
        k_blur = max(5, int(w_sil * 0.012)) | 1
        sil = cv2.GaussianBlur(sil, (k_blur, k_blur), 0)
        _, sil = cv2.threshold(sil, 140, 255, cv2.THRESH_BINARY)
        gray = np.full_like(image_bgr, 245)
        gray[sil > 128] = _FG

        return extracted, gray

    def _px(self, mask: np.ndarray, x: int, y: int) -> bool:
        """마스크에서 (x,y)가 사람 픽셀인지 확인."""
        h, w = mask.shape[:2]
        if x < 0 or x >= w or y < 0 or y >= h:
            return False
        return mask[y, x] > 0

    def _find_top_head_y(self, mask: np.ndarray, landmarks) -> int:
        for y in range(mask.shape[0]):
            if np.any(mask[y, :] > 0):
                return y
        return max(0, int(landmarks[0]["y"]))

    def _find_bottom_foot_y(self, mask: np.ndarray, landmarks) -> int:
        # 사용자의 요청에 따라 실루엣의 끝(발가락) 대신 MediaPipe에서 추출한 발꿈치(heel) 랜드마크 29, 30 중 더 낮은 Y좌표를 키의 끝으로 사용합니다.
        return int(max(landmarks[29]["y"], landmarks[30]["y"]))

    def _find_shoulder_edge(self, mask: np.ndarray,
                            lm_x: float, lm_y: float) -> Dict[str, float]:
        """
        어깨 랜드마크 x열에서 마스크 최상단 픽셀을 찾는다.
        HTML: findShoulderTop(x, yStart)
        """
        h = mask.shape[0]
        x, y = int(lm_x), int(lm_y)
        if self._px(mask, x, y):
            while y > 0 and self._px(mask, x, y):
                y -= 1
            return {"x": float(x), "y": float(y + 1)}
        else:
            while y < h - 1 and not self._px(mask, x, y):
                y += 1
            return {"x": float(x), "y": float(y)}

    def _find_armpits_scan(self, mask: np.ndarray, spine_x: int,
                           shoulder_y: int, hip_y: int) -> Dict[str, Optional[Dict]]:
        """
        Gap Vanishing Raycast — HTML: findArmpitsScan 완전 대응.

        골반(hip_y)에서 어깨(shoulder_y) 방향으로 위로 스캔.
        상태 기계: SEARCHING → TRACKING (갭 발견) → VANISHED (갭 소멸 = 겨드랑이).
        lastLeftGap / lastRightGap = 갭이 마지막으로 존재했던 위치 = 실제 겨드랑이.

        MIN_GAP_PX: 벨트·의류 경계의 1~3px 세그멘테이션 아티팩트를 무시하기 위한
        최소 갭 너비. 실제 팔-몸통 사이 공간은 보통 8px 이상.
        """
        h, w = mask.shape[:2]
        # 이미지 너비의 1% 이상, 최소 5px — 벨트 아티팩트(1-3px) 제거 but 실제 팔 갭(5px+) 허용
        MIN_GAP_PX = max(5, int(w * 0.01))

        last_left_gap  = None
        last_right_gap = None
        left_state  = "SEARCHING"
        right_state = "SEARCHING"

        scan_start = int(hip_y)
        scan_end   = max(0, int(shoulder_y - h * 0.1))

        for y in range(scan_start, scan_end - 1, -1):
            # ── 화면 왼쪽(인체 오른쪽 팔) ──
            if left_state != "VANISHED":
                gap_x = arm_x = -1
                for x in range(spine_x, 0, -1):
                    if not self._px(mask, x, y):
                        gap_x = x; break
                if gap_x != -1:
                    for x in range(gap_x - 1, 0, -1):
                        if self._px(mask, x, y):
                            arm_x = x; break

                valid = gap_x != -1 and arm_x != -1 and (gap_x - arm_x) >= MIN_GAP_PX
                if valid:
                    last_left_gap = {"x": float((gap_x + arm_x) // 2), "y": float(y)}
                    left_state = "TRACKING"
                else:
                    if left_state == "TRACKING":
                        left_state = "VANISHED"

            # ── 화면 오른쪽(인체 왼쪽 팔) ──
            if right_state != "VANISHED":
                gap_x = arm_x = -1
                for x in range(spine_x, w - 1):
                    if not self._px(mask, x, y):
                        gap_x = x; break
                if gap_x != -1:
                    for x in range(gap_x + 1, w - 1):
                        if self._px(mask, x, y):
                            arm_x = x; break

                valid = gap_x != -1 and arm_x != -1 and (arm_x - gap_x) >= MIN_GAP_PX
                if valid:
                    last_right_gap = {"x": float((gap_x + arm_x) // 2), "y": float(y)}
                    right_state = "TRACKING"
                else:
                    if right_state == "TRACKING":
                        right_state = "VANISHED"

            if left_state == "VANISHED" and right_state == "VANISHED":
                break

        return {"left_armpit": last_left_gap, "right_armpit": last_right_gap}

    def _find_crotch_scan(self, mask: np.ndarray, spine_x: int,
                          hip_y: int, knee_y: int) -> Optional[Dict[str, float]]:
        """
        HTML: findCrotchScan — 골반 아래로 스캔하며 두 세그먼트로 갈라지는 첫 행.
        """
        h, w = mask.shape[:2]
        start_x = max(0,     int(spine_x - w * 0.15))
        end_x   = min(w - 1, int(spine_x + w * 0.15))

        for y in range(max(0, int(hip_y - h * 0.05)), min(h, int(knee_y) + 1)):
            segments: List[Tuple[int, int]] = []
            in_person = False
            seg_start = start_x

            for x in range(start_x, end_x + 1):
                p = self._px(mask, x, y)
                if p and not in_person:
                    in_person = True; seg_start = x
                elif not p and in_person:
                    in_person = False; segments.append((seg_start, x - 1))
            if in_person:
                segments.append((seg_start, end_x))

            if len(segments) >= 2:
                return {"x": float((segments[0][1] + segments[1][0]) // 2), "y": float(y)}

        return None

    def _get_horizontal_width(self, mask: np.ndarray,
                              center_x: int, center_y: int) -> Optional[Dict[str, Any]]:
        """HTML: getHorizWidth — center_y 행에서 마스크 좌우 경계 탐색."""
        h, w = mask.shape[:2]
        if center_y < 0 or center_y >= h:
            return None

        cx, cy = int(center_x), int(center_y)

        if not self._px(mask, cx, cy):
            found = False
            for d in range(1, int(w * 0.15)):
                if self._px(mask, cx + d, cy):
                    cx += d; found = True; break
                if self._px(mask, cx - d, cy):
                    cx -= d; found = True; break
            if not found:
                return None

        left_x = cx
        while left_x > 0 and self._px(mask, left_x, cy):
            left_x -= 1

        right_x = cx
        while right_x < w - 1 and self._px(mask, right_x, cy):
            right_x += 1

        width_px = float(right_x - left_x - 1)
        if width_px <= 0:
            return None

        return {
            "width_px": width_px,
            "p_start":  {"x": float(left_x + 1), "y": float(cy)},
            "p_end":    {"x": float(right_x - 1), "y": float(cy)},
        }

    def _find_waist_width(self, mask: np.ndarray, spine_x: int,
                          shoulder_y: int, hip_y: int,
                          armpit_y: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """
        HTML: chestY+20 ~ hipY-10 구간 4픽셀 간격으로 최소 폭 탐색.
        armpit_y가 있으면 그 아래 20px부터 시작(HTML과 동일).
        """
        start_y = int(armpit_y + 20) if armpit_y is not None \
                  else int(shoulder_y + (hip_y - shoulder_y) * 0.35)
        end_y   = int(hip_y - 10)

        min_span  = None
        min_width = None

        for y in range(start_y, end_y, 4):
            span = self._get_horizontal_width(mask, spine_x, y)
            if span is None:
                continue
            if min_width is None or span["width_px"] < min_width:
                min_width = span["width_px"]
                min_span  = span

        return min_span

    def _find_torso_width_at_y(self, mask: np.ndarray, spine_x: int,
                                center_y: int, band: int = 10) -> Optional[Dict[str, Any]]:
        """
        겨드랑이 Y 레벨에서 몸통(torso) 폭만 측정.
        spine_x를 기준으로 좌우 몸통 경계를 찾되,
        팔-몸통 갭을 만나면 그 지점에서 멈춤 → 팔 제외.
        ±band 범위에서 최대 폭을 반환하여 안정성 확보.
        """
        h, w = mask.shape[:2]
        best_span = None
        best_width = 0

        for y in range(max(0, center_y - band), min(h, center_y + band + 1), 2):
            # spine에서 좌측으로 → 몸통 경계 찾기
            left_x = spine_x
            gap_count = 0
            for x in range(spine_x, 0, -1):
                if self._px(mask, x, y):
                    left_x = x
                    gap_count = 0
                else:
                    gap_count += 1
                    # 5px 이상 연속 공백 = 팔-몸통 갭 → 중단
                    if gap_count >= 5:
                        left_x = x + gap_count
                        break

            # spine에서 우측으로 → 몸통 경계 찾기
            right_x = spine_x
            gap_count = 0
            for x in range(spine_x, w - 1):
                if self._px(mask, x, y):
                    right_x = x
                    gap_count = 0
                else:
                    gap_count += 1
                    if gap_count >= 5:
                        right_x = x - gap_count
                        break

            width_px = float(right_x - left_x)
            if width_px > best_width:
                best_width = width_px
                best_span = {
                    "width_px": width_px,
                    "p_start": {"x": float(left_x), "y": float(y)},
                    "p_end":   {"x": float(right_x), "y": float(y)},
                }

        return best_span

    def _find_min_width_in_range(self, mask: np.ndarray, spine_x: int,
                                  start_y: int, end_y: int) -> Optional[Dict[str, Any]]:
        """
        start_y ~ end_y 구간을 3px 간격으로 스캔하여 최소 수평 폭을 반환.
        허리 측정용 — 가장 좁은 위치가 실제 허리선.
        """
        min_span = None
        min_width = None

        for y in range(int(start_y), int(end_y), 3):
            span = self._get_horizontal_width(mask, spine_x, y)
            if span is None:
                continue
            if min_width is None or span["width_px"] < min_width:
                min_width = span["width_px"]
                min_span = span

        return min_span

    def _xy(self, lm: Dict) -> Dict[str, float]:
        return {"x": lm["x"], "y": lm["y"]}

    def _dist(self, p1: Dict, p2: Dict) -> float:
        return math.hypot(p2["x"] - p1["x"], p2["y"] - p1["y"])

    def _item(self, key: str, label: str, width_px: float, cm_per_pixel: float,
              p_start: Optional[Dict], p_end: Optional[Dict]) -> Dict[str, Any]:
        return {
            "key":       key,
            "label":     label,
            "value_cm":  round(width_px * cm_per_pixel, 1),
            "width_px":  round(width_px, 1),
            "p_start":   p_start,
            "p_end":     p_end,
        }

    def _find_shoulder_outer_edge(self, mask: np.ndarray,
                                   lm_x: float, lm_y: float,
                                   direction: int) -> Dict[str, float]:
        """
        어깨 랜드마크 Y에서 수평 외측으로 마스크 경계를 찾는다.
        (팔길이 측정의 시작점 등에 사용)
        """
        h, w = mask.shape[:2]
        x, y = int(lm_x), int(lm_y)
        y = max(0, min(y, h - 1))

        max_scan = int(w * 0.15)
        scanned = 0
        if self._px(mask, x, y):
            while 0 < x < w - 1 and self._px(mask, x + direction, y) and scanned < max_scan:
                x += direction
                scanned += 1
            return {"x": float(x), "y": float(y)}
        else:
            search_x = x
            while 0 < search_x < w - 1:
                search_x -= direction
                if self._px(mask, search_x, y):
                    while 0 < search_x < w - 1 and self._px(mask, search_x + direction, y):
                        search_x += direction
                    return {"x": float(search_x), "y": float(y)}
            return {"x": float(lm_x), "y": float(lm_y)}

    def _find_shoulder_contour_point(self, mask: np.ndarray,
                                     lm_x: float, lm_y: float,
                                     direction: int) -> Dict[str, float]:
        """
        어깨 측정용 대각선 포인트 탐색:
        1) 어깨 관절 Y에서 외측으로 스캔하여 마스크 외곽 X를 찾음
        2) spine과 외곽 X의 75% 지점에서 위로 올라가 어깨 경사면의 상단 엣지를 찾음
        → 삼각근 꼭대기가 아닌, 실제 어깨 경사면 위의 포인트가 됨
        """
        h, w = mask.shape[:2]
        x, y = int(lm_x), int(lm_y)
        y = max(0, min(y, h - 1))
        spine_x = int(lm_x)  # 대략적 spine (나중에 analyze에서 보정)

        # Step 1: 어깨 관절 Y에서 외측으로 스캔하여 마스크 외곽 X 찾기
        max_scan = int(w * 0.15)
        scanned = 0
        outer_x = x
        if self._px(mask, x, y):
            while 0 < outer_x < w - 1 and self._px(mask, outer_x + direction, y) and scanned < max_scan:
                outer_x += direction
                scanned += 1
        else:
            search_x = x
            while 0 < search_x < w - 1:
                search_x -= direction
                if self._px(mask, search_x, y):
                    while 0 < search_x < w - 1 and self._px(mask, search_x + direction, y):
                        search_x += direction
                    outer_x = search_x
                    break

        # Step 2: 랜드마크 X와 외곽 X의 75% 지점에서 위로 올라가 어깨 경사면 찾기
        # (100%=외곽 끝 → 삼각근 꼭대기, 75% → 어깨 경사면)
        scan_x = int(x + (outer_x - x) * 0.75)
        top_y = y
        if self._px(mask, scan_x, top_y):
            while top_y > 0 and self._px(mask, scan_x, top_y - 1):
                top_y -= 1

        # 어깨 경사면 포인트 = 75% X, 상단 Y
        return {"x": float(scan_x), "y": float(top_y)}

    def _find_max_width_in_band(self, mask: np.ndarray, center_x: int,
                                 center_y: int, band: int = 15) -> Optional[Dict[str, Any]]:
        """
        center_y ± band 범위를 2px 간격으로 스캔하여 최대 수평 폭을 반환한다.
        단일 행 측정보다 더 안정적으로 최대 폭(가슴, 엉덩이 등)을 포착한다.
        """
        max_span = None
        max_width = None

        start_y = max(0, center_y - band)
        end_y = min(mask.shape[0] - 1, center_y + band)

        for y in range(start_y, end_y + 1, 2):
            span = self._get_horizontal_width(mask, center_x, y)
            if span is None:
                continue
            if max_width is None or span["width_px"] > max_width:
                max_width = span["width_px"]
                max_span = span

        return max_span

    def _find_bicep_width(self, mask: np.ndarray, lm_shoulder: Dict, lm_elbow: Dict) -> Optional[Dict[str, Any]]:
        """어깨와 팔꿈치 사이에서 팔 두께(이두)를 측정"""
        dx = lm_elbow["x"] - lm_shoulder["x"]
        dy = lm_elbow["y"] - lm_shoulder["y"]
        length = math.hypot(dx, dy)
        if length == 0:
            return None
            
        nx = -dy / length
        ny = dx / length
        
        best_width = 0
        best_span = None
        
        h, w = mask.shape[:2]
        
        # 50% ~ 80% 구간(팔 아래쪽)에서 가장 두꺼운 부분 찾기
        for t in [0.5, 0.6, 0.7, 0.8]:
            cx = lm_shoulder["x"] + dx * t
            cy = lm_shoulder["y"] + dy * t
            
            # 중심점이 마스크 바깥이면 근처 마스크 내부로 보정
            cx_int, cy_int = int(cx), int(cy)
            if not self._px(mask, cx_int, cy_int):
                found = False
                for r in range(1, 15):
                    for dx_c, dy_c in [(0, r), (0, -r), (r, 0), (-r, 0), (r, r), (-r, -r), (r, -r), (-r, r)]:
                        if self._px(mask, cx_int + dx_c, cy_int + dy_c):
                            cx, cy = cx_int + dx_c, cy_int + dy_c
                            found = True
                            break
                    if found: break
                if not found:
                    continue
            
            # 한쪽 방향 탐색
            x1, y1 = cx, cy
            dist1 = 0
            max_scan = int(w * 0.15)
            for _ in range(max_scan):
                if not self._px(mask, int(x1), int(y1)): break
                x1 += nx
                y1 += ny
                dist1 += 1
                
            # 반대 방향 탐색
            x2, y2 = cx, cy
            dist2 = 0
            for _ in range(max_scan):
                if not self._px(mask, int(x2), int(y2)): break
                x2 -= nx
                y2 -= ny
                dist2 += 1
                
            # 팔이 몸통과 붙어있어 한쪽이 비정상적으로 길게 측정되는 경우(몸통 침범),
            # 짧은 쪽(바깥쪽) 길이를 기준으로 1.2배까지만 허용하여 잘라냅니다.
            if dist1 > dist2 * 1.8:
                dist1 = dist2 * 1.2
                x1 = cx + nx * dist1
                y1 = cy + ny * dist1
            elif dist2 > dist1 * 1.8:
                dist2 = dist1 * 1.2
                x2 = cx - nx * dist2
                y2 = cy - ny * dist2
                
            width = math.hypot(x1 - x2, y1 - y2)
            if width > best_width:
                best_width = width
                best_span = {
                    "width_px": float(width),
                    "p_start": {"x": float(x1), "y": float(y1)},
                    "p_end": {"x": float(x2), "y": float(y2)}
                }
                
        return best_span

    def _find_max_thigh_width(self, mask: np.ndarray,
                               crotch: Dict, lm_knee_l: Dict, lm_knee_r: Dict,
                               knee_y: int) -> Optional[Dict[str, Any]]:
        """
        사타구니~무릎 구간의 상위 30%를 스캔하여 최대 단일 다리 폭을 찾는다.
        랜드마크 25/26(무릎)의 x좌표로 각 다리의 중심축을 결정하여
        정확히 해당 다리 영역만 측정한다.
        """
        crotch_y = int(crotch["y"])
        scan_end = int(crotch_y + (knee_y - crotch_y) * 0.30)

        best_left = None
        best_right = None
        best_left_w = 0
        best_right_w = 0

        for y in range(crotch_y + 3, scan_end, 2):
            # 왼쪽 다리: 사타구니 x ~ 왼쪽 무릎 x 사이 보간
            t = (y - crotch_y) / max(1, knee_y - crotch_y)
            left_cx = int(crotch["x"] + (lm_knee_l["x"] - crotch["x"]) * t)
            right_cx = int(crotch["x"] + (lm_knee_r["x"] - crotch["x"]) * t)

            left_span = self._get_horizontal_width(mask, left_cx, y)
            right_span = self._get_horizontal_width(mask, right_cx, y)

            if left_span and left_span["width_px"] > best_left_w:
                best_left_w = left_span["width_px"]
                best_left = left_span
            if right_span and right_span["width_px"] > best_right_w:
                best_right_w = right_span["width_px"]
                best_right = right_span

        # 좌우 평균
        if best_left and best_right:
            avg_w = (best_left["width_px"] + best_right["width_px"]) / 2
            return {
                "width_px": avg_w,
                "p_start": best_left["p_start"],
                "p_end": best_left["p_end"],
            }
        return best_left or best_right

    def _find_hem_width(self, mask: np.ndarray,
                         lm_ankle_l: Dict, lm_ankle_r: Dict,
                         lm_knee_l: Dict, lm_knee_r: Dict) -> Optional[Dict[str, Any]]:
        """
        발목 랜드마크(27/28) 근처에서 밴드 스캔하여 밑단 폭을 측정한다.
        무릎~발목 구간의 하위 10% 지점부터 발목까지 스캔하여
        가장 안정적인 밑단 폭을 찾는다.
        """
        results = []
        for lm_ankle, lm_knee in [(lm_ankle_l, lm_knee_l), (lm_ankle_r, lm_knee_r)]:
            ankle_y = int(lm_ankle["y"])
            knee_y = int(lm_knee["y"])
            # 발목 위 약간(무릎~발목 거리의 10%)에서 발목까지 스캔
            scan_start = int(ankle_y - abs(ankle_y - knee_y) * 0.10)
            scan_start = max(knee_y, scan_start)

            best = None
            best_w = None
            for y in range(scan_start, ankle_y + 1, 2):
                span = self._get_horizontal_width(mask, int(lm_ankle["x"]), y)
                if span is None:
                    continue
                if best_w is None or span["width_px"] < best_w:
                    best_w = span["width_px"]
                    best = span
            if best is not None:
                results.append(best)

        if len(results) == 2:
            avg_w = (results[0]["width_px"] + results[1]["width_px"]) / 2
            return {
                "width_px": avg_w,
                "p_start": results[0]["p_start"],
                "p_end": results[0]["p_end"],
            }
        elif len(results) == 1:
            return results[0]
        return None

    def _extract_depth_measurements(
        self,
        side_bgr: np.ndarray,
        chest_ratio: float,
        waist_ratio: float,
        hip_ratio: float,
        thigh_ratio: Optional[float],
        user_height_cm: float,
    ) -> Optional[Dict[str, Any]]:
        """
        측면 사진에서 가슴/허리/골반 깊이(cm)를 측정한다.
        각 ratio: 정면 mask_bottom 기준 (머리~발끝) 내 위치 비율.
        측면도 동일 기준으로 매핑 → 참조점 불일치 없음.
        """
        h, w = side_bgr.shape[:2]
        side_rgb = cv2.cvtColor(side_bgr, cv2.COLOR_BGR2RGB)

        _REMBG_MAX = 1024
        scale = min(1.0, _REMBG_MAX / max(h, w))
        rw, rh = int(w * scale), int(h * scale)
        pil_input = PILImage.fromarray(side_rgb).resize((rw, rh), PILImage.LANCZOS)
        rembg_rgba = rembg_remove(pil_input, session=self._rembg_session, only_mask=False)
        alpha_small = np.array(rembg_rgba)[:, :, 3].astype(np.float32)
        alpha_arr = cv2.resize(alpha_small, (w, h), interpolation=cv2.INTER_LINEAR) if scale < 1.0 else alpha_small

        raw_mask = (alpha_arr > 128).astype(np.uint8) * 255
        mask = self._build_binary_mask(raw_mask, w)

        top_y = next((y for y in range(h) if np.any(mask[y, :] > 0)), None)
        bottom_y = next((y for y in range(h - 1, -1, -1) if np.any(mask[y, :] > 0)), None)
        if top_y is None or bottom_y is None or bottom_y <= top_y:
            return None

        pixel_height = float(bottom_y - top_y)
        # 깊이(cm) 계산용 스케일 — mask_bottom 기준이므로 신발 보정 불필요
        cm_per_pixel = user_height_cm / pixel_height

        # 비율로 측면 Y 위치 결정: 정면 mask_bottom 기준 ratio → 측면 mask_bottom 기준 ty
        chest_ty  = int(top_y + chest_ratio * pixel_height)
        waist_ty  = int(top_y + waist_ratio  * pixel_height)
        hip_ty    = int(top_y + hip_ratio    * pixel_height)
        thigh_ty  = int(top_y + thigh_ratio  * pixel_height) if thigh_ratio is not None else None

        seg_float = alpha_arr / 255.0
        _, dbg = self._build_visual_images(side_bgr, seg_float, raw_mask)

        cv2.line(dbg, (30, top_y), (30, bottom_y), (0, 0, 200), 2)
        cv2.circle(dbg, (30, top_y),    4, (0, 0, 200), -1)
        cv2.circle(dbg, (30, bottom_y), 4, (0, 0, 200), -1)

        text_tasks: List[tuple] = []

        def _draw_depth_line(ty: int, color_bgr: tuple, label_prefix: str) -> Optional[float]:
            ty = max(0, min(h - 1, ty))
            xs = np.where(mask[ty, :] > 0)[0]
            if len(xs) == 0:
                return None
            cx = int((int(xs[0]) + int(xs[-1])) / 2)
            span = self._get_horizontal_width(mask, cx, ty)
            if span is None:
                return None
            depth_cm = span["width_px"] * cm_per_pixel
            x1, x2 = int(span["p_start"]["x"]), int(span["p_end"]["x"])
            cv2.line(dbg, (x1, ty), (x2, ty), color_bgr, 3)
            cv2.circle(dbg, (x1, ty), 6, color_bgr, -1)
            cv2.circle(dbg, (x2, ty), 6, color_bgr, -1)
            text_tasks.append((f'{label_prefix}: {depth_cm:.1f}cm', int((x1 + x2) / 2), ty - 8, color_bgr))
            return depth_cm

        chest_d = _draw_depth_line(chest_ty, (200,   0, 200), "가슴깊이")
        waist_d  = _draw_depth_line(waist_ty,  (0,  140, 255), "허리깊이")
        hip_d    = _draw_depth_line(hip_ty,    (0,   0, 220), "골반깊이")
        thigh_d  = _draw_depth_line(thigh_ty,  (0, 200,   0), "허벅지깊이") if thigh_ty is not None else None
        dbg = self._pil_draw_texts(dbg, text_tasks)

        return {
            "chest_depth_cm": chest_d,
            "waist_depth_cm": waist_d,
            "hip_depth_cm":   hip_d,
            "thigh_depth_cm": thigh_d,
            "debug_image":    dbg,
        }

    def _get_korean_font(self, size: int = 15) -> ImageFont.FreeTypeFont:
        """PIL용 한글 지원 폰트를 반환한다. 없으면 기본 폰트 사용."""
        font_paths = [
            "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            "/Library/Fonts/AppleGothic.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
            "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
        ]
        for fp in font_paths:
            if os.path.exists(fp):
                try:
                    return ImageFont.truetype(fp, size)
                except Exception:
                    pass
        return ImageFont.load_default()

    def _pil_draw_texts(self, img_bgr: np.ndarray,
                        text_tasks: List[tuple]) -> np.ndarray:
        """
        text_tasks: list of (text, center_x, center_y, color_bgr)
        BGR numpy array → PIL로 한글 텍스트 + 검정 배경 렌더링 → BGR 반환.
        """
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        pil_img = PILImage.fromarray(img_rgb)
        draw = ImageDraw.Draw(pil_img)
        font = self._get_korean_font(15)
        w_img = img_bgr.shape[1]

        for text, cx, cy, color_bgr in text_tasks:
            c_rgb = (color_bgr[2], color_bgr[1], color_bgr[0])
            try:
                bb = draw.textbbox((0, 0), text, font=font)
                tw, th = bb[2] - bb[0], bb[3] - bb[1]
                tx = max(2, min(w_img - tw - 4, cx - tw // 2))
                ty = cy - th - 4
                if ty < 0:
                    ty = cy + 4
                pad = 3
                draw.rectangle([tx - pad, ty - pad, tx + tw + pad, ty + th + pad], fill=(0, 0, 0))
                draw.text((tx, ty), text, font=font, fill=c_rgb)
            except Exception:
                pass

        return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    def _draw_debug(self, image_bgr: np.ndarray, landmarks,
                    top_y: int, bottom_y: int,
                    armpits: Dict, crotch: Optional[Dict],
                    measurements: List[Dict]) -> np.ndarray:
        dbg = image_bgr.copy()
        text_tasks: List[tuple] = []

        # 키 기준선
        cv2.line(dbg, (40, top_y), (40, bottom_y), (0, 0, 255), 2)
        cv2.circle(dbg, (40, top_y),    4, (0, 0, 255), -1)
        cv2.circle(dbg, (40, bottom_y), 4, (0, 0, 255), -1)

        # 주요 랜드마크
        for idx in [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30]:
            cv2.circle(dbg,
                       (int(landmarks[idx]["x"]), int(landmarks[idx]["y"])),
                       4, (255, 255, 0), -1)

        # 겨드랑이 앵커
        for name in ["left_armpit", "right_armpit"]:
            pt = armpits.get(name)
            if pt:
                cv2.circle(dbg, (int(pt["x"]), int(pt["y"])), 6, (255, 0, 255), -1)
                text_tasks.append((name, int(pt["x"]) + 5, int(pt["y"]) - 5, (255, 0, 255)))

        # 사타구니 앵커
        if crotch:
            cv2.circle(dbg, (int(crotch["x"]), int(crotch["y"])), 6, (0, 255, 255), -1)
            text_tasks.append(("crotch", int(crotch["x"]) + 5, int(crotch["y"]) - 5, (0, 255, 255)))

        color_map = {
            "shoulder":      (0, 165, 255),
            "chest":         (200, 0, 200),
            "sleeve":        (255, 191, 0),
            "arm_width":     (0, 69, 255),
            "top_length":    (0, 255, 0),
            "waist":         (0, 0, 255),
            "hip":           (0, 165, 255),
            "thigh":         (255, 255, 0),
            "rise":          (180, 105, 255),
            "hem":           (50, 205, 50),
            "bottom_length": (0, 255, 255),
        }

        for item in measurements:
            ps, pe = item.get("p_start"), item.get("p_end")
            if ps is None or pe is None:
                continue
            x1, y1 = int(ps["x"]), int(ps["y"])
            x2, y2 = int(pe["x"]), int(pe["y"])
            c = color_map.get(item["key"], (0, 200, 255))
            cv2.line(dbg, (x1, y1), (x2, y2), c, 2)
            cv2.circle(dbg, (x1, y1), 4, c, -1)
            cv2.circle(dbg, (x2, y2), 4, c, -1)
            text = f'{item["label"]}: {item["value_cm"]}cm'
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2) - 8
            text_tasks.append((text, cx, cy, c))

        return self._pil_draw_texts(dbg, text_tasks)
