import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Edit2, Trash2, ChevronLeft, Package, Search, Heart, ShoppingBag } from 'lucide-react';
import './ProductList.css';
import './MyProducts.css';

function MyProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const userEmail = sessionStorage.getItem('userEmail')?.trim();
  const username = sessionStorage.getItem('username') || 'User';
  const isLoggedIn = !!sessionStorage.getItem('token');
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    if (!userEmail) {
      navigate('/login');
      return;
    }
    fetchMyProducts();
    refreshCart();
  }, [userEmail]);

  const refreshCart = () => {
    const email = sessionStorage.getItem('userEmail');
    if (!email) return;
    fetch(`http://localhost:8000/api/cart/${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : [])
      .then(items => { setCartItems(items); setCartCount(items.length); })
      .catch(() => {});
  };

  const removeCartItem = async (itemId) => {
    const email = sessionStorage.getItem('userEmail');
    if (!email) return;
    await fetch(`http://localhost:8000/api/cart/${itemId}?user_email=${encodeURIComponent(email)}`, { method: 'DELETE' });
    refreshCart();
  };

  const fetchMyProducts = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/products/user/${encodeURIComponent(userEmail)}`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    // Prevent event from bubbling if there's any parent listener
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!window.confirm('이 상품을 삭제하시겠습니까?')) return;

    console.log('Delete button clicked for ID:', id);

    try {
      const response = await axios.delete(`http://localhost:8000/api/products/${id}`, {
        params: { owner_email: userEmail }
      });

      console.log('Delete response:', response.data);

      if (response.status === 200) {
        setProducts(prev => prev.filter(p => p.id !== id));
        alert('성공적으로 삭제되었습니다.');
      }
    } catch (error) {
      console.error('Delete error details:', error.response || error);
      const errorMsg = error.response?.data?.detail || '삭제에 실패했습니다.';
      alert(`삭제 실패: ${errorMsg}`);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  return (
    <div className="product-list-container">
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

      <div className="my-products-container">
        <div className="my-products-header">
          <button onClick={() => navigate('/mypage')} className="back-btn">
            <ChevronLeft size={20} />
            <span>마이페이지</span>
          </button>
          <div className="header-title-row">
            <h1>상품 관리</h1>
            <button className="add-product-btn" onClick={() => navigate('/products/new')}>
              <Plus size={20} /> 새 상품 등록
            </button>
          </div>
          <p className="header-subtitle">{products.length}개의 상품이 등록되어 있습니다.</p>
        </div>

        <main className="my-products-content">
          {loading ? (
            <div className="loading-state">로딩 중...</div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <Package size={48} color="#ccc" />
              <p>등록된 상품이 없습니다.</p>
              <button className="inline-add-btn" onClick={() => navigate('/products/new')}>
                첫 상품 등록하기
              </button>
            </div>
          ) : (
            <div className="products-table-wrapper">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>이미지</th>
                    <th>상품명</th>
                    <th>카테고리</th>
                    <th>가격</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id}>
                      <td>
                        <img
                          src={`http://localhost:8000${product.image_url}`}
                          alt={product.name}
                          className="table-thumb"
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/products/${product.id}`)}
                          onError={(e) => { e.target.src = 'https://via.placeholder.com/50x60'; }}
                        />
                      </td>
                      <td className="product-name-cell" style={{ cursor: 'pointer' }} onClick={() => navigate(`/products/${product.id}`)}>{product.name}</td>
                      <td>{product.category.name}</td>
                      <td>{product.price.toLocaleString()}원</td>
                      <td className="actions-cell">
                        <div className="actions-wrapper">
                          <button className="edit-btn" onClick={() => navigate(`/products/edit/${product.id}`)}>
                            <Edit2 size={16} />
                            <span>수정</span>
                          </button>
                          <button className="delete-btn" onClick={(e) => handleDelete(e, product.id)}>
                            <Trash2 size={16} />
                            <span>삭제</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default MyProducts;
