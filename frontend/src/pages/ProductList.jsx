import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Heart, Search, ShoppingBag, Eye, ArrowUpDown, Filter, ChevronRight } from 'lucide-react';
import './ProductList.css';
import axios from 'axios';

function ProductList() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(!!sessionStorage.getItem('token'));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const navigate = useNavigate();
  const username = sessionStorage.getItem('username') || 'User';

  useEffect(() => {
    setIsLoggedIn(!!sessionStorage.getItem('token'));
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    try {
      const userEmail = sessionStorage.getItem('userEmail');
      const url = userEmail
        ? `http://localhost:8000/api/products?user_email=${userEmail}`
        : 'http://localhost:8000/api/products';

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories([{ id: 'all', name: 'All' }, ...data]);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search Filter
    if (searchQuery) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Category Filter
    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category.name === selectedCategory);
    }

    // Sorting
    if (sortBy === 'price-low') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating') {
      result.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
    } else {
      // Default newest - assuming higher ID is newer or using id for stability
      result.sort((a, b) => b.id - a.id);
    }

    return result;
  }, [products, searchQuery, selectedCategory, sortBy]);

  const handleToggleWish = async (e, productId) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoggedIn) {
      alert('로그인이 필요한 서비스입니다.');
      navigate('/login');
      return;
    }

    const userEmail = sessionStorage.getItem('userEmail');

    setProducts(prevProducts =>
      prevProducts.map(p =>
        p.id === productId
          ? { ...p, is_wished: !p.is_wished, wish_count: p.is_wished ? p.wish_count - 1 : p.wish_count + 1 }
          : p
      )
    );

    const formData = new FormData();
    formData.append('product_id', productId);
    formData.append('user_email', userEmail);

    try {
      await axios.post('http://localhost:8000/api/wishes/toggle', formData);
    } catch (error) {
      console.error('Error toggling wish:', error);
      fetchProducts();
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

        <div className="header-search">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="찾으시는 상품을 검색해보세요"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
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


      <div className="category-section">
        <div className="category-pills">
          {categories.map(cat => (
            <div
              key={cat.id}
              className={`category-pill ${selectedCategory === cat.name ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.name)}
            >
              {cat.name}
            </div>
          ))}
        </div>

        <div className="sort-dropdown-wrapper">
          <ArrowUpDown size={16} color="#64748b" />
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="newest">최신순</option>
            <option value="price-low">가격 낮은순</option>
            <option value="price-high">가격 높은순</option>
            <option value="rating">평점 높은순</option>
          </select>
        </div>
      </div>

      <main className="product-main">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <p>검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <div key={product.id} className="product-card" onClick={() => navigate(`/products/${product.id}`)}>
                <div className="product-image-container">
                  <img
                    src={`http://localhost:8000${product.image_url}`}
                    alt={product.name}
                    className="product-image"
                    onError={(e) => { e.target.src = 'https://via.placeholder.com/400x500?text=No+Image'; }}
                  />
                  <div className="card-badges">
                    {product.id % 5 === 0 && <span className="badge-new">NEW</span>}
                    {product.wish_count > 10 && <span className="badge-hot">HOT</span>}
                  </div>
                  <button
                    className={`wish-button ${product.is_wished ? 'wished' : ''}`}
                    onClick={(e) => handleToggleWish(e, product.id)}
                  >
                    <Heart size={20} fill={product.is_wished ? "#ff4d4f" : "none"} color={product.is_wished ? "#ff4d4f" : "currentColor"} />
                  </button>
                </div>
                <div className="product-info">
                  <span className="product-brand">{product.brand || 'VF Basic'}</span>
                  <h4 className="product-name">{product.name}</h4>

                  <div className="product-price-row">
                    <span className="product-price">{product.price.toLocaleString()}</span>
                    <span className="price-unit">원</span>
                  </div>

                  <div className="product-stats">
                    <div className="stat-item rating">
                      <Star size={14} fill="#ffc107" color="#ffc107" />
                      <span>{product.avg_rating || 0}</span>
                    </div>
                    <div className="stat-item">
                      <Heart size={14} fill="#ff4d4f" color="#ff4d4f" />
                      <span>{product.wish_count || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default ProductList;
