import React, { createContext, useContext, useState, useCallback } from 'react';
import '../components/Toast.css';

const ToastCtx = createContext(null);
let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const MAX = 3;

  const showToast = useCallback((message, type = 'success') => {
    const id = ++_id;
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    });
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
