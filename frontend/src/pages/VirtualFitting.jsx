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
  const [fittingImg, setFittingImg] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [preparingFit, setPreparingFit] = useState(false);

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
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i+1], b = px[i+2];
      const br = (r+g+b)/3;
      const sat = Math.max(r,g,b) === 0 ? 0 : (Math.max(r,g,b)-Math.min(r,g,b))/Math.max(r,g,b);
      if (br > (isGray ? 140 : 230) || (br > 200 && sat < 0.12)) px[i+3] = 0;
    }
    ctx.putImageData(d, 0, 0);
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

  // ── auto-fit scale/position ────────────────────────────────────────
  const computeAutoFit = useCallback((img, height_cm, length_cm, isTop) => {
    let scale;
    if (height_cm && length_cm) {
      scale = (length_cm * (DRAW_H / height_cm)) / (img.height * FILL_RATIO);
    } else if (height_cm) {
      scale = (DRAW_H * (isTop ? 0.28 : 0.32)) / (img.height * FILL_RATIO);
    } else {
      scale = (CV_W * 0.55) / img.width;
    }
    scale = Math.max(0.05, Math.min(1.5, scale));
    const x = (CV_W - img.width * scale) / 2;
    const y = OFFSET_Y + DRAW_H * (isTop ? 0.13 : 0.42);
    return { x, y, scale };
  }, []);

  // ── prepare fitting image (rembg) when product loads ─────────────
  useEffect(() => {
    if (!productInfo) return;
    const load = (url) => {
      const img = new Image();
      img.onload = () => setFittingImg(img);
      img.onerror = () => setFittingImg(null);
      img.src = url.startsWith('http') ? url : `${BASE}${url}`;
    };
    if (productInfo.fitting_image_url) {
      load(productInfo.fitting_image_url);
    } else {
      setPreparingFit(true);
      fetch(`${BASE}/api/products/${productInfo.id}/prepare-fitting`, { method: 'POST' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.fitting_image_url) load(data.fitting_image_url); })
        .catch(() => {})
        .finally(() => setPreparingFit(false));
    }
  }, [productInfo]);

  // ── init selected size ────────────────────────────────────────────
  useEffect(() => {
    if (!productInfo) return;
    const isTop = productInfo.category?.name?.includes('상의') ?? true;
    const sizes = isTop ? productInfo.top_sizes : productInfo.bottom_sizes;
    if (sizes?.length > 0) setSelectedSize(sizes[0]);
  }, [productInfo]);

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

    if (fittingImg && avatar) {
      const isTop = productInfo?.category?.name?.includes('상의') ?? true;
      const length_cm = selectedSize?.length ?? null;
      const { x, y, scale } = computeAutoFit(fittingImg, avatar.height_cm, length_cm, isTop);
      ctx.drawImage(fittingImg, x, y, fittingImg.width * scale, fittingImg.height * scale);
    }
  }, [avatarImg, fittingImg, selectedSize, avatar, productInfo, computeAutoFit]);

  // ── size list & fit badge helpers ─────────────────────────────────
  const getSizes = () => {
    if (!productInfo) return [];
    const isTop = productInfo.category?.name?.includes('상의') ?? true;
    return isTop ? (productInfo.top_sizes || []) : (productInfo.bottom_sizes || []);
  };

  const getAvatarMeasure = (key) =>
    avatar?.measurements?.find?.(m => m.key === key)?.value_cm ?? null;

  const fitBadge = (userVal, clothingVal) => {
    if (userVal == null || clothingVal == null) return null;
    const diff = userVal - clothingVal;
    const [label, color] =
      diff < -3 ? ['타이트', '#ef4444'] :
      diff > 5  ? ['루즈',   '#f59e0b'] :
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
    ? [{ label: '어깨', k: 'shoulder' }, { label: '가슴', k: 'chest' }, { label: '소매', k: 'sleeve' }]
    : [{ label: '허리', k: 'waist' }, { label: '허벅지', k: 'thigh' }];

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

          <div className="vf-canvas-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
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
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <canvas
                  ref={canvasRef}
                  width={CV_W}
                  height={CV_H}
                  style={{ borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'block', maxWidth: '100%' }}
                />
                {preparingFit && (
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '16px',
                    background: 'rgba(255,255,255,0.75)', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}>
                    <div style={{ width: '28px', height: '28px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 600 }}>누끼 처리 중...</span>
                  </div>
                )}
              </div>
            )}

            {/* ── size selector ── */}
            {getSizes().length > 0 && (
              <div style={{ width: '100%', maxWidth: `${CV_W}px` }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>사이즈 선택</p>
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
                  {fitPairs.map(({ label, k }) => {
                    const userVal = getAvatarMeasure(k);
                    const clothingVal = selectedSize[k];
                    if (clothingVal == null) return null;
                    return (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
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
