import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './ProductRegister.css';

function ProductRegister() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    price: '',
    description: '',
  });
  
  const [mainImage, setMainImage] = useState(null);
  const [descImage, setDescImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const userEmail = sessionStorage.getItem('userEmail')?.trim();

  useEffect(() => {
    fetchCategories();
    if (isEditMode) {
      fetchProductData();
    }
  }, [id]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
        if (data.length > 0 && !isEditMode) {
          setFormData((prev) => ({ ...prev, category_id: data[0].id }));
        }
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProductData = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/products/${id}`);
      if (response.ok) {
        const data = await response.json();
        setFormData({
          category_id: data.category.id,
          name: data.name,
          price: data.price,
          description: data.description || '',
        });
      }
    } catch (error) {
      console.error('Error fetching product data:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMainImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setMainImage(e.target.files[0]);
    }
  };

  const handleDescImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setDescImage(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Get fresh email from sessionStorage
    const currentEmail = sessionStorage.getItem('userEmail')?.trim();

    if (!mainImage && !isEditMode) {
      alert('상품 대표 이미지를 선택해주세요.');
      return;
    }

    if (!formData.category_id) {
      alert('카테고리를 선택해주세요.');
      return;
    }

    if (!currentEmail) {
      alert('로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인해주세요.');
      navigate('/login');
      return;
    }

    if (categories.length === 0) {
      alert('카테고리 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      fetchCategories();
      return;
    }

    setLoading(true);

    try {
      const submitData = new FormData();
      submitData.append('category_id', formData.category_id);
      submitData.append('name', formData.name);
      submitData.append('price', formData.price);
      submitData.append('description', formData.description);
      submitData.append('owner_email', currentEmail);
      
      if (mainImage) {
        submitData.append('image', mainImage);
      }
      
      if (descImage) {
        submitData.append('desc_image', descImage);
      }

      const url = isEditMode 
        ? `http://localhost:8000/api/products/${id}` 
        : 'http://localhost:8000/api/products';
      const method = isEditMode ? 'PUT' : 'POST';

      console.log('Submitting to:', url, 'Method:', method);

      const response = await fetch(url, {
        method: method,
        body: submitData,
      });

      if (response.ok) {
        alert(isEditMode ? '상품이 수정되었습니다.' : '상품이 성공적으로 등록되었습니다.');
        navigate('/mypage/products');
      } else {
        const errData = await response.json();
        alert(`실패했습니다: ${errData.detail || '서버 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('네트워크 오류가 발생했습니다. 서버 연결을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-header-wrapper">
        <button onClick={() => navigate('/products')} className="back-btn">
          &larr; 목록으로
        </button>
        <h2>{isEditMode ? '상품 수정' : '상품 등록'}</h2>
        <div style={{ width: '80px' }}></div> {/* spacer */}
      </div>

      <div className="register-card">
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="category">카테고리 <span className="required">*</span></label>
            <select 
              id="category" 
              name="category_id" 
              value={formData.category_id} 
              onChange={handleInputChange} 
              required
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="name">상품명 <span className="required">*</span></label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              placeholder="예: 베이직 오버핏 코튼 셔츠" 
              value={formData.name} 
              onChange={handleInputChange} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="price">가격 (원) <span className="required">*</span></label>
            <input 
              type="number" 
              id="price" 
              name="price" 
              placeholder="예: 25000" 
              value={formData.price} 
              onChange={handleInputChange} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="mainImage">상품 이미지 (대표) <span className="required">*</span></label>
            <div className="file-input-wrapper">
              <input 
                type="file" 
                id="mainImage" 
                accept="image/*" 
                onChange={handleMainImageChange} 
                className="file-input"
              />
              <span className="file-name">{mainImage ? mainImage.name : '이미지 파일을 선택하세요'}</span>
            </div>
          </div>

          <hr className="divider" />

          <div className="form-group">
            <label htmlFor="description">상품 설명</label>
            <textarea 
              id="description" 
              name="description" 
              placeholder="상품에 대한 상세 설명을 작성해주세요." 
              value={formData.description} 
              onChange={handleInputChange}
              rows="6"
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="descImage">설명 첨부 이미지 (선택)</label>
            <div className="file-input-wrapper alternate">
              <input 
                type="file" 
                id="descImage" 
                accept="image/*" 
                onChange={handleDescImageChange} 
                className="file-input"
              />
              <span className="file-name">{descImage ? descImage.name : '추가 설명 이미지를 선택하세요'}</span>
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? (isEditMode ? '수정 중...' : '등록 중...') : (isEditMode ? '상품 수정하기' : '상품 등록하기')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProductRegister;
