import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Trash2, User, Shirt, ChevronDown, ChevronUp, RotateCcw, Heart, ShoppingBag, ShoppingCart, Layers } from 'lucide-react';
import './ProductList.css';
import './FittingRoom.css';
import FittingRoomGuide from '../components/FittingRoomGuide';
import { useToast } from '../contexts/ToastContext';

const BASE = 'http://localhost:8000';

const AVATAR_W = 220;
const AVATAR_H = 550;

function estimateArmCircumference(width) {
  if (!width) return null;
  const a = width / 2;
  const b = (width * 0.85) / 2;
  return parseFloat((2 * Math.PI * Math.sqrt((a * a + b * b) / 2)).toFixed(1));
}

function getHeightRatio(avatar) {
  if (!avatar?.measurements) return 1;
  try {
    const m = typeof avatar.measurements === 'string'
      ? JSON.parse(avatar.measurements)
      : avatar.measurements;
    return (m && m.height_ratio) ? m.height_ratio : 1;
  } catch { return 1; }
}
function getAvatarMeasureObj(avatar, key) {
  if (!avatar?.measurements) return null;
  try {
    const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
    const arr = Array.isArray(m) ? m : (m?.items ?? []);
    return arr.find(item => item.key === key)?.value_cm ?? null;
  } catch(e) { return null; }
}

function getLegAngleObj(avatar) {
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
}

function getAutoSleeveAngleObj(avatar, sizeInfo, side = 'right') {
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
  if (sizeInfo) {
    const isShortSleeve = (sizeInfo.sleeve_length || 0) < 30;
    return isShortSleeve ? 45 : 65;
  }
  return 65;
}

