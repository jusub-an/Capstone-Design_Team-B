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

// ── compute auto sleeve angle from size measurements (pxPerCm cancels out) ──
function autoSleeveAngle(sizeInfo) {
  const gv = (v, d) => (v && v > 0) ? v : d;
  const shldr  = gv(sizeInfo.shoulder, 45);
  const chest  = gv(sizeInfo.chest, 50);
  const slvLen = gv(sizeInfo.sleeve_length, 20);
  const slvOpn = gv(sizeInfo.sleeve, 16);
  const dx = (chest - shldr) / 2;
  const R  = Math.sqrt(slvLen * slvLen + slvOpn * slvOpn);
  if (R > 0 && Math.abs(dx / R) <= 1) {
    const deg = (Math.acos(dx / R) - Math.atan2(slvOpn, slvLen)) * 180 / Math.PI;
    if (!isNaN(deg)) return Math.max(0, Math.min(90, deg)) * Math.PI / 180;
  }
  return 65 * Math.PI / 180;
}

// ── standalone clothing polygon renderer (same algorithm as VirtualFitting) ──
function drawClothingPolygon(ctx, centerX, startY, sizeInfo, pxPerCm, isTop, isSelected) {
  const getVal = (v, def) => (v && v > 0) ? v : def;
  ctx.save();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.fillStyle = isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.15)';
  ctx.beginPath();

  if (isTop) {
    const neckW    = getVal(sizeInfo.neck, 15)          * pxPerCm;
    const shldrW   = getVal(sizeInfo.shoulder, 40)      * pxPerCm;
    const chestW   = getVal(sizeInfo.chest, 50)         * pxPerCm;
    const totLen   = getVal(sizeInfo.length, 65)        * pxPerCm;
    const slvLen   = getVal(sizeInfo.sleeve_length, 20) * pxPerCm;
    const slvOpen  = getVal(sizeInfo.sleeve, 16)        * pxPerCm;
    const armhole  = 22  * pxPerCm;
    const shldrDrp = 4   * pxPerCm;
    const neckDrp  = 4   * pxPerCm;
    const ang      = autoSleeveAngle(sizeInfo);

    ctx.moveTo(centerX - neckW / 2, startY);
    ctx.quadraticCurveTo(centerX, startY + neckDrp, centerX + neckW / 2, startY);
    ctx.lineTo(centerX + shldrW / 2, startY + shldrDrp);

    const rx1 = centerX + shldrW / 2 + slvLen * Math.cos(ang);
    const ry1 = startY + shldrDrp + slvLen * Math.sin(ang);
    ctx.lineTo(rx1, ry1);
    const rx2 = rx1 - slvOpen * Math.sin(ang);
    const ry2 = ry1 + slvOpen * Math.cos(ang);
    ctx.lineTo(rx2, ry2);

    ctx.quadraticCurveTo(centerX + chestW / 2, startY + armhole - 2 * pxPerCm, centerX + chestW / 2, startY + armhole);
    ctx.quadraticCurveTo(centerX + chestW / 2 - 1.5 * pxPerCm, startY + armhole + (totLen - armhole) / 2, centerX + chestW / 2, startY + totLen);
    ctx.quadraticCurveTo(centerX, startY + totLen + 1.5 * pxPerCm, centerX - chestW / 2, startY + totLen);
    ctx.quadraticCurveTo(centerX - chestW / 2 + 1.5 * pxPerCm, startY + armhole + (totLen - armhole) / 2, centerX - chestW / 2, startY + armhole);

    const lx2 = centerX - shldrW / 2 - slvLen * Math.cos(ang) + slvOpen * Math.sin(ang);
    const ly2 = startY + shldrDrp + slvLen * Math.sin(ang) + slvOpen * Math.cos(ang);
    ctx.quadraticCurveTo(centerX - chestW / 2, startY + armhole - 2 * pxPerCm, lx2, ly2);
    const lx1 = centerX - shldrW / 2 - slvLen * Math.cos(ang);
    const ly1 = startY + shldrDrp + slvLen * Math.sin(ang);
    ctx.lineTo(lx1, ly1);
    ctx.lineTo(centerX - shldrW / 2, startY + shldrDrp);
  } else {
    const waistW   = getVal(sizeInfo.waist, 35)  * pxPerCm;
    const thighW   = getVal(sizeInfo.thigh, 25)  * pxPerCm;
    const totLen   = getVal(sizeInfo.length, 100) * pxPerCm;
    const riseLen  = getVal(sizeInfo.rise, 25)   * pxPerCm;
    const hemW     = getVal(sizeInfo.hem, 20)    * pxPerCm;

    ctx.moveTo(centerX - waistW / 2, startY);
    ctx.quadraticCurveTo(centerX, startY + 2 * pxPerCm, centerX + waistW / 2, startY);
    ctx.quadraticCurveTo(centerX + thighW, startY + riseLen / 2, centerX + thighW, startY + riseLen);
    ctx.lineTo(centerX + thighW / 2 + hemW / 2, startY + totLen);
    ctx.quadraticCurveTo(centerX + thighW / 2, startY + totLen + 1.5 * pxPerCm, centerX + thighW / 2 - hemW / 2, startY + totLen);
    ctx.quadraticCurveTo(centerX + 2 * pxPerCm, startY + riseLen, centerX, startY + riseLen);
    ctx.quadraticCurveTo(centerX - 2 * pxPerCm, startY + riseLen, centerX - thighW / 2 + hemW / 2, startY + totLen);
    ctx.quadraticCurveTo(centerX - thighW / 2, startY + totLen + 1.5 * pxPerCm, centerX - thighW / 2 - hemW / 2, startY + totLen);
    ctx.lineTo(centerX - thighW, startY + riseLen);
    ctx.quadraticCurveTo(centerX - thighW, startY + riseLen / 2, centerX - waistW / 2, startY);
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();
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
  const removeBackground = useCallback((img, isGrayMode) => {
    const offscreen = document.createElement('canvas');
    offscreen.width = img.width;
    offscreen.height = img.height;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const brightness = (r + g + b) / 3;
      // gray_mask: dark silhouette on light-gray bg → remove bright pixels
      // person_extracted: rembg turns transparent→white when saved as JPEG → remove near-white
      const threshold = isGrayMode ? 140 : 230;
      // also check low saturation (gray/white, not colored skin)
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
      if (brightness > threshold || (brightness > 200 && saturation < 0.12)) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return offscreen;
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
        );

        // dashed selection rect around polygon bounding box
        if (layer.id === selectedLayerId) {
          const getVal = (v, d) => (v && v > 0) ? v : d;
          const halfW = getVal(isTop ? layer.sizeInfo.chest : layer.sizeInfo.waist, isTop ? 50 : 35) / 2 * pxPerCm;
          const totH  = getVal(layer.sizeInfo.length, isTop ? 65 : 100) * pxPerCm;
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(layer.x - halfW - 4, layer.y - 4, halfW * 2 + 8, totH + 8);
          ctx.setLineDash([]);
        }
        return;
      }

      if (!layer.img) return;
      const imgW = layer.img.width * layer.scale;
      const imgH = layer.img.height * layer.scale;
      ctx.drawImage(layer.img, layer.x, layer.y, imgW, imgH);

      if (layer.id === selectedLayerId) {
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(layer.x - 2, layer.y - 2, imgW + 4, imgH + 4);
        ctx.setLineDash([]);
      }
    });
  }, [avatarImg, layers, selectedLayerId, avatar]);

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
              <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>레이어 조절</h3>
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
                    const userVal = getAvatarMeasure(avatarKey);
                    const clothingVal = sizeInfo[clothingKey];
                    if (clothingVal == null) return null;
                    return (
                      <div key={clothingKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: '#64748b', minWidth: '40px' }}>{label}</span>
                        <span style={{ color: '#334155' }}>
                          {userVal != null ? `내 ${userVal.toFixed(1)} / 의류 ${clothingVal}` : `의류 ${clothingVal} cm`}
                        </span>
                        {renderFitBadge(userVal, clothingVal)}
                      </div>
                    );
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
