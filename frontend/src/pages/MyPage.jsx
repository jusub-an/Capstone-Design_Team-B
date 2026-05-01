import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Package, User, MessageSquareMore, Settings, LogOut, Heart } from 'lucide-react';
import './ProductList.css'; // Reusing some header styles

function MyPage() {
  const navigate = useNavigate();
  const username = sessionStorage.getItem('username') || 'User';
  const email = sessionStorage.getItem('userEmail') || 'No Email';

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userEmail');
    navigate('/login');
  };

  const menuItems = [
    { title: '상품 관리', icon: <Package size={20} />, path: '/mypage/products', description: '등록한 상품을 확인합니다.' },
    { title: '찜한 상품 목록', icon: <Heart size={20} />, path: '/mypage/wishes', description: '찜한 상품들을 확인합니다.' },
    { title: '아바타 관리', icon: <User size={20} />, path: '/mypage/body-measure', description: '나의 아바타 정보를 확인합니다.' },
    { title: '리뷰 관리', icon: <MessageSquareMore size={20} />, path: '/mypage/reviews', description: '작성한 리뷰 목록을 확인합니다.' }
  ];

  return (
    <div className="product-list-container">
      <header className="product-header">
        <div className="logo-section" onClick={() => navigate('/products')} style={{ cursor: 'pointer' }}>
          <h2>Virtual Fitting</h2>
        </div>
        <div className="header-actions">
          <div className="user-profile-wrapper">
            <div className="user-avatar">
              {username.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="product-main" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="mypage-profile-card" style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '30px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '40px',
          boxShadow: '0 8px 32px rgba(31, 38, 135, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.18)'
        }}>
          <div className="profile-avatar" style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6e8efb, #a777e3)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '2rem',
            color: 'white',
            fontWeight: 'bold'
          }}>
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{username} 님</h2>
            <p style={{ margin: '5px 0 0', color: '#666' }}>{email}</p>
          </div>
        </div>

        <h3 className="section-title">마이페이지</h3>

        <div className="mypage-menu-grid" style={{ display: 'grid', gap: '15px' }}>
          {menuItems.map((item, idx) => (
            <div
              key={idx}
              className="menu-item"
              onClick={() => item.path !== '#' && navigate(item.path)}
              style={{
                background: 'white',
                padding: '20px',
                borderRadius: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: item.path !== '#' ? 'pointer' : 'default',
                transition: 'transform 0.2s, box-shadow 0.2s',
                border: '1px solid #eee'
              }}
              onMouseEnter={(e) => {
                if (item.path !== '#') {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 5px 15px rgba(0,0,0,0.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#f0f2f5',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  color: '#555'
                }}>
                  {item.icon}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{item.title}</h4>
                  <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#888' }}>{item.description}</p>
                </div>
              </div>
              {item.path !== '#' && <ChevronRight size={20} color="#ccc" />}
            </div>
          ))}

          <div
            className="menu-item logout-item"
            onClick={handleLogout}
            style={{
              marginTop: '20px',
              padding: '20px',
              borderRadius: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              cursor: 'pointer',
              color: '#ff4d4f'
            }}
          >
            <LogOut size={20} />
            <span style={{ fontWeight: '600' }}>로그아웃</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default MyPage;