function drawClothingPolygon(ctx, centerX, startY, sizeInfo, pxPerCm, isTop, isSelected, avatar, showDimLines) {
  const getVal = (v, def) => (v && v > 0) ? v : def;
  const getLabel = (name, val) => (val && val > 0) ? `${name} ${val}cm` : `${name} 정보 없음`;
  const isMissing = (val) => !(val && val > 0);

  const calcRenderWidth = (clothingFlat, userCirc, userFlat, defaultFlat) => {
    const flat = getVal(clothingFlat, defaultFlat);
    if (!userFlat) return flat * pxPerCm;
    if (userCirc) {
      const clothingCirc = flat * 2;
      const ease = clothingCirc - userCirc;
      if (ease < 0) return userFlat * pxPerCm;
      else return (userFlat + ease / Math.PI) * pxPerCm;
    } else {
      const ease = flat - userFlat;
      if (ease < 0) return userFlat * pxPerCm;
      else return (userFlat + ease / 1.5) * pxPerCm;
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
    if (ctx.roundRect) ctx.roundRect(mx - bgWidth/2, my - bgHeight/2, bgWidth, bgHeight, 8);
    else ctx.rect(mx - bgWidth/2, my - bgHeight/2, bgWidth, bgHeight);
    ctx.fill();
    ctx.strokeStyle = missing ? 'rgba(209, 213, 219, 1)' : 'rgba(252, 165, 165, 1)';
    ctx.stroke();
    
    ctx.fillStyle = missing ? '#6b7280' : '#ef4444';
    ctx.fillText(text, mx, my);
    ctx.restore();
  };

  ctx.save();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.fillStyle = isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.15)';
  ctx.beginPath();

  if (isTop) {
    const neckVal = sizeInfo.neck;
    const shoulderVal = sizeInfo.shoulder;
    const chestVal = sizeInfo.chest;
    const lengthVal = sizeInfo.length;
    const sleeveVal = sizeInfo.sleeve_length;
    const sleeveWidthVal = sizeInfo.sleeve;

    const neckWidth = getVal(neckVal, 15) * pxPerCm;
    const shoulderWidth = getVal(shoulderVal, 40) * pxPerCm;
    
    const chestWidth = calcRenderWidth(chestVal, getAvatarMeasureObj(avatar, 'chest_circumference'), getAvatarMeasureObj(avatar, 'chest'), 50);
    
    const totalLength = getVal(lengthVal, 65) * pxPerCm;
    const sleeveLength = getVal(sleeveVal, 20) * pxPerCm;
    const armhole = 22 * pxPerCm;
    const shoulderDrop = 4 * pxPerCm;
    const neckDrop = 4 * pxPerCm;
    
    ctx.moveTo(centerX - neckWidth/2, startY);
    ctx.quadraticCurveTo(centerX, startY + neckDrop, centerX + neckWidth/2, startY);
    ctx.lineTo(centerX + shoulderWidth/2, startY + shoulderDrop);
    
    // 화면 우측(Screen Right)은 아바타의 실제 왼팔(Person's Left)
    const rightSleeveAngle = getAutoSleeveAngleObj(avatar, sizeInfo, 'left');
    // 화면 좌측(Screen Left)은 아바타의 실제 오른팔(Person's Right)
    const leftSleeveAngle = getAutoSleeveAngleObj(avatar, sizeInfo, 'right');
    const r_angle = rightSleeveAngle * Math.PI / 180;
    const l_angle = leftSleeveAngle * Math.PI / 180;

    const userArmWidth = getAvatarMeasureObj(avatar, 'arm_width') || 10;
    const userArmCirc = estimateArmCircumference(userArmWidth);
    const sleeveOpening = calcRenderWidth(sleeveWidthVal, userArmCirc, userArmWidth, 16);

    const avatarShoulder = getAvatarMeasureObj(avatar, 'shoulder') || getAvatarMeasureObj(avatar, 'shoulder_width') || 40;
    const A_sx = centerX + (avatarShoulder/2) * pxPerCm;
    const A_sy = startY + (avatarShoulder * 0.15) * pxPerCm;
    const armCenterShift = (userArmWidth / 2) * pxPerCm;
    
    const A_center_end_x = A_sx - armCenterShift * Math.sin(r_angle) + sleeveLength * Math.cos(r_angle);
    const A_center_end_y = A_sy + armCenterShift * Math.cos(r_angle) + sleeveLength * Math.sin(r_angle);

    const rx1 = A_center_end_x + (sleeveOpening/2) * Math.sin(r_angle);
    const ry1 = A_center_end_y - (sleeveOpening/2) * Math.cos(r_angle);
    ctx.lineTo(rx1, ry1);
    
    const rx2 = A_center_end_x - (sleeveOpening/2) * Math.sin(r_angle);
    const ry2 = A_center_end_y + (sleeveOpening/2) * Math.cos(r_angle);
    ctx.lineTo(rx2, ry2);
    
    ctx.quadraticCurveTo(centerX + chestWidth/2, startY + armhole - 2*pxPerCm, centerX + chestWidth/2, startY + armhole);
    ctx.quadraticCurveTo(centerX + chestWidth/2 - 1.5*pxPerCm, startY + armhole + (totalLength - armhole)/2, centerX + chestWidth/2, startY + totalLength);
    ctx.quadraticCurveTo(centerX, startY + totalLength + 1.5*pxPerCm, centerX - chestWidth/2, startY + totalLength);
    ctx.quadraticCurveTo(centerX - chestWidth/2 + 1.5*pxPerCm, startY + armhole + (totalLength - armhole)/2, centerX - chestWidth/2, startY + armhole);
    
    const L_A_sx = centerX - (avatarShoulder/2) * pxPerCm;
    const L_A_sy = startY + (avatarShoulder * 0.15) * pxPerCm;
    const L_A_center_end_x = L_A_sx + armCenterShift * Math.sin(l_angle) - sleeveLength * Math.cos(l_angle);
    const L_A_center_end_y = L_A_sy + armCenterShift * Math.cos(l_angle) + sleeveLength * Math.sin(l_angle);

    const lx2 = L_A_center_end_x + (sleeveOpening/2) * Math.sin(l_angle);
    const ly2 = L_A_center_end_y + (sleeveOpening/2) * Math.cos(l_angle);
    ctx.quadraticCurveTo(centerX - chestWidth/2, startY + armhole - 2*pxPerCm, lx2, ly2);
    
    const lx1 = L_A_center_end_x - (sleeveOpening/2) * Math.sin(l_angle);
    const ly1 = L_A_center_end_y - (sleeveOpening/2) * Math.cos(l_angle);
    ctx.lineTo(lx1, ly1);
    ctx.lineTo(centerX - shoulderWidth/2, startY + shoulderDrop);
    
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (showDimLines && isSelected) {
      drawDimLine(centerX - shoulderWidth/2, startY + shoulderDrop - 8, centerX + shoulderWidth/2, startY + shoulderDrop - 8, getLabel('어깨', shoulderVal), 0, -10, isMissing(shoulderVal));
      drawDimLine(centerX - chestWidth/2, startY + armhole + 15, centerX + chestWidth/2, startY + armhole + 15, getLabel('가슴', chestVal), 0, 0, isMissing(chestVal));
      drawDimLine(centerX, startY, centerX, startY + totalLength, getLabel('총장', lengthVal), 36, 0, isMissing(lengthVal));
      
      const sx1 = centerX + shoulderWidth/2;
      const sy1 = startY + shoulderDrop;
      const sx2 = sx1 + sleeveLength * Math.cos(r_angle);
      const sy2 = sy1 + sleeveLength * Math.sin(r_angle);
      drawDimLine(sx1, sy1 - 10, sx2, sy2 - 10, getLabel('소매길이', sizeInfo.sleeve_length), 0, -12, isMissing(sizeInfo.sleeve_length));
      
      const sx3 = sx2 - sleeveOpening * Math.sin(r_angle);
      const sy3 = sy2 + sleeveOpening * Math.cos(r_angle);
      drawDimLine(sx2 + 5, sy2 + 5, sx3 + 5, sy3 + 5, getLabel('소매단면', sleeveWidthVal), 10, 0, isMissing(sleeveWidthVal));
      drawDimLine(centerX - neckWidth/2, startY - 10, centerX + neckWidth/2, startY - 10, getLabel('목폭', neckVal), 0, -10, isMissing(neckVal));
    }
  } else {
    const waistVal = sizeInfo.waist;
    const thighVal = sizeInfo.thigh;
    const lengthVal = sizeInfo.length;
    const riseVal = sizeInfo.rise;
    const hemVal = sizeInfo.hem;

    const waistWidth = calcRenderWidth(waistVal, getAvatarMeasureObj(avatar, 'waist_circumference'), getAvatarMeasureObj(avatar, 'waist'), 35);
    const thighWidth = calcRenderWidth(thighVal, getAvatarMeasureObj(avatar, 'thigh_circumference'), getAvatarMeasureObj(avatar, 'thigh'), 25);
    const totalLength = getVal(lengthVal, 100) * pxPerCm;
    const riseLength = getVal(riseVal, 25) * pxPerCm;
    const hemWidth = getVal(hemVal, 20) * pxPerCm;

    ctx.moveTo(centerX - waistWidth/2, startY);
    ctx.quadraticCurveTo(centerX, startY + 2*pxPerCm, centerX + waistWidth/2, startY);
    
    const legAngleRad = getLegAngleObj(avatar) * Math.PI / 180;
    
    const rawThighWidth = getVal(thighVal, 25) * pxPerCm;
    const thighRatio = rawThighWidth > 0 ? (thighWidth / rawThighWidth) : 1;
    const renderHemWidth = getVal(hemVal, 20) * pxPerCm * Math.max(thighRatio, 0.4);

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

    ctx.quadraticCurveTo(centerX + thighWidth, startY + riseLength/2, centerX + thighWidth, startY + riseLength);
    ctx.lineTo(rightHemOuterX, rightHemY);
    ctx.quadraticCurveTo(rightThighCenterX + hemOffsetX, rightHemY + 1.5*pxPerCm, rightHemInnerX, rightHemY);
    ctx.quadraticCurveTo(centerX + 2*pxPerCm, startY + riseLength, centerX, startY + riseLength);
    ctx.quadraticCurveTo(centerX - 2*pxPerCm, startY + riseLength, leftHemInnerX, leftHemY);
    ctx.quadraticCurveTo(leftThighCenterX - hemOffsetX, leftHemY + 1.5*pxPerCm, leftHemOuterX, leftHemY);
    ctx.lineTo(centerX - thighWidth, startY + riseLength);
    ctx.quadraticCurveTo(centerX - thighWidth, startY + riseLength/2, centerX - waistWidth/2, startY);
    
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (showDimLines && isSelected) {
      drawDimLine(centerX - waistWidth/2, startY - 10, centerX + waistWidth/2, startY - 10, getLabel('허리', waistVal), 0, -10, isMissing(waistVal));
      drawDimLine(centerX, startY + riseLength + 10, centerX + thighWidth, startY + riseLength + 10, getLabel('허벅지', thighVal), 0, 0, isMissing(thighVal));
      drawDimLine(centerX, startY, centerX, startY + riseLength, getLabel('밑위', riseVal), -36, 0, isMissing(riseVal));
      drawDimLine(centerX - thighWidth - 15, startY, centerX - thighWidth - 15, startY + totalLength, getLabel('총장', lengthVal), -36, 0, isMissing(lengthVal));
      drawDimLine(centerX + thighWidth/2 - hemWidth/2, startY + totalLength + 12, centerX + thighWidth/2 + hemWidth/2, startY + totalLength + 12, getLabel('밑단', hemVal), 0, 10, isMissing(hemVal));
    }
  }
  ctx.restore();
}

