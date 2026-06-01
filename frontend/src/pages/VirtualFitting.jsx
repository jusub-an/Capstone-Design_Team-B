import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles, Ruler, MessageSquare, Info, User, Heart, ShoppingBag } from 'lucide-react';
import './ProductList.css';
import './VirtualFitting.css';

const BASE = 'http://localhost:8000';
const CV_W = 700, CV_H = 600;
const DRAW_H = CV_H * 0.9;
const OFFSET_Y = (CV_H - DRAW_H) / 2 + CV_H * 0.02;
const FILL_RATIO = 0.78;

// 팔 단면을 원으로 가정하여 둘레를 구하는 함수 (사용자 요청: 지름 * PI)
const estimateArmCircumference = (width) => {
  if (!width) return null;
  return parseFloat((width * Math.PI).toFixed(1));
};

function VirtualFitting() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { sender: 'bot', text: '안녕하세요! AI 핏 어드바이저입니다. 현재는 상품 상세 이미지를 기반으로 질문에 답변해 드립니다. 무엇이든 물어보세요!' }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [productImages, setProductImages] = useState([]);
  const [productInfo, setProductInfo] = useState(null);
  const [productReviews, setProductReviews] = useState([]);

  const username = sessionStorage.getItem('username') || 'User';
  const isLoggedIn = !!sessionStorage.getItem('token');
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const canvasRef = useRef(null);
  const userEmail = sessionStorage.getItem('userEmail');
  const [avatar, setAvatar] = useState(null);
  const [avatarImg, setAvatarImg] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [showSizeOverlay, setShowSizeOverlay] = useState(true);
  const [showDimLines, setShowDimLines] = useState(true);
  const [sleeveAngle, setSleeveAngle] = useState('auto');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

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

  const refreshCart = useCallback(() => {
    const email = sessionStorage.getItem('userEmail');
    if (!email) return;
    fetch(`http://localhost:8000/api/cart/${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : [])
      .then(items => { setCartItems(items); setCartCount(items.length); })
      .catch(() => {});
  }, []);

  const removeCartItem = async (itemId) => {
    const email = sessionStorage.getItem('userEmail');
    if (!email) return;
    await fetch(`http://localhost:8000/api/cart/${itemId}?user_email=${encodeURIComponent(email)}`, { method: 'DELETE' });
    refreshCart();
  };

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  useEffect(() => {
    if (!userEmail) return;
    fetch(`${BASE}/api/avatar/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : null)
      .then(setAvatar)
      .catch(() => {});
  }, [userEmail]);

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

  useEffect(() => {
    if (!avatar?.gray_mask_url) { setAvatarImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setAvatarImg(removeBackground(img, true));
    img.onerror = () => setAvatarImg(null);
    img.src = `${BASE}${avatar.gray_mask_url}`;
  }, [avatar, removeBackground]);

  useEffect(() => {
    if (!productInfo) return;
    const isTop = productInfo.category?.name?.includes('상의') ?? true;
    const sizes = isTop ? productInfo.top_sizes : productInfo.bottom_sizes;
    if (sizes?.length > 0) setSelectedSize(sizes[0]);
  }, [productInfo]);

  // 소매 및 다리 각도 자동 계산
  const getAutoSleeveAngle = useCallback((side = 'right') => {
    if (avatar && avatar.measurements) {
      try {
        const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
        const key = side === 'left' ? 'left_arm_angle' : 'right_arm_angle';
        if (m && m.anchors && m.anchors[key]) return m.anchors[key];
        if (m && m.items) {
          const armItem = m.items.find(i => i.key === key);
          if (armItem) return armItem.value_cm;
        }
        if (m && m.anchors && m.anchors.arm_angle) return m.anchors.arm_angle;
        if (m && m.items) {
          const armItem = m.items.find(i => i.key === 'arm_angle');
          if (armItem) return armItem.value_cm;
        }
      } catch(e) {}
    }
    if (productInfo?.category?.name?.includes('상의') && selectedSize) {
      const isShortSleeve = (selectedSize.sleeve_length || 0) < 30;
      return isShortSleeve ? 45 : 65;
    }
    return 65;
  }, [selectedSize, productInfo, avatar]);

  const getLegAngle = useCallback(() => {
    if (avatar && avatar.measurements) {
      try {
        const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
        if (m && m.anchors && m.anchors.leg_angle) return m.anchors.leg_angle;
        if (m && m.items) {
          const legItem = m.items.find(i => i.key === 'leg_angle');
          if (legItem) return legItem.value_cm;
        }
      } catch(e) {}
    }
    return 0;
  }, [avatar]);

  // 화면 우측(Screen Right)은 아바타의 실제 왼팔(Person's Left)
  const rightSleeveAngle = sleeveAngle === 'auto' ? getAutoSleeveAngle('left') : sleeveAngle;
  // 화면 좌측(Screen Left)은 아바타의 실제 오른팔(Person's Right)
  const leftSleeveAngle = sleeveAngle === 'auto' ? getAutoSleeveAngle('right') : sleeveAngle;

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
      const px_per_cm = DRAW_H / (avatar.height_cm * heightRatio);
      const isTop = productInfo?.category?.name?.includes('상의') ?? true;
      
      const centerX = CV_W / 2;
      const headHeight_cm = avatar.height_cm * 0.135; // 머리높이 아래에 어깨선이 시작
      const startY = isTop
        ? OFFSET_Y + headHeight_cm * px_per_cm
        : OFFSET_Y + avatar.height_cm * heightRatio * 0.42 * px_per_cm;

      const getVal = (val, defaultVal) => (val && val > 0) ? val : defaultVal;
      const getLabel = (name, val) => (val && val > 0) ? `${name} ${val}cm` : `${name} 정보 없음`;
      const isMissing = (val) => !(val && val > 0);

      const calcRenderWidth = (clothingFlat, userCirc, userFlat, defaultFlat) => {
        const flat = getVal(clothingFlat, defaultFlat);
        if (!userFlat) return flat * px_per_cm;
        
        if (userCirc) {
          const clothingCirc = flat * 2;
          const ease = clothingCirc - userCirc;
          if (ease < 0) {
            return userFlat * px_per_cm;
          } else {
            return (userFlat + ease / Math.PI) * px_per_cm;
          }
        } else {
          const ease = flat - userFlat;
          if (ease < 0) {
            return userFlat * px_per_cm;
          } else {
            return (userFlat + ease / 1.5) * px_per_cm;
          }
        }
      };

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
        
        const chestWidth = calcRenderWidth(chestVal, getAvatarMeasure('chest_circumference'), getAvatarMeasure('chest'), 50);
        
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
        
        const r_angle = rightSleeveAngle * Math.PI / 180;
        const l_angle = leftSleeveAngle * Math.PI / 180;
        
        const userArmWidth = getAvatarMeasure('arm_width') || 10;
        const userArmCirc = estimateArmCircumference(userArmWidth);
        const sleeveOpening = calcRenderWidth(sleeveWidthVal, userArmCirc, userArmWidth, 16);

        const avatarShoulder = getAvatarMeasure('shoulder') || getAvatarMeasure('shoulder_width') || 40;
        const A_sx = centerX + (avatarShoulder/2) * px_per_cm;
        const A_sy = startY + (avatarShoulder * 0.15) * px_per_cm;
        const armCenterShift = (userArmWidth / 2) * px_per_cm;
        
        const A_center_end_x = A_sx - armCenterShift * Math.sin(r_angle) + sleeveLength * Math.cos(r_angle);
        const A_center_end_y = A_sy + armCenterShift * Math.cos(r_angle) + sleeveLength * Math.sin(r_angle);

        const rx1 = A_center_end_x + (sleeveOpening/2) * Math.sin(r_angle);
        const ry1 = A_center_end_y - (sleeveOpening/2) * Math.cos(r_angle);
        ctx.lineTo(rx1, ry1);
        
        const rx2 = A_center_end_x - (sleeveOpening/2) * Math.sin(r_angle);
        const ry2 = A_center_end_y + (sleeveOpening/2) * Math.cos(r_angle);
        ctx.lineTo(rx2, ry2);
        
        // Armpit curve
        ctx.quadraticCurveTo(centerX + chestWidth/2, startY + armhole - 2*px_per_cm, centerX + chestWidth/2, startY + armhole);
        
        // Right side seam
        ctx.quadraticCurveTo(centerX + chestWidth/2 - 1.5*px_per_cm, startY + armhole + (totalLength - armhole)/2, centerX + chestWidth/2, startY + totalLength);
        
        // Hem
        ctx.quadraticCurveTo(centerX, startY + totalLength + 1.5*px_per_cm, centerX - chestWidth/2, startY + totalLength);
        
        // Left side seam
        ctx.quadraticCurveTo(centerX - chestWidth/2 + 1.5*px_per_cm, startY + armhole + (totalLength - armhole)/2, centerX - chestWidth/2, startY + armhole);
        
        const L_A_sx = centerX - (avatarShoulder/2) * px_per_cm;
        const L_A_sy = startY + (avatarShoulder * 0.15) * px_per_cm;
        const L_A_center_end_x = L_A_sx + armCenterShift * Math.sin(l_angle) - sleeveLength * Math.cos(l_angle);
        const L_A_center_end_y = L_A_sy + armCenterShift * Math.cos(l_angle) + sleeveLength * Math.sin(l_angle);

        const lx2 = L_A_center_end_x + (sleeveOpening/2) * Math.sin(l_angle);
        const ly2 = L_A_center_end_y + (sleeveOpening/2) * Math.cos(l_angle);
        
        // Armpit curve
        ctx.quadraticCurveTo(centerX - chestWidth/2, startY + armhole - 2*px_per_cm, lx2, ly2);
        
        const lx1 = L_A_center_end_x - (sleeveOpening/2) * Math.sin(l_angle);
        const ly1 = L_A_center_end_y - (sleeveOpening/2) * Math.cos(l_angle);
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
          const sx2 = sx1 + sleeveLength * Math.cos(r_angle);
          const sy2 = sy1 + sleeveLength * Math.sin(r_angle);
          drawDimLine(sx1, sy1 - 10, sx2, sy2 - 10, getLabel('소매길이', sleeveVal), 0, -12, isMissing(sleeveVal));
          
          const sx3 = sx2 - sleeveOpening * Math.sin(r_angle);
          const sy3 = sy2 + sleeveOpening * Math.cos(r_angle);
          drawDimLine(sx2 + 5, sy2 + 5, sx3 + 5, sy3 + 5, getLabel('소매단면', sleeveWidthVal), 10, 0, isMissing(sleeveWidthVal));
          
          drawDimLine(centerX - neckWidth/2, startY - 10, centerX + neckWidth/2, startY - 10, getLabel('목폭', neckVal), 0, -10, isMissing(neckVal));
        }

      } else {
        const waistVal = selectedSize.waist;
        const thighVal = selectedSize.thigh;
        const lengthVal = selectedSize.length;
        const riseVal = selectedSize.rise;
        const hemVal = selectedSize.hem;

        const waistWidth = calcRenderWidth(waistVal, getAvatarMeasure('waist_circumference'), getAvatarMeasure('waist'), 35);
        
        const thighWidth = calcRenderWidth(thighVal, getAvatarMeasure('thigh_circumference'), getAvatarMeasure('thigh'), 25);
        
        const totalLength = getVal(lengthVal, 100) * px_per_cm;
        const riseLength = getVal(riseVal, 25) * px_per_cm;
        const hemWidth = getVal(hemVal, 20) * px_per_cm;

        ctx.moveTo(centerX - waistWidth/2, startY);
        // Waist curved slightly
        ctx.quadraticCurveTo(centerX, startY + 2*px_per_cm, centerX + waistWidth/2, startY);
        
        const legAngleRad = getLegAngle() * Math.PI / 180;
        
        const rawThighWidth = getVal(thighVal, 25) * px_per_cm;
        const thighRatio = rawThighWidth > 0 ? (thighWidth / rawThighWidth) : 1;
        const renderHemWidth = getVal(hemVal, 20) * px_per_cm * Math.max(thighRatio, 0.4);

        const hemOffsetX = (totalLength - riseLength) * Math.sin(legAngleRad);
        const hemOffsetY = (totalLength - riseLength) * Math.cos(legAngleRad) - (totalLength - riseLength);
        
        const rightThighCenterX = centerX + thighWidth/2;
        const leftThighCenterX = centerX - thighWidth/2;
        
        const rightHemOuterX = rightThighCenterX + hemOffsetX + renderHemWidth/2;
        const rightHemInnerX = rightThighCenterX + hemOffsetX - renderHemWidth/2;
        const rightHemY = startY + totalLength + hemOffsetY;
        
        const leftHemOuterX = leftThighCenterX - hemOffsetX - renderHemWidth/2;
        const leftHemInnerX = leftThighCenterX - hemOffsetX + renderHemWidth/2;
        const leftHemY = startY + totalLength + hemOffsetY;

        // Right outer hip curve
        ctx.quadraticCurveTo(centerX + thighWidth, startY + riseLength/2, centerX + thighWidth, startY + riseLength);
        ctx.lineTo(rightHemOuterX, rightHemY);
        
        // Right hem curve
        ctx.quadraticCurveTo(rightThighCenterX + hemOffsetX, rightHemY + 1.5*px_per_cm, rightHemInnerX, rightHemY);
        
        // Crotch curve
        ctx.quadraticCurveTo(centerX + 2*px_per_cm, startY + riseLength, centerX, startY + riseLength);
        ctx.quadraticCurveTo(centerX - 2*px_per_cm, startY + riseLength, leftHemInnerX, leftHemY);
        
        // Left hem curve
        ctx.quadraticCurveTo(leftThighCenterX - hemOffsetX, leftHemY + 1.5*px_per_cm, leftHemOuterX, leftHemY);
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
    
    ctx.restore();

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

  const isTop = productInfo?.category?.name?.includes('상의') ?? true;
  
  // 핏 시각화 컴포넌트
  const FitVisualizer = ({ label, clothingVal, userCirc, userFlat, canBeCircumference }) => {
    if (!clothingVal) return null;
    
    let ease = 0;
    let statusText = '';
    let color = '';
    let percent = 50;
    let userDisplay = '';
    let clothDisplay = '';

    const useCirc = canBeCircumference && userCirc != null;

    if (useCirc) {
      const clothingCirc = clothingVal * 2;
      ease = clothingCirc - userCirc;
      userDisplay = `${userCirc}cm`;
      clothDisplay = `${clothingCirc}cm`;

      if (label === '가슴둘레') {
        if (ease < 2) { statusText = `타이트 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10; }
        else if (ease < 5) { statusText = `슬림핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#84cc16'; percent = 30; }
        else if (ease < 12) { statusText = `정핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50; }
        else if (ease < 15) { statusText = `세미 오버핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#3b82f6'; percent = 70; }
        else { statusText = `오버핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#8b5cf6'; percent = 90; }
      } else if (label === '팔둘레(소매)') {
        if (ease < 2) { statusText = `타이트 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10; }
        else if (ease < 5) { statusText = `슬림핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#84cc16'; percent = 30; }
        else if (ease < 10) { statusText = `정핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50; }
        else { statusText = `오버핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#8b5cf6'; percent = 90; }
      } else if (label === '허리둘레') {
        if (ease < 1) { statusText = `타이트 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10; }
        else if (ease < 3) { statusText = `정핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50; }
        else { statusText = `여유로움 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#3b82f6'; percent = 80; }
      } else if (label === '허벅지둘레') {
        if (ease < 2) { statusText = `타이트 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10; }
        else if (ease < 4) { statusText = `슬림핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#84cc16'; percent = 30; }
        else if (ease < 10) { statusText = `정핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50; }
        else { statusText = `와이드핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#8b5cf6'; percent = 90; }
      }
    } else {
      if (!userFlat) return null;
      ease = clothingVal - userFlat;
      userDisplay = `${userFlat}cm`;
      clothDisplay = `${clothingVal}cm`;

      if (label === '어깨너비') {
        if (ease < -1) { statusText = `타이트 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10; }
        else if (ease < 1) { statusText = `슬림핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#84cc16'; percent = 30; }
        else if (ease < 5) { statusText = `정핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50; }
        else { statusText = `오버핏/드롭숄더 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#8b5cf6'; percent = 90; }
      } else {
        // 상하의 총기장 단면 기준
        if (ease < 0) { statusText = `짧음/크롭 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10; }
        else if (ease < 3) { statusText = `저스트 기장 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#84cc16'; percent = 30; }
        else if (ease < 6) { statusText = `레귤러 기장 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50; }
        else { statusText = `여유/김 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#3b82f6'; percent = 80; }
      }
    }

    return (
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px' }}>
          <span style={{ fontWeight: 700, color: '#334155' }}>
            {label}
          </span>
          <span style={{ fontWeight: 800, color }}>{statusText}</span>
        </div>
        
        {/* 중앙 기준 핏 게이지 바 */}
        <div style={{ position: 'relative', height: '6px', background: '#e2e8f0', borderRadius: '3px', margin: '6px 0' }}>
          <div style={{ position: 'absolute', left: '50%', top: '-4px', bottom: '-4px', width: '2px', background: '#cbd5e1', zIndex: 1 }} />
          <div style={{ 
            position: 'absolute', top: 0, bottom: 0, 
            left: percent < 50 ? `${percent}%` : '50%', 
            right: percent > 50 ? `${100 - percent}%` : '50%',
            background: color, borderRadius: '3px', transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' 
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: `${percent}%`, transform: 'translate(-50%, -50%)',
            width: '12px', height: '12px', background: 'white', border: `3.5px solid ${color}`, borderRadius: '50%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', zIndex: 2, transition: 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
          }} />
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
          <span>타이트</span>
          <span style={{ marginLeft: '6px' }}>정핏</span>
          <span>여유로움</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
          <span>내 신체: <b>{userDisplay}</b></span>
          <span>옷 치수: <b>{clothDisplay}</b></span>
        </div>
      </div>
    );
  };

  const getBase64ImageFromUrl = (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1024;
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
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };

      img.onerror = () => {
        fetch(imageUrl)
          .then(res => {
            if (!res.ok) throw new Error("Image fetch failed");
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.startsWith('image/')) {
              throw new Error("Not an image");
            }
            return res.blob();
          })
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
          .catch(reject);
      };

      img.src = imageUrl + "?t=" + new Date().getTime();
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

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

`;

        const sizes = productInfo.category?.name?.includes('상의') ? productInfo.top_sizes : productInfo.bottom_sizes;
        if (sizes && sizes.length > 0) {
          productDetailsText += `[상품 사이즈표]\n` + sizes.map(s => {
            const parts = [`사이즈명: ${s.size_name}`];
            if (s.length) parts.push(`총장 ${s.length}cm`);
            if (s.shoulder) parts.push(`어깨 ${s.shoulder}cm`);
            if (s.chest) parts.push(`가슴단면 ${s.chest}cm`);
            if (s.sleeve) parts.push(`소매단면 ${s.sleeve}cm`);
            if (s.sleeve_length) parts.push(`소매길이 ${s.sleeve_length}cm`);
            if (s.neck) parts.push(`목폭 ${s.neck}cm`);
            if (s.waist) parts.push(`허리단면 ${s.waist}cm`);
            if (s.thigh) parts.push(`허벅지단면 ${s.thigh}cm`);
            if (s.rise) parts.push(`밑위 ${s.rise}cm`);
            if (s.hem) parts.push(`밑단단면 ${s.hem}cm`);
            return parts.join(', ');
          }).join('\n') + `\n\n`;
        }

        let userMeasurements = "신체 치수 정보 없음";
        if (avatar && avatar.measurements) {
          try {
            const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
            const items = Array.isArray(m) ? m : (m.items || []);
            if (items.length > 0) {
              userMeasurements = items.map(item => `${item.label}: ${item.value_cm}cm`).join(', ');
            }
          } catch(e) {}
        }
        productDetailsText += `[사용자 신체 치수]\n- ${userMeasurements}\n\n`;

        productDetailsText += `[고객 리뷰 요약]\n`;
        if (productReviews && productReviews.length > 0) {
          // 토큰 절약을 위해 최근 리뷰 최대 10개만 전송
          const recentReviews = productReviews.slice(0, 10);
          productDetailsText += recentReviews.map((r, idx) => `${idx + 1}. 별점: ${r.rating}점, 내용: "${r.comment}"`).join('\n');
        } else {
          productDetailsText += "아직 등록된 리뷰가 없습니다.";
        }
      }

      const systemPrompt = `당신은 사용자의 체형과 상품 데이터를 분석해 최적의 사이즈와 스타일을 추천해주는 '전문 AI 핏 어드바이저'입니다.
아래 제공된 [상품 메타 정보], [상품 사이즈표], [사용자 신체 치수], [고객 리뷰 데이터], [상품 이미지]를 종합적으로 분석하여 사용자의 질문에 답변해 주세요.

[핵심 역할 및 답변 원칙]
1. 맞춤형 핏 컨설팅: 사용자의 [신체 치수]와 [상품 사이즈표]를 구체적인 수치로 비교하여 직관적으로 설명해 주세요. (예: "고객님의 어깨 너비는 42cm이고, L 사이즈 어깨 단면은 45cm이므로 살짝 여유로운 핏이 예상됩니다.")
2. 데이터 기반 답변 (환각 방지): 제공된 정보(사이즈, 가격, 리뷰 등)와 이미지에서 확인할 수 없는 내용은 절대 추측하지 말고 "해당 정보는 제공된 상세 페이지에서 확인할 수 없습니다"라고 정중히 안내하세요.
3. 리뷰 적극 활용: 착용감이나 핏에 대한 질문을 받으면, 제공된 고객 리뷰 내용들의 긍정적인 반응이나 아쉬운 점 등을 근거로 들어 답변의 신뢰도를 높여주세요.
4. 전문적이고 친절한 톤: 백화점의 퍼스널 스타일리스트처럼 다정하고 센스 있는 말투를 사용하세요.
5. 가독성 높은 포맷: 마크다운 기호(**, # 등)는 화면에 그대로 노출되므로 절대 사용하지 마세요. 대신 줄바꿈과 하이픈(-), 번호(1. 2.)를 활용해 문단을 깔끔하게 나누어 답변하세요.

${productDetailsText}
`;

      const apiMessages = [
        { role: 'system', content: systemPrompt },
      ];

      const history = newMessages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      if (productImages.length > 0) {
        const validImages = productImages.filter(base64 => base64 && base64.startsWith('data:image/'));
        if (validImages.length > 0) {
          const lastUserMsg = history[history.length - 1];
          lastUserMsg.content = [
            { type: "text", text: lastUserMsg.content },
            ...validImages.map(base64 => ({
              type: "image_url",
              image_url: { url: base64 }
            }))
          ];
        }
      }

      apiMessages.push(...history);

      fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: apiMessages
        })
      })
        .then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "API 서버 에러");
          }
          return res.json();
        })
        .then(data => {
          let botResponse = data.choices[0].message.content;
          botResponse = botResponse.replace(/\*\*/g, '').replace(/#/g, '');
          setMessages(prev => [...prev, { sender: 'bot', text: botResponse }]);
          setIsTyping(false);
        })
        .catch(error => {
          console.error(error);
          setMessages(prev => [...prev, { sender: 'bot', text: `죄송합니다. 오류가 발생했습니다: ${error.message}` }]);
          setIsTyping(false);
        });

    } catch (error) {
      console.error(error);
      setIsTyping(false);
    }
  };

  return (
    <div className="vf-page-wrapper product-list-container" style={{ paddingBottom: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="product-header">
        <div className="logo-section" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <h2>Virtual Fitting</h2>
        </div>

        <div className="header-actions">
          <button className="action-icon-btn" onClick={() => navigate('/mypage/wishes')}>
            <Heart size={22} />
          </button>
          <div style={{ position: 'relative' }}>
            <button className="action-icon-btn" onClick={() => setCartOpen(o => !o)}>
              <ShoppingBag size={22} />
              {cartCount > 0 && <span className="badge">{cartCount}</span>}
            </button>
            {cartOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setCartOpen(false)} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: '300px', background: 'white', borderRadius: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid #e2e8f0',
                  zIndex: 99, overflow: 'hidden',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                    장바구니 {cartCount > 0 ? `(${cartCount})` : ''}
                  </div>
                  {cartItems.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>장바구니가 비어있습니다</div>
                  ) : (
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                      {cartItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
                          <img src={`http://localhost:8000${item.product.image_url}`} alt={item.product.name}
                            onClick={() => { setCartOpen(false); navigate(`/products/${item.product.id}`); }}
                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, cursor: 'pointer' }} />
                          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                            onClick={() => { setCartOpen(false); navigate(`/products/${item.product.id}`); }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</p>
                            {item.size_name && <span style={{ fontSize: '0.72rem', color: '#6366f1' }}>{item.size_name}</span>}
                          </div>
                          <button onClick={() => removeCartItem(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: '2px 4px', flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button onClick={() => { setCartOpen(false); navigate('/cart'); }}
                      style={{ width: '100%', padding: '9px', borderRadius: '10px', border: '1.5px solid #6366f1', background: 'white', color: '#6366f1', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      장바구니 보기
                    </button>
                    <button onClick={() => { setCartOpen(false); navigate('/mypage/fitting'); }}
                      style={{ width: '100%', padding: '9px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      가상 피팅룸에서 착용해보기
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {isLoggedIn ? (
            <div className="user-profile-wrapper">
              <div className="user-avatar" title="User Profile">
                {username.charAt(0).toUpperCase()}
              </div>
              <div className="dropdown-menu">
                <ul>
                  <li onClick={() => navigate('/mypage')}>마이페이지</li>
                  <li onClick={handleLogout} className="logout-action">로그아웃</li>
                </ul>
              </div>
            </div>
          ) : (
            <button className="login-header-button" onClick={() => navigate('/login')}>로그인</button>
          )}
        </div>
      </header>

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
        <section className="vf-fit-analysis-section">
          <div className="vf-visual-header">
            <Sparkles className="vf-icon" />
            <h3>정밀 핏 분석</h3>
          </div>
          <div className="vf-canvas-container" style={{ gap: '20px', background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
            {selectedSize && avatar?.measurements ? (
              <>
                <div style={{ width: '100%', background: '#ffffff', borderRadius: '14px', padding: '16px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
                  <p style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={16} color="#6366f1" /> 핏 가이드 지표
                  </p>
                  <div style={{ position: 'relative', height: '8px', borderRadius: '4px', display: 'flex', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{ flex: 1, background: '#ef4444' }} title="타이트" />
                    <div style={{ flex: 1, background: '#84cc16' }} title="슬림" />
                    <div style={{ flex: 1, background: '#22c55e' }} title="정핏" />
                    <div style={{ flex: 1, background: '#3b82f6' }} title="세미오버" />
                    <div style={{ flex: 1, background: '#8b5cf6' }} title="오버" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                    <span style={{ width: '20%', textAlign: 'center' }}>타이트</span>
                    <span style={{ width: '20%', textAlign: 'center' }}>슬림</span>
                    <span style={{ width: '20%', textAlign: 'center' }}>정핏</span>
                    <span style={{ width: '20%', textAlign: 'center' }}>세미오버</span>
                    <span style={{ width: '20%', textAlign: 'center' }}>오버</span>
                  </div>
                </div>

                <div style={{ width: '100%', background: '#ffffff', borderRadius: '14px', padding: '16px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
                  <p style={{ margin: '0 0 16px', fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={16} color="#6366f1" /> 정밀 핏 분석 ({selectedSize.size_name})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {isTop ? (
                      <>
                        <FitVisualizer label="어깨너비" clothingVal={selectedSize.shoulder} userCirc={null} userFlat={getAvatarMeasure('shoulder')} canBeCircumference={false} />
                        <FitVisualizer label="가슴둘레" clothingVal={selectedSize.chest} userCirc={getAvatarMeasure('chest_circumference')} userFlat={null} canBeCircumference={true} />
                        <FitVisualizer 
                          label="팔둘레(소매)" 
                          clothingVal={selectedSize.sleeve} 
                          userCirc={estimateArmCircumference(getAvatarMeasure('arm_width'))} 
                          userFlat={getAvatarMeasure('arm_width')} 
                          canBeCircumference={true} 
                        />
                        <FitVisualizer label="상체길이" clothingVal={selectedSize.length} userCirc={null} userFlat={getAvatarMeasure('top_length')} canBeCircumference={false} />
                      </>
                    ) : (
                      <>
                        <FitVisualizer label="허리둘레" clothingVal={selectedSize.waist} userCirc={getAvatarMeasure('waist_circumference')} userFlat={null} canBeCircumference={true} />
                        <FitVisualizer label="허벅지둘레" clothingVal={selectedSize.thigh} userCirc={getAvatarMeasure('thigh_circumference')} userFlat={null} canBeCircumference={true} />
                        <FitVisualizer label="하반신길이" clothingVal={selectedSize.length} userCirc={null} userFlat={getAvatarMeasure('bottom_length')} canBeCircumference={false} />
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                <Info size={32} style={{ marginBottom: '12px', color: '#cbd5e1' }} />
                <p style={{ fontSize: '0.85rem', margin: 0 }}>아바타를 로드하고 사이즈를 선택하면<br/>핏 분석 결과가 표시됩니다.</p>
              </div>
            )}
          </div>
        </section>

        <section className="vf-visualization-section">
          <div className="vf-visual-header">
            <Sparkles className="vf-icon" />
            <h3>2D 가상 피팅 시뮬레이션</h3>
          </div>

          <div className="vf-canvas-container" style={{ gap: '12px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', overflow: 'hidden' }}>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                  <canvas
                    ref={canvasRef}
                    width={CV_W}
                    height={CV_H}
                    style={{ borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: isDragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                    onDoubleClick={handleDoubleClick}
                  />
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', flexShrink: 0 }}>
                  의류를 드래그해서 이동할 수 있습니다 (더블클릭 시 복귀)
                </p>

                {getSizes().length > 0 && (
                  <div style={{ width: '100%', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 10px', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>사이즈 선택</p>
                      <div
                        onClick={() => setShowDimLines(!showDimLines)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, userSelect: 'none' }}>
                          치수선 표시
                        </span>
                        <div style={{ width: '36px', height: '20px', backgroundColor: showDimLines ? '#6366f1' : '#e2e8f0', borderRadius: '20px', position: 'relative', transition: 'background-color 0.2s ease-in-out', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
                          <div style={{
                            position: 'absolute', top: '2px', left: showDimLines ? '18px' : '2px',
                            width: '16px', height: '16px', backgroundColor: 'white',
                            borderRadius: '50%', transition: 'left 0.2s ease-in-out', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                          }} />
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {getSizes().map(s => (
                        <button
                          key={s.size_name}
                          onClick={() => setSelectedSize(s)}
                          style={{
                            padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
                            border: `1.5px solid ${selectedSize?.size_name === s.size_name ? '#6366f1' : '#e2e8f0'}`,
                            background: selectedSize?.size_name === s.size_name ? '#eef2ff' : 'white',
                            color: selectedSize?.size_name === s.size_name ? '#6366f1' : '#64748b',
                            cursor: 'pointer', transition: 'all 0.2s'
                          }}
                        >{s.size_name}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="vf-chat-section">
          <div className="vf-chat-header">
            <div className="vf-chat-title">
              <MessageSquare className="vf-icon" />
              <h3>AI 핏 어드바이저</h3>
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
                  <div className="vf-message-bubble" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
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
            <div ref={messagesEndRef} />
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
