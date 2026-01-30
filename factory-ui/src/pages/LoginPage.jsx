import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!userId || !password) {
      setError('Please enter both user ID and password.');
      return;
    }
    setLoading(true);
    try {
      await login(userId, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form className="w-full max-w-xs rounded-lg bg-white p-6 shadow" onSubmit={handleLogin}>
        <h2 className="mb-4 text-xl font-bold text-slate-800">Login</h2>
        <label className="block mb-2 text-sm font-medium text-slate-700">User ID</label>
        <input
          className="mb-4 w-full rounded border px-3 py-2 text-sm"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          autoFocus
        />
        <label className="block mb-2 text-sm font-medium text-slate-700">Password</label>
        <input
          className="mb-4 w-full rounded border px-3 py-2 text-sm"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          className="w-full rounded bg-blue-600 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <div className="mt-4 text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <a href="/register" className="text-blue-600 hover:underline">Register</a>
        </div>
      </form>
    </div>
  );
}
