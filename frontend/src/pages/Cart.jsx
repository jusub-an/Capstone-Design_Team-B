import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ShoppingCart, ShoppingBag } from 'lucide-react';
import './Cart.css';
import { useToast } from '../contexts/ToastContext';

const BASE = 'http://localhost:8000';

function Cart() {
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const email = sessionStorage.getItem('userEmail');
  const showToast = useToast();

  const fetchCart = useCallback(async () => {
    if (!email) { navigate('/login'); return; }
    try {
      const res = await fetch(`${BASE}/api/cart/${encodeURIComponent(email)}`);
      if (res.ok) setCartItems(await res.json());
    } catch (e) {}
    setLoading(false);
  }, [email, navigate]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const removeItem = async (itemId) => {
    await fetch(`${BASE}/api/cart/${itemId}?user_email=${encodeURIComponent(email)}`, { method: 'DELETE' });
    setCartItems(prev => prev.filter(i => i.id !== itemId));
    showToast('상품이 삭제됐습니다', 'info');
  };

  const clearAll = async () => {
    await Promise.all(cartItems.map(item =>
      fetch(`${BASE}/api/cart/${item.id}?user_email=${encodeURIComponent(email)}`, { method: 'DELETE' })
    ));
    setCartItems([]);
    showToast('장바구니를 비웠습니다', 'info');
  };

  const changeSize = async (itemId, newSize) => {
    const res = await fetch(
      `${BASE}/api/cart/${itemId}?user_email=${encodeURIComponent(email)}&size_name=${encodeURIComponent(newSize)}`,
      { method: 'PATCH' }
    );
    if (res.ok) {
      const updated = await res.json();
      setCartItems(prev => prev.map(i => i.id === itemId ? updated : i));
      showToast(`사이즈가 ${newSize}로 변경됐습니다`, 'success');
    }
  };

  const total = cartItems.reduce((sum, item) => sum + (item.product?.price || 0), 0);

  return (
    <div className="cart-page">
      <header className="cart-header">
        <button className="cart-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="cart-header-title">장바구니</h1>
        <div style={{ width: 40 }} />
      </header>

      {loading ? (
        <div className="cart-empty">
          <p style={{ color: '#94a3b8' }}>로딩 중...</p>
        </div>
      ) : cartItems.length === 0 ? (
        <div className="cart-empty">
          <ShoppingCart size={60} strokeWidth={1.2} color="#cbd5e1" />
          <p className="cart-empty-msg">장바구니가 비어있습니다</p>
          <button className="cart-shop-btn" onClick={() => navigate('/products')}>
            쇼핑 계속하기
          </button>
        </div>
      ) : (
        <div className="cart-body">
          {/* 상품 목록 */}
          <div className="cart-items-col">
            <div className="cart-items-header">
              <span className="cart-count">총 {cartItems.length}개 상품</span>
              <button className="cart-clear-btn" onClick={clearAll}>전체 삭제</button>
            </div>
            <div className="cart-items-list">
              {cartItems.map(item => (
                <div key={item.id} className="cart-item-card">
                  <img
                    src={`${BASE}${item.product?.image_url}`}
                    alt={item.product?.name}
                    className="cart-item-img"
                    onClick={() => navigate(`/products/${item.product?.id}`)}
                  />
                  <div className="cart-item-info">
                    {item.product?.brand && (
                      <span className="cart-item-brand">{item.product.brand}</span>
                    )}
                    <p
                      className="cart-item-name"
                      onClick={() => navigate(`/products/${item.product?.id}`)}
                    >
                      {item.product?.name}
                    </p>
                    {(() => {
                      const sizes = item.product?.top_sizes?.length > 0
                        ? item.product.top_sizes
                        : item.product?.bottom_sizes ?? [];
                      return sizes.length > 0 ? (
                        <select
                          className="cart-item-size-select"
                          value={item.size_name || ''}
                          onChange={e => changeSize(item.id, e.target.value)}
                        >
                          {sizes.map(s => (
                            <option key={s.size_name} value={s.size_name}>{s.size_name}</option>
                          ))}
                        </select>
                      ) : item.size_name ? (
                        <span className="cart-item-size">사이즈 {item.size_name}</span>
                      ) : null;
                    })()}
                  </div>
                  <div className="cart-item-right">
                    <span className="cart-item-price">
                      {item.product?.price?.toLocaleString()}원
                    </span>
                    <button className="cart-item-remove" onClick={() => removeItem(item.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 주문 요약 */}
          <div className="cart-summary-col">
            <div className="cart-summary-box">
              <h3 className="cart-summary-title">주문 요약</h3>
              <div className="cart-summary-rows">
                <div className="cart-summary-row">
                  <span>상품 수</span>
                  <span>{cartItems.length}개</span>
                </div>
                <div className="cart-summary-row">
                  <span>상품 금액</span>
                  <span>{total.toLocaleString()}원</span>
                </div>
                <div className="cart-summary-row">
                  <span>배송비</span>
                  <span className="cart-free">무료</span>
                </div>
              </div>
              <div className="cart-summary-total">
                <span>합계</span>
                <span className="cart-total-price">{total.toLocaleString()}원</span>
              </div>
              <button className="cart-buy-btn">
                구매하기
              </button>
              <button
                className="cart-fitting-btn"
                onClick={() => navigate('/mypage/fitting')}
              >
                <ShoppingBag size={16} />
                가상 피팅룸에서 착용해보기
              </button>
              <button
                className="cart-continue-btn"
                onClick={() => navigate('/products')}
              >
                쇼핑 계속하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cart;
