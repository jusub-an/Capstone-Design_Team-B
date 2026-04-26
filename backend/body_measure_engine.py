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

        # rembg: u2net 내부 처리 해상도는 320×320 고정이므로
        # 입력을 max 600px로 다운스케일 후 알파를 원본 크기로 복원 → 속도 개선
        _REMBG_MAX = 600
        scale = min(1.0, _REMBG_MAX / max(h, w))
        rw, rh = int(w * scale), int(h * scale)
        pil_input = PILImage.fromarray(image_rgb).resize((rw, rh), PILImage.LANCZOS)

        rembg_rgba = rembg_remove(pil_input, session=self._rembg_session, only_mask=False)
        alpha_small = np.array(rembg_rgba)[:, :, 3].astype(np.float32)

        # 원본 크기로 복원 (스케일 == 1이면 복원 생략)
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
        lm29, lm30 = landmarks[29], landmarks[30]   # 발꿈치

        shoulder_y = int((lm11["y"] + lm12["y"]) / 2)
        hip_y      = int((lm23["y"] + lm24["y"]) / 2)
        knee_y     = int((lm25["y"] + lm26["y"]) / 2)
        spine_x    = int((lm11["x"] + lm12["x"]) / 2)

        # ══════════════════════════════════════
        # 1. 어깨단면
        #    HTML: findShoulderTop → 어깨 랜드마크 x열에서 마스크 상단 엣지 찾기
        #    → 두 점 사이 유클리드 거리
        # ══════════════════════════════════════
        sh_top_left  = self._find_shoulder_edge(mask, lm11["x"], lm11["y"])
        sh_top_right = self._find_shoulder_edge(mask, lm12["x"], lm12["y"])
        shoulder_width_px = math.hypot(
            sh_top_right["x"] - sh_top_left["x"],
            sh_top_right["y"] - sh_top_left["y"],
        )

        # ══════════════════════════════════════
        # 2. 겨드랑이 앵커 (Gap Vanishing Raycast)
        #    HTML: findArmpitsScan — 골반→어깨 위로 스캔하며
        #    SEARCHING→TRACKING→VANISHED 상태 기계로 갭이 마지막으로 있던 위치 = 겨드랑이
        # ══════════════════════════════════════
        armpits = self._find_armpits_scan(mask, spine_x, shoulder_y, hip_y)

        # 겨드랑이 미감지 시 폴백: 겨드랑이는 어깨 관절 바로 아래에 위치하므로
        # 어깨 랜드마크 x + 어깨 아래 15% y를 폴백 앵커로 사용
        if armpits["left_armpit"] is None or armpits["right_armpit"] is None:
            fallback_y = int(shoulder_y + (hip_y - shoulder_y) * 0.15)
            if armpits["left_armpit"] is None:
                armpits["left_armpit"]  = {"x": float(lm11["x"]), "y": float(fallback_y)}
            if armpits["right_armpit"] is None:
                armpits["right_armpit"] = {"x": float(lm12["x"]), "y": float(fallback_y)}
            warnings.append("겨드랑이 자동 감지 실패 — 어깨 랜드마크 기반 추정값 사용. A자 포즈를 권장합니다.")

        # ══════════════════════════════════════
        # 3. 가슴단면
        #    HTML: chestSpan = { pStart: AR_pt, pEnd: AL_pt, widthPx: hypot(...) }
        #    두 겨드랑이 앵커 간 유클리드 거리 (마스크 폭이 아님)
        # ══════════════════════════════════════
        chest_width_px = None
        chest_p_start  = chest_p_end = None
        if armpits["left_armpit"] is not None and armpits["right_armpit"] is not None:
            chest_p_start = armpits["left_armpit"]
            chest_p_end   = armpits["right_armpit"]
            chest_width_px = math.hypot(
                chest_p_end["x"] - chest_p_start["x"],
                chest_p_end["y"] - chest_p_start["y"],
            )

        # ══════════════════════════════════════
        # 4. 사타구니 앵커
        #    HTML: findCrotchScan — 골반 아래로 스캔하며 두 세그먼트로 갈라지는 첫 행
        # ══════════════════════════════════════
        crotch = self._find_crotch_scan(mask, spine_x, hip_y, knee_y)

        # ══════════════════════════════════════
        # 5. 허리단면
        #    HTML: chestY+20 ~ hipY-10 구간에서 최소 수평 폭
        # ══════════════════════════════════════
        armpit_y = None
        if chest_p_start and chest_p_end:
            armpit_y = (chest_p_start["y"] + chest_p_end["y"]) / 2
        waist_span = self._find_waist_width(mask, spine_x, shoulder_y, hip_y, armpit_y)

        # ══════════════════════════════════════
        # 6. 골반단면
        #    HTML: pelvisY = hipY, getHorizWidth
        # ══════════════════════════════════════
        hip_span = self._get_horizontal_width(mask, spine_x, hip_y)

        # ── 팔·다리 길이 ──
        left_arm_px  = self._dist(lm11, lm13) + self._dist(lm13, lm15)
        right_arm_px = self._dist(lm12, lm14) + self._dist(lm14, lm16)
        left_leg_px  = self._dist(lm23, lm25) + self._dist(lm25, lm29)
        right_leg_px = self._dist(lm24, lm26) + self._dist(lm26, lm30)

        # ── 측정값 목록 조립 ──
        measurements: List[Dict[str, Any]] = [
            self._item("shoulder_width", "어깨단면", shoulder_width_px, cm_per_pixel,
                       sh_top_left, sh_top_right),
        ]

        if chest_width_px is not None:
            measurements.append(self._item(
                "chest_width", "가슴단면", chest_width_px, cm_per_pixel,
                chest_p_start, chest_p_end,
            ))

        if waist_span is not None:
            measurements.append(self._item(
                "waist_width", "허리단면", waist_span["width_px"], cm_per_pixel,
                waist_span["p_start"], waist_span["p_end"],
            ))

        if hip_span is not None:
            measurements.append(self._item(
                "hip_width", "골반단면", hip_span["width_px"], cm_per_pixel,
                hip_span["p_start"], hip_span["p_end"],
            ))

        measurements += [
            self._item("left_arm_length",  "좌측팔길이", left_arm_px,  cm_per_pixel,
                       self._xy(lm11), self._xy(lm15)),
            self._item("right_arm_length", "우측팔길이", right_arm_px, cm_per_pixel,
                       self._xy(lm12), self._xy(lm16)),
            self._item("left_leg_length",  "좌다리길이", left_leg_px,  cm_per_pixel,
                       self._xy(lm23), self._xy(lm29)),
            self._item("right_leg_length", "우다리길이", right_leg_px, cm_per_pixel,
                       self._xy(lm24), self._xy(lm30)),
        ]

        debug_image = self._draw_debug(image_bgr, landmarks, top_y, bottom_y,
                                       armpits, crotch, measurements)
        person_extracted, gray_mask = self._build_visual_images(image_bgr, seg_float, raw_mask)

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
        계산용 타이트 마스크 — 가장 큰 윤곽선 + MORPH_CLOSE만 적용.
        Gaussian blur는 여기서 사용하지 않음: 블러가 팔-몸통 갭을 메워
        겨드랑이 감지 알고리즘을 망가뜨리기 때문.
        """
        contours, _ = cv2.findContours(raw_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            clean = np.zeros_like(raw_mask)
            cv2.drawContours(clean, [max(contours, key=cv2.contourArea)], -1, 255, cv2.FILLED)
        else:
            clean = raw_mask.copy()

        k_morph = max(3, int(w * 0.005)) | 1  # 홀수 보정
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_morph, k_morph))
        return cv2.morphologyEx(clean, cv2.MORPH_CLOSE, kernel)

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

        # ── 실루엣: raw_mask 기반, contour fill 생략 → 팔-몸통 갭 보존 ──
        # open(3px): 외부 작은 노이즈 제거
        # close(7px): 내부 작은 구멍 메우기 (팔-몸통 사이 갭은 훨씬 커서 유지)
        # 소프트 blur(w*0.008): 경계 계단 현상 제거
        w_sil = image_bgr.shape[1]
        k_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        sil = cv2.morphologyEx(raw_mask, cv2.MORPH_OPEN,  k_open)
        sil = cv2.morphologyEx(sil,      cv2.MORPH_CLOSE, k_close)
        k_blur = max(5, int(w_sil * 0.008)) | 1
        sil = cv2.GaussianBlur(sil, (k_blur, k_blur), 0)
        _, sil = cv2.threshold(sil, 127, 255, cv2.THRESH_BINARY)
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

    def _draw_debug(self, image_bgr: np.ndarray, landmarks,
                    top_y: int, bottom_y: int,
                    armpits: Dict, crotch: Optional[Dict],
                    measurements: List[Dict]) -> np.ndarray:
        dbg = image_bgr.copy()

        # 키 기준선
        cv2.line(dbg, (40, top_y), (40, bottom_y), (0, 0, 255), 2)
        cv2.circle(dbg, (40, top_y),    4, (0, 0, 255), -1)
        cv2.circle(dbg, (40, bottom_y), 4, (0, 0, 255), -1)

        # 주요 랜드마크
        for idx in [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 29, 30]:
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

        # 측정 선
        for item in measurements:
            ps, pe = item.get("p_start"), item.get("p_end")
            if ps is None or pe is None:
                continue
            x1, y1 = int(ps["x"]), int(ps["y"])
            x2, y2 = int(pe["x"]), int(pe["y"])
            cv2.line(dbg, (x1, y1), (x2, y2), (0, 200, 255), 2)
            cv2.circle(dbg, (x1, y1), 4, (0, 200, 255), -1)
            cv2.circle(dbg, (x2, y2), 4, (0, 200, 255), -1)
            cv2.putText(
                dbg,
                f'{item["label"]}: {item["value_cm"]}cm',
                (int((x1 + x2) / 2) + 5, int((y1 + y2) / 2) - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA,
            )

        return dbg
