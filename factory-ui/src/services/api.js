const API_BASE_URL = 'http://localhost:3000/api';

/**
 * Make an authenticated API request
 * @param {string} endpoint - API endpoint (e.g., '/layouts')
 * @param {object} options - Fetch options
 * @returns {Promise} Response data
 */
export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('factory-ui:token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    // If unauthorized, redirect to login
    if (response.status === 401) {
      localStorage.removeItem('user');
      localStorage.removeItem('factory-ui:token');
      window.location.href = '/login';
    }
    throw new Error(data.error || 'API request failed');
  }
  
  return data;
}

/**
 * Login user
 */
export async function login(userId, password) {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }
  
  // Store token
  localStorage.setItem('factory-ui:token', data.token);
  
  // Store user data
  const userData = {
    id: data.userId,
    name: data.userId,
    email: `${data.userId}@company.com`,
    role: 'User',
  };
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
  return apiRequest('/user');
}

/**
 * Get department layout (current and previous)
 * @param {string} factoryId
 * @param {string} plantId
 * @param {string} departmentId
 * @returns {Promise<{current: object|null, previous: object|null}>}
 */
export async function getDepartmentLayout(factoryId, plantId, departmentId) {
  const params = new URLSearchParams({
    factoryId: factoryId || '',
    plantId: plantId || '',
    departmentId: departmentId || '',
  });
  return apiRequest(`/layouts?${params}`);
}

/**
 * Save department layout
 * @param {string} factoryId
 * @param {string} plantId
 * @param {string} departmentId
 * @param {object} layout - Layout object to save
 * @returns {Promise<{current: object, previous: object|null}>}
 */
export async function saveDepartmentLayout(factoryId, plantId, departmentId, layout) {
  const params = new URLSearchParams({
    factoryId: factoryId || '',
    plantId: plantId || '',
    departmentId: departmentId || '',
  });
  return apiRequest(`/layouts?${params}`, {
    method: 'POST',
    body: JSON.stringify({ layout }),
  });
}

/**
 * Delete department layout
 * @param {string} factoryId
 * @param {string} plantId
 * @param {string} departmentId
 * @returns {Promise<{ok: boolean}>}
 */
export async function deleteDepartmentLayout(factoryId, plantId, departmentId) {
  const params = new URLSearchParams({
    factoryId: factoryId || '',
    plantId: plantId || '',
    departmentId: departmentId || '',
  });
  return apiRequest(`/layouts?${params}`, {
    method: 'DELETE',
  });
}
