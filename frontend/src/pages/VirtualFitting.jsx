import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles, Ruler, MessageSquare, Info, Key, User } from 'lucide-react';
import './VirtualFitting.css';

const BASE = 'http://localhost:8000';
const CV_W = 300, CV_H = 500;
const DRAW_H = CV_H * 0.9;
const OFFSET_Y = (CV_H - DRAW_H) / 2 + CV_H * 0.02;
const FILL_RATIO = 0.78;

function VirtualFitting() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { sender: 'bot', text: '안녕하세요! AI 핏 어드바이저입니다. 현재는 상품 상세 이미지를 기반으로 질문에 답변해 드립니다. 무엇이든 물어보세요!' }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [productImages, setProductImages] = useState([]);
  const [productInfo, setProductInfo] = useState(null);
  const [productReviews, setProductReviews] = useState([]);

  // ── overlay canvas state ──
  const canvasRef = useRef(null);
  const userEmail = sessionStorage.getItem('userEmail');
  const [avatar, setAvatar] = useState(null);
  const [avatarImg, setAvatarImg] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [showSizeOverlay, setShowSizeOverlay] = useState(true);
  const [showDimLines, setShowDimLines] = useState(false);
  const [sleeveAngle, setSleeveAngle] = useState('auto');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragStartPos.current = { x: e.nativeEvent.offsetX - dragOffset.x, y: e.nativeEvent.offsetY - dragOffset.y };
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setDragOffset({
      x: e.nativeEvent.offsetX - dragStartPos.current.x,
      y: e.nativeEvent.offsetY - dragStartPos.current.y
    });
  };
  const handleMouseUpOrLeave = () => setIsDragging(false);
  const handleDoubleClick = () => setDragOffset({ x: 0, y: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 상품 기본 정보 및 상세 이미지 가져오기
        const prodRes = await fetch(`http://localhost:8000/api/products/${id}`);
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          setProductInfo(prodData);

          const base64Images = [];

          // 메인 이미지 변환 추가
          if (prodData.image_url) {
            try {
              const mainImgUrl = `http://localhost:8000${prodData.image_url}`;
              const base64 = await getBase64ImageFromUrl(mainImgUrl);
              base64Images.push(base64);
            } catch (e) {
              console.error("메인 이미지 변환 실패:", e);
            }
          }

          if (prodData.desc_images) {
            for (let img of prodData.desc_images) {
              const imgUrl = `http://localhost:8000${img.image_url}`;
              try {
                const base64 = await getBase64ImageFromUrl(imgUrl);
                base64Images.push(base64);
              } catch (e) {
                console.error("상세 이미지 변환 실패:", e);
              }
            }
          }
          setProductImages(base64Images);
        }

        // 리뷰 정보 가져오기
        const revRes = await fetch(`http://localhost:8000/api/products/${id}/reviews`);
        if (revRes.ok) {
          const revData = await revRes.json();
          setProductReviews(revData);
        }
      } catch (err) {
        console.error('상품 정보 불러오기 실패:', err);
      }
    };
    fetchData();
  }, [id]);

  // ── fetch avatar ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userEmail) return;
    fetch(`${BASE}/api/avatar/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : null)
      .then(setAvatar)
      .catch(() => {});
  }, [userEmail]);

  // ── remove gray/white background from avatar JPEG ─────────────────
  const removeBackground = useCallback((img, isGray) => {
    const off = document.createElement('canvas');
    off.width = img.width; off.height = img.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, off.width, off.height);
    const px = d.data;
    
    let top = img.height, bottom = 0, left = img.width, right = 0;
    
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i+1], b = px[i+2];
      const br = (r+g+b)/3;
      const sat = Math.max(r,g,b) === 0 ? 0 : (Math.max(r,g,b)-Math.min(r,g,b))/Math.max(r,g,b);
      
      let isBg = false;
      if (br > (isGray ? 140 : 230) || (br > 200 && sat < 0.12)) {
        isBg = true;
        px[i+3] = 0;
      }
      
      if (!isBg && px[i+3] > 0) {
        const idx = i / 4;
        const x = idx % img.width;
        const y = Math.floor(idx / img.width);
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    ctx.putImageData(d, 0, 0);
    
    if (bottom >= top && right >= left) {
      const cropW = right - left + 1;
      const cropH = bottom - top + 1;
      const cropped = document.createElement('canvas');
      cropped.width = cropW;
      cropped.height = cropH;
      cropped.getContext('2d').drawImage(off, left, top, cropW, cropH, 0, 0, cropW, cropH);
      return cropped;
    }
    
    return off;
  }, []);

  // ── load avatar image ──────────────────────────────────────────────
  useEffect(() => {
    if (!avatar?.gray_mask_url) { setAvatarImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setAvatarImg(removeBackground(img, true));
    img.onerror = () => setAvatarImg(null);
    img.src = `${BASE}${avatar.gray_mask_url}`;
  }, [avatar, removeBackground]);

  // ── init selected size ────────────────────────────────────────────
  useEffect(() => {
    if (!productInfo) return;
    const isTop = productInfo.category?.name?.includes('상의') ?? true;
    const sizes = isTop ? productInfo.top_sizes : productInfo.bottom_sizes;
    if (sizes?.length > 0) setSelectedSize(sizes[0]);
  }, [productInfo]);

  // ── auto calculate sleeve angle ──────────────────────────────────
  const getAutoSleeveAngle = useCallback(() => {
    if (!selectedSize || !productInfo?.category?.name?.includes('상의') || !avatar) return 65;
    let heightRatio = 1;
    if (avatar.measurements) {
      try {
        const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
        // new format: { items: [...], height_ratio: N }
        // old format: [...] array
        if (m && m.height_ratio) heightRatio = m.height_ratio;
      } catch(e) {}
    }
    const px_per_cm = DRAW_H / (avatar.height_cm * heightRatio);
    const getVal = (val, defaultVal) => (val && val > 0) ? val : defaultVal;
    
    const shoulderWidth = getVal(selectedSize.shoulder, 45) * px_per_cm;
    const chestWidth = getVal(selectedSize.chest, 50) * px_per_cm;
    const sleeveLength = getVal(selectedSize.sleeve_length, 20) * px_per_cm;
    const sleeveOpening = getVal(selectedSize.sleeve, 16) * px_per_cm;
    
    const dx = chestWidth/2 - shoulderWidth/2;
    const R = Math.sqrt(sleeveLength*sleeveLength + sleeveOpening*sleeveOpening);
    if (R > 0 && Math.abs(dx / R) <= 1) {
      let calc = (Math.acos(dx / R) - Math.atan2(sleeveOpening, sleeveLength)) * 180 / Math.PI;
      return isNaN(calc) ? 65 : Math.max(0, Math.min(90, calc));
    }
    return 65;
  }, [selectedSize, productInfo, avatar]);

  const currentSleeveAngle = sleeveAngle === 'auto' ? getAutoSleeveAngle() : sleeveAngle;

  // ── draw canvas ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CV_W, CV_H);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, CV_W, CV_H);

    if (avatarImg) {
      const aspect = avatarImg.width / avatarImg.height;
      const dh = DRAW_H, dw = dh * aspect;
      ctx.drawImage(avatarImg, (CV_W - dw) / 2, OFFSET_Y, dw, dh);
    }

    ctx.save();
    ctx.translate(dragOffset.x, dragOffset.y);

    // Draw Size Chart Overlay
    if (showSizeOverlay && avatar && selectedSize) {
      let heightRatio = 1;
      if (avatar.measurements) {
        try {
          const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
          // new format: { items: [...], height_ratio: N } / old format: [...]
          if (m && m.height_ratio) heightRatio = m.height_ratio;
        } catch(e) {}
      }
      // DRAW_H는 발가락 끝까지 타이트 크롭된 전체 이미지 높이입니다.
      // 실제 입력받은 키(avatar.height_cm)는 발꿈치까지의 길이이므로, 
      // 전체 이미지 높이 비율(heightRatio)을 곱해 보정합니다.
      const px_per_cm = DRAW_H / (avatar.height_cm * heightRatio);
      const isTop = productInfo?.category?.name?.includes('상의') ?? true;
      
      const centerX = CV_W / 2;
      // 평균적 머리 높이 = 키의 13.5% (1/7.4)
      // avatar 이미지는 OFFSET_Y에서 그려지며 실루엣의 매 픽셀 = px_per_cm 단위이므로
      // 의류 시작점도 동일한 px_per_cm 기준으로 계산
      const headHeight_cm = avatar.height_cm * 0.135; // 머리높이 아래에 어깨선이 시작
      const startY = isTop
        ? OFFSET_Y + headHeight_cm * px_per_cm
        : OFFSET_Y + avatar.height_cm * heightRatio * 0.42 * px_per_cm;

      const getVal = (val, defaultVal) => (val && val > 0) ? val : defaultVal;
      const getLabel = (name, val) => (val && val > 0) ? `${name} ${val}cm` : `${name} 정보 없음`;
      const isMissing = (val) => !(val && val > 0);

      const drawDimLine = (x1, y1, x2, y2, text, offsetX = 0, offsetY = 0, missing = false) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = missing ? 'rgba(156, 163, 175, 0.8)' : 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash(missing ? [2, 4] : [4, 4]);
        ctx.stroke();
        
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const tickLen = 3;
        ctx.beginPath();
        ctx.moveTo(x1 - tickLen * Math.sin(angle), y1 + tickLen * Math.cos(angle));
        ctx.lineTo(x1 + tickLen * Math.sin(angle), y1 - tickLen * Math.cos(angle));
        ctx.moveTo(x2 - tickLen * Math.sin(angle), y2 + tickLen * Math.cos(angle));
        ctx.lineTo(x2 + tickLen * Math.sin(angle), y2 - tickLen * Math.cos(angle));
        ctx.setLineDash([]);
        ctx.stroke();

        ctx.font = '600 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const mx = (x1 + x2) / 2 + offsetX;
        const my = (y1 + y2) / 2 + offsetY;
        
        const textMetrics = ctx.measureText(text);
        const padding = 6;
        const bgWidth = textMetrics.width + padding * 2;
        const bgHeight = 16;
        
        ctx.fillStyle = missing ? 'rgba(243, 244, 246, 0.9)' : 'rgba(254, 242, 242, 0.9)';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(mx - bgWidth/2, my - bgHeight/2, bgWidth, bgHeight, 8);
        } else {
          ctx.rect(mx - bgWidth/2, my - bgHeight/2, bgWidth, bgHeight);
        }
        ctx.fill();
        ctx.strokeStyle = missing ? 'rgba(209, 213, 219, 1)' : 'rgba(252, 165, 165, 1)';
        ctx.stroke();
        
        ctx.fillStyle = missing ? '#6b7280' : '#ef4444';
        ctx.fillText(text, mx, my);
        ctx.restore();
      };

      ctx.save();
      ctx.strokeStyle = '#6366f1'; // Indigo color
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)'; // Transparent indigo
      ctx.beginPath();

      if (isTop) {
        const neckVal = selectedSize.neck;
        const shoulderVal = selectedSize.shoulder;
        const chestVal = selectedSize.chest;
        const lengthVal = selectedSize.length;
        const sleeveVal = selectedSize.sleeve_length;
        const sleeveWidthVal = selectedSize.sleeve;

        const neckWidth = getVal(neckVal, 15) * px_per_cm;
        const shoulderWidth = getVal(shoulderVal, 40) * px_per_cm;
        const chestWidth = getVal(chestVal, 50) * px_per_cm;
        const totalLength = getVal(lengthVal, 65) * px_per_cm;
        const sleeveLength = getVal(sleeveVal, 20) * px_per_cm;
        
        const armhole = 22 * px_per_cm;
        const shoulderDrop = 4 * px_per_cm;
        const neckDrop = 4 * px_per_cm;
        
        ctx.moveTo(centerX - neckWidth/2, startY);
        // Curved Neckline
        ctx.quadraticCurveTo(centerX, startY + neckDrop, centerX + neckWidth/2, startY);
        
        // Right shoulder
        ctx.lineTo(centerX + shoulderWidth/2, startY + shoulderDrop);
        
        const angle = currentSleeveAngle * Math.PI / 180;
        const rx1 = centerX + shoulderWidth/2 + sleeveLength * Math.cos(angle);
        const ry1 = startY + shoulderDrop + sleeveLength * Math.sin(angle);
        ctx.lineTo(rx1, ry1);
        
        const sleeveOpening = getVal(sleeveWidthVal, 16) * px_per_cm;
        const rx2 = rx1 - sleeveOpening * Math.sin(angle);
        const ry2 = ry1 + sleeveOpening * Math.cos(angle);
        ctx.lineTo(rx2, ry2);
        
        // Armpit curve
        ctx.quadraticCurveTo(centerX + chestWidth/2, startY + armhole - 2*px_per_cm, centerX + chestWidth/2, startY + armhole);
        
        // Right side seam
        ctx.quadraticCurveTo(centerX + chestWidth/2 - 1.5*px_per_cm, startY + armhole + (totalLength - armhole)/2, centerX + chestWidth/2, startY + totalLength);
        
        // Hem
        ctx.quadraticCurveTo(centerX, startY + totalLength + 1.5*px_per_cm, centerX - chestWidth/2, startY + totalLength);
        
        // Left side seam
        ctx.quadraticCurveTo(centerX - chestWidth/2 + 1.5*px_per_cm, startY + armhole + (totalLength - armhole)/2, centerX - chestWidth/2, startY + armhole);
        
        const lx2 = centerX - shoulderWidth/2 - sleeveLength * Math.cos(angle) + sleeveOpening * Math.sin(angle);
        const ly2 = startY + shoulderDrop + sleeveLength * Math.sin(angle) + sleeveOpening * Math.cos(angle);
        
        // Armpit curve
        ctx.quadraticCurveTo(centerX - chestWidth/2, startY + armhole - 2*px_per_cm, lx2, ly2);
        
        const lx1 = centerX - shoulderWidth/2 - sleeveLength * Math.cos(angle);
        const ly1 = startY + shoulderDrop + sleeveLength * Math.sin(angle);
        ctx.lineTo(lx1, ly1);
        
        ctx.lineTo(centerX - shoulderWidth/2, startY + shoulderDrop);
        
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (showDimLines) {
          drawDimLine(centerX - shoulderWidth/2, startY + shoulderDrop - 8, centerX + shoulderWidth/2, startY + shoulderDrop - 8, getLabel('어깨', shoulderVal), 0, -10, isMissing(shoulderVal));
          drawDimLine(centerX - chestWidth/2, startY + armhole + 15, centerX + chestWidth/2, startY + armhole + 15, getLabel('가슴', chestVal), 0, 0, isMissing(chestVal));
          drawDimLine(centerX, startY, centerX, startY + totalLength, getLabel('총장', lengthVal), 36, 0, isMissing(lengthVal));
          
          const sx1 = centerX + shoulderWidth/2;
          const sy1 = startY + shoulderDrop;
          const sx2 = sx1 + sleeveLength * Math.cos(angle);
          const sy2 = sy1 + sleeveLength * Math.sin(angle);
          drawDimLine(sx1, sy1 - 10, sx2, sy2 - 10, getLabel('소매길이', sleeveVal), 0, -12, isMissing(sleeveVal));
          
          const sleeveOpening = getVal(sleeveWidthVal, 16) * px_per_cm;
          const sx3 = sx2 - sleeveOpening * Math.sin(angle);
          const sy3 = sy2 + sleeveOpening * Math.cos(angle);
          // 소매단면 치수선 (살짝 옆으로 띄워서 표시)
          drawDimLine(sx2 + 5, sy2 + 5, sx3 + 5, sy3 + 5, getLabel('소매단면', sleeveWidthVal), 10, 0, isMissing(sleeveWidthVal));
          
          drawDimLine(centerX - neckWidth/2, startY - 10, centerX + neckWidth/2, startY - 10, getLabel('목폭', neckVal), 0, -10, isMissing(neckVal));
        }

      } else {
        const waistVal = selectedSize.waist;
        const thighVal = selectedSize.thigh;
        const lengthVal = selectedSize.length;
        const riseVal = selectedSize.rise;
        const hemVal = selectedSize.hem;

        const waistWidth = getVal(waistVal, 35) * px_per_cm;
        const thighWidth = getVal(thighVal, 25) * px_per_cm;
        const totalLength = getVal(lengthVal, 100) * px_per_cm;
        const riseLength = getVal(riseVal, 25) * px_per_cm;
        const hemWidth = getVal(hemVal, 20) * px_per_cm;

        ctx.moveTo(centerX - waistWidth/2, startY);
        // Waist curved slightly
        ctx.quadraticCurveTo(centerX, startY + 2*px_per_cm, centerX + waistWidth/2, startY);
        
        // Right outer hip curve
        ctx.quadraticCurveTo(centerX + thighWidth, startY + riseLength/2, centerX + thighWidth, startY + riseLength);
        ctx.lineTo(centerX + thighWidth/2 + hemWidth/2, startY + totalLength);
        
        // Right hem curve
        ctx.quadraticCurveTo(centerX + thighWidth/2, startY + totalLength + 1.5*px_per_cm, centerX + thighWidth/2 - hemWidth/2, startY + totalLength);
        
        // Crotch curve
        ctx.quadraticCurveTo(centerX + 2*px_per_cm, startY + riseLength, centerX, startY + riseLength);
        ctx.quadraticCurveTo(centerX - 2*px_per_cm, startY + riseLength, centerX - thighWidth/2 + hemWidth/2, startY + totalLength);
        
        // Left hem curve
        ctx.quadraticCurveTo(centerX - thighWidth/2, startY + totalLength + 1.5*px_per_cm, centerX - thighWidth/2 - hemWidth/2, startY + totalLength);
        ctx.lineTo(centerX - thighWidth, startY + riseLength);
        
        // Left outer hip curve
        ctx.quadraticCurveTo(centerX - thighWidth, startY + riseLength/2, centerX - waistWidth/2, startY);
        
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (showDimLines) {
          drawDimLine(centerX - waistWidth/2, startY - 10, centerX + waistWidth/2, startY - 10, getLabel('허리', waistVal), 0, -10, isMissing(waistVal));
          drawDimLine(centerX, startY + riseLength + 10, centerX + thighWidth, startY + riseLength + 10, getLabel('허벅지', thighVal), 0, 0, isMissing(thighVal));
          drawDimLine(centerX, startY, centerX, startY + riseLength, getLabel('밑위', riseVal), -36, 0, isMissing(riseVal));
          drawDimLine(centerX - thighWidth - 15, startY, centerX - thighWidth - 15, startY + totalLength, getLabel('총장', lengthVal), -36, 0, isMissing(lengthVal));
          drawDimLine(centerX + thighWidth/2 - hemWidth/2, startY + totalLength + 12, centerX + thighWidth/2 + hemWidth/2, startY + totalLength + 12, getLabel('밑단', hemVal), 0, 10, isMissing(hemVal));
        }
      }
      ctx.restore();
    }
    
    
    ctx.restore(); // Restore global translation

    // ── 가이드라인 시각화 (Height Visualization) - 드래그에 고정됨 ──
    if (showDimLines && avatar) {
      let heightRatioGuide = 1;
      if (avatar.measurements) {
        try {
          const mg = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
          if (mg && mg.height_ratio) heightRatioGuide = mg.height_ratio;
        } catch(e) {}
      }
      ctx.save();
      const guideX = CV_W - 15;
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      ctx.beginPath(); ctx.moveTo(guideX - 40, OFFSET_Y); ctx.lineTo(guideX, OFFSET_Y); ctx.stroke();

      const heelYg = OFFSET_Y + (DRAW_H / heightRatioGuide);
      ctx.beginPath(); ctx.moveTo(guideX - 40, heelYg); ctx.lineTo(guideX, heelYg); ctx.stroke();

      ctx.beginPath(); ctx.moveTo(guideX - 40, OFFSET_Y + DRAW_H); ctx.lineTo(guideX, OFFSET_Y + DRAW_H); ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('정수리 (0cm)', guideX - 45, OFFSET_Y + 3);
      ctx.fillText(`${avatar.height_cm}cm (발꿈치)`, guideX - 45, heelYg + 3);
      ctx.fillText('전체 이미지 끝 (발가락)', guideX - 45, OFFSET_Y + DRAW_H + 3);

      ctx.beginPath(); ctx.moveTo(guideX - 5, OFFSET_Y); ctx.lineTo(guideX - 5, OFFSET_Y + DRAW_H); ctx.stroke();
      ctx.restore();
    }
  }, [avatarImg, selectedSize, avatar, productInfo, showSizeOverlay, dragOffset, showDimLines, sleeveAngle]);

  // ── size list & fit badge helpers ─────────────────────────────────
  const getSizes = () => {
    if (!productInfo) return [];
    const isTop = productInfo.category?.name?.includes('상의') ?? true;
    return isTop ? (productInfo.top_sizes || []) : (productInfo.bottom_sizes || []);
  };

  const getAvatarMeasure = (key) => {
    if (!avatar?.measurements) return null;
    try {
      const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
      const arr = Array.isArray(m) ? m : (m?.items ?? []);
      return arr.find(item => item.key === key)?.value_cm ?? null;
    } catch(e) { return null; }
  };

  const fitBadge = (userVal, clothingVal) => {
    if (userVal == null || clothingVal == null) return null;
    const diff = userVal - clothingVal;
    const [label, color] =
      diff > 3  ? ['타이트', '#ef4444'] :
      diff < -5 ? ['루즈',   '#f59e0b'] :
                  ['적정',   '#22c55e'];
    return (
      <span style={{
        fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '20px',
        background: color + '20', color, border: `1px solid ${color}40`,
      }}>
        {label} ({diff >= 0 ? '+' : ''}{diff.toFixed(1)})
      </span>
    );
  };

  const isTop = productInfo?.category?.name?.includes('상의') ?? true;
  const fitPairs = isTop
    ? [
        { label: '어깨',     avatarKey: 'shoulder',  clothingKey: 'shoulder' },
        { label: '가슴',     avatarKey: 'chest',     clothingKey: 'chest' },
        { label: '소매길이', avatarKey: 'sleeve',    clothingKey: 'sleeve_length' },
        { label: '소매넓이', avatarKey: 'arm_width', clothingKey: 'sleeve' },
      ]
    : [
        { label: '허리',   avatarKey: 'waist',  clothingKey: 'waist' },
        { label: '허벅지', avatarKey: 'thigh',  clothingKey: 'thigh' },
      ];

  const getBase64ImageFromUrl = (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1024; // 이미지 크기를 줄여서 API 페이로드 초과 방지
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "#ffffff"; // 투명 배경을 흰색으로
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG로 압축하여 base64 크기 최소화
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };

      img.onerror = () => {
        // img 로드 실패 시 fetch 방식 폴백
        fetch(imageUrl)
          .then(res => res.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
          .catch(reject);
      };

      // 캐시 방지 처리
      img.src = imageUrl + "?t=" + new Date().getTime();
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;
    if (!apiKey) {
      alert("OpenRouter API Key를 입력해주세요.");
      return;
    }

    const userMessageText = inputMsg;
    const newMessages = [...messages, { sender: 'user', text: userMessageText }];
    setMessages(newMessages);
    setInputMsg('');
    setIsTyping(true);

    try {
      let productDetailsText = "상품 상세 정보가 아직 로드되지 않았습니다.";
      if (productInfo) {
        productDetailsText = `
[상품 기본 정보]
- 상품명: ${productInfo.name}
- 가격: ${productInfo.price ? productInfo.price.toLocaleString() : 0}원
- 카테고리: ${productInfo.category ? productInfo.category.name : '알 수 없음'}
- 브랜드: ${productInfo.brand || '알 수 없음'}
- 찜 개수: ${productInfo.wish_count || 0}개
- 평균 별점: ${productInfo.avg_rating || 0} / 5.0 (총 ${productInfo.review_count || 0}개 리뷰)

[고객 리뷰 요약]
`;
        if (productReviews && productReviews.length > 0) {
          // 토큰 절약을 위해 최근 리뷰 최대 10개만 전송
          const recentReviews = productReviews.slice(0, 10);
          productDetailsText += recentReviews.map((r, idx) => `${idx + 1}. 별점: ${r.rating}점, 내용: "${r.comment}"`).join('\n');
        } else {
          productDetailsText += "아직 등록된 리뷰가 없습니다.";
        }
      }

      const systemPrompt = `당신은 패션 쇼핑몰의 전문 AI 핏 어드바이저입니다. 
아래 제공된 [상품 메타 정보], [고객 리뷰(후기) 데이터], 그리고 사용자가 함께 전송한 [상품 이미지]들을 모두 꼼꼼히 분석하여 질문에 매우 친절하고 자연스럽게 답변해 주세요.

[답변 원칙]
1. 제공된 텍스트 데이터(가격, 사이즈, 별점, 리뷰/후기 등)와 이미지를 최대한 활용하여 사용자의 궁금증을 적극적으로 해결해 주세요. ('리뷰'와 '후기'는 완전히 같은 의미입니다.)
2. 사용자가 리뷰나 후기를 요약해달라고 하면, 제공된 리뷰 데이터를 바탕으로 전반적인 고객 반응(장단점, 핏감 등)을 보기 좋게 요약해 주세요.
3. 제공된 데이터(텍스트 및 이미지) 어디에서도 전혀 힌트를 찾을 수 없는 구체적인 스펙이나 치수에 대해서만 "해당 정보는 제공된 상세 페이지에서 확인할 수 없습니다"라고 정중히 답변하세요 (거짓 정보 생성 절대 금지).
4. 패션/스타일링 전문가처럼 부드럽고 친근한 대화체로 답변하세요.
5. **주의**: 글씨를 굵게 만드는 마크다운 기호(**)나 샵(#) 기호는 절대 사용하지 마세요. 대신 줄바꿈(엔터)과 하이픈(-), 숫자(1, 2)를 적절히 활용하여 단락을 나누어 아주 읽기 편하게 작성하세요.

${productDetailsText}
`;

      const apiMessages = [
        { role: 'system', content: systemPrompt },
      ];

      const history = newMessages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      // 마지막 사용자 메시지에 이미지를 포함시킴 (최신 질문에 대한 컨텍스트로 제공)
      if (productImages.length > 0) {
        const lastUserMsg = history[history.length - 1];
        lastUserMsg.content = [
          { type: "text", text: lastUserMsg.content },
          ...productImages.map(base64 => ({
            type: "image_url",
            image_url: { url: base64 }
          }))
        ];
      }

      apiMessages.push(...history);

      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini", // 비전(이미지) 처리를 지원하는 모델
          messages: apiMessages,
          temperature: 0.1 // 정보의 정확성을 위해 낮은 temperature 설정
        })
      })
        .then(res => {
          if (!res.ok) throw new Error("API 요청 실패");
          return res.json();
        })
        .then(data => {
          const botResponse = data.choices[0].message.content;
          setMessages(prev => [...prev, { sender: 'bot', text: botResponse }]);
          setIsTyping(false);
        })
        .catch(error => {
          console.error(error);
          setMessages(prev => [...prev, { sender: 'bot', text: '죄송합니다. 오류가 발생했습니다. API 키가 유효한지 확인해주세요.' }]);
          setIsTyping(false);
        });

    } catch (error) {
      console.error(error);
      setIsTyping(false);
    }
  };

  return (
    <div className="vf-page-wrapper">
      <header className="vf-header">
        <div className="vf-header-left">
          <button className="vf-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          {productInfo && (
            <div className="vf-product-info-header">
              <img
                src={`http://localhost:8000${productInfo.image_url}`}
                alt={productInfo.name}
                className="vf-header-thumb"
              />
              <div className="vf-header-details">
                <span className="vf-header-product-name">{productInfo.name}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="vf-main-content">
        {/* Left: 2D 가상 피팅 시뮬레이션 영역 */}
        <section className="vf-visualization-section">
          <div className="vf-visual-header">
            <Sparkles className="vf-icon" />
            <h3>2D 가상 피팅 시뮬레이션</h3>
          </div>

          <div className="vf-canvas-container" style={{ gap: '12px' }}>
            {/* ── overlay canvas ── */}
            {!userEmail ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>
                <User size={40} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '0.85rem' }}>로그인 후 아바타를 불러올 수 있습니다</p>
              </div>
            ) : !avatar && !avatarImg ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>
                <User size={40} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '0.85rem', margin: '0 0 10px' }}>저장된 아바타가 없습니다</p>
                <button
                  onClick={() => navigate('/mypage/body-measure')}
                  style={{ padding: '7px 16px', borderRadius: '10px', border: 'none', background: '#6366f1', color: 'white', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >신체 측정 하러 가기</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <canvas
                  ref={canvasRef}
                  width={CV_W}
                  height={CV_H}
                  style={{ borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 260px)', aspectRatio: `${CV_W} / ${CV_H}`, cursor: isDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUpOrLeave}
                  onMouseLeave={handleMouseUpOrLeave}
                  onDoubleClick={handleDoubleClick}
                />
                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
                  의류를 드래그해서 이동할 수 있습니다 (더블클릭 시 복귀)
                </p>
              </div>
            )}

            {/* ── size selector ── */}
            {getSizes().length > 0 && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>사이즈 선택</p>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={showSizeOverlay} 
                          onChange={(e) => setShowSizeOverlay(e.target.checked)} 
                          style={{ accentColor: '#6366f1' }}
                        />
                        핏 시각화
                      </label>
                      {showSizeOverlay && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={showDimLines} 
                            onChange={(e) => setShowDimLines(e.target.checked)} 
                            style={{ accentColor: '#ef4444' }}
                          />
                          치수선 보기
                        </label>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {getSizes().map(s => (
                    <button
                      key={s.size_name}
                      onClick={() => setSelectedSize(s)}
                      style={{
                        padding: '5px 13px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                        border: `1.5px solid ${selectedSize?.size_name === s.size_name ? '#6366f1' : '#e2e8f0'}`,
                        background: selectedSize?.size_name === s.size_name ? '#eef2ff' : 'white',
                        color: selectedSize?.size_name === s.size_name ? '#6366f1' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >{s.size_name}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── fit analysis for selected size ── */}
            {selectedSize && avatar?.measurements && (
              <div style={{ width: '100%', maxWidth: `${CV_W}px`, background: '#f8fafc', borderRadius: '12px', padding: '10px 14px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                  핏 분석 ({selectedSize.size_name})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {fitPairs.map(({ label, avatarKey, clothingKey }) => {
                    const userVal = getAvatarMeasure(avatarKey);
                    const clothingVal = selectedSize[clothingKey];
                    if (clothingVal == null) return null;
                    return (
                      <div key={clothingKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                        <span style={{ color: '#64748b', minWidth: '36px' }}>{label}</span>
                        <span style={{ color: '#475569' }}>
                          {userVal != null ? `내 ${userVal.toFixed(1)} / 의류 ${clothingVal}` : `의류 ${clothingVal} cm`}
                        </span>
                        {fitBadge(userVal, clothingVal)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right: AI 핏 상담 챗봇 영역 */}
        <section className="vf-chat-section">
          <div className="vf-chat-header">
            <div className="vf-chat-title">
              <MessageSquare className="vf-icon" />
              <h3>AI 핏 어드바이저</h3>
            </div>
            <div className="vf-api-key-container">
              <Key size={14} className="vf-api-key-icon" />
              <input
                type="password"
                placeholder="OpenRouter API Key 입력"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="vf-api-key-input"
              />
            </div>
          </div>

          <div className="vf-chat-window">
            <div className="vf-messages">
              {messages.map((msg, index) => (
                <div key={index} className={`vf-message-wrapper ${msg.sender}`}>
                  {msg.sender === 'bot' && (
                    <div className="vf-bot-avatar">
                      <Sparkles size={16} />
                    </div>
                  )}
                  <div className="vf-message-bubble">
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="vf-message-wrapper bot">
                  <div className="vf-bot-avatar">
                    <Sparkles size={16} />
                  </div>
                  <div className="vf-message-bubble typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>

            <form className="vf-chat-input-area" onSubmit={handleSendMessage}>
              <div className="vf-input-wrapper">
                <input
                  type="text"
                  placeholder="예: 어깨가 많이 낄까요? 총기장은 어디까지 오나요?"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                />
                <button type="submit" className="vf-send-btn" disabled={!inputMsg.trim()}>
                  <Send size={18} />
                </button>
              </div>
              <div className="vf-chat-notice">
                <Info size={12} />
                <span>상품 상세 정보와 고객님의 신체 치수를 비교 분석하여 답변합니다.</span>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

export default VirtualFitting;
