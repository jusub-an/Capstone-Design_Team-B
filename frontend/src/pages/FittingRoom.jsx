import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Trash2, User, Shirt, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

const BASE = 'http://localhost:8000';

const AVATAR_W = 220;
const AVATAR_H = 550;

// ── extract heightRatio from avatar.measurements (new format: {items,height_ratio}) ──
function getHeightRatio(avatar) {
  if (!avatar?.measurements) return 1;
  try {
    const m = typeof avatar.measurements === 'string'
      ? JSON.parse(avatar.measurements)
      : avatar.measurements;
    return (m && m.height_ratio) ? m.height_ratio : 1;
  } catch { return 1; }
}


// ── helper for avatar measurements ──
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

function getAutoSleeveAngleObj(avatar, sizeInfo) {
  if (avatar && avatar.measurements) {
    try {
      const m = typeof avatar.measurements === 'string' ? JSON.parse(avatar.measurements) : avatar.measurements;
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
    
    const currentSleeveAngle = getAutoSleeveAngleObj(avatar, sizeInfo);
    const angle = currentSleeveAngle * Math.PI / 180;
    const rx1 = centerX + shoulderWidth/2 + sleeveLength * Math.cos(angle);
    const ry1 = startY + shoulderDrop + sleeveLength * Math.sin(angle);
    ctx.lineTo(rx1, ry1);
    
    const sleeveOpening = getVal(sleeveWidthVal, 16) * pxPerCm;
    const rx2 = rx1 - sleeveOpening * Math.sin(angle);
    const ry2 = ry1 + sleeveOpening * Math.cos(angle);
    ctx.lineTo(rx2, ry2);
    
    ctx.quadraticCurveTo(centerX + chestWidth/2, startY + armhole - 2*pxPerCm, centerX + chestWidth/2, startY + armhole);
    ctx.quadraticCurveTo(centerX + chestWidth/2 - 1.5*pxPerCm, startY + armhole + (totalLength - armhole)/2, centerX + chestWidth/2, startY + totalLength);
    ctx.quadraticCurveTo(centerX, startY + totalLength + 1.5*pxPerCm, centerX - chestWidth/2, startY + totalLength);
    ctx.quadraticCurveTo(centerX - chestWidth/2 + 1.5*pxPerCm, startY + armhole + (totalLength - armhole)/2, centerX - chestWidth/2, startY + armhole);
    
    const lx2 = centerX - shoulderWidth/2 - sleeveLength * Math.cos(angle) + sleeveOpening * Math.sin(angle);
    const ly2 = startY + shoulderDrop + sleeveLength * Math.sin(angle) + sleeveOpening * Math.cos(angle);
    ctx.quadraticCurveTo(centerX - chestWidth/2, startY + armhole - 2*pxPerCm, lx2, ly2);
    
    const lx1 = centerX - shoulderWidth/2 - sleeveLength * Math.cos(angle);
    const ly1 = startY + shoulderDrop + sleeveLength * Math.sin(angle);
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
      const sx2 = sx1 + sleeveLength * Math.cos(angle);
      const sy2 = sy1 + sleeveLength * Math.sin(angle);
      drawDimLine(sx1, sy1 - 10, sx2, sy2 - 10, getLabel('소매길이', sleeveVal), 0, -12, isMissing(sleeveVal));
      
      const sx3 = sx2 - sleeveOpening * Math.sin(angle);
      const sy3 = sy2 + sleeveOpening * Math.cos(angle);
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

const CANVAS_W = 380;
const CANVAS_H = 600;
const DRAW_H = CANVAS_H * 0.9;       // 540px — avatar draw height
const OFFSET_Y = (CANVAS_H - DRAW_H) / 2 + CANVAS_H * 0.02; // 42px — avatar top edge
const FILL_RATIO = 0.78;              // garment occupies ~78 % of product image height

function FittingRoom() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const userEmail = sessionStorage.getItem('userEmail');

  const [avatar, setAvatar] = useState(null);           // {gray_mask_url, person_extracted_url, measurements, height_cm}
  const [avatarMode, setAvatarMode] = useState('gray'); // 'gray' | 'photo'
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

  // ── fetch avatar ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userEmail) { setLoadingAvatar(false); return; }
    fetch(`${BASE}/api/avatar/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setAvatar(data); setLoadingAvatar(false); })
      .catch(() => setLoadingAvatar(false));
  }, [userEmail]);

  // ── remove light background from avatar image (both modes saved as JPEG) ──
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

  // ── load avatar image whenever mode or avatar changes ─────────────
  useEffect(() => {
    if (!avatar) { setAvatarImg(null); return; }
    const url = avatarMode === 'gray' ? avatar.gray_mask_url : avatar.person_extracted_url;
    if (!url) { setAvatarImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setAvatarImg(removeBackground(img, avatarMode === 'gray'));
    img.onerror = () => setAvatarImg(null);
    img.src = `${BASE}${url}`;
  }, [avatar, avatarMode, removeBackground]);

  // ── fetch cart ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userEmail) { setLoadingCart(false); return; }
    fetch(`${BASE}/api/cart/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : [])
      .then(items => { setCartItems(items); setLoadingCart(false); })
      .catch(() => setLoadingCart(false));
  }, [userEmail]);

  // ── compute auto-fit position/scale from avatar + clothing measurements ──
  const computeAutoFit = useCallback((img, autoFitParams) => {
    const { height_cm, length_cm, isTop = true } = autoFitParams || {};
    let scale;

    if (height_cm && length_cm) {
      // ideal path: scale so clothing length matches body proportion
      const pxPerCm = DRAW_H / height_cm;
      scale = (length_cm * pxPerCm) / (img.height * FILL_RATIO);
    } else if (height_cm) {
      // no length data: estimate top ≈ 28 %, bottom ≈ 32 % of body height
      const ratio = isTop ? 0.28 : 0.32;
      scale = (DRAW_H * ratio) / (img.height * FILL_RATIO);
    } else {
      // no avatar: fit to 55 % of canvas width
      scale = (CANVAS_W * 0.55) / img.width;
    }

    scale = Math.max(0.05, Math.min(1.5, scale));
    const x = (CANVAS_W - img.width * scale) / 2;
    const posYRatio = isTop ? 0.13 : 0.42;
    const y = OFFSET_Y + DRAW_H * posYRatio;

    return { x, y, scale };
  }, []);

  // ── load image for a layer ────────────────────────────────────────
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

  // ── add a cart item as layer ──────────────────────────────────────
  const addLayer = async (cartItem) => {
    const already = layers.find(l =>
      l.product_id === cartItem.product_id && l.size_name === cartItem.size_name
    );
    if (already) return;

    const p = cartItem.product;

    // build auto-fit params from avatar measurements + clothing size
    const isTop = p?.category?.name?.includes('상의') ?? true;
    const sizes = isTop ? p.top_sizes : p.bottom_sizes;
    const sizeInfo = sizes?.find(s => s.size_name === cartItem.size_name);

    // skip prepare-fitting when polygon mode is available (no image needed)
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

    // polygon mode: draw measurement-based avatar when we have sizeInfo + avatar height
    const isPolygon = !!(sizeInfo && avatar?.height_cm);

    let initX, initY, initScale;
    if (isPolygon) {
      const heightRatio = getHeightRatio(avatar);
      const pxPerCm = DRAW_H / (avatar.height_cm * heightRatio);
      const headH = avatar.height_cm * 0.135;
      initX     = CANVAS_W / 2; // centerX
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
  };

  // ── remove layer ──────────────────────────────────────────────────
  const removeLayer = (layerId) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  };

  // ── toggle visibility ─────────────────────────────────────────────
  const toggleVisible = (layerId) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  };

  // ── reset layer position ──────────────────────────────────────────
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

  // ── scale selected layer ──────────────────────────────────────────
  const scaleLayer = (layerId, delta) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const min = l.isPolygon ? 0.5 : 0.3;
      const max = l.isPolygon ? 2.0 : 3.0;
      return { ...l, scale: Math.max(min, Math.min(max, l.scale + delta)) };
    }));
  };

  // ── draw canvas ───────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // draw avatar
    if (avatarImg) {
      const aspect = avatarImg.width / avatarImg.height;
      const drawH = H * 0.9;
      const drawW = drawH * aspect;
      const offsetX = (W - drawW) / 2;
      const offsetY = (H - drawH) / 2 + H * 0.02;
      ctx.drawImage(avatarImg, offsetX, offsetY, drawW, drawH);
    } else {
      // placeholder silhouette
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

    // draw clothing layers (bottom to top)
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

    // ── 가이드라인 시각화 (Height Visualization) ──
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

  // ── hit-test for layer selection ──────────────────────────────────
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

  // wheel to scale selected layer
  const onWheel = (e) => {
    e.preventDefault();
    if (!selectedLayerId) return;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    scaleLayer(selectedLayerId, delta);
  };

  // ── size info for selected layer ──────────────────────────────────
  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  const getSizeInfo = (cartItem) => {
    const p = cartItem?.product;
    if (!p) return null;
    const isTop = p?.category?.name?.includes('상의');
    const sizes = isTop ? p.top_sizes : p.bottom_sizes;
    return sizes?.find(s => s.size_name === cartItem.size_name) || null;
  };

  const getAvatarMeasure = (key) => {
    if (!avatar?.measurements) return null;
    const found = avatar.measurements.find?.(m => m.key === key);
    return found ? found.value_cm : null;
  };

  const FitVisualizer = ({ label, clothingVal, userCirc, userFlat, canBeCircumference }) => {
    if (!clothingVal) return null;
    
    let ease = 0;
    let statusText = '';
    let color = '';
    let percent = 50;
    let userDisplay = '';
    let clothDisplay = '';

    // 사용자 DB에 실제 둘레 데이터가 존재하는 경우에만 '둘레 기반 분석' 진행
    const useCirc = canBeCircumference && userCirc != null;

    if (useCirc) {
      // 의류 단면을 2배하여 원단 총 둘레 도출
      const clothingCirc = clothingVal * 2;
      ease = clothingCirc - userCirc;
      
      // DB 실수 그대로 사용 (어떠한 반올림도 없음)
      userDisplay = `${userCirc}cm`;
      clothDisplay = `${clothingCirc}cm`;
      
      if (ease < -2) {
        statusText = `매우 타이트 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10;
      } else if (ease < 4) {
        statusText = `슬림 핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#84cc16'; percent = 30;
      } else if (ease < 10) {
        statusText = `레귤러 핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50;
      } else if (ease < 18) {
        statusText = `루즈 핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#3b82f6'; percent = 75;
      } else {
        statusText = `오버사이즈 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#8b5cf6'; percent = 95;
      }
    } else {
      // 단면/길이 기반 분석
      if (!userFlat) return null;
      ease = clothingVal - userFlat;
      userDisplay = `${userFlat}cm`;
      clothDisplay = `${clothingVal}cm`;

      if (ease < -2) {
        statusText = `짧음/타이트 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#ef4444'; percent = 10;
      } else if (ease < 2) {
        statusText = `저스트 핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#84cc16'; percent = 30;
      } else if (ease < 6) {
        statusText = `레귤러 핏 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#22c55e'; percent = 50;
      } else {
        statusText = `여유/김 (${ease > 0 ? '+' : ''}${ease.toFixed(1)}cm)`; color = '#3b82f6'; percent = 80;
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
  const renderFitBadge = (userVal, clothingVal) => {
    if (userVal == null || clothingVal == null) return null;
    const diff = userVal - clothingVal;
    let label, color;
    if (diff > 3) { label = '타이트'; color = '#ef4444'; }
    else if (diff < -5) { label = '루즈'; color = '#f59e0b'; }
    else { label = '적정'; color = '#22c55e'; }
    return (
      <span style={{
        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
        background: color + '20', color, border: `1px solid ${color}40`,
      }}>{label} ({diff >= 0 ? '+' : ''}{diff.toFixed(1)})</span>
    );
  };

  const isLoggedIn = !!sessionStorage.getItem('token');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '12px 24px', background: 'white',
        borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        flexShrink: 0,
      }}>
        <button onClick={() => navigate('/mypage')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>가상 피팅룸</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>아바타 모드</span>
          <button
            onClick={() => setAvatarMode(m => m === 'gray' ? 'photo' : 'gray')}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
              border: '1.5px solid #6366f1', cursor: 'pointer',
              background: avatarMode === 'gray' ? '#eef2ff' : 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: avatarMode === 'gray' ? '#6366f1' : 'white', transition: 'all 0.2s',
            }}
          >
            {avatarMode === 'gray' ? '🪄 실루엣' : '📷 누끼'}
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Canvas area */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '20px', gap: '12px',
        }}>
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
            <>
              <canvas
                ref={canvasRef}
                width={380}
                height={600}
                style={{
                  background: 'white',
                  borderRadius: '20px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                  cursor: dragging ? 'grabbing' : selectedLayerId ? 'grab' : 'default',
                  maxWidth: '100%',
                  touchAction: 'none',
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={onMouseDown}
                onTouchMove={onMouseMove}
                onTouchEnd={onMouseUp}
                onWheel={onWheel}
              />
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
                옷을 클릭해 선택 후 드래그로 이동 · 스크롤로 크기 조절
              </p>
            </>
          )}
        </div>

        {/* Right panel */}
        <div style={{
          width: '320px', flexShrink: 0,
          borderLeft: '1px solid #e2e8f0',
          background: 'white',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Cart items */}
          <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shirt size={16} color="#6366f1" /> 장바구니 상품
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
            <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>레이어</h3>
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
                      {layer.size_name && <span style={{ fontSize: '0.7rem', color: '#6366f1' }}>{layer.size_name}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); toggleVisible(layer.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px' }}>
                        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); resetLayerPosition(layer.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px' }}>
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); removeLayer(layer.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected layer controls */}
          {selectedLayer && (
            <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>레이어 조절</h3>
                {selectedLayer.isPolygon && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748b', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showDimLines} onChange={e => setShowDimLines(e.target.checked)} />
                    치수선 표시
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b', minWidth: '40px' }}>크기</span>
                <button onClick={() => scaleLayer(selectedLayerId, -0.05)} style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 700 }}>−</button>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: '40px', textAlign: 'center' }}>{(selectedLayer.scale * 100).toFixed(0)}%</span>
                <button onClick={() => scaleLayer(selectedLayerId, 0.05)} style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 700 }}>+</button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setLayers(prev => {
                  const idx = prev.findIndex(l => l.id === selectedLayerId);
                  if (idx <= 0) return prev;
                  const arr = [...prev];
                  [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                  return arr;
                })} style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <ChevronDown size={12} /> 앞으로
                </button>
                <button onClick={() => setLayers(prev => {
                  const idx = prev.findIndex(l => l.id === selectedLayerId);
                  if (idx >= prev.length - 1) return prev;
                  const arr = [...prev];
                  [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                  return arr;
                })} style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <ChevronUp size={12} /> 뒤로
                </button>
              </div>
            </div>
          )}

          {/* Fit info for selected layer */}
          {selectedLayer && avatar?.measurements && (() => {
            const cartItem = cartItems.find(c => c.product_id === selectedLayer.product_id && c.size_name === selectedLayer.size_name);
            if (!cartItem) return null;
            const sizeInfo = getSizeInfo(cartItem);
            if (!sizeInfo) return null;
            const isTop = cartItem.product?.category?.name?.includes('상의');

            const pairs = isTop ? [
              { label: '어깨',     clothingKey: 'shoulder',      avatarKey: 'shoulder' },
              { label: '가슴',     clothingKey: 'chest',         avatarKey: 'chest' },
              { label: '소매길이', clothingKey: 'sleeve_length', avatarKey: 'sleeve' },
              { label: '소매넓이', clothingKey: 'sleeve',        avatarKey: 'arm_width' },
            ] : [
              { label: '허리',   clothingKey: 'waist', avatarKey: 'waist' },
              { label: '허벅지', clothingKey: 'thigh', avatarKey: 'thigh' },
            ];

            return (
              <div style={{ padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>핏 분석 ({selectedLayer.size_name})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pairs.map(({ label, clothingKey, avatarKey }) => {
                    const userFlat = getAvatarMeasure(avatarKey);
                    const userCirc = getAvatarMeasure(avatarKey + '_circumference');
                    const clothingVal = sizeInfo[clothingKey];
                    if (clothingVal == null) return null;
                    const canBeCircumference = ['chest', 'waist', 'thigh'].includes(clothingKey);
                    return <FitVisualizer key={clothingKey} label={label} clothingVal={clothingVal} userCirc={userCirc} userFlat={userFlat} canBeCircumference={canBeCircumference} />;
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default FittingRoom;
