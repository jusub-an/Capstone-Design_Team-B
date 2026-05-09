import math
import os
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision as mp_vision
from PIL import Image as PILImage
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

    def analyze(self, image_bgr: np.ndarray, user_height_cm: float) -> Dict[str, Any]:
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

        # ── 스케일 계산 (HTML: topHeadY ~ heelYpx) ──
        top_y = self._find_top_head_y(mask, landmarks)
        bottom_y = self._find_bottom_foot_y(mask, landmarks)
        pixel_height = float(bottom_y - top_y)
        if pixel_height <= 0:
            raise ValueError("신체 높이 픽셀 계산에 실패했습니다.")
        cm_per_pixel = float(user_height_cm / pixel_height)

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
        # 5. 허리너비 (→ 하의 waist)
        #    바지 허리선이 위치하는 실제 신체 부위(골반 약간 위쪽)를 측정
        #    (hip_y에서 위로 약 15% 지점)
        # ══════════════════════════════════════
        pants_waist_y = int(hip_y - (hip_y - shoulder_y) * 0.15)
        waist_span = self._find_torso_width_at_y(mask, spine_x, pants_waist_y, band=5)
        if waist_span is None:
            waist_span = {"width_px": 10, "p_start": {"x": float(spine_x - 5), "y": float(pants_waist_y)}, "p_end": {"x": float(spine_x + 5), "y": float(pants_waist_y)}}

        # ══════════════════════════════════════
        # 7. 허벅지너비 (→ 하의 thigh)
        #    사타구니~무릎 구간(상위 30%) 스캔 → 최대 단일 다리 폭
        # ══════════════════════════════════════
        thigh_span = None
        if crotch is not None:
            thigh_span = self._find_max_thigh_width(
                mask, crotch, lm25, lm26, knee_y)

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

        # ── 하의 대응 항목 ──
        if waist_span is not None:
            measurements.append(self._item(
                "waist", "허리너비", waist_span["width_px"], cm_per_pixel,
                waist_span["p_start"], waist_span["p_end"],
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
            "anchors": {
                "left_armpit":  armpits["left_armpit"],
                "right_armpit": armpits["right_armpit"],
                "crotch":       crotch,
            },
            "measurements":      measurements,
            "debug_image":       debug_image,
            "person_extracted":  person_extracted,
            "gray_mask":         gray_mask,
            "gray_debug_image":  gray_debug_image,
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
        for y in range(mask.shape[0] - 1, -1, -1):
            if np.any(mask[y, :] > 0):
                return y
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

    def _draw_debug(self, image_bgr: np.ndarray, landmarks,
                    top_y: int, bottom_y: int,
                    armpits: Dict, crotch: Optional[Dict],
                    measurements: List[Dict]) -> np.ndarray:
        dbg = image_bgr.copy()

        # 키 기준선
        cv2.line(dbg, (40, top_y), (40, bottom_y), (0, 0, 255), 2)
        cv2.circle(dbg, (40, top_y),    4, (0, 0, 255), -1)
        cv2.circle(dbg, (40, bottom_y), 4, (0, 0, 255), -1)

        # 주요 랜드마크 (발목 27,28 추가)
        for idx in [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30]:
            cv2.circle(dbg,
                       (int(landmarks[idx]["x"]), int(landmarks[idx]["y"])),
                       4, (255, 255, 0), -1)

        # 겨드랑이 앵커
        for name in ["left_armpit", "right_armpit"]:
            pt = armpits.get(name)
            if pt:
                cv2.circle(dbg, (int(pt["x"]), int(pt["y"])), 6, (255, 0, 255), -1)
                cv2.putText(dbg, name, (int(pt["x"]) + 5, int(pt["y"]) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 255), 1, cv2.LINE_AA)

        # 사타구니 앵커
        if crotch:
            cv2.circle(dbg, (int(crotch["x"]), int(crotch["y"])), 6, (0, 255, 255), -1)
            cv2.putText(dbg, "crotch",
                        (int(crotch["x"]) + 5, int(crotch["y"]) - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

        # 측정 선 및 텍스트 (항목별 고유 색상 적용)
        color_map = {
            "shoulder":      (0, 165, 255),    # 오렌지
            "chest":         (200, 0, 200),    # 보라
            "sleeve":        (255, 191, 0),    # 파랑 (Deep Sky Blue)
            "arm_width":     (0, 69, 255),     # 주황/빨강 계열
            "top_length":    (0, 255, 0),      # 초록
            "waist":         (0, 0, 255),      # 빨강
            "hip":           (0, 165, 255),    # 주황 (미사용)
            "thigh":         (255, 255, 0),    # 시안 (Cyan)
            "rise":          (180, 105, 255),  # 핫핑크 (Hot Pink)
            "hem":           (50, 205, 50),    # 라임 (Lime)
            "bottom_length": (0, 255, 255),    # 노랑
        }

        for item in measurements:
            ps, pe = item.get("p_start"), item.get("p_end")
            if ps is None or pe is None:
                continue
            
            x1, y1 = int(ps["x"]), int(ps["y"])
            x2, y2 = int(pe["x"]), int(pe["y"])
            
            # 항목별 색상 가져오기 (없으면 기본 주황색)
            c = color_map.get(item["key"], (0, 200, 255))
            
            # 선과 끝점 그리기
            cv2.line(dbg, (x1, y1), (x2, y2), c, 2)
            cv2.circle(dbg, (x1, y1), 4, c, -1)
            cv2.circle(dbg, (x2, y2), 4, c, -1)
            
            # 텍스트 그리기 (가독성을 위해 반투명/어두운 배경 추가)
            text = f'{item["label"]}: {item["value_cm"]}cm'
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.45
            thickness = 1
            
            # 텍스트 크기 계산
            (text_w, text_h), _ = cv2.getTextSize(text, font, font_scale, thickness)
            
            # 텍스트 위치 (선 중앙에서 약간 위로)
            tx = int((x1 + x2) / 2) - int(text_w / 2)
            ty = int((y1 + y2) / 2) - 8
            
            # 배경 박스 그리기
            pad = 3
            cv2.rectangle(dbg, (tx - pad, ty - text_h - pad), 
                          (tx + text_w + pad, ty + pad), 
                          (0, 0, 0), -1)
            
            # 텍스트 그리기 (글씨는 색상 적용)
            cv2.putText(dbg, text, (tx, ty), font, font_scale, c, thickness, cv2.LINE_AA)

        return dbg
