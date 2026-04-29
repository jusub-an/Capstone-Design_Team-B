import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import ProductList from './pages/ProductList';
import ProductRegister from './pages/ProductRegister';
import ProductDetail from './pages/ProductDetail';
import MyPage from './pages/MyPage';
import MyProducts from './pages/MyProducts';
import ReviewRegister from './pages/ReviewRegister';
import Wishlist from './pages/Wishlist';
import MyReviews from './pages/MyReviews';
import BodyMeasure from './pages/BodyMeasure';

function App() {
  return (
    <Router>
      <div className="app-container">
        {/* Animated Background Blobs */}
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        
        <Routes>
          <Route path="/" element={<Navigate to="/products" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/products/new" element={<ProductRegister />} />
          <Route path="/products/edit/:id" element={<ProductRegister />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/mypage/products" element={<MyProducts />} />
          <Route path="/reviews/new/:productId" element={<ReviewRegister />} />
          <Route path="/reviews/edit/:reviewId" element={<ReviewRegister />} />
          <Route path="/mypage/body-measure" element={<BodyMeasure />} />
          <Route path="/mypage/wishes" element={<Wishlist />} />
          <Route path="/mypage/reviews" element={<MyReviews />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
