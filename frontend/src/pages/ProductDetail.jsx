import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ShoppingCart, Heart, Share2, Star, MessageSquare, Plus, Edit2, Trash2, ShoppingBag } from 'lucide-react';
import './ProductList.css';
import axios from 'axios';
import './ProductDetail.css';

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [reviews, setReviews] = useState([]);
  const [sizeReviews, setSizeReviews] = useState([]);
  const [selectedSizeFilter, setSelectedSizeFilter] = useState('ALL');
  const [expandedReviewId, setExpandedReviewId] = useState(null);
  const [showCartModal, setShowCartModal] = useState(false);
  const [selectedCartSize, setSelectedCartSize] = useState('');
  const [cartAdding, setCartAdding] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [cartCount, setCartCount] = useState(0);

  const isLoggedIn = !!sessionStorage.getItem('token');
  const userEmail = sessionStorage.getItem('userEmail');
  const username = sessionStorage.getItem('username') || 'User';

  const handleAddToCart = async () => {
    if (!isLoggedIn) { alert('로그인이 필요합니다.'); navigate('/login'); return; }
    const sizes = product?.category?.name?.includes('상의') ? product.top_sizes : product.bottom_sizes;
    if (sizes && sizes.length > 0 && !selectedCartSize) {
      setShowCartModal(true);
      return;
    }
    setCartAdding(true);
    try {
      const fd = new FormData();
      fd.append('user_email', userEmail);
      fd.append('product_id', id);
      if (selectedCartSize) fd.append('size_name', selectedCartSize);
      await axios.post('http://localhost:8000/api/cart/add', fd);
      setCartAdded(true);
      setShowCartModal(false);
      refreshCart();
      setTimeout(() => setCartAdded(false), 2500);
    } catch (err) {
      alert('장바구니 담기 실패: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCartAdding(false);
    }
  };

  const refreshCart = React.useCallback(() => {
    if (!userEmail) return;
    fetch(`http://localhost:8000/api/cart/${encodeURIComponent(userEmail)}`)
      .then(r => r.ok ? r.json() : [])
      .then(items => { setCartItems(items); setCartCount(items.length); })
      .catch(() => {});
  }, [userEmail]);

  React.useEffect(() => { refreshCart(); }, [refreshCart]);

  const removeCartItem = async (itemId) => {
    if (!userEmail) return;
    await fetch(`http://localhost:8000/api/cart/${itemId}?user_email=${encodeURIComponent(userEmail)}`, { method: 'DELETE' });
    refreshCart();
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  const handleToggleWish = async () => {
    if (!isLoggedIn) {
      alert('로그인이 필요한 서비스입니다.');
      navigate('/login');
      return;
    }
    const formData = new FormData();
    formData.append('product_id', id);
    formData.append('user_email', userEmail);
    try {
      await axios.post('http://localhost:8000/api/wishes/toggle', formData);
      fetchProduct();
    } catch (error) {
      console.error('Error toggling wish:', error);
    }
  };

  useEffect(() => {
    fetchProduct();
    fetchReviews();
    fetchSizeReviews();
  }, [id]);

  const fetchSizeReviews = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}/size-reviews`);
      if (response.ok) {
        const data = await response.json();
        setSizeReviews(data);
      }
    } catch (error) {
      console.error('Failed to fetch size reviews:', error);
    }
  };

  const fetchReviews = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}/reviews`);
      if (response.ok) {
        const data = await response.json();
        setReviews(data);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('정말 리뷰를 삭제하시겠습니까?')) return;
    try {
      const response = await fetch(`http://localhost:8000/api/reviews/${reviewId}?user_email=${userEmail}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        alert('리뷰가 삭제되었습니다.');
        fetchReviews();
      }
    } catch (error) {
      console.error('Error deleting review:', error);
    }
  };

  const averageRating = reviews.length > 0
    ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1)
    : 0;

  const fetchProduct = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}${isLoggedIn ? `?user_email=${userEmail}` : ''}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      } else {
        navigate('/products');
      }
    } catch (error) {
      console.error('Network error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return dateString.split('T')[0];
  };

  const handleDeleteSizeReview = async (reviewId) => {
    if (!window.confirm('등록한 사이즈 실측 후기를 삭제하시겠습니까?')) return;
    try {
      const response = await fetch(`http://localhost:8000/api/size-reviews/${reviewId}?user_email=${userEmail}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        alert('사이즈 후기가 삭제되었습니다.');
        fetchSizeReviews();
      } else {
        alert('삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete size review:', error);
    }
  };

  const mySizeReviews = isLoggedIn ? sizeReviews.filter(sr => sr.user_email === userEmail) : [];

  if (loading) return <div className="detail-loading">Loading...</div>;
  if (!product) return null;

  const aggregateSizeDiffs = () => {
    if (!product || !sizeReviews || sizeReviews.length === 0) return null;
    const isTop = product.category.name.includes('상의');
    
    let sums = {};
    let counts = {};

    const filteredReviews = selectedSizeFilter === 'ALL' 
      ? sizeReviews 
      : sizeReviews.filter(sr => sr.size_name === selectedSizeFilter);

    if (filteredReviews.length === 0) return null;

    filteredReviews.forEach(sr => {
      const chartSize = isTop 
        ? product.top_sizes.find(s => s.size_name === sr.size_name)
        : product.bottom_sizes.find(s => s.size_name === sr.size_name);
      
      if (!chartSize) return;

      const addDiff = (key, actual, chart) => {
        if (actual != null && chart != null) {
          if (!sums[key]) { sums[key] = 0; counts[key] = 0; }
          sums[key] += (actual - chart);
          counts[key] += 1;
        }
      };

      addDiff('총장', sr.length, chartSize.length);
      if (isTop) {
        addDiff('가슴', sr.chest_or_waist, chartSize.chest);
        addDiff('어깨', sr.shoulder_or_thigh, chartSize.shoulder);
        addDiff('소매단면', sr.sleeve_or_rise, chartSize.sleeve);
        addDiff('소매길이', sr.sleeve_length, chartSize.sleeve_length);
        addDiff('목폭', sr.neck_or_hem, chartSize.neck);
      } else {
        addDiff('허리', sr.chest_or_waist, chartSize.waist);
        addDiff('허벅지', sr.shoulder_or_thigh, chartSize.thigh);
        addDiff('밑위', sr.sleeve_or_rise, chartSize.rise);
        addDiff('밑단', sr.neck_or_hem, chartSize.hem);
      }
    });

    const results = Object.keys(sums).map(key => ({
      label: key,
      avgDiff: sums[key] / counts[key]
    })).filter(r => !isNaN(r.avgDiff));

    return results;
  };

  const avgSizeDiffs = aggregateSizeDiffs();

  return (
    <div className="product-detail-container">
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
                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</p>
                            {item.size_name && <span style={{ fontSize: '0.72rem', color: '#6366f1' }}>{item.size_name}</span>}
                          </div>
                          <button onClick={() => removeCartItem(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: '2px 4px', flexShrink: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: '12px 16px' }}>
                    <button onClick={() => { setCartOpen(false); navigate('/mypage/fitting'); }}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '10px', border: 'none',
                        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                        color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                      }}>
                      ✨ 가상 피팅룸에서 착용해보기
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

      <main className="detail-content">
        <div className="detail-top">
          <div className="detail-image-section">
            <img
              src={`http://localhost:8000${product.image_url}`}
              alt={product.name}
              className="main-product-image"
              onError={(e) => { e.target.src = 'https://via.placeholder.com/500x600?text=No+Image'; }}
            />
          </div>

          <div className="detail-info-section">
            <div className="info-header">
              <div className="category-brand-wrapper">
                {product.brand && <span className="info-brand">{product.brand}</span>}
                <span className="info-category">{product.category.name}</span>
              </div>
              <div className="info-actions">
                <Heart
                  className={`action-icon ${product.is_wished ? 'wished' : ''}`}
                  size={24}
                  fill={product.is_wished ? "#ff4d4f" : "none"}
                  color={product.is_wished ? "#ff4d4f" : "#aaa"}
                  onClick={handleToggleWish}
                />
                <Share2 className="action-icon" size={24} />
              </div>
            </div>

            <h1 className="info-name">{product.name}</h1>

            <div className="info-stats-row">
              <div className="info-stat-item">
                <Star size={18} fill="#ffc107" color="#ffc107" />
                <span className="stat-value">{product.avg_rating || 0}</span>
                <span className="stat-label">({product.review_count || 0}개의 후기)</span>
              </div>
              <div className="stat-divider"></div>
              <div className="info-stat-item">
                <Heart size={18} fill="#ff4d4f" color="#ff4d4f" />
                <span className="stat-value">{product.wish_count || 0}</span>
                <span className="stat-label">명이 찜함</span>
              </div>
            </div>

            <div className="info-price-row">
              <span className="info-price">{product.price.toLocaleString()}</span>
              <span className="currency">원</span>
            </div>

            <div className="info-divider"></div>

            <button className="btn-virtual-fitting" onClick={() => navigate(`/products/${id}/fitting`)}>
              ✨ 가상 피팅 시뮬레이션
            </button>

            <div className="purchase-actions">
              <button
                className="btn-cart"
                onClick={() => {
                  const sizes = product?.category?.name?.includes('상의') ? product.top_sizes : product.bottom_sizes;
                  if (sizes && sizes.length > 0) { setShowCartModal(true); }
                  else handleAddToCart();
                }}
                style={cartAdded ? { background: '#27ae60', color: 'white' } : {}}
              >
                <ShoppingCart size={20} />
                <span>{cartAdded ? '담김 ✓' : '장바구니'}</span>
              </button>
              <button className="btn-buy">바로 구매하기</button>
              <button className="btn-wish" onClick={handleToggleWish}>
                <Heart size={20} fill={product.is_wished ? "#ff4d4f" : "none"} color={product.is_wished ? "#ff4d4f" : "#aaa"} />
              </button>
            </div>

            {showCartModal && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                zIndex: 1000,
              }} onClick={() => setShowCartModal(false)}>
                <div style={{
                  background: 'white', borderRadius: '20px 20px 0 0',
                  padding: '28px 24px 32px', width: '100%', maxWidth: '480px',
                  boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
                }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>사이즈 선택</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                    {(product?.category?.name?.includes('상의') ? product.top_sizes : product.bottom_sizes).map(s => (
                      <button
                        key={s.size_name}
                        onClick={() => setSelectedCartSize(s.size_name)}
                        style={{
                          padding: '10px 22px', borderRadius: '10px', fontWeight: 600,
                          fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s',
                          border: selectedCartSize === s.size_name ? '2px solid #6366f1' : '2px solid #e2e8f0',
                          background: selectedCartSize === s.size_name ? '#eef2ff' : 'white',
                          color: selectedCartSize === s.size_name ? '#6366f1' : '#334155',
                        }}
                      >
                        {s.size_name}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleAddToCart}
                    disabled={!selectedCartSize || cartAdding}
                    style={{
                      width: '100%', padding: '14px',
                      background: !selectedCartSize ? '#e2e8f0' : 'linear-gradient(135deg, #6366f1, #a855f7)',
                      color: !selectedCartSize ? '#94a3b8' : 'white',
                      border: 'none', borderRadius: '12px',
                      fontSize: '1rem', fontWeight: 700, cursor: !selectedCartSize ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {cartAdding ? '담는 중...' : '장바구니에 담기'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="detail-bottom">
          <div className="detail-tabs">
            <button className={`tab-item ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>상세정보</button>
            <button className={`tab-item ${activeTab === 'size' ? 'active' : ''}`} onClick={() => setActiveTab('size')}>사이즈</button>
            <button className={`tab-item ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>리뷰 ({reviews.length})</button>
          </div>

          {activeTab === 'details' && (
            <div className="detail-description-content">
              <h3 className="desc-title">PRODUCT INFO</h3>
              {product.desc_images && product.desc_images.length > 0 && (
                <div className="desc-image-wrapper">
                  {product.desc_images.map((img) => (
                    <img
                      key={img.id}
                      src={`http://localhost:8000${img.image_url}`}
                      alt="Detail"
                      className="desc-image"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'size' && (
            <div className="detail-size-content">
              {/* 공식 사이즈표 */}
              <div className="official-size-chart-section">
                <h3 className="size-chart-title">공식 사이즈표</h3>
                <div className="size-chart-table-wrapper">
                  <table className="size-chart-table">
                    <thead>
                      <tr>
                        <th>사이즈</th>
                        <th>총장</th>
                        {product.category.name.includes('상의') ? (
                          <><th>어깨</th><th>가슴</th><th>소매단면</th><th>소매길이</th><th>목폭</th></>
                        ) : (
                          <><th>허리</th><th>허벅지</th><th>밑위</th><th>밑단</th></>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(product.category.name.includes('상의') ? product.top_sizes : product.bottom_sizes).map(s => (
                        <tr key={s.id}>
                          <td><strong>{s.size_name}</strong></td>
                          <td>{s.length}</td>
                          {product.category.name.includes('상의') ? (
                            <><td>{s.shoulder}</td><td>{s.chest}</td><td>{s.sleeve}</td><td>{s.sleeve_length}</td><td>{s.neck}</td></>
                          ) : (
                            <><td>{s.waist}</td><td>{s.thigh}</td><td>{s.rise}</td><td>{s.hem}</td></>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 사이즈 후기 섹션 */}
              <div className="size-reviews-section">
                <div className="sr-header-row">
                  <h4 className="sr-title">사이즈 실측 후기 ({sizeReviews.length})</h4>
                  <button className="btn-register-size-review" onClick={() => isLoggedIn ? navigate(`/reviews/new/${id}`) : (alert('로그인이 필요합니다.'), navigate('/login'))}>
                    리뷰 및 실측 후기 남기기
                  </button>
                </div>
                
                <div className="sr-aggregated-list">
                  {(!sizeReviews || sizeReviews.length === 0) ? (
                    <div className="empty-sr">등록된 사이즈 실측 후기가 없습니다.</div>
                  ) : (
                    <div className="sr-bars-container">
                      <div className="sr-size-filters">
                        <button className={`sr-filter-btn ${selectedSizeFilter === 'ALL' ? 'active' : ''}`} onClick={() => setSelectedSizeFilter('ALL')}>
                          전체 ({sizeReviews.length})
                        </button>
                        {Object.entries(
                          sizeReviews.reduce((acc, sr) => {
                            acc[sr.size_name] = (acc[sr.size_name] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([sizeName, count]) => (
                          <button key={sizeName} className={`sr-filter-btn ${selectedSizeFilter === sizeName ? 'active' : ''}`} onClick={() => setSelectedSizeFilter(sizeName)}>
                            {sizeName} 구매자 ({count}명)
                          </button>
                        ))}
                      </div>

                      <div className="sr-bars-desc">
                        {selectedSizeFilter === 'ALL' ? '전체' : selectedSizeFilter} 구매자들의 실측 데이터를 바탕으로 사이즈표 대비 평균 차이를 보여줍니다.
                      </div>
                      
                      {(!avgSizeDiffs || avgSizeDiffs.length === 0) ? (
                        <div className="empty-sr">해당 사이즈의 실측 후기가 없습니다.</div>
                      ) : (
                        avgSizeDiffs.map(field => {
                          const maxScale = 5; // 최대 5cm 스케일로 시각화
                          const percent = Math.min((Math.abs(field.avgDiff) / maxScale) * 100, 100);
                        const isPositive = field.avgDiff > 0;
                        const isNegative = field.avgDiff < 0;
                        const diffAbs = Math.abs(field.avgDiff).toFixed(1);
                        
                        let valText = "동일함";
                        let colorClass = "same";
                        if (isPositive) { valText = `${diffAbs}cm 더 큼`; colorClass = "positive"; }
                        if (isNegative) { valText = `${diffAbs}cm 더 작음`; colorClass = "negative"; }

                        return (
                          <div key={field.label} className="sr-bar-item">
                            <div className="sr-bar-header">
                              <span className="sr-bar-label">{field.label}</span>
                              <span className={`sr-bar-val ${colorClass}`}>{valText}</span>
                            </div>
                            <div className="sr-bar-track-wrapper">
                              <span className="sr-bar-marker left">작음</span>
                              <div className="sr-bar-track">
                                <div className="sr-bar-center-line"></div>
                                {isPositive && <div className="sr-bar-fill positive" style={{ left: '50%', width: `${percent / 2}%` }}></div>}
                                {isNegative && <div className="sr-bar-fill negative" style={{ right: '50%', width: `${percent / 2}%` }}></div>}
                              </div>
                              <span className="sr-bar-marker right">큼</span>
                            </div>
                          </div>
                        );
                      })
                      )}
                    </div>
                  )}
                </div>

                {mySizeReviews.length > 0 && (
                  <div className="my-sr-section">
                    <h5 className="my-sr-title">내가 작성한 실측 후기 내역</h5>
                    <div className="my-sr-list">
                      {mySizeReviews.map(sr => (
                        <div key={sr.id} className="my-sr-item">
                          <div className="my-sr-info">
                            <span className="my-sr-size">{sr.size_name} 사이즈 측정결과</span>
                            <span className="my-sr-date">{formatDate(sr.created_at)}</span>
                          </div>
                          <div className="my-sr-actions">
                            <button className="my-sr-btn delete" onClick={() => handleDeleteSizeReview(sr.id)}>
                              <Trash2 size={14} /> 삭제하기
                            </button>
                            <button className="my-sr-btn edit" onClick={() => { alert('사이즈 후기는 삭제 후 리뷰 작성 페이지에서 다시 등록해주세요.'); }}>
                              <Edit2 size={14} /> 정정 안내
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="detail-reviews-content">
              <div className="reviews-summary">
                <div className="avg-rating-box">
                  <span className="avg-score">{averageRating}</span>
                  <div className="avg-stars">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={18} fill={s <= Math.round(averageRating) ? "#ffc107" : "none"} color={s <= Math.round(averageRating) ? "#ffc107" : "#cbd5e1"} />
                    ))}
                  </div>
                  <span className="review-count">총 {reviews.length}개의 리뷰</span>
                </div>
                <div className="reviews-action-header">
                  <button className="btn-write-review" onClick={() => isLoggedIn ? navigate(`/reviews/new/${id}`) : (alert('로그인이 필요합니다.'), navigate('/login'))}>
                    <Plus size={18} />
                    <span>리뷰 작성하기</span>
                  </button>
                </div>
              </div>

              <div className="reviews-list">
                {reviews.length === 0 ? (
                  <div className="empty-reviews"><p>아직 작성된 리뷰가 없습니다.</p></div>
                ) : (
                  reviews.map((review) => (
                    <div key={review.id} className="review-item">
                      <div className="review-meta">
                        <span className="review-user">{review.user_email.split('@')[0]}</span>
                        <div className="review-stars">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} size={14} fill={s <= review.rating ? "#ffc107" : "none"} color={s <= review.rating ? "#ffc107" : "#cbd5e1"} />
                          ))}
                        </div>
                        <span className="review-date">{formatDate(review.created_at)}</span>
                        {userEmail === review.user_email && (
                          <div className="review-owner-actions">
                            <button onClick={() => navigate(`/reviews/edit/${review.id}`)}><Edit2 size={14} /></button>
                            <button onClick={() => handleDeleteReview(review.id)}><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                      <div className="review-body">
                        <div className="review-images-list">
                          {review.images && review.images.length > 0 ? (
                            review.images.map((img) => (
                              <div
                                key={img.id}
                                className={`review-image-container ${expandedReviewId === img.id ? 'expanded' : ''}`}
                              >
                                <img
                                  src={`http://localhost:8000${img.image_url}`}
                                  alt="Review"
                                  className={`review-image ${expandedReviewId === img.id ? 'expanded' : ''}`}
                                  onClick={() => setExpandedReviewId(expandedReviewId === img.id ? null : img.id)}
                                />
                              </div>
                            ))
                          ) : (
                            review.image_url && (
                              <div className={`review-image-container ${expandedReviewId === review.id ? 'expanded' : ''}`}>
                                <img
                                  src={`http://localhost:8000${review.image_url}`}
                                  alt="Review"
                                  className={`review-image ${expandedReviewId === review.id ? 'expanded' : ''}`}
                                  onClick={() => setExpandedReviewId(expandedReviewId === review.id ? null : review.id)}
                                />
                              </div>
                            )
                          )}
                        </div>
                        <p className="review-comment">{review.comment}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default ProductDetail;
