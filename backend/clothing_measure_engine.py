import cv2
import numpy as np
from rembg import remove
import math

class ClothingMeasureEngine:
    def __init__(self):
        # rembg 모델은 첫 호출 시 자동 다운로드 (u2net)
        pass

    def dist(self, p1, p2):
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    def dist_to_segment(self, p, a, b):
        line_len = math.hypot(b[0] - a[0], b[1] - a[1])
        if line_len == 0:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        u = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (line_len ** 2)
        proj_x = a[0] + u * (b[0] - a[0])
        proj_y = a[1] + u * (b[1] - a[1])
        return math.hypot(p[0] - proj_x, p[1] - proj_y)

    def process(self, shirt_image_bytes, a4_image_bytes, shirt_rect, a4_rect, orig_w, orig_h, category_type="Top"):
        # 1. 배경 제거 (rembg)
        # return_type: bytes
        shirt_mask_bytes = remove(shirt_image_bytes)
        a4_mask_bytes = remove(a4_image_bytes)

        # 바이트를 numpy array(이미지)로 변환
        shirt_nparr = np.frombuffer(shirt_mask_bytes, np.uint8)
        shirt_rgba = cv2.imdecode(shirt_nparr, cv2.IMREAD_UNCHANGED)

        a4_nparr = np.frombuffer(a4_mask_bytes, np.uint8)
        a4_rgba = cv2.imdecode(a4_nparr, cv2.IMREAD_UNCHANGED)

        if shirt_rgba is None or a4_rgba is None:
            raise ValueError("Failed to decode images after background removal")

        if shirt_rgba.shape[2] != 4 or a4_rgba.shape[2] != 4:
            raise ValueError("Images do not have alpha channel after background removal")

        # 2. A4 분석
        a4_alpha = a4_rgba[:, :, 3]
        _, a4_alpha_thresh = cv2.threshold(a4_alpha, 10, 255, cv2.THRESH_BINARY)
        contours_a4, _ = cv2.findContours(a4_alpha_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if len(contours_a4) == 0:
            raise ValueError("A4_NOT_FOUND")

        cnt_a4 = max(contours_a4, key=cv2.contourArea)
        if cv2.contourArea(cnt_a4) < 1000:
            raise ValueError("A4_TOO_SMALL")

        peri = cv2.arcLength(cnt_a4, True)
        approx = cv2.approxPolyDP(cnt_a4, 0.04 * peri, True)

        if len(approx) != 4:
            raise ValueError("A4_NOT_QUAD")

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

        if new_width > 4000 or new_height > 4000:
            raise ValueError("WARP_TOO_LARGE")

        T = np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], dtype=np.float64)
        M_new = T @ M

        ppcm_w = dst_w / 21.0
        ppcm_h = dst_h / 29.7
        ppcm = (ppcm_w + ppcm_h) / 2.0

        # 3. 의류 마스크 병합
        full_shirt_mask = np.zeros((int(orig_h), int(orig_w)), dtype=np.uint8)
        shirt_alpha = shirt_rgba[:, :, 3]
        _, shirt_alpha_thresh = cv2.threshold(shirt_alpha, 10, 255, cv2.THRESH_BINARY)
        
        # 실제 이미지 마스크의 크기에 맞춤 (Frontend에서 소수점 픽셀 반올림 차이 해결)
        sy = int(shirt_rect['y'])
        sx = int(shirt_rect['x'])
        mask_h, mask_w = shirt_alpha_thresh.shape
        
        ey = min(sy + mask_h, full_shirt_mask.shape[0])
        ex = min(sx + mask_w, full_shirt_mask.shape[1])
        
        full_shirt_mask[sy:ey, sx:ex] = shirt_alpha_thresh[:ey-sy, :ex-sx]

        warped_shirt_mask = cv2.warpPerspective(full_shirt_mask, M_new, (int(new_width), int(new_height)), flags=cv2.INTER_NEAREST)
        _, warped_shirt_mask = cv2.threshold(warped_shirt_mask, 127, 255, cv2.THRESH_BINARY)

        contours_shirt, _ = cv2.findContours(warped_shirt_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if len(contours_shirt) == 0:
            raise ValueError("SHIRT_NOT_FOUND")

        tshirt_cnt = max(contours_shirt, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(tshirt_cnt)
        mid_x = x + w / 2

        if category_type == "Bottom":
            return self._process_bottom(tshirt_cnt, warped_shirt_mask, src_tri, M_new, ppcm, x, y, w, h, mid_x)

        hull = cv2.convexHull(tshirt_cnt, returnPoints=False)
        defects = cv2.convexityDefects(tshirt_cnt, hull)

        armpit_l = None
        armpit_r = None
        min_y_l_def = 99999
        min_y_r_def = 99999
        idx_al = -1
        idx_ar = -1

        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                depth = d / 256.0
                fx, fy = tshirt_cnt[f][0]

                if depth > 10.0 and (y + h * 0.15) < fy < (y + h * 0.6):
                    if fx < mid_x:
                        if fy < min_y_l_def:
                            min_y_l_def = fy
                            armpit_l = (fx, fy)
                            idx_al = f
                    else:
                        if fy < min_y_r_def:
                            min_y_r_def = fy
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
        
        # 1. 의류 윤곽선 (흰색)
        cv2.drawContours(debug_img, [tshirt_cnt], -1, (255, 255, 255), 2)

        # 2. Convex Hull (노란색 점선 느낌으로 그리기)
        hull_pts = cv2.convexHull(tshirt_cnt)
        cv2.drawContours(debug_img, [hull_pts], -1, (0, 255, 255), 2)

        # 3. Convexity Defects (움푹 패인 곳 - 보라색 점)
        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                fx, fy = tshirt_cnt[f][0]
                if d / 256.0 > 10.0: # 깊이가 어느정도 있는 패인 곳만
                    cv2.circle(debug_img, (fx, fy), 4, (255, 0, 255), -1)

        # 4. A4 용지 영역 (초록색) - 원본 좌표를 Warped 좌표로 변환하여 그리기
        warped_a4_pts = cv2.perspectiveTransform(src_tri.reshape(-1, 1, 2), M_new)
        cv2.polylines(debug_img, [np.int32(warped_a4_pts)], True, (0, 255, 0), 2)
        cv2.putText(debug_img, "A4 (Transformed)", tuple(np.int32(warped_a4_pts[0][0])), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        def draw_point(pt, color, text):
            cv2.circle(debug_img, (int(pt[0]), int(pt[1])), 8, color, -1)
            cv2.putText(debug_img, text, (int(pt[0]) + 10, int(pt[1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            
        def draw_line(p1, p2, color, text):
            p1_int = (int(p1[0]), int(p1[1]))
            p2_int = (int(p2[0]), int(p2[1]))
            cv2.line(debug_img, p1_int, p2_int, color, 3)
            mid = ((p1_int[0] + p2_int[0]) // 2, (p1_int[1] + p2_int[1]) // 2 - 10)
            cv2.putText(debug_img, text, mid, cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

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

        import base64
        _, buffer = cv2.imencode('.jpg', debug_img)
        debug_base64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "length_cm": round(length_cm, 1),
            "chest_cm": round(chest_cm, 1),
            "sleeve_width_cm": round(sle_wid_cm, 1),
            "neck_width_cm": round(neck_cm, 1),
            "debug_image_base64": debug_base64,
            "status": "success"
        }

    def _process_bottom(self, tshirt_cnt, warped_shirt_mask, src_tri, M_new, ppcm, x, y, w, h, mid_x):
        import base64
        import numpy as np
        hull = cv2.convexHull(tshirt_cnt, returnPoints=False)
        defects = cv2.convexityDefects(tshirt_cnt, hull)
        
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
            
        pts = [tuple(pt[0]) for pt in tshirt_cnt]
        
        # 1. Waist (Top corners by projecting diagonally)
        upper_pts = [p for p in pts if p[1] < y + h * 0.3]
        if not upper_pts: upper_pts = pts
        waist_l = min(upper_pts, key=lambda p: p[0] + p[1]*2)
        waist_r = max(upper_pts, key=lambda p: p[0] - p[1]*2)
        waist_center_y = (waist_l[1] + waist_r[1]) / 2
        waist_mid = ((waist_l[0]+waist_r[0])/2, waist_center_y)
            
        # 3. Hem (Bottom lines for each leg, robustly finding true bounding points without altering Y)
        bottom_pts = [p for p in pts if p[1] > y + h * 0.5]
        if not bottom_pts: bottom_pts = pts
        
        # Split left and right legs based on horizontal midpoint
        left_half = [p for p in bottom_pts if p[0] < mid_x]
        right_half = [p for p in bottom_pts if p[0] >= mid_x]
        
        if not left_half: left_half = bottom_pts
        if not right_half: right_half = bottom_pts
        
        # Find the absolute bottom to establish a search zone
        ll_max_y = max(left_half, key=lambda p: p[1])[1]
        # Get points within the bottom 5% of the left leg
        ll_hem_pts = [p for p in left_half if p[1] > ll_max_y - h * 0.05]
        # Keep their original Y coordinates! Just find min/max X.
        hem_l_left = min(ll_hem_pts, key=lambda p: p[0])
        hem_l_right = max(ll_hem_pts, key=lambda p: p[0])

        rl_max_y = max(right_half, key=lambda p: p[1])[1]
        rl_hem_pts = [p for p in right_half if p[1] > rl_max_y - h * 0.05]
        hem_r_left = min(rl_hem_pts, key=lambda p: p[0])
        hem_r_right = max(rl_hem_pts, key=lambda p: p[0])
        
        # 2. Thigh (Perpendicular to left leg outseam)
        def project_point_to_line(p, a, b):
            ap = np.array([p[0]-a[0], p[1]-a[1]])
            ab = np.array([b[0]-a[0], b[1]-a[1]])
            dot_ab = np.dot(ab, ab)
            if dot_ab == 0: return a
            t = np.dot(ap, ab) / dot_ab
            # Do not clamp to segment so we can project exactly horizontal if needed,
            # but for outer thigh, it should fall on the segment.
            t = max(0.0, min(1.0, t))
            return (a[0] + t * ab[0], a[1] + t * ab[1])
            
        # Shortest distance from crotch to the outseam line (Waist L to Hem LL)
        thigh_l_left = project_point_to_line(crotch_pt, waist_l, hem_l_left)
        thigh_l_right = crotch_pt
        
        # 4. Measurements
        len_l = self.dist(waist_l, hem_l_left)
        len_r = self.dist(waist_r, hem_r_right)
        length_cm = max(len_l, len_r) / ppcm
        leg_line_start = waist_l if len_l > len_r else waist_r
        leg_line_end = hem_l_left if len_l > len_r else hem_r_right
        
        waist_cm = self.dist(waist_l, waist_r) / ppcm
        rise_cm = (crotch_pt[1] - waist_center_y) / ppcm
        hem_cm = (self.dist(hem_l_left, hem_l_right) + self.dist(hem_r_left, hem_r_right)) / 2 / ppcm
        thigh_cm = self.dist(thigh_l_left, thigh_l_right) / ppcm

        debug_img = cv2.cvtColor(warped_shirt_mask, cv2.COLOR_GRAY2BGR)
        debug_img[warped_shirt_mask > 0] = [60, 60, 60]
        
        cv2.drawContours(debug_img, [tshirt_cnt], -1, (255, 255, 255), 2)
        
        hull_pts = cv2.convexHull(tshirt_cnt)
        cv2.drawContours(debug_img, [hull_pts], -1, (0, 255, 255), 2)
        
        if defects is not None:
            for i in range(defects.shape[0]):
                s, e, f, d = defects[i, 0]
                fx, fy = tshirt_cnt[f][0]
                if d / 256.0 > 10.0:
                    cv2.circle(debug_img, (fx, fy), 4, (255, 0, 255), -1)
        
        warped_a4_pts = cv2.perspectiveTransform(src_tri.reshape(-1, 1, 2), M_new)
        cv2.polylines(debug_img, [np.int32(warped_a4_pts)], True, (0, 255, 0), 2)
        cv2.putText(debug_img, "A4 (Transformed)", tuple(np.int32(warped_a4_pts[0][0])), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        def draw_point(pt, color, text):
            cv2.circle(debug_img, (int(pt[0]), int(pt[1])), 8, color, -1)
            cv2.putText(debug_img, text, (int(pt[0]) + 10, int(pt[1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            
        def draw_line(p1, p2, color, text):
            p1_int = (int(p1[0]), int(p1[1]))
            p2_int = (int(p2[0]), int(p2[1]))
            cv2.line(debug_img, p1_int, p2_int, color, 3)
            mid = ((p1_int[0] + p2_int[0]) // 2, (p1_int[1] + p2_int[1]) // 2 - 10)
            cv2.putText(debug_img, text, mid, cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

        draw_point(waist_l, (255, 100, 100), "Waist L")
        draw_point(waist_r, (255, 100, 100), "Waist R")
        draw_line(waist_l, waist_r, (255, 100, 100), f"Waist {round(waist_cm,1)}cm")

        draw_point(crotch_pt, (100, 255, 100), "Crotch")
        draw_line(waist_mid, crotch_pt, (100, 255, 100), f"Rise {round(rise_cm,1)}cm")
        
        draw_point(hem_l_left, (100, 100, 255), "Hem LL")
        draw_point(hem_l_right, (100, 100, 255), "Hem LR")
        draw_line(hem_l_left, hem_l_right, (100, 100, 255), f"Hem {round(hem_cm,1)}cm")
        
        draw_point(thigh_l_left, (255, 255, 100), "Thigh L")
        draw_point(thigh_l_right, (255, 255, 100), "Thigh R")
        draw_line(thigh_l_left, thigh_l_right, (255, 255, 100), f"Thigh {round(thigh_cm,1)}cm")
        
        draw_line(leg_line_start, leg_line_end, (200, 200, 200), f"Length {round(length_cm,1)}cm")

        _, buffer = cv2.imencode('.jpg', debug_img)
        debug_base64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "length_cm": round(length_cm, 1),
            "waist_cm": round(waist_cm, 1),
            "rise_cm": round(rise_cm, 1),
            "thigh_cm": round(thigh_cm, 1),
            "hem_cm": round(hem_cm, 1),
            "debug_image_base64": debug_base64,
            "status": "success"
        }
