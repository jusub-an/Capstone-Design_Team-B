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
    brand: '',
    price: '',
  });

  const [mainImage, setMainImage] = useState(null);
  const [descImages, setDescImages] = useState([]);
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
          brand: data.brand || '',
          price: data.price,
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
    if (e.target.files) {
      setDescImages(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
      const submitData = new FormData();
      submitData.append('category_id', formData.category_id);
      submitData.append('name', formData.name);
      submitData.append('brand', formData.brand);
      submitData.append('price', formData.price);
      submitData.append('owner_email', currentEmail);

      if (mainImage) submitData.append('image', mainImage);
      if (descImages.length > 0) {
        descImages.forEach((img) => submitData.append('desc_images', img));
      }

      const url = isEditMode ? `http://localhost:8000/api/products/${id}` : 'http://localhost:8000/api/products';
      const response = await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        body: submitData,
      });

      if (response.ok) {
        alert(isEditMode ? '상품이 수정되었습니다.' : '상품이 성공적으로 등록되었습니다.');
        navigate('/mypage/products');
      } else {
        const errData = await response.json();
        const detail = typeof errData.detail === 'object'
          ? JSON.stringify(errData.detail, null, 2)
          : errData.detail;
        alert(`실패: ${detail || '서버 오류가 발생했습니다.'}`);
      }
    } catch (error) {
      console.error(error);
      alert('네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-header-wrapper">
        <button onClick={() => navigate('/mypage/products')} className="back-btn">&larr; 목록으로</button>
        <h2>{isEditMode ? '상품 수정' : '상품 등록'}</h2>
        <div style={{ width: '80px' }}></div>
      </div>

      <div className="register-card">
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label>브랜드 <span className="required">*</span></label>
            <input type="text" name="brand" value={formData.brand} onChange={handleInputChange} required />
          </div>

          <div className="form-group">
            <label>카테고리 <span className="required">*</span></label>
            <select name="category_id" value={formData.category_id} onChange={handleInputChange} required>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>상품명 <span className="required">*</span></label>
            <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
          </div>

          <div className="form-group">
            <label>가격 (원) <span className="required">*</span></label>
            <input type="number" name="price" value={formData.price} onChange={handleInputChange} required />
          </div>

          <div className="form-group">
            <label>상품 이미지 (대표) <span className="required">*</span></label>
            <div className="file-input-wrapper">
              <input type="file" accept="image/*" onChange={handleMainImageChange} className="file-input" />
              <span className="file-name">{mainImage ? mainImage.name : '파일 선택'}</span>
            </div>
          </div>

          <div className="form-group">
            <label>상품 상세 이미지(여러장 가능) <span className="required">*</span></label>
            <div className="file-input-wrapper alternate">
              <input type="file" accept="image/*" onChange={handleDescImageChange} className="file-input" multiple required={!isEditMode} />
              <span className="file-name">{descImages.length > 0 ? `${descImages.length}개 선택됨` : '파일 선택'}</span>
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '처리 중...' : (isEditMode ? '수정하기' : '등록하기')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProductRegister;
