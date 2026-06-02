import os
import site

try:
    # ONNX Runtime이 GPU(CUDA 12) 파일을 못 찾는 버그 해결을 위해,
    # PyTorch가 이미 가지고 있는 CUDA 12 파일 경로를 런타임에만 임시로 PATH에 주입합니다.
    torch_lib_path = os.path.join(site.getsitepackages()[0], "torch", "lib")
    if os.path.exists(torch_lib_path):
        os.environ["PATH"] = torch_lib_path + \
            os.pathsep + os.environ.get("PATH", "")
except Exception:
    pass

import cv2
import numpy as np
from rembg import remove
import math
import base64


class ClothingMeasureEngine:
    def __init__(self):
        import os
        import urllib.request
        from segment_anything_hq import sam_model_registry, SamPredictor
        import torch

        sam_checkpoint = "sam_hq_vit_b.pth"
        if not os.path.exists(sam_checkpoint):
            print("Downloading SAM-HQ weights... This may take a minute.")
            url = "https://huggingface.co/lkeab/hq-sam/resolve/main/sam_hq_vit_b.pth"
            urllib.request.urlretrieve(url, sam_checkpoint)

        model_type = "vit_b"
        sam = sam_model_registry[model_type](checkpoint=sam_checkpoint)
        if torch.cuda.is_available():
            sam.to(device="cuda")
        self.predictor = SamPredictor(sam)

        # 2. CascadePSP 초기화 (테두리 정밀 다듬기)
        import segmentation_refinement as refine
        print("Initializing CascadePSP Refiner... This may take a moment.")
        self.refiner = refine.Refiner(
    device='cuda:0' if torch.cuda.is_available() else 'cpu')

    def _remove_bg(
    self,
    image_bytes,
    target_type="Shirt",
     category_type="Top"):
        import cv2
        import numpy as np

        nparr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        self.predictor.set_image(img_rgb)

        h, w = img_rgb.shape[:2]
        # sam_hq 로직
        if target_type == "A4":
            # A4 용지는 중앙 1포인트면 충분함
            input_point = np.array([[w // 2, h // 2]])
            input_label = np.array([1])
        else:
            if category_type == "Bottom":
                # 하의(바지)의 경우 가랑이 중앙(w//2)에 빈 공간이 있을 확률이 매우 높으므로 정중앙을 아예 피합니다.
                # 왼쪽 허벅지, 오른쪽 허벅지, 왼쪽 종아리, 오른쪽 종아리
                input_point = np.array([
                    [w // 3, h // 3],       # 왼쪽 허벅지
                    [2 * w // 3, h // 3],   # 오른쪽 허벅지
                    [w // 3, 2 * h // 3],   # 왼쪽 종아리
                    [2 * w // 3, 2 * h // 3]  # 오른쪽 종아리
                ])
                input_label = np.array([1, 1, 1, 1])
            else:
                # 상의(Top)의 경우 소매와 몸통을 잡되, 여백이 많아도 옷에 맞도록 약간 안쪽으로 조정
                input_point = np.array([
                    [w // 2, h // 2],       # 가슴 중앙
                    [w // 3, h // 3],       # 왼쪽 소매/어깨 부근
                    [2 * w // 3, h // 3],   # 오른쪽 소매/어깨 부근
                    [w // 2, h // 4],       # 목 아래 상단
                    [w // 2, 3 * h // 4]    # 밑단 근처 하단
                ])
                input_label = np.array([1, 1, 1, 1, 1])

        import time
        t_sam = time.time()
        masks, _, _ = self.predictor.predict(
            point_coords=input_point,
            point_labels=input_label,
            box=None,
            multimask_output=False,
        )
        print(
            f"[TIME] SAM-HQ Inference ({target_type}): {time.time() - t_sam:.2f} seconds")

        mask = masks[0]
        alpha_channel = (mask * 255).astype(np.uint8)
        rgba = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2BGRA)
        rgba[:, :, 3] = alpha_channel

        # 시각화 (디버그용)
        vis_img = img_bgr.copy()
        for i, pt in enumerate(input_point):
            cv2.circle(vis_img, (pt[0], pt[1]), radius=max(
                5, w // 50), color=(0, 255, 255), thickness=-1)
            cv2.circle(vis_img, (pt[0], pt[1]), radius=max(
                5, w // 50), color=(0, 0, 255), thickness=2)
            cv2.putText(vis_img,
    f"P{i+1}",
    (pt[0] + 10,
    pt[1] - 10),
    cv2.FONT_HERSHEY_SIMPLEX,
    max(0.5,
    w // 500),
    (0,
    0,
    255),
     2)

        _, mask_buf = cv2.imencode('.png', rgba)
        return mask_buf.tobytes(), vis_img

    def _encode_img(self, img):
        """OpenCV 이미지를 base64 문자열로 변환"""
        _, buffer = cv2.imencode('.jpg', img)
        return base64.b64encode(buffer).decode('utf-8')

    def dist(self, p1, p2):
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    def dist_to_segment(self, p, a, b):
        line_len = math.hypot(b[0] - a[0], b[1] - a[1])
        if line_len == 0:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        u = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1])
             * (b[1] - a[1])) / (line_len ** 2)
        proj_x = a[0] + u * (b[0] - a[0])
        proj_y = a[1] + u * (b[1] - a[1])
        return math.hypot(p[0] - proj_x, p[1] - proj_y)

    def _get_sharp_corners(self, cnt):
        # 1. 대략적인 4각형 꼭짓점 찾기
        peri = cv2.arcLength(cnt, True)
        approx = None
        for eps in [0.02, 0.03, 0.04, 0.05, 0.06]:
            app = cv2.approxPolyDP(cnt, eps * peri, True)
            if len(app) == 4:
                approx = app
                break

        if approx is None:
            return None

        cnt_pts = cnt.reshape(-1, 2)
        approx_pts = approx.reshape(-1, 2)

        # 꼭짓점과 가장 가까운 윤곽선 인덱스 찾기
        indices = []
        for pt in approx_pts:
            dists = np.sum((cnt_pts - pt)**2, axis=1)
            indices.append(np.argmin(dists))

        indices.sort()

        lines = []
        n = len(cnt_pts)
        for i in range(4):
            start_idx = indices[i]
            end_idx = indices[(i + 1) % 4]

            if start_idx < end_idx:
                segment = cnt_pts[start_idx:end_idx]
            else:
                segment = np.vstack((cnt_pts[start_idx:], cnt_pts[:end_idx]))

            # 라운딩된 꼭짓점 부근(양끝 15%) 제외하고 직선 구간만 추출
            seg_len = len(segment)
            if seg_len > 10:
                trim = int(seg_len * 0.15)
                segment = segment[trim:-trim]

            if len(segment) > 2:
                line = cv2.fitLine(segment, cv2.DIST_L2, 0, 0.01, 0.01)
                lines.append((line[0][0], line[1][0], line[2][0], line[3][0]))
            else:
                return approx

        def intersect(line1, line2):
            v1x, v1y, x1, y1 = line1
            v2x, v2y, x2, y2 = line2
            denom = v1x * v2y - v1y * v2x
            if abs(denom) < 1e-6: return None
            t1 = ((x2 - x1) * v2y - (y2 - y1) * v2x) / denom
            return [x1 + t1 * v1x, y1 + t1 * v1y]

        sharp_corners = []
        for i in range(4):
            pt = intersect(lines[i - 1], lines[i])
            if pt is None: return approx
            sharp_corners.append([pt])

        return np.array(sharp_corners, dtype=np.float32)
    def process(self, shirt_image_bytes, a4_image_bytes, shirt_rect, a4_rect, orig_w, orig_h, category_type="Top", shoulder_pts=None, debug_mode=False):
        # 난수 고정 — AI 배경제거 결과를 매번 동일하게
        import random, torch
        random.seed(42)
        np.random.seed(42)
        torch.manual_seed(42)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(42)

        debug_stages = {}  # 각 단계별 디버그 이미지 저장

        # 0. 원본 크롭 이미지 저장
        shirt_orig_nparr = np.frombuffer(shirt_image_bytes, np.uint8)
        shirt_orig_img = cv2.imdecode(shirt_orig_nparr, cv2.IMREAD_COLOR)
        if shirt_orig_img is not None and debug_mode:
            debug_stages['0_shirt_crop_original'] = self._encode_img(shirt_orig_img)

        a4_orig_nparr = np.frombuffer(a4_image_bytes, np.uint8)
        a4_orig_img = cv2.imdecode(a4_orig_nparr, cv2.IMREAD_COLOR)
        if a4_orig_img is not None and debug_mode:
            debug_stages['1_a4_crop_original'] = self._encode_img(a4_orig_img)
        # 1. 배경 제거 (SAM-HQ 고정)
        shirt_mask_bytes, shirt_prompt_vis = self._remove_bg(shirt_image_bytes, target_type="Shirt", category_type=category_type)
        a4_mask_bytes, a4_prompt_vis = self._remove_bg(a4_image_bytes, target_type="A4", category_type=category_type)
        
        if debug_mode:
            debug_stages['1_5_shirt_sam_prompt'] = self._encode_img(shirt_prompt_vis)
            debug_stages['1_6_a4_sam_prompt'] = self._encode_img(a4_prompt_vis)

        # 바이트를 numpy array(이미지)로 변환
        shirt_nparr = np.frombuffer(shirt_mask_bytes, np.uint8)
        shirt_rgba = cv2.imdecode(shirt_nparr, cv2.IMREAD_UNCHANGED)

        a4_nparr = np.frombuffer(a4_mask_bytes, np.uint8)
        a4_rgba = cv2.imdecode(a4_nparr, cv2.IMREAD_UNCHANGED)

        if shirt_rgba is None or a4_rgba is None:
            raise ValueError("Failed to decode images after background removal")

        if shirt_rgba.shape[2] != 4 or a4_rgba.shape[2] != 4:
            raise ValueError("Images do not have alpha channel after background removal")
        # [NEW] CascadePSP: 초정밀 테두리 다듬기 (Refinement)

        skip_cascade = False 

        # 1. 다듬기 전 원본 SAM 마스크 저장 (비교용 - 디버그 모드에서만)
        if debug_mode:
            debug_stages['1_7_shirt_sam_raw'] = self._encode_img(self._rgba_to_vis(shirt_rgba.copy()))
            debug_stages['1_8_a4_sam_raw'] = self._encode_img(self._rgba_to_vis(a4_rgba.copy()))
            # [NEW] CascadePSP L=300 윈도우 분할 시각화
            vis_crops = shirt_orig_img.copy()
            vis_crops_all = shirt_orig_img.copy() # 실제 밀도로 촘촘하게 그린 버전
            contours, _ = cv2.findContours((shirt_rgba[:, :, 3] > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            if contours:
                contour = max(contours, key=cv2.contourArea)
                
                # 1. 보기 편하게 30개만 듬성듬성 그린 버전
                step_size = max(1, len(contour) // 30)
                for i in range(0, len(contour), step_size):
                    pt = contour[i][0]
                    x, y = pt[0], pt[1]

                    cv2.rectangle(vis_crops, (x - 150, y - 150), (x + 150, y + 150), (0, 255, 255), 8) # L=300 노란 박스
                    cv2.circle(vis_crops, (x, y), 15, (0, 0, 255), -1) # 박스 중심점 (빨강)
                
                # 2. 실제 CascadePSP 연산과 유사하게 50픽셀 간격으로 모든 박스를 그린 버전
                for i in range(0, len(contour), 50):
                    pt = contour[i][0]
                    x, y = pt[0], pt[1]
                    # 선이 너무 굵으면 노란색으로 화면이 덮이므로 굵기를 3으로 줄임
                    cv2.rectangle(vis_crops_all, (x - 150, y - 150), (x + 150, y + 150), (0, 255, 255), 3) 
                    cv2.circle(vis_crops_all, (x, y), 5, (0, 0, 255), -1)

                debug_stages['1_8_1_cascade_L300_crops_sample'] = self._encode_img(vis_crops)
            debug_stages['1_8_2_cascade_L300_crops_all'] = self._encode_img(vis_crops_all)

        # 2. CascadePSP 적용 
        shirt_alpha_raw = shirt_rgba[:, :, 3].copy() if debug_mode else shirt_rgba[:, :, 3]
        a4_alpha_raw = a4_rgba[:, :, 3].copy() if debug_mode else a4_rgba[:, :, 3]

        if not skip_cascade:
            # 옷(Shirt)과 A4 모두 4K 정밀도를 위해 CascadePSP 적용
            import time
            print(f"[TIME] Starting CascadePSP for Shirt/A4...")
            t_cascade = time.time()
            shirt_alpha_refined = self.refiner.refine(shirt_orig_img, shirt_alpha_raw, fast=False, L=400)
            a4_alpha_refined = self.refiner.refine(a4_orig_img, a4_alpha_raw, fast=False, L=400)
            print(f"[TIME] CascadePSP for Shirt/A4 finished: {time.time() - t_cascade:.2f} seconds")
        else:
            # 스킵할 경우 원본을 그대로 덮어씀
            shirt_alpha_refined = shirt_alpha_raw
            a4_alpha_refined = a4_alpha_raw

        shirt_rgba[:, :, 3] = shirt_alpha_refined
        a4_rgba[:, :, 3] = a4_alpha_refined

        if debug_mode:
            # 디버그: rembg 결과 (RGBA → BGR with checkerboard bg)
            debug_stages['2_shirt_rembg_rgba'] = self._encode_img(self._rgba_to_vis(shirt_rgba))
            debug_stages['3_a4_rembg_rgba'] = self._encode_img(self._rgba_to_vis(a4_rgba))

            # 눈으로 확인하기 위한 차이점 시각화 (Diff)
            diff_vis = shirt_orig_img.copy()
            diff_vis = cv2.addWeighted(diff_vis, 0.3, diff_vis, 0, 0)
            _, raw_bin = cv2.threshold(shirt_alpha_raw, 127, 255, cv2.THRESH_BINARY)
            _, ref_bin = cv2.threshold(shirt_alpha_refined, 127, 255, cv2.THRESH_BINARY)
            erased_mask = cv2.subtract(raw_bin, ref_bin)
            added_mask = cv2.subtract(ref_bin, raw_bin)
            kernel = np.ones((5,5), np.uint8)
            erased_mask = cv2.dilate(erased_mask, kernel, iterations=1)
            added_mask = cv2.dilate(added_mask, kernel, iterations=1)
            diff_vis[erased_mask > 0] = [0, 0, 255]
            diff_vis[added_mask > 0] = [0, 255, 0]
            debug_stages['1_9_0_shirt_refine_diff'] = self._encode_img(diff_vis)

            # 마스크 알파값 정밀 비교 행렬
            self._generate_alpha_comparison_vis(shirt_orig_img, shirt_alpha_raw, shirt_alpha_refined, '1_9_5', debug_stages)
            self._generate_alpha_comparison_vis(a4_orig_img, a4_alpha_raw, a4_alpha_refined, '3_5_a4', debug_stages)

        # 2. A4 분석 (A4 축소 방지를 위해 임계값을 50으로 낮춤)
        a4_alpha = a4_rgba[:, :, 3]
        
        # 디버그 3.5: A4 용지 가장자리 투명도 수치 시각화
        # vis_a4_edge = self._generate_edge_debug_vis(a4_rgba, debug_stages, '3_5')
        # if vis_a4_edge is not None:
        #     debug_stages['3_5_a4_edge_values'] = vis_a4_edge
            
        a4_alpha = a4_rgba[:, :, 3]
        # debug_stages['3_8_a4_alpha_before'] = self._encode_img(a4_alpha)

        _, a4_alpha_thresh = cv2.threshold(a4_alpha, 150, 255, cv2.THRESH_BINARY)

        # 디버그 4: 쓰레스홀드 적용 후 A4 알파 마스크
        if debug_mode:
            debug_stages['4_a4_alpha_mask'] = self._encode_img(a4_alpha_thresh)

        contours_a4, _ = cv2.findContours(a4_alpha_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if len(contours_a4) == 0:
            raise ValueError("A4_NOT_FOUND")

        cnt_a4 = max(contours_a4, key=cv2.contourArea)
        if cv2.contourArea(cnt_a4) < 1000:
            raise ValueError("A4_TOO_SMALL")

        # 기하학적 선분 교차를 이용해 완벽하게 날카로운 꼭짓점 추출
        approx = self._get_sharp_corners(cnt_a4)

        if approx is None or len(approx) != 4:
            raise ValueError("A4_NOT_QUAD")

        # 디버그: A4 꼭짓점 시각화
        a4_corners_vis = cv2.cvtColor(a4_alpha_thresh, cv2.COLOR_GRAY2BGR)
        cv2.drawContours(a4_corners_vis, [cnt_a4], -1, (0, 255, 0), 2)
        for pt in approx:
            cv2.circle(a4_corners_vis, (int(pt[0][0]), int(pt[0][1])), 8, (0, 0, 255), -1)
        if debug_mode:
            debug_stages['5_a4_quad_detection'] = self._encode_img(a4_corners_vis)

        # 글로벌 좌표계로 변환 (orig_w, orig_h 기준)
        pts = np.array([pt[0] + [a4_rect['x'], a4_rect['y']] for pt in approx], dtype=np.float32)

        # 4개 꼭짓점 정렬 (좌상, 우상, 우하, 좌하)
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1)
        tl = pts[np.argmin(s)]
        br = pts[np.argmax(s)]
        tr = pts[np.argmin(diff)]
        bl = pts[np.argmax(diff)]

        w_top = math.hypot(tl[0] - tr[0], tl[1] - tr[1])
        w_bot = math.hypot(bl[0] - br[0], bl[1] - br[1])
        dst_w = max(w_top, w_bot)
        dst_h = dst_w * (29.7 / 21.0) # A4 비율

        dst_tri = np.array([
            [tl[0], tl[1]],
            [tl[0] + dst_w, tl[1]],
            [tl[0] + dst_w, tl[1] + dst_h],
            [tl[0], tl[1] + dst_h]
        ], dtype=np.float32)

        src_tri = np.array([tl, tr, br, bl], dtype=np.float32)

        M = cv2.getPerspectiveTransform(src_tri, dst_tri)

        # 캔버스 확장 매트릭스 계산
        corners = np.array([
            [0, 0], [orig_w, 0], [orig_w, orig_h], [0, orig_h]
        ], dtype=np.float32).reshape(-1, 1, 2)
        warped_corners = cv2.perspectiveTransform(corners, M)

        min_x, min_y = warped_corners.min(axis=0)[0]
        max_x, max_y = warped_corners.max(axis=0)[0]

        dx = -min(0, round(min_x))
        dy = -min(0, round(min_y))
        new_width = round(max_x + dx)
        new_height = round(max_y + dy)

        if new_width > max(4000, orig_w * 3) or new_height > max(4000, orig_h * 3):
            raise ValueError("WARP_TOO_LARGE")

        T = np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], dtype=np.float64)
        M_new = T @ M

        # ppcm 계산 — 픽셀 면적(Area)이 아닌, 강제로 맞춘 A4 픽셀 너비(dst_w)를 사용
        # 면적을 쓰면 rembg가 A4 모서리를 둥글게 깎아먹었을 때 픽셀이 크게 유실되어 ppcm이 널뛰는 문제가 발생함.
        # 원근 보정(Perspective Transform) 시 너비를 dst_w로 강제했으므로, dst_w 픽셀 = 21.0cm 가 수학적으로 완벽히 성립함.
        ppcm = dst_w / 21.0

        # 3. 의류 마스크 병합
        full_shirt_mask = np.zeros((int(orig_h), int(orig_w)), dtype=np.uint8)
        shirt_alpha = shirt_rgba[:, :, 3]

        # 디버그 5.5: 의류 가장자리 투명도 수치 시각화
        # vis_shirt_edge = self._generate_edge_debug_vis(shirt_rgba, debug_stages, '5_5')
        # if vis_shirt_edge is not None:
        #     debug_stages['5_5_shirt_edge_values'] = vis_shirt_edge

        shirt_alpha = shirt_rgba[:, :, 3]
        # debug_stages['5_8_shirt_alpha_before'] = self._encode_img(shirt_alpha)

        # 그림자 노이즈 억제를 위해 임계값 250 적용
        _, shirt_alpha_thresh = cv2.threshold(shirt_alpha, 150, 255, cv2.THRESH_BINARY)

        # 디버그 6: 쓰레스홀드 적용 후 의류 알파 마스크
        if debug_mode:
            debug_stages['6_shirt_alpha_mask'] = self._encode_img(shirt_alpha_thresh)
        
        # 실제 이미지 마스크의 크기에 맞춤 (Frontend에서 소수점 픽셀 반올림 차이 해결)
        sy = int(shirt_rect['y'])
        sx = int(shirt_rect['x'])
        mask_h, mask_w = shirt_alpha_thresh.shape
        
        ey = min(sy + mask_h, full_shirt_mask.shape[0])
        ex = min(sx + mask_w, full_shirt_mask.shape[1])
        
        full_shirt_mask[sy:ey, sx:ex] = shirt_alpha_thresh[:ey-sy, :ex-sx]

        # 디버그: 전체 캔버스에 배치된 마스크
        # debug_stages['7_full_mask_on_canvas'] = self._encode_img(full_shirt_mask)

        warped_shirt_mask = cv2.warpPerspective(full_shirt_mask, M_new, (int(new_width), int(new_height)), flags=cv2.INTER_LINEAR)
        _, warped_shirt_mask = cv2.threshold(warped_shirt_mask, 30, 255, cv2.THRESH_BINARY)
        
        # 윤곽선 스무딩 (Morphological Close & Open) 계단 현상 및 잔털 노이즈 제거
        kernel = np.ones((5, 5), np.uint8)
        warped_shirt_mask = cv2.morphologyEx(warped_shirt_mask, cv2.MORPH_CLOSE, kernel)
        warped_shirt_mask = cv2.morphologyEx(warped_shirt_mask, cv2.MORPH_OPEN, kernel)

        # 디버그: 워프된 마스크
        if debug_mode:
            debug_stages['8_warped_shirt_mask'] = self._encode_img(warped_shirt_mask)

        contours_shirt, _ = cv2.findContours(warped_shirt_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if len(contours_shirt) == 0:
            raise ValueError("SHIRT_NOT_FOUND")

        tshirt_cnt = max(contours_shirt, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(tshirt_cnt)
        mid_x = x + w / 2

        # 디버그: 실루엣 윤곽선
        contour_vis = np.zeros_like(warped_shirt_mask)
        cv2.drawContours(contour_vis, [tshirt_cnt], -1, 255, 2)
        # debug_stages['9_silhouette_contour'] = self._encode_img(contour_vis)

        if category_type == "Bottom":
            result = self._process_bottom(tshirt_cnt, warped_shirt_mask, src_tri, M_new, ppcm, x, y, w, h, mid_x, debug_stages)
            result["shirt_rembg_base64"] = self._crop_and_encode_png(shirt_mask_bytes)
            return result

        hull = cv2.convexHull(tshirt_cnt, returnPoints=False)
        defects = cv2.convexityDefects(tshirt_cnt, hull)

        # 디버그: Convex Hull
        hull_vis = cv2.cvtColor(warped_shirt_mask, cv2.COLOR_GRAY2BGR)
        hull_vis[warped_shirt_mask > 0] = [40, 40, 40]
        cv2.drawContours(hull_vis, [tshirt_cnt], -1, (255, 255, 255), 1)
        hull_pts = cv2.convexHull(tshirt_cnt)
        cv2.drawContours(hull_vis, [hull_pts], -1, (0, 255, 255), 2)
        # debug_stages['10_convex_hull'] = self._encode_img(hull_vis)

        # 디버그: Convexity Defects (모든 결함점)
        defects_vis = hull_vis.copy()
        if defects is not None:
            for i in range(defects.shape[0]):
                s_d, e_d, f_d, d_d = defects[i, 0]
                fx_d, fy_d = tshirt_cnt[f_d][0]
                depth_d = d_d / 256.0
                color = (0, 0, 255) if depth_d > 10.0 else (128, 128, 128)
                cv2.circle(defects_vis, (fx_d, fy_d), 5, color, -1)
                cv2.putText(defects_vis, f"{depth_d:.0f}", (fx_d+6, fy_d-6), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
        # debug_stages['11_convexity_defects'] = self._encode_img(defects_vis)

        armpit_l = None
        armpit_r = None
        max_depth_l = -1
        max_depth_r = -1
        idx_al = -1
        idx_ar = -1

        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                depth = d / 256.0
                fx, fy = tshirt_cnt[f][0]

                if depth > 10.0 and (y + h * 0.15) < fy < (y + h * 0.6):
                    if fx < mid_x:
                        if depth > max_depth_l:
                            max_depth_l = depth
                            armpit_l = (fx, fy)
                            idx_al = f
                    else:
                        if depth > max_depth_r:
                            max_depth_r = depth
                            armpit_r = (fx, fy)
                            idx_ar = f

        if armpit_l is None:
            min_x = 99999
            for i, pt in enumerate(tshirt_cnt):
                px, py = pt[0]
                if (y + h * 0.2) < py < (y + h * 0.5) and px < mid_x:
                    if px < min_x:
                        min_x = px
                        armpit_l = (px, py)
                        idx_al = i
            if armpit_l is None:
                armpit_l = (x, y + h / 2)
                idx_al = 0

        if armpit_r is None:
            max_x = -99999
            for i, pt in enumerate(tshirt_cnt):
                px, py = pt[0]
                if (y + h * 0.2) < py < (y + h * 0.5) and px > mid_x:
                    if px > max_x:
                        max_x = px
                        armpit_r = (px, py)
                        idx_ar = i
            if armpit_r is None:
                armpit_r = (x + w, y + h / 2)
                idx_ar = 0

        dynamic_cx = (armpit_l[0] + armpit_r[0]) / 2

        sl_top = (99999, 0)
        sr_top = (-99999, 0)
        idx_stl = -1
        idx_str = -1

        for i, pt in enumerate(tshirt_cnt):
            px, py = pt[0]
            if px < sl_top[0]:
                sl_top = (px, py)
                idx_stl = i
            if px > sr_top[0]:
                sr_top = (px, py)
                idx_str = i

        def get_shortest_path(cnt, idx1, idx2):
            n = len(cnt)
            dist1 = abs(idx1 - idx2)
            dist2 = n - dist1
            path = []
            
            if dist1 <= dist2:
                step = 1 if idx1 < idx2 else -1
                length = dist1
            else:
                step = -1 if idx1 < idx2 else 1
                length = dist2
                
            curr = idx1
            for _ in range(length + 1):
                path.append(tuple(cnt[curr][0]))
                curr = (curr + step + n) % n
            return path

        path_sleeve_l = get_shortest_path(tshirt_cnt, idx_al, idx_stl)
        sl_bot = armpit_l
        max_d_sl = -1
        for p in path_sleeve_l:
            d = self.dist_to_segment(p, armpit_l, sl_top)
            if d > max_d_sl:
                max_d_sl = d
                sl_bot = p

        path_sleeve_r = get_shortest_path(tshirt_cnt, idx_ar, idx_str)
        sr_bot = armpit_r
        max_d_sr = -1
        for p in path_sleeve_r:
            d = self.dist_to_segment(p, armpit_r, sr_top)
            if d > max_d_sr:
                max_d_sr = d
                sr_bot = p

        neck_l = (dynamic_cx, 99999)
        neck_r = (dynamic_cx, 99999)
        margin = (armpit_r[0] - armpit_l[0]) * 0.1

        for pt in tshirt_cnt:
            px, py = pt[0]
            if py < armpit_l[1] and py < armpit_r[1]:
                if armpit_l[0] < px < dynamic_cx - margin:
                    if py < neck_l[1]:
                        neck_l = (px, py)
                elif dynamic_cx + margin < px < armpit_r[0]:
                    if py < neck_r[1]:
                        neck_r = (px, py)

        # 보정
        if neck_l[1] == 99999:
            for pt in tshirt_cnt:
                px, py = pt[0]
                if (x + w * 0.2) < px < dynamic_cx and py < neck_l[1]:
                    neck_l = (px, py)
        if neck_r[1] == 99999:
            for pt in tshirt_cnt:
                px, py = pt[0]
                if dynamic_cx < px < (x + w * 0.8) and py < neck_r[1]:
                    neck_r = (px, py)

        chest_left = armpit_l
        chest_right = armpit_r

        def is_solid(px, py):
            ix, iy = int(px), int(py)
            if 0 <= ix < warped_shirt_mask.shape[1] and 0 <= iy < warped_shirt_mask.shape[0]:
                return warped_shirt_mask[iy, ix] > 0
            return False

        neck_mid_x = (neck_l[0] + neck_r[0]) / 2

        back_collar_y = y
        for cy in range(int(y), int(y + h * 0.5)):
            if is_solid(neck_mid_x, cy):
                back_collar_y = cy
                break

        neck_center_drop = (neck_mid_x, back_collar_y)

        scan_range = int(w * 0.05)
        bottom_ys = []
        for cx in range(int(dynamic_cx - scan_range), int(dynamic_cx + scan_range + 1)):
            for cy in range(int(y + h - 1), int(armpit_l[1]), -1):
                if is_solid(cx, cy):
                    bottom_ys.append(cy)
                    break

        avg_bottom_y = sum(bottom_ys) / len(bottom_ys) if bottom_ys else (y + h)
        hem_center_point = (dynamic_cx, avg_bottom_y)

        length_cm = self.dist(neck_center_drop, hem_center_point) / ppcm
        chest_cm = self.dist(chest_left, chest_right) / ppcm
        sle_wid_cm = (self.dist(sl_top, sl_bot) + self.dist(sr_top, sr_bot)) / 2 / ppcm
        neck_cm = self.dist(neck_l, neck_r) / ppcm

        # --- 시각화 (Developer Debug Image) ---
        debug_img = cv2.cvtColor(warped_shirt_mask, cv2.COLOR_GRAY2BGR)
        debug_img[warped_shirt_mask > 0] = [60, 60, 60] # 어두운 회색 배경
        
        # 동적 스케일링 계산
        img_w = warped_shirt_mask.shape[1]
        base_scale = max(1.0, img_w / 1500.0)
        font_scale = 0.7 * base_scale
        thick = max(2, int(2 * base_scale))
        radius = max(8, int(8 * base_scale))
        
        # 1. 의류 윤곽선 (흰색)
        cv2.drawContours(debug_img, [tshirt_cnt], -1, (255, 255, 255), thick)

        # 2. Convex Hull (노란색 점선 느낌으로 그리기)
        hull_pts = cv2.convexHull(tshirt_cnt)
        cv2.drawContours(debug_img, [hull_pts], -1, (0, 255, 255), thick)

        # 3. Convexity Defects (움푹 패인 곳 - 보라색 점)
        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                fx, fy = tshirt_cnt[f][0]
                if d / 256.0 > 10.0: # 깊이가 어느정도 있는 패인 곳만
                    cv2.circle(debug_img, (fx, fy), max(4, int(4 * base_scale)), (255, 0, 255), -1)

        # 4. A4 용지 영역 (초록색) - 원본 좌표를 Warped 좌표로 변환하여 그리기
        warped_a4_pts = cv2.perspectiveTransform(src_tri.reshape(-1, 1, 2), M_new)
        cv2.polylines(debug_img, [np.int32(warped_a4_pts)], True, (0, 255, 0), thick)
        cv2.putText(debug_img, "A4 (Transformed)", tuple(np.int32(warped_a4_pts[0][0])), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 255, 0), thick)

        def draw_point(pt, color, text):
            cv2.circle(debug_img, (int(pt[0]), int(pt[1])), radius, color, -1)
            cv2.putText(debug_img, text, (int(pt[0]) + radius + 5, int(pt[1]) - radius - 5), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, thick)
            
        def draw_line(p1, p2, color, text):
            p1_int = (int(p1[0]), int(p1[1]))
            p2_int = (int(p2[0]), int(p2[1]))
            cv2.line(debug_img, p1_int, p2_int, color, thick)
            mid = ((p1_int[0] + p2_int[0]) // 2, (p1_int[1] + p2_int[1]) // 2 - int(10 * base_scale))
            cv2.putText(debug_img, text, mid, cv2.FONT_HERSHEY_SIMPLEX, font_scale * 1.1, color, thick)

        # 특징점과 선 그리기 (최종 추출 결과)
        draw_point(chest_left, (255, 100, 100), "Armpit L")
        draw_point(chest_right, (255, 100, 100), "Armpit R")
        draw_line(chest_left, chest_right, (255, 100, 100), f"Chest {round(chest_cm,1)}cm")

        draw_point(neck_center_drop, (100, 255, 100), "Neck Drop")
        draw_point(hem_center_point, (100, 255, 100), "Hem Center")
        draw_line(neck_center_drop, hem_center_point, (100, 255, 100), f"Length {round(length_cm,1)}cm")
        
        draw_point(sl_top, (100, 100, 255), "Slv Top L")
        draw_point(sl_bot, (100, 100, 255), "Slv Bot L")
        draw_line(sl_top, sl_bot, (100, 100, 255), "Sleeve")

        draw_point(sr_top, (100, 100, 255), "Slv Top R")
        draw_point(sr_bot, (100, 100, 255), "Slv Bot R")
        draw_line(sr_top, sr_bot, (100, 100, 255), "Sleeve")
        
        draw_point(neck_l, (255, 255, 100), "Neck L")
        draw_point(neck_r, (255, 255, 100), "Neck R")
        draw_line(neck_l, neck_r, (255, 255, 100), f"Neck {round(neck_cm,1)}cm")

        shoulder_cm = 0
        sleeve_length_cm = 0
        if shoulder_pts is not None:
            sh_arr = np.array([[shoulder_pts[0]], [shoulder_pts[1]]], dtype=np.float32)
            warped_sh = cv2.perspectiveTransform(sh_arr, M_new)
            sh_x1, sh_y1 = warped_sh[0][0]
            sh_x2, sh_y2 = warped_sh[1][0]
            shoulder_cm = abs(sh_x1 - sh_x2) / ppcm
            avg_y = (sh_y1 + sh_y2) / 2
            
            # --- 소매 길이 측정 ---
            sh_l_x = min(sh_x1, sh_x2)
            sh_r_x = max(sh_x1, sh_x2)
            
            def get_shoulder_seam_y(cx):
                ix = int(cx)
                if 0 <= ix < warped_shirt_mask.shape[1]:
                    for iy in range(warped_shirt_mask.shape[0]):
                        if warped_shirt_mask[iy, ix] > 0:
                            return iy
                return int(avg_y)
                
            left_seam_y = get_shoulder_seam_y(sh_l_x)
            right_seam_y = get_shoulder_seam_y(sh_r_x)
            
            left_seam_pt = (sh_l_x, left_seam_y)
            right_seam_pt = (sh_r_x, right_seam_y)
            
            sleeve_l_len = self.dist(left_seam_pt, sl_top)
            sleeve_r_len = self.dist(right_seam_pt, sr_top)
            
            sleeve_length_cm = (sleeve_l_len + sleeve_r_len) / 2 / ppcm
            
            # 그리기
            draw_point(left_seam_pt, (255, 165, 0), "Seam L")
            draw_point(right_seam_pt, (255, 165, 0), "Seam R")
            draw_line(left_seam_pt, sl_top, (255, 165, 0), "Slv Len")
            draw_line(right_seam_pt, sr_top, (255, 165, 0), f"Slv Len {round(sleeve_length_cm,1)}cm")

            draw_point((sh_x1, sh_y1), (0, 255, 255), "Shoulder L")
            draw_point((sh_x2, sh_y2), (0, 255, 255), "Shoulder R")
            draw_line((sh_x1, avg_y), (sh_x2, avg_y), (0, 255, 255), f"Shoulder {round(shoulder_cm,1)}cm")

        debug_base64 = self._encode_img(debug_img)

        # 디버그: 최종 결과 이미지
        # debug_stages['12_final_debug'] = debug_base64

        # 피팅용 이미지: rembg RGBA에서 투명 여백 제거 후 PNG base64
        shirt_rembg_base64 = self._crop_and_encode_png(shirt_mask_bytes)

        return {
            "length_cm": round(length_cm, 1),
            "chest_cm": round(chest_cm, 1),
            "shoulder_width_cm": round(shoulder_cm, 1) if shoulder_pts else 0.0,
            "sleeve_width_cm": round(sle_wid_cm, 1),
            "sleeve_length_cm": round(sleeve_length_cm, 1) if shoulder_pts else 0.0,
            "neck_width_cm": round(neck_cm, 1),
            "debug_image_base64": debug_base64,
            "debug_stages": debug_stages,
            "shirt_rembg_base64": shirt_rembg_base64,
            "status": "success"
        }

    def _crop_and_encode_png(self, rembg_bytes: bytes) -> str:
        """rembg PNG bytes → 투명 여백 제거 → PNG base64"""
        from PIL import Image as PILImage
        import io
        pil_img = PILImage.open(io.BytesIO(rembg_bytes)).convert("RGBA")
        bbox = pil_img.getbbox()
        if bbox:
            pil_img = pil_img.crop(bbox)
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    def _generate_edge_debug_vis(self, rgba_img, debug_stages, prefix):
        alpha_mask = rgba_img[:, :, 3]
        
        # 핵심 경계선을 중앙에 잡기 위해 알파값이 중간(127)을 넘는 지점을 찾음
        y_ind, x_ind = np.where(alpha_mask > 127)
        if len(y_ind) == 0:
            y_ind, x_ind = np.where(alpha_mask > 0)
            if len(y_ind) == 0:
                return None
            
        min_x_idx = np.argmin(x_ind)
        tx, ty = x_ind[min_x_idx], y_ind[min_x_idx]
        
        crop_size = 30
        half = crop_size // 2
        sty = max(0, ty - half)
        edy = min(alpha_mask.shape[0], ty + half)
        stx = max(0, tx - half) # 정확히 중앙에 오도록 절반(half)만큼 뺌
        edx = min(alpha_mask.shape[1], stx + crop_size)
        
        actual_h = edy - sty
        actual_w = edx - stx
        
        if actual_h <= 0 or actual_w <= 0:
            return None
            
        # --- 추가된 디버그 이미지 1: 크롭 위치 컨텍스트 ---
        context_img = rgba_img[:, :, :3].copy()
        thick = max(2, context_img.shape[1] // 200)
        cv2.rectangle(context_img, (stx, sty), (edx, edy), (0, 0, 255), thick)
        cv2.putText(context_img, "Crop Region", (stx, max(10, sty - 10)), cv2.FONT_HERSHEY_SIMPLEX, max(0.5, thick*0.3), (0, 0, 255), max(1, thick//2))
        debug_stages[f'{prefix}_edge_crop_context'] = self._encode_img(context_img)

        # --- 추가된 디버그 이미지 2: 뭉개짐(Blur) 시각화 ---
        blur_comp = rgba_img[:, :, :3].copy()
        
        # 10 < alpha < 245 인 구간을 '뭉개진(Fuzzy) 경계'로 정의
        fuzzy_mask = (alpha_mask > 10) & (alpha_mask < 245)
        
        # 뭉개진 부분에 붉은색 틴트 적용
        red_tint = np.array([0, 0, 255], dtype=np.float32)
        blur_comp[fuzzy_mask] = (blur_comp[fuzzy_mask].astype(np.float32) * 0.3 + red_tint * 0.7).astype(np.uint8)
        
        # 현재 기준이 되는 127(약 50%) 임계값 윤곽선을 초록색으로 표시
        _, thresh = cv2.threshold(alpha_mask, 127, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(blur_comp, contours, -1, (0, 255, 0), max(1, thick // 2))
        
        debug_stages[f'{prefix}_edge_blur_comparison'] = self._encode_img(blur_comp)

        crop_alpha = alpha_mask[sty:edy, stx:edx]
        crop_orig = rgba_img[sty:edy, stx:edx]
        
        cell_size = 30
        vis_w = actual_w * cell_size
        vis_h = actual_h * cell_size
        
        # 1. 숫자 기입된 알파 마스크 시각화
        vis_alpha = cv2.resize(crop_alpha, (vis_w, vis_h), interpolation=cv2.INTER_NEAREST)
        vis_alpha = cv2.cvtColor(vis_alpha, cv2.COLOR_GRAY2BGR)
        
        for i in range(actual_h):
            for j in range(actual_w):
                val = crop_alpha[i, j]
                color = (0, 0, 0) if val > 127 else (255, 255, 255)
                cv2.rectangle(vis_alpha, (j * cell_size, i * cell_size), ((j+1) * cell_size, (i+1) * cell_size), (100, 100, 100), 1)
                cv2.putText(vis_alpha, str(val), (j * cell_size + 2, i * cell_size + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # 2. 원본 RGBA 시각화 (체커보드 배경 + 동일하게 확대)
        vis_orig = self._rgba_to_vis(crop_orig)
        vis_orig = cv2.resize(vis_orig, (vis_w, vis_h), interpolation=cv2.INTER_NEAREST)
        
        # 라벨 추가
        cv2.putText(vis_orig, "Original Image", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        cv2.putText(vis_alpha, "Alpha Values", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        # 두 이미지를 가로로 이어붙이기
        combined = np.hstack((vis_orig, vis_alpha))
        return self._encode_img(combined)

    def _generate_alpha_comparison_vis(self, orig_img, alpha_raw, alpha_refined, prefix, debug_stages):
        # 확실한 테두리(경계선) 픽셀을 찾기 위해 형태학적 그래디언트 사용
        kernel_edge = np.ones((3,3), np.uint8)
        boundary = cv2.morphologyEx(alpha_raw, cv2.MORPH_GRADIENT, kernel_edge)
        
        # 모서리(Corner)를 정확하게 찾기 위해 이진화 처리
        _, boundary_bin = cv2.threshold(boundary, 127, 255, cv2.THRESH_BINARY)
        
        # [NEW] 이미지 가장자리(크롭 경계선)에서 잘리면서 생긴 인공적인 90도 직각을 모서리로 오인하지 않도록 마진(Margin) 제외
        h, w = boundary_bin.shape
        margin = 15
        mask_center = np.zeros((h, w), dtype=np.uint8)
        # 이미지 크기가 충분히 클 때만 마진 적용
        if h > margin*2 and w > margin*2:
            mask_center[margin:h-margin, margin:w-margin] = 255
            boundary_bin = cv2.bitwise_and(boundary_bin, mask_center)
        
        # Harris 코너 알고리즘을 추가 적용(useHarrisDetector=True)하여 옷의 소매 끝, 밑단 등 진짜 '뾰족한 꼭짓점'을 최우선으로 검출
        corners = cv2.goodFeaturesToTrack(boundary_bin, maxCorners=10, qualityLevel=0.1, minDistance=50, useHarrisDetector=True)
        
        if corners is not None and len(corners) > 0:
            # 가장 뚜렷한 첫 번째 모서리 좌표 선택
            tx, ty = int(corners[0][0][0]), int(corners[0][0][1])
        else:
            # 모서리가 없거나 둥근 물체인 경우, 기존처럼 일반 테두리의 중간 지점 선택
            y_ind, x_ind = np.where(boundary_bin > 0)
            if len(y_ind) == 0:
                # 경계마저 없으면 전경 픽셀 선택
                y_ind, x_ind = np.where(alpha_raw > 127)
                if len(y_ind) == 0:
                    return
            mid_idx = len(x_ind) // 2
            tx, ty = x_ind[mid_idx], y_ind[mid_idx]
        
        crop_size = 30
        half = crop_size // 2
        sty = max(0, ty - half)
        edy = min(alpha_raw.shape[0], ty + half)
        stx = max(0, tx - half)
        edx = min(alpha_raw.shape[1], stx + crop_size)
        
        actual_h = edy - sty
        actual_w = edx - stx
        if actual_h <= 0 or actual_w <= 0:
            return
            
        crop_orig = orig_img[sty:edy, stx:edx, :3]
        crop_raw = alpha_raw[sty:edy, stx:edx]
        crop_ref = alpha_refined[sty:edy, stx:edx]
        
        cell_size = 30
        vis_w = actual_w * cell_size
        vis_h = actual_h * cell_size
        
        # 1. Original Image
        vis_orig = cv2.resize(crop_orig, (vis_w, vis_h), interpolation=cv2.INTER_NEAREST)
        
        # 2. SAM-HQ Alpha Matrix
        vis_raw = cv2.resize(crop_raw, (vis_w, vis_h), interpolation=cv2.INTER_NEAREST)
        vis_raw = cv2.cvtColor(vis_raw, cv2.COLOR_GRAY2BGR)
        for i in range(actual_h):
            for j in range(actual_w):
                val = crop_raw[i, j]
                color = (0, 0, 0) if val > 127 else (255, 255, 255)
                cv2.rectangle(vis_raw, (j * cell_size, i * cell_size), ((j+1) * cell_size, (i+1) * cell_size), (100, 100, 100), 1)
                cv2.putText(vis_raw, str(val), (j * cell_size + 2, i * cell_size + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # 3. CascadePSP Alpha Matrix (Soft Edges)
        vis_ref = cv2.resize(crop_ref, (vis_w, vis_h), interpolation=cv2.INTER_NEAREST)
        vis_ref = cv2.cvtColor(vis_ref, cv2.COLOR_GRAY2BGR)
        for i in range(actual_h):
            for j in range(actual_w):
                val = crop_ref[i, j]
                color = (0, 0, 0) if val > 127 else (255, 255, 255)
                cv2.rectangle(vis_ref, (j * cell_size, i * cell_size), ((j+1) * cell_size, (i+1) * cell_size), (100, 100, 100), 1)
                cv2.putText(vis_ref, str(val), (j * cell_size + 2, i * cell_size + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # 4. Final Thresholded Matrix (Binary Edges)
        _, crop_final = cv2.threshold(crop_ref, 150, 255, cv2.THRESH_BINARY)
        vis_final = cv2.resize(crop_final, (vis_w, vis_h), interpolation=cv2.INTER_NEAREST)
        vis_final = cv2.cvtColor(vis_final, cv2.COLOR_GRAY2BGR)
        for i in range(actual_h):
            for j in range(actual_w):
                val = crop_final[i, j]
                color = (0, 0, 0) if val > 127 else (255, 255, 255)
                cv2.rectangle(vis_final, (j * cell_size, i * cell_size), ((j+1) * cell_size, (i+1) * cell_size), (100, 100, 100), 1)
                cv2.putText(vis_final, str(val), (j * cell_size + 2, i * cell_size + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        cv2.putText(vis_orig, "Original", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        cv2.putText(vis_raw, "SAM-HQ (Before)", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        cv2.putText(vis_ref, "CascadePSP (Soft)", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        cv2.putText(vis_final, "Final Mask (Thresh 150)", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        
        combined = np.hstack((vis_orig, vis_raw, vis_ref, vis_final))
        debug_stages[f'{prefix}_edge_matrix_comparison'] = self._encode_img(combined)

    def _rgba_to_vis(self, rgba_img):
        """RGBA 이미지를 체커보드 배경 위에 합성하여 시각화"""
        h, w = rgba_img.shape[:2]
        checker = np.zeros((h, w, 3), dtype=np.uint8)
        block = 16
        for cy in range(0, h, block):
            for cx in range(0, w, block):
                color = 200 if ((cy // block) + (cx // block)) % 2 == 0 else 160
                checker[cy:cy+block, cx:cx+block] = color
        alpha = rgba_img[:, :, 3:4].astype(np.float32) / 255.0
        bgr = rgba_img[:, :, :3].astype(np.float32)
        result = (bgr * alpha + checker.astype(np.float32) * (1 - alpha)).astype(np.uint8)
        return result

    def _process_bottom(self, tshirt_cnt, warped_shirt_mask, src_tri, M_new, ppcm, x, y, w, h, mid_x, debug_stages=None):
        if debug_stages is None:
            debug_stages = {}
        hull = cv2.convexHull(tshirt_cnt, returnPoints=False)
        defects = cv2.convexityDefects(tshirt_cnt, hull)

        # 디버그: 하의 Convex Hull
        hull_vis = cv2.cvtColor(warped_shirt_mask, cv2.COLOR_GRAY2BGR)
        hull_vis[warped_shirt_mask > 0] = [40, 40, 40]
        cv2.drawContours(hull_vis, [tshirt_cnt], -1, (255, 255, 255), 1)
        hull_pts = cv2.convexHull(tshirt_cnt)
        cv2.drawContours(hull_vis, [hull_pts], -1, (0, 255, 255), 2)
        # debug_stages['10_convex_hull'] = self._encode_img(hull_vis)

        # 디버그: 하의 Convexity Defects
        defects_vis = hull_vis.copy()
        if defects is not None:
            for i in range(defects.shape[0]):
                s_d, e_d, f_d, d_d = defects[i, 0]
                fx_d, fy_d = tshirt_cnt[f_d][0]
                depth_d = d_d / 256.0
                color = (0, 0, 255) if depth_d > 10.0 else (128, 128, 128)
                cv2.circle(defects_vis, (fx_d, fy_d), 5, color, -1)
                cv2.putText(defects_vis, f"{depth_d:.0f}", (fx_d+6, fy_d-6), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
        # debug_stages['11_convexity_defects'] = self._encode_img(defects_vis)
        
        crotch_pt = None
        max_depth = 0
        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                depth = d / 256.0
                fx, fy = tshirt_cnt[f][0]
                
                if depth > 10.0 and (y + h * 0.2) < fy < (y + h * 0.8) and (x + w * 0.3) < fx < (x + w * 0.7):
                    if depth > max_depth:
                        max_depth = depth
                        crotch_pt = (fx, fy)
                        
        if crotch_pt is None:
            crotch_pt = (mid_x, y + h * 0.4)
            
        pants_pts = [tuple(pt[0]) for pt in tshirt_cnt]
        
        # 2. 허리 양끝점 (Waist L/R)
        upper_pts = [p for p in pants_pts if p[1] < y + h * 0.3]
        if not upper_pts: upper_pts = pants_pts
        
        # 최상단 좌/우측 꼭짓점 찾기
        waist_l = min(upper_pts, key=lambda p: p[0] + p[1])
        waist_r = max(upper_pts, key=lambda p: p[0] - p[1])
        
        # 3. 밑단 (Hem) - 왼쪽 다리(Left Leg) 기준 수학적 모서리 스냅
        left_leg_pts = [p for p in pants_pts if p[0] < crotch_pt[0] and p[1] > crotch_pt[1]]
        if not left_leg_pts: left_leg_pts = pants_pts
        
        # y-x 가 가장 크면 왼쪽 아래, y+x 가 가장 크면 오른쪽 아래
        hem_l_left = max(left_leg_pts, key=lambda p: p[1] - p[0])
        hem_l_right = max(left_leg_pts, key=lambda p: p[1] + p[0])
        
        # 4. 허벅지 (Thigh) - 사타구니에서 수직 투영 후 '실제 실루엣'에 스냅
        def project_point_to_line(p, a, b):
            ap = np.array([p[0]-a[0], p[1]-a[1]])
            ab = np.array([b[0]-a[0], b[1]-a[1]])
            dot_ab = np.dot(ab, ab)
            if dot_ab == 0: return a
            t = np.dot(ap, ab) / dot_ab
            t = max(0.0, min(1.0, t))
            return (a[0] + t * ab[0], a[1] + t * ab[1])
            
        proj_thigh = project_point_to_line(crotch_pt, waist_l, hem_l_left)
        left_outline = [p for p in pants_pts if p[0] < crotch_pt[0]]
        if not left_outline: left_outline = pants_pts
        
        thigh_l_left = min(left_outline, key=lambda p: self.dist(p, proj_thigh))
        thigh_l_right = crotch_pt
        
        # 5. 허리 실루엣(곡선) 경로 추출
        idx_wl = -1
        idx_wr = -1
        for i, pt in enumerate(pants_pts):
            if pt == waist_l: idx_wl = i
            if pt == waist_r: idx_wr = i
            
        path1 = []
        path2 = []
        n = len(pants_pts)
        curr = idx_wl
        while curr != idx_wr:
            path1.append(pants_pts[curr])
            curr = (curr + 1) % n
        path1.append(waist_r)
        
        curr = idx_wl
        while curr != idx_wr:
            path2.append(pants_pts[curr])
            curr = (curr - 1 + n) % n
        path2.append(waist_r)
        
        avg_y1 = sum(p[1] for p in path1) / len(path1) if path1 else 0
        avg_y2 = sum(p[1] for p in path2) / len(path2) if path2 else 0
        top_waist_path = path1 if avg_y1 < avg_y2 else path2
        
        # 허리 곡선 길이 계산 및 각 픽셀까지의 누적 거리 저장
        waist_curve_len = 0
        cumulative_distances = [0]
        for i in range(len(top_waist_path) - 1):
            d = self.dist(top_waist_path[i], top_waist_path[i+1])
            waist_curve_len += d
            cumulative_distances.append(waist_curve_len)
            
        # 곡선의 길이를 쫙 폈을 때 정확히 50%가 되는 정중앙 픽셀 찾기
        half_len = waist_curve_len / 2
        waist_center_top = top_waist_path[0]
        for i, cum_dist in enumerate(cumulative_distances):
            if cum_dist >= half_len:
                waist_center_top = top_waist_path[i]
                break
                
        # 6. 최종 치수 계산
        length_cm = self.dist(waist_l, hem_l_left) / ppcm
        waist_cm = waist_curve_len / ppcm
        rise_cm = self.dist(waist_center_top, crotch_pt) / ppcm
        hem_cm = self.dist(hem_l_left, hem_l_right) / ppcm
        thigh_cm = self.dist(thigh_l_left, thigh_l_right) / ppcm

        # 동적 스케일링 계산
        img_w = warped_shirt_mask.shape[1]
        base_scale = max(1.0, img_w / 1500.0)
        font_scale = 0.7 * base_scale
        thick = max(2, int(2 * base_scale))
        radius = max(8, int(8 * base_scale))

        debug_img = cv2.cvtColor(warped_shirt_mask, cv2.COLOR_GRAY2BGR)
        debug_img[warped_shirt_mask > 0] = [60, 60, 60]
        
        cv2.drawContours(debug_img, [tshirt_cnt], -1, (255, 255, 255), thick)
        
        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                fx, fy = tshirt_cnt[f][0]
                if d / 256.0 > 10.0:
                    cv2.circle(debug_img, (fx, fy), max(4, int(4 * base_scale)), (255, 0, 255), -1)
                    
        warped_a4_pts = cv2.perspectiveTransform(src_tri.reshape(-1, 1, 2), M_new)
        cv2.polylines(debug_img, [np.int32(warped_a4_pts)], True, (0, 255, 0), thick)
        cv2.putText(debug_img, "A4 (Transformed)", tuple(np.int32(warped_a4_pts[0][0])), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 255, 0), thick)

        def draw_point(pt, color, text):
            cv2.circle(debug_img, (int(pt[0]), int(pt[1])), radius, color, -1)
            cv2.putText(debug_img, text, (int(pt[0]) + radius + 5, int(pt[1]) - radius - 5), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, thick)
            
        def draw_line(p1, p2, color, text):
            p1_int = (int(p1[0]), int(p1[1]))
            p2_int = (int(p2[0]), int(p2[1]))
            cv2.line(debug_img, p1_int, p2_int, color, thick)
            mid = ((p1_int[0] + p2_int[0]) // 2, (p1_int[1] + p2_int[1]) // 2 - int(10 * base_scale))
            cv2.putText(debug_img, text, mid, cv2.FONT_HERSHEY_SIMPLEX, font_scale * 1.1, color, thick)

        # 📌 선 그리기
        # 1) 허리 단면 (실루엣 곡선을 따라 파란색 선 그리기)
        for i in range(len(top_waist_path) - 1):
            p1 = (int(top_waist_path[i][0]), int(top_waist_path[i][1]))
            p2 = (int(top_waist_path[i+1][0]), int(top_waist_path[i+1][1]))
            cv2.line(debug_img, p1, p2, (255, 100, 100), thick)

        draw_point(waist_l, (255, 100, 100), "Waist L")
        draw_point(waist_r, (255, 100, 100), "Waist R")
        draw_point(waist_center_top, (255, 100, 100), "Waist C")
        cv2.putText(debug_img, f"Waist {round(waist_cm,1)}cm", (int(waist_center_top[0]) - int(50*base_scale), int(waist_center_top[1]) - int(20*base_scale)), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 100, 100), thick)

        draw_point(crotch_pt, (100, 255, 100), "Crotch")
        draw_line(waist_center_top, crotch_pt, (100, 255, 100), f"Rise {round(rise_cm,1)}cm")
        
        draw_point(hem_l_left, (100, 100, 255), "Hem LL")
        draw_point(hem_l_right, (100, 100, 255), "Hem LR")
        draw_line(hem_l_left, hem_l_right, (100, 100, 255), f"Hem {round(hem_cm,1)}cm")
        
        draw_point(thigh_l_left, (255, 255, 100), "Thigh L")
        draw_point(thigh_l_right, (255, 255, 100), "Thigh R")
        draw_line(thigh_l_left, thigh_l_right, (255, 255, 100), f"Thigh {round(thigh_cm,1)}cm")
        
        draw_line(waist_l, hem_l_left, (200, 200, 200), f"Length {round(length_cm,1)}cm")

        debug_base64 = self._encode_img(debug_img)
        # debug_stages['12_final_debug'] = debug_base64

        return {
            "length_cm": round(length_cm, 1),
            "waist_cm": round(waist_cm, 1),
            "rise_cm": round(rise_cm, 1),
            "thigh_cm": round(thigh_cm, 1),
            "hem_cm": round(hem_cm, 1),
            "debug_image_base64": debug_base64,
            "debug_stages": debug_stages,
            "status": "success"
        }
