import React, { useEffect, useState } from 'react';

/**
 * Listens to window 'error' and 'unhandledrejection' events.
 * Shows a fixed-position red banner displaying the error message so
 * the user can screenshot it even if the React tree has crashed.
 */
const GlobalErrorOverlay = () => {
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const onError = (e) => {
      const msg = e?.error?.stack || e?.error?.message || e?.message || 'Unknown error';
      setErrors((prev) => [...prev.slice(-4), { id: Date.now() + Math.random(), msg }]);
    };
    const onRejection = (e) => {
      const r = e?.reason;
      const msg = r?.stack || r?.message || (typeof r === 'string' ? r : JSON.stringify(r));
      setErrors((prev) => [...prev.slice(-4), { id: Date.now() + Math.random(), msg: `[Promise] ${msg}` }]);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        right: 12,
        zIndex: 999999,
        maxHeight: '50vh',
        overflowY: 'auto',
        background: '#fee2e2',
        border: '2px solid #b91c1c',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        fontFamily: 'monospace',
      }}
      data-testid="global-error-overlay"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: '#7f1d1d' }}>⚠ JavaScript Error Detected ({errors.length})</strong>
        <button
          onClick={() => setErrors([])}
          style={{ background: '#b91c1c', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}
        >
          Dismiss
        </button>
      </div>
      {errors.map((er) => (
        <pre
          key={er.id}
          style={{
            background: '#fff',
            border: '1px solid #fca5a5',
            color: '#7f1d1d',
            padding: 8,
            margin: '4px 0',
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {er.msg}
        </pre>
      ))}
      <div style={{ fontSize: 11, color: '#7f1d1d', marginTop: 6 }}>
        Please screenshot this message and share it.
      </div>
    </div>
  );
};

export default GlobalErrorOverlay;
