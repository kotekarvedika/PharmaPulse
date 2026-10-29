/**
 * PharmaPulse - Database API Client Bridge
 * Connects frontend actions directly to SQLite/SQL backend queries
 */

const API = {
  baseUrl: (() => {
    // 1. Explicit window or localStorage override
    if (typeof window !== 'undefined') {
      if (window.PHARMAPULSE_API_URL) return window.PHARMAPULSE_API_URL;
      const stored = localStorage.getItem('pharmapulse_api_url');
      if (stored) return stored;

      // 2. If running standalone file:// or secondary dev port (e.g., Live Server :5500), point to port 5000
      if (window.location.protocol === 'file:' || 
          (window.location.hostname === 'localhost' && window.location.port !== '5000' && window.location.port !== '')) {
        return 'http://localhost:5000/api';
      }
    }
    // 3. In production (Vercel, Render) or Flask port 5000: relative /api works seamlessly
    return '/api';
  })(),
  
  isServerConnected: false,

  getAuthHeaders(extraHeaders = {}) {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      if (!window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
      }
      return extraHeaders;
    }
    return { ...extraHeaders, 'Authorization': `Bearer ${token}` };
  },

  handleAuthError(res) {
    if (res && res.status === 401) {
      localStorage.removeItem('auth_token');
      if (!window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
      }
      return true;
    }
    return false;
  },

  getLoggedInUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) return null;
    try {
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodedPayload);
    } catch (e) {
      return null;
    }
  },

  auth: {
    async login(username, password) {
      const res = await fetch(`${API.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Login failed');
      localStorage.setItem('auth_token', data.token);
      return data;
    },
    async signup(username, email, password) {
      const res = await fetch(`${API.baseUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Signup failed');
      return data;
    },
    logout() {
      localStorage.removeItem('auth_token');
      window.location.href = 'login.html';
    }
  },

  async checkConnection() {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        this.isServerConnected = true;
        this.updateStatusBadge(true, data.database);
        return true;
      }
    } catch (err) {
      console.warn("DB connection check failed:", err);
    }
    this.isServerConnected = false;
    this.updateStatusBadge(false);
    return false;
  },

  updateStatusBadge(connected, dbName = 'SQLite') {
    const badge = document.getElementById('db-connection-status');
    if (!badge) return;

    if (connected) {
      badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono-code font-bold';
      badge.innerHTML = `<i class="fa-solid fa-database text-[#00F59B] animate-pulse"></i> <span>SQL DB: Connected (${dbName})</span>`;
    } else {
      badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-mono-code font-bold';
      badge.innerHTML = `<i class="fa-solid fa-hard-drive text-amber-400"></i> <span>Offline Mode (LocalStorage)</span>`;
    }
  },

  // 1. Fetch live inventory from database
  async getInventory() {
    try {
      const res = await fetch(`${this.baseUrl}/inventory`, {
        headers: this.getAuthHeaders()
      });
      if (this.handleAuthError(res)) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.isServerConnected = true;
      this.updateStatusBadge(true);
      return data;
    } catch (err) {
      console.warn("DB connection unavailable, using fallback:", err);
      return null;
    }
  },

  // 2. Insert new medicine and batch into database
  async addMedicine(medicineData) {
    if (!this.isServerConnected) return null;
    try {
      const res = await fetch(`${this.baseUrl}/inventory`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(medicineData)
      });
      if (this.handleAuthError(res)) return null;
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error("Failed to add medicine to database:", err);
      throw err;
    }
  },

  // 3. Process POS checkout transaction in database
  async checkout(invoiceData) {
    if (!this.isServerConnected) return null;
    try {
      const res = await fetch(`${this.baseUrl}/sales/checkout`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(invoiceData)
      });
      if (this.handleAuthError(res)) return null;
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error("Failed to process checkout transaction:", err);
      throw err;
    }
  },

  // 4. Record stock disposal write-off in database
  async disposeStock(disposalData) {
    if (!this.isServerConnected) return null;
    try {
      const res = await fetch(`${this.baseUrl}/inventory/dispose`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(disposalData)
      });
      if (this.handleAuthError(res)) return null;
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error("Failed to record stock disposal:", err);
      throw err;
    }
  },

  // 5. Update clearance discount in database
  async updateDiscount(medicineId, discountPercentage) {
    if (!this.isServerConnected) return null;
    try {
      const res = await fetch(`${this.baseUrl}/inventory/${encodeURIComponent(medicineId)}/discount`, {
        method: 'PUT',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ discountPercentage })
      });
      if (this.handleAuthError(res)) return null;
      return await res.json();
    } catch (err) {
      console.error("Failed to update discount:", err);
      throw err;
    }
  },

  // 6. Fetch aggregated analytics from database
  async getAnalytics() {
    if (!this.isServerConnected) return null;
    try {
      const res = await fetch(`${this.baseUrl}/analytics`, {
        headers: this.getAuthHeaders()
      });
      if (this.handleAuthError(res)) return null;
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("Analytics fetch failed, using fallback:", err);
    }
    return null;
  },

  // 7. Reset database to default mock records
  async resetDatabase() {
    if (!this.isServerConnected) return null;
    try {
      const res = await fetch(`${this.baseUrl}/reset`, { 
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      if (this.handleAuthError(res)) return null;
      return await res.json();
    } catch (err) {
      console.error("Database reset failed:", err);
      throw err;
    }
  },

  // 8. Log OCR detection results
  async logOCRScan(scanData) {
    if (!this.isServerConnected) return null;
    try {
      const res = await fetch(`${this.baseUrl}/ocr/log`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(scanData)
      });
      if (this.handleAuthError(res)) return null;
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("OCR scan log failed:", e);
    }
    return null;
  }
};
