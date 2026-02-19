/**
 * Decode JWT token without verification (client-side only)
 * @param {string} token - JWT token
 * @returns {object|null} Decoded payload or null if invalid
 */
export function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Check if JWT token is expired
 * @param {string} token - JWT token
 * @returns {boolean} True if token is expired
 */
export function isTokenExpired(token) {
  if (!token) return true;
  
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return true;
  
  // exp is in seconds, Date.now() is in milliseconds
  const expirationTime = decoded.exp * 1000;
  const currentTime = Date.now();
  
  return currentTime >= expirationTime;
}

/**
 * Clear authentication data from localStorage
 */
export function clearAuth() {
  localStorage.removeItem('user');
  localStorage.removeItem('factory-ui:token');
}

/**
 * Check if user is logged in with valid token
 * @returns {boolean} True if user is logged in with valid token
 */
export function isAuthenticated() {
  if (typeof localStorage === 'undefined') return false;
  
  const token = localStorage.getItem('factory-ui:token');
  const user = localStorage.getItem('user');
  
  // Must have both token and user data
  if (!token || !user) {
    clearAuth();
    return false;
  }
  
  // Check if token is expired
  if (isTokenExpired(token)) {
    clearAuth();
    return false;
  }
  
  return true;
}
