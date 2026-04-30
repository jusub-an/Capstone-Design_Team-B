import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Edit2, Trash2, ChevronLeft, Package } from 'lucide-react';
import './MyProducts.css';

function MyProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const userEmail = sessionStorage.getItem('userEmail')?.trim();

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

    // For now, let's remove confirm to see if it's the issue, or use a simpler check
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

  return (
      <div className="my-products-container">
      <div className="my-products-header">
        <button onClick={() => navigate('/mypage')} className="back-btn">
          <ChevronLeft size={20} />
          <span>마이페이지</span>
        </button>
        <h1>상품 관리</h1>
        <p>{products.length}개의 상품이 등록되어 있습니다.</p>
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
                      <button className="edit-btn" onClick={() => navigate(`/products/edit/${product.id}`)}>
                        <Edit2 size={16} />
                        <span>수정</span>
                      </button>
                      <button className="delete-btn" onClick={(e) => handleDelete(e, product.id)}>
                        <Trash2 size={16} />
                        <span>삭제</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default MyProducts;
