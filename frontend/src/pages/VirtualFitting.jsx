import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles, Ruler, MessageSquare, Info, Key } from 'lucide-react';
import './VirtualFitting.css';

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
      } catch(err) {
        console.error('상품 정보 불러오기 실패:', err);
      }
    };
    fetchData();
  }, [id]);

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
        <button className="vf-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
          <span>뒤로 가기</span>
        </button>
        <h2>가상 피팅룸</h2>
        <div className="vf-product-id">상품 번호: {id}</div>
      </header>

      <main className="vf-main-content">
        {/* Left: 2D 가상 피팅 시뮬레이션 영역 */}
        <section className="vf-visualization-section">
          <div className="vf-visual-header">
            <Sparkles className="vf-icon" />
            <h3>2D 가상 피팅 시뮬레이션</h3>
          </div>
          
          <div className="vf-canvas-container">
            {/* 시각화 캔버스 자리표시자 */}
            <div className="vf-mock-canvas">
              <div className="vf-silhouette-placeholder">
                <div className="vf-mock-avatar"></div>
                <div className="vf-mock-clothes"></div>
              </div>
              <div className="vf-canvas-overlay-text">
                <Ruler size={32} />
                <p>아바타 및 2D 의류 생성 대기 중...</p>
                <span className="vf-subtext">신체 치수와 의류 치수 비례 연산이 이곳에 적용됩니다.</span>
              </div>
            </div>
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
