// All API calls are now mocked or use static data. No backend is required.

/**
 * Make an authenticated API request
 * @param {string} endpoint - API endpoint (e.g., '/layouts')
 * @param {object} options - Fetch options
 * @returns {Promise} Response data
 */
export async function apiRequest(endpoint, options = {}) {
  // All API requests are now mocked. Use mockApi.js or static data instead.
  throw new Error('API is mocked. Use mockApi.js or static data.');
}

/**
 * Login user
 */
export async function login(userId, password) {
  // Simulate login and store a fake token
  const userData = {
    id: userId,
    name: userId,
    email: `${userId}@company.com`,
    role: 'User',
  };
  localStorage.setItem('factory-ui:token', 'mock-token');
  localStorage.setItem('user', JSON.stringify(userData));
  return userData;
}

/**
 * Logout user
 */
export function logout() {
  localStorage.removeItem('user');
  localStorage.removeItem('factory-ui:token');
  window.location.href = '/login';
}

/**
 * Get current user info
 */
export async function getCurrentUser() {
  // Return user from localStorage if present
  const user = localStorage.getItem('user');
  if (user) return JSON.parse(user);
  throw new Error('No user logged in');
}
