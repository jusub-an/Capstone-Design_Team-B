import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, UserPlus, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await axios.post('http://localhost:8000/api/register', {
        username,
        email,
        password
      });
      setSuccess('회원가입에 성공했습니다! 로그인 페이지로 이동합니다.');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.detail || '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">무료로 회원가입하고 시작하세요!</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="error-message" style={{background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.2)'}}>{success}</div>}

      <form className="auth-form" onSubmit={handleRegister}>
        <div className="input-group">
          <label className="input-label">사용자 이름</label>
          <div className="input-wrapper">
            <User className="input-icon" size={20} />
            <input 
              type="text" 
              className="auth-input" 
              placeholder="홍길동"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
        </div>

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

        <button type="submit" className="auth-button" disabled={loading || success}>
          {loading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
          <span>회원가입</span>
        </button>
      </form>

      <div className="auth-footer">
        이미 계정이 있으신가요? 
        <Link to="/login" className="auth-link">로그인</Link>
      </div>
    </div>
  );
}
