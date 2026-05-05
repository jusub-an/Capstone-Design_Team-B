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

  useEffect(() => {
    if (!userEmail) {
      navigate('/login');
      return;
    }
    fetchMyProducts();
  }, [userEmail]);

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
          <button className="action-icon-btn">
            <ShoppingBag size={22} />
            <span className="badge">0</span>
          </button>

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
                          onError={(e) => { e.target.src = 'https://via.placeholder.com/50x60'; }}
                        />
                      </td>
                      <td className="product-name-cell">{product.name}</td>
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
