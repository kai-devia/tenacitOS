const API_BASE = '/api';

/**
 * Get stored auth token
 */
export function getToken() {
  return localStorage.getItem('kai-doc-token');
}

/**
 * Set auth token
 */
export function setToken(token) {
  localStorage.setItem('kai-doc-token', token);
}

/**
 * Clear auth token
 */
export function clearToken() {
  localStorage.removeItem('kai-doc-token');
}

/**
 * API client with auth headers
 */
async function request(path, options = {}) {
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  
  if (response.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('No autorizado');
  }
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Error de servidor');
  }
  
  return data;
}

/**
 * Login
 */
export async function login(user, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ user, password }),
  });
  setToken(data.token);
  return data;
}

/**
 * Logout
 */
export function logout() {
  clearToken();
  window.location.href = '/login';
}

/**
 * Get file tree
 */
export async function getFileTree() {
  return request('/files');
}

/**
 * Get flat file list
 */
export async function getFileList() {
  return request('/files/flat');
}

/**
 * Get file content
 */
export async function getFileContent(path) {
  return request(`/files/content?path=${encodeURIComponent(path)}`);
}

/**
 * Save file content
 */
export async function saveFileContent(path, content) {
  return request(`/files/content?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return !!getToken();
}

// ─── Tasks API ───────────────────────────────────────────────────────────────

export async function getTasks(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/tasks${qs}`);
}

export async function getTask(id) {
  return request(`/tasks/${id}`);
}

export async function createTask(data) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTask(id, data) {
  return request(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTask(id) {
  return request(`/tasks/${id}`, { method: 'DELETE' });
}

// ─── WebAuthn API ────────────────────────────────────────────────────────────

export async function webauthnRegisterStart() {
  return request('/auth/webauthn/register/start', { method: 'POST' });
}

export async function webauthnRegisterFinish(attestation) {
  return request('/auth/webauthn/register/finish', {
    method: 'POST',
    body: JSON.stringify(attestation),
  });
}

export async function webauthnLoginStart() {
  return request('/auth/webauthn/login/start', { method: 'POST' });
}

export async function webauthnLoginFinish(assertion) {
  return request('/auth/webauthn/login/finish', {
    method: 'POST',
    body: JSON.stringify(assertion),
  });
}

export async function getWebauthnCredentials() {
  return request('/auth/webauthn/credentials');
}

export async function deleteWebauthnCredential(id) {
  return request(`/auth/webauthn/credentials/${id}`, { method: 'DELETE' });
}

// ─── Events API ──────────────────────────────────────────────────────────────

export async function getEvents() {
  return request('/events');
}

export async function getEvent(id) {
  return request(`/events/${id}`);
}

export async function createEvent(data) {
  return request('/events', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEvent(id, data) {
  return request(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteEvent(id) {
  return request(`/events/${id}`, { method: 'DELETE' });
}
