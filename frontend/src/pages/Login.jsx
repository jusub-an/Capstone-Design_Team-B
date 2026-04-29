import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('http://localhost:8000/api/login', {
        email,
        password
      });
      // Handle succcess - Save token, redirect
      sessionStorage.setItem('token', response.data.access_token);
      sessionStorage.setItem('username', response.data.username);
      sessionStorage.setItem('userEmail', response.data.email);
      navigate('/products');
    } catch (err) {
      setError(err.response?.data?.detail || '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-title">Virtual Fitting</h1>
        <p className="auth-subtitle">서비스 이용을 위해 로그인해주세요.</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form className="auth-form" onSubmit={handleLogin}>
        <div className="input-group">
          <label className="input-label">이메일 주소</label>
          <div className="input-wrapper">
            <Mail className="input-icon" size={20} />
            <input
              type="email"
              className="auth-input"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">비밀번호</label>
          <div className="input-wrapper">
            <Lock className="input-icon" size={20} />
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="auth-button" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
          <span>로그인</span>
        </button>
      </form>

      <div className="auth-footer">
        계정이 없으신가요?
        <Link to="/register" className="auth-link">회원가입</Link>
      </div>
    </div>
  );
}