const CANVAS_W = 700;
const CANVAS_H = 600;
const DRAW_H = CANVAS_H * 0.9;       
const OFFSET_Y = (CANVAS_H - DRAW_H) / 2 + CANVAS_H * 0.02; 
const FILL_RATIO = 0.78;              

function FittingRoom() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const userEmail = sessionStorage.getItem('userEmail');

  const [avatar, setAvatar] = useState(null);           // {gray_mask_url, person_extracted_url, measurements, height_cm}
  const [avatarImg, setAvatarImg] = useState(null);     // loaded Image object
  const [showDimLines, setShowDimLines] = useState(true);

  const [cartItems, setCartItems] = useState([]);
  const [layers, setLayers] = useState([]);
  /* layer shape:
    { id, product_id, product_name, size_name, image_url, fitting_image_url,
      visible, x, y, scale, autoFitParams,
      img: Image | null, imgLoading: bool }
  */

  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [loadingAvatar, setLoadingAvatar] = useState(true);
  const [loadingCart, setLoadingCart] = useState(true);
  const [preparingLayer, setPreparingLayer] = useState(null); // product_id being prepared
  const [cartOpen, setCartOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!userEmail) { setLoadingAvatar(false); return; }
    fetch(`${BASE}/api/avatar/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setAvatar(data); setLoadingAvatar(false); })
      .catch(() => setLoadingAvatar(false));
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
    if (!avatar) { setAvatarImg(null); return; }
    const url = avatar.gray_mask_url;
    if (!url) { setAvatarImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setAvatarImg(removeBackground(img, true));
    img.onerror = () => setAvatarImg(null);
    img.src = `${BASE}${url}`;
  }, [avatar, removeBackground]);

  const refreshCart = useCallback(() => {
    if (!userEmail) { setLoadingCart(false); return; }
    fetch(`${BASE}/api/cart/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : [])
      .then(items => { setCartItems(items); setLoadingCart(false); })
      .catch(() => setLoadingCart(false));
  }, [userEmail]);

  const removeCartItem = async (itemId) => {
    if (!userEmail) return;
    await fetch(`${BASE}/api/cart/${itemId}?user_email=${encodeURIComponent(userEmail)}`, { method: 'DELETE' });
    refreshCart();
  };

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const computeAutoFit = useCallback((img, autoFitParams) => {
    const { height_cm, length_cm, isTop = true } = autoFitParams || {};
    let scale;

    if (height_cm && length_cm) {
      const pxPerCm = DRAW_H / height_cm;
      scale = (length_cm * pxPerCm) / (img.height * FILL_RATIO);
    } else if (height_cm) {
      const ratio = isTop ? 0.28 : 0.32;
      scale = (DRAW_H * ratio) / (img.height * FILL_RATIO);
    } else {
      scale = (CANVAS_W * 0.55) / img.width;
    }

    scale = Math.max(0.05, Math.min(1.5, scale));
    const x = (CANVAS_W - img.width * scale) / 2;
    const posYRatio = isTop ? 0.13 : 0.42;
    const y = OFFSET_Y + DRAW_H * posYRatio;

    return { x, y, scale };
  }, []);

  const loadLayerImage = useCallback((layerId, imgUrl, autoFitParams) => {
    const img = new Image();
    img.onload = () => {
      const { x, y, scale } = computeAutoFit(img, autoFitParams);
      setLayers(prev => prev.map(l =>
        l.id === layerId ? { ...l, img, imgLoading: false, x, y, scale } : l
      ));
    };
    img.onerror = () => {
      setLayers(prev => prev.map(l =>
        l.id === layerId ? { ...l, imgLoading: false } : l
      ));
    };
    img.src = imgUrl.startsWith('http') ? imgUrl : `${BASE}${imgUrl}`;
  }, [computeAutoFit]);

  const addLayer = async (cartItem) => {
    const already = layers.find(l =>
      l.product_id === cartItem.product_id && l.size_name === cartItem.size_name
    );
    if (already) return;

    const p = cartItem.product;

    const isTop = p?.category?.name?.includes('상의') ?? true;
    const sizes = isTop ? p.top_sizes : p.bottom_sizes;
    const sizeInfo = sizes?.find(s => s.size_name === cartItem.size_name);

    const willUsePolygon = !!(sizeInfo && avatar?.height_cm);
    let fittingUrl = p.fitting_image_url;

    if (!fittingUrl && !willUsePolygon) {
      setPreparingLayer(cartItem.product_id);
      try {
        const res = await fetch(`${BASE}/api/products/${cartItem.product_id}/prepare-fitting`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          fittingUrl = data.fitting_image_url;
        }
      } catch (e) {
        console.error('prepare-fitting failed', e);
      }
      setPreparingLayer(null);
    }
    const autoFitParams = {
      height_cm: avatar?.height_cm || null,
      length_cm: sizeInfo?.length || null,
      isTop,
    };

    const isPolygon = !!(sizeInfo && avatar?.height_cm);

    let initX, initY, initScale;
    if (isPolygon) {
      const heightRatio = getHeightRatio(avatar);
      const pxPerCm = DRAW_H / (avatar.height_cm * heightRatio);
      const headH = avatar.height_cm * 0.135;
      initX     = CANVAS_W / 2;
      initY     = isTop
        ? OFFSET_Y + headH * pxPerCm
        : OFFSET_Y + avatar.height_cm * heightRatio * 0.42 * pxPerCm;
      initScale = 1.0;
    } else {
      initX     = CANVAS_W / 2 - 60;
      initY     = OFFSET_Y + DRAW_H * (isTop ? 0.13 : 0.42);
      initScale = 0.25;
    }

    const layerId = `${cartItem.product_id}_${cartItem.size_name || 'nosize'}_${Date.now()}`;
    const newLayer = {
      id: layerId,
      product_id: cartItem.product_id,
      cart_item_id: cartItem.id,
      product_name: p.name,
      size_name: cartItem.size_name,
      image_url: p.image_url,
      fitting_image_url: fittingUrl,
      visible: true,
      x: initX,
      y: initY,
      scale: initScale,
      autoFitParams,
      isPolygon,
      sizeInfo: sizeInfo || null,
      img: null,
      imgLoading: !isPolygon,
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(layerId);

    if (!isPolygon) {
      const imgSrc = fittingUrl || p.image_url;
      loadLayerImage(layerId, imgSrc, autoFitParams);
    }
    showToast('착용됐습니다', 'success');
  };

  const removeLayer = (layerId) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (selectedLayerId === layerId) setSelectedLayerId(null);
    showToast('제거됐습니다', 'info');
  };

  const toggleVisible = (layerId) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  };

  const changeLayerSize = (layer, newSizeName) => {
    const cartItem = cartItems.find(c => c.id === layer.cart_item_id);
    const sizes = cartItem?.product?.top_sizes?.length > 0
      ? cartItem.product.top_sizes
      : cartItem?.product?.bottom_sizes ?? [];
    const newSizeInfo = sizes.find(s => s.size_name === newSizeName);
    setLayers(prev => prev.map(l =>
      l.id === layer.id ? { ...l, size_name: newSizeName, sizeInfo: newSizeInfo } : l
    ));
    showToast(`피팅 사이즈가 ${newSizeName}로 변경됐습니다`, 'success');
  };

  const resetLayerPosition = (layerId) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      if (l.isPolygon && avatar?.height_cm) {
        const heightRatio = getHeightRatio(avatar);
        const pxPerCm = DRAW_H / (avatar.height_cm * heightRatio);
        const isTop = l.autoFitParams?.isTop ?? true;
        const headH = avatar.height_cm * 0.135;
        return {
          ...l,
          x: CANVAS_W / 2,
          y: isTop
            ? OFFSET_Y + headH * pxPerCm
            : OFFSET_Y + avatar.height_cm * heightRatio * 0.42 * pxPerCm,
          scale: 1.0,
        };
      }
      if (l.img && l.autoFitParams) {
        const { x, y, scale } = computeAutoFit(l.img, l.autoFitParams);
        return { ...l, x, y, scale };
      }
      return { ...l, x: CANVAS_W / 2 - 60, y: OFFSET_Y + DRAW_H * 0.13, scale: 0.25 };
    }));
  };

  const scaleLayer = (layerId, delta) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const min = l.isPolygon ? 0.5 : 0.3;
      const max = l.isPolygon ? 2.0 : 3.0;
      return { ...l, scale: Math.max(min, Math.min(max, l.scale + delta)) };
    }));
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    if (avatarImg) {
      const aspect = avatarImg.width / avatarImg.height;
      const drawH = H * 0.9;
      const drawW = drawH * aspect;
      const offsetX = (W - drawW) / 2;
      const offsetY = (H - drawH) / 2 + H * 0.02;
      ctx.drawImage(avatarImg, offsetX, offsetY, drawW, drawH);
    } else {
      ctx.fillStyle = '#e2e8f0';
      const sw = AVATAR_W * 0.55;
      const sh = AVATAR_H * 0.85;
      const sx = (W - sw) / 2;
      const sy = (H - sh) / 2;
      ctx.beginPath();
      ctx.ellipse(sx + sw / 2, sy + 40, sw * 0.28, 35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx + sw * 0.15, sy + 70, sw * 0.7, sh - 70);
    }

    layers.forEach(layer => {
      if (!layer.visible) return;

      if (layer.isPolygon && layer.sizeInfo && avatar?.height_cm) {
        const heightRatio = getHeightRatio(avatar);
        const pxPerCm = (DRAW_H / (avatar.height_cm * heightRatio)) * layer.scale;
        const isTop = layer.autoFitParams?.isTop ?? true;
        drawClothingPolygon(
          ctx,
          layer.x,   // centerX
          layer.y,   // startY
          layer.sizeInfo,
          pxPerCm,
          isTop,
          layer.id === selectedLayerId,
          avatar,
          showDimLines
        );


        return;
      }

      if (!layer.img) return;
      const imgW = layer.img.width * layer.scale;
      const imgH = layer.img.height * layer.scale;
      ctx.drawImage(layer.img, layer.x, layer.y, imgW, imgH);


    });

    if (showDimLines && avatar) {
      let heightRatioGuide = 1;
      if (avatar.measurements) {
        try {
          const mg = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
          if (mg && mg.height_ratio) heightRatioGuide = mg.height_ratio;
        } catch(e) {}
      }
      ctx.save();
      const guideX = W - 15;
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
  }, [avatarImg, layers, selectedLayerId, avatar, showDimLines]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getLayerAtPoint = useCallback((px, py) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (!l.visible) continue;

      if (l.isPolygon && l.sizeInfo && avatar?.height_cm) {
        const heightRatio = getHeightRatio(avatar);
        const pxPerCm = (DRAW_H / (avatar.height_cm * heightRatio)) * l.scale;
        const isTop = l.autoFitParams?.isTop ?? true;
        const getVal = (v, d) => (v && v > 0) ? v : d;
        const halfW = getVal(isTop ? l.sizeInfo.chest : l.sizeInfo.waist, isTop ? 50 : 35) / 2 * pxPerCm;
        const totH  = getVal(l.sizeInfo.length, isTop ? 65 : 100) * pxPerCm;
        if (px >= l.x - halfW && px <= l.x + halfW && py >= l.y && py <= l.y + totH) {
          return l;
        }
        continue;
      }

      if (!l.img) continue;
      const imgW = l.img.width * l.scale;
      const imgH = l.img.height * l.scale;
      if (px >= l.x && px <= l.x + imgW && py >= l.y && py <= l.y + imgH) {
        return l;
      }
    }
    return null;
  }, [layers, avatar]);

  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onMouseDown = (e) => {
    const { x, y } = getCanvasPos(e);
    const hit = getLayerAtPoint(x, y);
    if (hit) {
      setSelectedLayerId(hit.id);
      setDragging(true);
      setDragOffset({ x: x - hit.x, y: y - hit.y });
    } else {
      setSelectedLayerId(null);
    }
  };

  const onMouseMove = (e) => {
    if (!dragging || !selectedLayerId) return;
    e.preventDefault();
    const { x, y } = getCanvasPos(e);
    setLayers(prev => prev.map(l =>
      l.id === selectedLayerId
        ? { ...l, x: x - dragOffset.x, y: y - dragOffset.y }
        : l
    ));
  };

  const onMouseUp = () => setDragging(false);




  const isLoggedIn = !!sessionStorage.getItem('token');

  const username = sessionStorage.getItem('username') || 'User';

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  return (
    <div className="product-list-container" style={{ height: '100vh', paddingBottom: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* 공통 헤더 */}
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
              {cartItems.length > 0 && <span className="badge">{cartItems.length}</span>}
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
                    장바구니 {cartItems.length > 0 ? `(${cartItems.length})` : ''}
                  </div>
                  {cartItems.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>장바구니가 비어있습니다</div>
                  ) : (
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                      {cartItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
                          <img src={`${BASE}${item.product.image_url}`} alt={item.product.name}
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
                    <button onClick={() => { setCartOpen(false); navigate('/products'); }}
                      style={{ width: '100%', padding: '9px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      가상 피팅룸 닫기
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
      <div className="fr-body">
        {/* Canvas area */}
        <div className="fr-canvas-area">
          {loadingAvatar ? (
            <p style={{ color: '#94a3b8' }}>아바타 불러오는 중...</p>
          ) : !avatar ? (
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <User size={48} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
              <p style={{ fontWeight: 600 }}>저장된 아바타가 없습니다</p>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px' }}>먼저 신체 측정 후 아바타를 저장해 주세요</p>
              <button
                onClick={() => navigate('/mypage/body-measure')}
                style={{
                  padding: '10px 24px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer',
                }}
              >신체 측정 하러 가기</button>
            </div>
          ) : (
            <div className="fr-canvas-wrap">
              {preparingLayer && (
                <div className="fr-preparing-overlay">
                  <div className="fr-preparing-spinner" />
                  <p className="fr-preparing-text">의류 이미지 준비 중...</p>
                </div>
              )}
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                style={{
                  background: 'white',
                  borderRadius: '20px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                  cursor: dragging ? 'grabbing' : selectedLayerId ? 'grab' : 'default',
                  maxWidth: '100%',
                  maxHeight: 'calc(100vh - 160px)',
                  objectFit: 'contain',
                  touchAction: 'none',
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={onMouseDown}
                onTouchMove={onMouseMove}
                onTouchEnd={onMouseUp}
              />
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
                옷을 클릭해 선택 후 드래그로 이동
              </p>
            </div>
          )}
        </div>

        {/* 모바일 패널 토글 버튼 */}
        <button className="fr-panel-toggle" onClick={() => setPanelOpen(o => !o)}>
          {panelOpen ? '✕' : '☰'}
        </button>

        {/* 모바일 딤 배경 */}
        {panelOpen && <div className="fr-panel-dim" onClick={() => setPanelOpen(false)} />}

        {/* Right panel */}
        <div className={`fr-panel${panelOpen ? ' fr-panel-open' : ''}`}>
          {/* 아바타 없음 배너 */}
          {!loadingAvatar && !avatar && (
            <div className="fr-no-avatar-banner">
              <p>신체 측정 후 아바타를 저장하면<br/>착용 시 자동으로 크기가 맞춰집니다</p>
              <button onClick={() => navigate('/mypage/body-measure')}>측정하기</button>
            </div>
          )}

          {/* Cart items */}
          <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={16} color="#6366f1" /> 장바구니 상품
              <div style={{ marginLeft: 'auto', position: 'relative' }}>
                <button
                  onClick={() => setShowGuide(true)}
                  title="사용방법"
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    border: '1.5px solid #c7d2fe', background: '#eef2ff',
                    color: '#6366f1', fontWeight: 800, fontSize: '0.75rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', lineHeight: 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#6366f1';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#eef2ff';
                    e.currentTarget.style.color = '#6366f1';
                  }}
                >
                  ?
                </button>
              </div>
            </h3>
            {loadingCart ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>불러오는 중...</p>
            ) : cartItems.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>장바구니가 비어있습니다</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cartItems.map(item => {
                  const alreadyAdded = layers.some(l => l.product_id === item.product_id && l.size_name === item.size_name);
                  const isPreparing = preparingLayer === item.product_id;
                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px', borderRadius: '12px',
                      background: alreadyAdded ? '#f5f3ff' : '#f8fafc',
                      border: `1px solid ${alreadyAdded ? '#c4b5fd' : '#e2e8f0'}`,
                    }}>
                      <img
                        src={`${BASE}${item.product.image_url}`}
                        alt={item.product.name}
                        style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.product.name}
                        </p>
                        {item.size_name && (
                          <span style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 600 }}>{item.size_name}</span>
                        )}
                      </div>
                      <button
                        onClick={() => alreadyAdded ? removeLayer(layers.find(l => l.product_id === item.product_id && l.size_name === item.size_name)?.id) : addLayer(item)}
                        disabled={isPreparing}
                        style={{
                          padding: '5px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                          border: 'none', cursor: isPreparing ? 'wait' : 'pointer',
                          background: alreadyAdded ? '#ef4444' : '#6366f1', color: 'white',
                          flexShrink: 0,
                        }}
                      >
                        {isPreparing ? '처리중' : alreadyAdded ? '제거' : '착용'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active layers */}
          <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="#6366f1" /> 레이어
              </h3>
              {layers.some(l => l.isPolygon) && (
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
              )}
            </div>
            {layers.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>위에서 상품을 착용해 보세요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[...layers].reverse().map(layer => (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', borderRadius: '10px', cursor: 'pointer',
                      border: `1.5px solid ${selectedLayerId === layer.id ? '#6366f1' : '#e2e8f0'}`,
                      background: selectedLayerId === layer.id ? '#f5f3ff' : 'white',
                    }}
                  >
                    <img
                      src={`${BASE}${layer.image_url}`}
                      alt={layer.product_name}
                      style={{ width: '34px', height: '34px', objectFit: 'cover', borderRadius: '6px', opacity: layer.visible ? 1 : 0.4 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {layer.product_name}
                      </p>
                      {(() => {
                        const cartItem = cartItems.find(c => c.id === layer.cart_item_id);
                        const sizes = cartItem?.product?.top_sizes?.length > 0
                          ? cartItem.product.top_sizes
                          : cartItem?.product?.bottom_sizes ?? [];
                        return sizes.length > 0 ? (
                          <select
                            value={layer.size_name || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); changeLayerSize(layer, e.target.value); }}
                            style={{ fontSize: '0.7rem', color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: '5px', padding: '1px 4px', background: '#eef2ff', cursor: 'pointer', marginTop: '2px' }}
                          >
                            {sizes.map(s => (
                              <option key={s.size_name} value={s.size_name}>{s.size_name}</option>
                            ))}
                          </select>
                        ) : layer.size_name ? (
                          <span style={{ fontSize: '0.7rem', color: '#6366f1' }}>{layer.size_name}</span>
                        ) : null;
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); resetLayerPosition(layer.id); }} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', color: '#475569', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600 }}>
                        위치 초기화
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {showGuide && <FittingRoomGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}

export default FittingRoom;
