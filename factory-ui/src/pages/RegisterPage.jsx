import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function RegisterPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!userId || !password) {
      setError('Please enter both user ID and password.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      // Simulate registration by storing user in localStorage (for demo only)
      const users = JSON.parse(localStorage.getItem('mock-users') || '{}');
      if (users[userId]) {
        setError('User already exists.');
        setLoading(false);
        return;
      }
      users[userId] = { password };
      localStorage.setItem('mock-users', JSON.stringify(users));
      setSuccess('Registration successful! You can now log in.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError('Registration error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form className="w-full max-w-xs rounded-lg bg-white p-6 shadow" onSubmit={handleRegister}>
        <div className="flex flex-col items-center justify-center flex-1">
          <h2 className="mb-6 text-2xl font-bold text-slate-800">Register</h2>
        </div>
        <label className="block mb-2 text-sm font-medium text-slate-700">User ID</label>
        <input
          className="mb-4 w-full rounded border px-3 py-2 text-sm text-black "
          placeholder="Enter your user ID"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          autoFocus
        />
        <label className="block mb-2 text-sm font-medium text-slate-700">Password</label>
        <input
          className="mb-4 w-full rounded border px-3 py-2 text-sm text-black "
          placeholder='Enter your password'
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <label className="block mb-2 text-sm font-medium text-slate-700">Confirm Password</label>
        <input
          className="mb-4 w-full rounded border px-3 py-2 text-sm text-black "
          placeholder="Confirm your password"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
        {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
        {success && <div className="mb-2 text-sm text-green-600">{success}</div>}
        <button
          type="submit"
          className="w-full rounded bg-blue-600 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Registering...' : 'Register'}
        </button>
        <div className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <a href="/login" className="text-blue-600 hover:underline">Login</a>
        </div>
      </form>
    </div>
  );
}
