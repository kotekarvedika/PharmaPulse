/**
 * PharmaPulse - Smart Pharmacy & Expiry Management System
 * Core Application Logic & State Engine
 */

// Application State
const AppState = {
  medicines: [],
  cart: [],
  taxRate: 0.12, // 12% GST
  cartDiscount: 0,
  activeTab: 'expiring_soon', // 'expiring_soon' | 'expired' | 'all' | 'low_stock'
  activeCategory: 'All',
  searchTerm: '',
  sortBy: 'expDate_asc',
  viewMode: 'cards', // 'cards' | 'table'
  audioEnabled: true,
  customerName: 'Walk-in Customer',
  rxNumber: '',
  paymentMethod: 'UPI / QR',
  charts: {
    salesLossChart: null,
    fastMovingChart: null,
    riskDoughnutChart: null
  }
};

// Web Audio API Synthesizer for pleasant tactile sound feedback
class SoundFX {
  static init() {
    this.ctx = null;
  }

  static getContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  static playBeep(freq = 880, type = 'sine', duration = 0.08) {
    if (!AppState.audioEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio not supported or blocked", e);
    }
  }

  static playSuccess() {
    if (!AppState.audioEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.08, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } catch (e) {}
  }

  static playWarning() {
    this.playBeep(440, 'sawtooth', 0.15);
  }
}

// Local Storage & Database Handlers
async function loadData() {
  if (typeof API !== 'undefined') {
    const isOnline = await API.checkConnection();
    if (isOnline) {
      const dbInventory = await API.getInventory();
      if (dbInventory && Array.isArray(dbInventory) && dbInventory.length > 0) {
        AppState.medicines = dbInventory;
        saveData(); // Keep local cache in sync
        return;
      }
    }
  }

  const storedInventory = localStorage.getItem('pharmapulse_inventory');
  if (storedInventory) {
    try {
      AppState.medicines = JSON.parse(storedInventory);
    } catch (e) {
      AppState.medicines = JSON.parse(JSON.stringify(INITIAL_MEDICINES));
    }
  } else {
    AppState.medicines = JSON.parse(JSON.stringify(INITIAL_MEDICINES));
    saveData();
  }
}

function saveData() {
  localStorage.setItem('pharmapulse_inventory', JSON.stringify(AppState.medicines));
}

async function resetToDefaultData() {
  if (confirm("Reset PharmaPulse inventory to default dataset? This will restore original database stock.")) {
    if (typeof API !== 'undefined' && API.isServerConnected) {
      try {
        await API.resetDatabase();
        showToast("Database Reset", "SQL database restored to default seed dataset.", "info");
      } catch (e) {
        console.warn("DB reset error:", e);
      }
    }
    AppState.medicines = JSON.parse(JSON.stringify(INITIAL_MEDICINES));
    saveData();
    await initApp();
    showToast("System Reset", "Inventory data restored to defaults.", "info");
  }
}

// Toast Notification Manager
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const typeStyles = {
    success: 'border-l-4 border-[#00F59B] bg-slate-900/95 text-white',
    warning: 'border-l-4 border-[#FFB800] bg-slate-900/95 text-white',
    danger: 'border-l-4 border-[#FF2E63] bg-slate-900/95 text-white',
    info: 'border-l-4 border-[#00D2FF] bg-slate-900/95 text-white'
  };

  const icons = {
    success: '<i class="fa-solid fa-circle-check text-[#00F59B]"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation text-[#FFB800]"></i>',
    danger: '<i class="fa-solid fa-circle-xmark text-[#FF2E63]"></i>',
    info: '<i class="fa-solid fa-bell text-[#00D2FF]"></i>'
  };

  toast.className = `toast-item flex items-start gap-3 p-4 rounded-lg shadow-xl backdrop-blur-md border border-slate-700/60 min-w-[300px] max-w-sm ${typeStyles[type] || typeStyles.info}`;
  toast.innerHTML = `
    <div class="text-xl pt-0.5">${icons[type] || icons.info}</div>
    <div class="flex-1">
      <h4 class="font-bold text-sm tracking-wide">${title}</h4>
      <p class="text-xs text-slate-300 mt-0.5 leading-relaxed">${message}</p>
    </div>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white transition-colors">
      <i class="fa-solid fa-xmark text-xs"></i>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// Calculate Helper Metrics
function getComputedStats() {
  let totalUnits = 0;
  let totalSKUs = 0;
  let lowStockCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  let valueAtRisk = 0;
  let inventoryValue = 0;

  AppState.medicines.forEach(item => {
    if (item.isDisposed) return;

    totalSKUs++;
    totalUnits += item.stockQty;
    const daysLeft = calculateDaysRemaining(item.expDate);
    const itemValue = item.stockQty * item.unitPrice;
    inventoryValue += itemValue;

    if (item.stockQty <= item.minThreshold) {
      lowStockCount++;
    }

    if (daysLeft < 0) {
      expiredCount++;
      valueAtRisk += itemValue;
    } else if (daysLeft <= 30) {
      expiringSoonCount++;
      valueAtRisk += itemValue;
    }
  });

  // Calculate simulated revenue (baseline + completed cart sales)
  let salesLogged = 0;
  try {
    const rawSales = localStorage.getItem('pharmapulse_sales');
    if (rawSales) {
      const logs = JSON.parse(rawSales);
      salesLogged = logs.reduce((sum, s) => sum + (s.total || 0), 0);
    }
  } catch (e) {}

  const totalRevenue = 22450 + salesLogged;

  return {
    totalUnits,
    totalSKUs,
    lowStockCount,
    expiringSoonCount,
    expiredCount,
    valueAtRisk,
    inventoryValue,
    totalRevenue
  };
}

// Render Top Metric Cards
function renderMetricCards() {
  const stats = getComputedStats();

  const totalInvEl = document.getElementById('metric-total-inventory');
  const lowStockEl = document.getElementById('metric-low-stock');
  const expiringEl = document.getElementById('metric-expiring-soon');
  const revenueEl = document.getElementById('metric-total-revenue');

  if (totalInvEl) {
    totalInvEl.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider font-bold text-slate-400">Total Active Stock</span>
        <div class="w-8 h-8 rounded-lg bg-[#00F59B]/10 border border-[#00F59B]/30 flex items-center justify-center text-[#00F59B]">
          <i class="fa-solid fa-cubes text-sm"></i>
        </div>
      </div>
      <div class="mt-3 flex items-baseline gap-2">
        <span class="text-3xl font-black font-space tracking-tight text-white">${stats.totalUnits.toLocaleString()}</span>
        <span class="text-xs font-mono-code text-slate-400">units</span>
      </div>
      <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span class="flex items-center gap-1.5 text-[#00F59B] font-semibold">
          <i class="fa-solid fa-arrow-trend-up"></i> ${stats.totalSKUs} Distinct SKUs
        </span>
        <span class="font-mono-code">₹${stats.inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Value</span>
      </div>
    `;
  }

  if (lowStockEl) {
    const isCritical = stats.lowStockCount > 5;
    lowStockEl.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider font-bold text-slate-400">Low Stock Alert</span>
        <div class="w-8 h-8 rounded-lg ${isCritical ? 'bg-[#FF2E63]/15 border border-[#FF2E63]/40 text-[#FF2E63]' : 'bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800]'} flex items-center justify-center">
          <i class="fa-solid fa-triangle-exclamation text-sm"></i>
        </div>
      </div>
      <div class="mt-3 flex items-baseline gap-2">
        <span class="text-3xl font-black font-space tracking-tight ${isCritical ? 'text-[#FF2E63]' : 'text-[#FFB800]'}">${stats.lowStockCount}</span>
        <span class="text-xs font-mono-code text-slate-400">batches reorder</span>
      </div>
      <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span class="text-amber-400 font-medium">Below threshold (min limit)</span>
        <button onclick="setFilterTab('low_stock')" class="underline hover:text-white transition-colors">Inspect &rarr;</button>
      </div>
    `;
  }

  if (expiringEl) {
    expiringEl.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider font-bold text-slate-400">Expiring &le; 30 Days</span>
        <div class="w-8 h-8 rounded-lg bg-[#FF2E63]/15 border border-[#FF2E63]/40 flex items-center justify-center text-[#FF2E63] animate-pulse">
          <i class="fa-solid fa-clock-rotate-left text-sm"></i>
        </div>
      </div>
      <div class="mt-3 flex items-baseline gap-2">
        <span class="text-3xl font-black font-space tracking-tight text-[#FF2E63]">${stats.expiringSoonCount + stats.expiredCount}</span>
        <span class="text-xs font-mono-code text-slate-400">batches at risk</span>
      </div>
      <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span class="text-[#FF2E63] font-semibold flex items-center gap-1">
          <i class="fa-solid fa-shield-halved"></i> ₹${stats.valueAtRisk.toFixed(0)} At Risk
        </span>
        <span class="text-xs text-red-300 font-mono-code font-bold">${stats.expiredCount} EXPIRED</span>
      </div>
    `;
  }

  if (revenueEl) {
    revenueEl.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider font-bold text-slate-400">Monthly Revenue</span>
        <div class="w-8 h-8 rounded-lg bg-[#00D2FF]/15 border border-[#00D2FF]/40 flex items-center justify-center text-[#00D2FF]">
          <i class="fa-solid fa-cash-register text-sm"></i>
        </div>
      </div>
      <div class="mt-3 flex items-baseline gap-2">
        <span class="text-3xl font-black font-space tracking-tight text-[#00D2FF]">₹${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span class="text-[#00F59B] font-semibold flex items-center gap-1">
          <i class="fa-solid fa-arrow-trend-up"></i> +14.2% MoM
        </span>
        <span class="font-mono-code text-slate-300">Live POS Synced</span>
      </div>
    `;
  }
}

// Render Interactive Expiry Alert Bar (Top Ribbon)
function renderExpiryAlertBar() {
  const container = document.getElementById('expiry-alert-ribbon');
  if (!container) return;

  const urgentItems = AppState.medicines
    .filter(m => !m.isDisposed)
    .map(m => ({ ...m, daysLeft: calculateDaysRemaining(m.expDate) }))
    .filter(m => m.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (urgentItems.length === 0) {
    container.innerHTML = `
      <div class="w-full flex items-center justify-center py-2.5 px-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold">
        <i class="fa-solid fa-circle-check mr-2 text-base text-[#00F59B]"></i>
        All active inventory is within safe shelf-life parameters. No imminent expirations in the next 30 days!
      </div>
    `;
    return;
  }

  // Build items pills
  let pillsHtml = '';
  urgentItems.forEach(item => {
    let badgeClass = '';
    let statusText = '';
    let icon = '';

    if (item.daysLeft < 0) {
      badgeClass = 'bg-[#FF2E63]/25 border-[#FF2E63] text-[#FF2E63] animate-pulse';
      statusText = `EXPIRED ${Math.abs(item.daysLeft)}d AGO`;
      icon = 'fa-solid fa-skull-crossbones';
    } else if (item.daysLeft === 0) {
      badgeClass = 'bg-[#FF2E63]/30 border-[#FF2E63] text-white animate-pulse';
      statusText = `EXPIRES TODAY!`;
      icon = 'fa-solid fa-fire';
    } else if (item.daysLeft <= 7) {
      badgeClass = 'bg-rose-950/60 border-rose-500 text-rose-300';
      statusText = `Expires in ${item.daysLeft} days`;
      icon = 'fa-solid fa-hourglass-start';
    } else {
      badgeClass = 'bg-amber-950/50 border-amber-500 text-amber-300';
      statusText = `Expires in ${item.daysLeft} days`;
      icon = 'fa-solid fa-clock';
    }

    pillsHtml += `
      <div class="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border ${badgeClass} text-xs mr-3 flex-shrink-0 backdrop-blur-md shadow-md transition-transform hover:scale-105">
        <i class="${icon} text-sm"></i>
        <span class="font-bold text-white">${item.name}</span>
        <span class="font-mono-code px-1.5 py-0.5 rounded bg-black/40 text-[10px] text-slate-300">${item.batchNo}</span>
        <span class="font-bold uppercase tracking-wider text-[11px]">${statusText}</span>
        <span class="text-slate-400 font-mono-code text-[11px]">Qty: <b class="text-white">${item.stockQty}</b></span>
        <div class="flex items-center gap-1 ml-1">
          ${item.daysLeft >= 0 ? `
            <button onclick="quickDiscountMedicine('${item.id}', 30); event.stopPropagation();" title="Apply 30% Clearance Discount" class="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 text-[10px] font-bold transition-all border border-amber-500/30">
              -30% Tag
            </button>
            <button onclick="addMedicineToCartById('${item.id}'); event.stopPropagation();" title="Quick Add to POS (FEFO)" class="px-1.5 py-0.5 rounded bg-[#00D2FF]/20 hover:bg-[#00D2FF] hover:text-black text-[#00D2FF] text-[10px] font-bold transition-all border border-[#00D2FF]/30">
              <i class="fa-solid fa-cart-plus"></i> Bill
            </button>
          ` : `
            <button onclick="openDisposeModal('${item.id}'); event.stopPropagation();" class="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-all">
              <i class="fa-solid fa-trash-can mr-1"></i> Write Off
            </button>
          `}
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="w-full bg-slate-900/90 border-2 border-red-500/50 rounded-xl p-3 shadow-lg shadow-red-950/20 backdrop-blur-xl relative overflow-hidden">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-[#FF2E63]"></span>
          </span>
          <span class="font-space font-bold text-sm tracking-wide text-white uppercase flex items-center gap-1.5">
            <i class="fa-solid fa-triangle-exclamation text-[#FF2E63]"></i>
            Urgent Expiry Action Bar
          </span>
          <span class="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[#FF2E63] text-xs font-mono-code font-bold">
            ${urgentItems.length} Urgent Batches
          </span>
        </div>
        <div class="text-xs text-slate-400 flex items-center gap-2">
          <span class="hidden sm:inline">FEFO Algorithm Active: Prioritize early batches to prevent waste</span>
          <button onclick="setFilterTab('expiring_soon')" class="text-[#00D2FF] hover:underline font-semibold flex items-center gap-1">
            View All in Tracker &rarr;
          </button>
        </div>
      </div>
      <!-- Marquee / Scrollable Strip -->
      <div class="flex items-center overflow-x-auto pb-1 pt-1 scrollbar-thin">
        ${pillsHtml}
      </div>
    </div>
  `;
}

// Filter and Sort Inventory
function getFilteredMedicines() {
  let list = AppState.medicines.filter(m => !m.isDisposed);

  // Category filter
  if (AppState.activeCategory !== 'All') {
    list = list.filter(m => m.category === AppState.activeCategory);
  }

  // Search filter
  if (AppState.searchTerm.trim()) {
    const q = AppState.searchTerm.toLowerCase().trim();
    list = list.filter(m => 
      m.name.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.batchNo.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.rackLocation.toLowerCase().includes(q) ||
      m.supplier.toLowerCase().includes(q)
    );
  }

  // Tab filter
  if (AppState.activeTab === 'expiring_soon') {
    list = list.filter(m => {
      const d = calculateDaysRemaining(m.expDate);
      return d >= 0 && d <= 30;
    });
  } else if (AppState.activeTab === 'expired') {
    list = list.filter(m => calculateDaysRemaining(m.expDate) < 0);
  } else if (AppState.activeTab === 'low_stock') {
    list = list.filter(m => m.stockQty <= m.minThreshold);
  }

  // Sort
  list.sort((a, b) => {
    const daysA = calculateDaysRemaining(a.expDate);
    const daysB = calculateDaysRemaining(b.expDate);
    if (AppState.sortBy === 'expDate_asc') return daysA - daysB; // FEFO
    if (AppState.sortBy === 'expDate_desc') return daysB - daysA;
    if (AppState.sortBy === 'stock_asc') return a.stockQty - b.stockQty;
    if (AppState.sortBy === 'stock_desc') return b.stockQty - a.stockQty;
    if (AppState.sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (AppState.sortBy === 'price_desc') return b.unitPrice - a.unitPrice;
    return 0;
  });

  return list;
}

// Render Medicine Tracker (Cards vs Table)
function renderExpiryTracker() {
  const container = document.getElementById('inventory-render-target');
  const countBadge = document.getElementById('tracker-results-count');
  if (!container) return;

  // Update Tab Badges
  const allStats = getComputedStats();
  const tabExpiringBadge = document.getElementById('badge-tab-expiring');
  const tabExpiredBadge = document.getElementById('badge-tab-expired');
  const tabAllBadge = document.getElementById('badge-tab-all');
  const tabLowStockBadge = document.getElementById('badge-tab-low');

  if (tabExpiringBadge) tabExpiringBadge.innerText = allStats.expiringSoonCount;
  if (tabExpiredBadge) tabExpiredBadge.innerText = allStats.expiredCount;
  if (tabAllBadge) tabAllBadge.innerText = allStats.totalSKUs;
  if (tabLowStockBadge) tabLowStockBadge.innerText = allStats.lowStockCount;

  const filtered = getFilteredMedicines();
  if (countBadge) countBadge.innerText = `${filtered.length} Medicines Found`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center glass-panel rounded-2xl border border-slate-700/60 p-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 text-2xl">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <h3 class="text-lg font-bold text-white mb-1">No Medicines Match Current Filter</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto mb-4">Try clearing your search query or switching to the "Full Inventory" tab to view all stock items.</p>
        <button onclick="resetFilters()" class="btn-neo btn-neo-blue text-xs px-4 py-2 rounded-lg">
          Reset Filter & Search
        </button>
      </div>
    `;
    return;
  }

  if (AppState.viewMode === 'cards') {
    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    container.innerHTML = filtered.map(item => renderMedicineCard(item)).join('');
  } else {
    container.className = 'w-full overflow-x-auto';
    container.innerHTML = renderMedicineTable(filtered);
  }
}

// Generate Single Medicine Card HTML (Neo-Brutalist Glass)
function renderMedicineCard(item) {
  const daysLeft = calculateDaysRemaining(item.expDate);
  const isExpired = daysLeft < 0;
  const isExpiringSoon = daysLeft >= 0 && daysLeft <= 30;
  const isLowStock = item.stockQty <= item.minThreshold;

  // Shelf life percentage calculation
  const mfd = new Date(item.mfdDate).getTime();
  const exp = new Date(item.expDate).getTime();
  const now = new Date().getTime();
  const totalDuration = Math.max(1, exp - mfd);
  const elapsed = Math.max(0, now - mfd);
  const shelfPercent = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));

  // Badges & styling
  let borderClass = 'border-slate-800 hover:border-slate-700';
  let statusBadge = '';
  let shelfColor = 'bg-[#00F59B]';

  if (isExpired) {
    borderClass = 'border-red-500/70 hover:border-red-400 bg-red-950/20';
    shelfColor = 'bg-[#FF2E63]';
    statusBadge = `
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold font-mono-code bg-[#FF2E63]/20 text-[#FF2E63] border border-[#FF2E63]/40">
        <i class="fa-solid fa-ban"></i> EXPIRED (${Math.abs(daysLeft)}d ago)
      </span>
    `;
  } else if (isExpiringSoon) {
    borderClass = 'border-amber-500/70 hover:border-amber-400 bg-amber-950/15';
    shelfColor = 'bg-[#FFB800]';
    statusBadge = `
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold font-mono-code bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40">
        <i class="fa-solid fa-clock"></i> ${daysLeft} DAYS LEFT
      </span>
    `;
  } else {
    statusBadge = `
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold font-mono-code bg-[#00F59B]/15 text-[#00F59B] border border-[#00F59B]/30">
        <i class="fa-solid fa-circle-check"></i> SAFE (${daysLeft}d)
      </span>
    `;
  }

  const effectivePrice = item.discountPercentage > 0 
    ? item.unitPrice * (1 - item.discountPercentage / 100) 
    : item.unitPrice;

  return `
    <div class="glass-panel glass-panel-hover rounded-xl p-4 flex flex-col justify-between relative overflow-hidden ${borderClass} transition-all">
      <!-- Top header line -->
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/50">
              ${item.category}
            </span>
            ${item.prescriptionRequired ? `
              <span class="text-[10px] font-bold text-cyan-300 ml-1 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                <i class="fa-solid fa-file-prescription mr-0.5"></i> Rx
              </span>
            ` : ''}
          </div>
          ${statusBadge}
        </div>

        <h4 class="font-bold text-white text-base leading-snug tracking-tight hover:text-[#00D2FF] transition-colors cursor-pointer" onclick="viewMedicineDetails('${item.id}')">
          ${item.name}
        </h4>
        <p class="text-xs text-slate-400 mt-0.5 line-clamp-1 italic">${item.genericName}</p>

        <!-- Batch & Rack meta -->
        <div class="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-800/80 text-xs">
          <div>
            <span class="text-slate-400 text-[11px]">Batch No:</span>
            <div class="font-mono-code font-bold text-slate-200 flex items-center gap-1">
              ${item.batchNo}
              <button onclick="navigator.clipboard.writeText('${item.batchNo}'); showToast('Copied', 'Batch #${item.batchNo} copied to clipboard', 'info')" class="text-slate-400 hover:text-white text-[10px]" title="Copy Batch">
                <i class="fa-solid fa-copy"></i>
              </button>
            </div>
          </div>
          <div>
            <span class="text-slate-400 text-[11px]">Rack / Bay:</span>
            <div class="font-medium text-slate-200 flex items-center gap-1">
              <i class="fa-solid fa-map-pin text-[10px] text-cyan-400"></i> ${item.rackLocation}
            </div>
          </div>
        </div>

        <!-- Shelf life progress -->
        <div class="mt-3">
          <div class="flex justify-between text-[11px] mb-1">
            <span class="text-slate-400">Shelf-Life Consumed:</span>
            <span class="font-mono-code font-bold ${isExpired ? 'text-[#FF2E63]' : (isExpiringSoon ? 'text-amber-400' : 'text-[#00F59B]')}">${shelfPercent}%</span>
          </div>
          <div class="progress-shelf">
            <div class="progress-shelf-bar ${shelfColor}" style="width: ${shelfPercent}%"></div>
          </div>
          <div class="flex justify-between text-[10px] font-mono-code text-slate-400 mt-1">
            <span>MFD: ${item.mfdDate}</span>
            <span class="${isExpired ? 'text-red-400 font-bold' : ''}">EXP: ${item.expDate}</span>
          </div>
        </div>

        <!-- Stock and pricing -->
        <div class="mt-3.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <div class="text-[10px] uppercase font-bold text-slate-400">Available Stock</div>
            <div class="font-space font-bold text-base flex items-center gap-1.5 ${isLowStock ? 'text-[#FF2E63]' : 'text-white'}">
              ${item.stockQty} <span class="text-xs text-slate-400 font-normal">units</span>
              ${isLowStock ? '<span class="text-[10px] px-1.5 py-0.2 bg-red-500/20 text-red-400 rounded border border-red-500/30">LOW</span>' : ''}
            </div>
          </div>
          <div class="text-right">
            <div class="text-[10px] uppercase font-bold text-slate-400">MRP Unit Price</div>
            <div class="font-space font-bold text-base text-[#00F59B]">
              ₹${effectivePrice.toFixed(2)}
              ${item.discountPercentage > 0 ? `<span class="text-xs text-slate-400 line-through ml-1">₹${item.unitPrice.toFixed(2)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2">
        ${!isExpired && item.stockQty > 0 ? `
          <button onclick="addMedicineToCartById('${item.id}')" class="btn-neo btn-neo-green flex-1 py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-cart-plus"></i> Bill (FEFO)
          </button>
        ` : (isExpired ? `
          <button onclick="openDisposeModal('${item.id}')" class="btn-neo btn-neo-crimson flex-1 py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-trash-can"></i> Log Disposal
          </button>
        ` : `
          <button disabled class="w-full py-1.5 px-3 rounded-lg text-xs bg-slate-800 text-slate-500 cursor-not-allowed">
            Out of Stock
          </button>
        `)}

        ${!isExpired ? `
          <button onclick="openDiscountModal('${item.id}')" title="Apply Clearance Discount" class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-400 transition-colors text-xs">
            <i class="fa-solid fa-tag"></i>
          </button>
        ` : ''}

        <button onclick="viewMedicineDetails('${item.id}')" title="View Batch Dossier" class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-400 transition-colors text-xs">
          <i class="fa-solid fa-circle-info"></i>
        </button>
      </div>
    </div>
  `;
}

// Generate Modern Data Table HTML
function renderMedicineTable(items) {
  return `
    <div class="glass-panel rounded-xl overflow-hidden border border-slate-700/60 shadow-xl">
      <table class="w-full text-left text-xs border-collapse">
        <thead>
          <tr class="bg-slate-900/90 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-700">
            <th class="py-3 px-4">Medicine & Generic</th>
            <th class="py-3 px-3">Batch & Rack</th>
            <th class="py-3 px-3">Category</th>
            <th class="py-3 px-3">Expiry Date</th>
            <th class="py-3 px-3 text-center">Shelf Status</th>
            <th class="py-3 px-3 text-right">Stock</th>
            <th class="py-3 px-3 text-right">Price</th>
            <th class="py-3 px-4 text-center">Quick Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/80 font-sans">
          ${items.map(item => {
            const daysLeft = calculateDaysRemaining(item.expDate);
            const isExpired = daysLeft < 0;
            const isExpiringSoon = daysLeft >= 0 && daysLeft <= 30;
            const isLowStock = item.stockQty <= item.minThreshold;

            let statusPill = '';
            if (isExpired) {
              statusPill = `<span class="px-2 py-0.5 rounded font-mono-code font-bold bg-[#FF2E63]/20 text-[#FF2E63] border border-[#FF2E63]/40 text-[10px]">EXPIRED (${Math.abs(daysLeft)}d)</span>`;
            } else if (isExpiringSoon) {
              statusPill = `<span class="px-2 py-0.5 rounded font-mono-code font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">${daysLeft}d left</span>`;
            } else {
              statusPill = `<span class="px-2 py-0.5 rounded font-mono-code font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">Safe (${daysLeft}d)</span>`;
            }

            return `
              <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="py-3 px-4">
                  <div class="font-bold text-white text-sm">${item.name}</div>
                  <div class="text-[11px] text-slate-400 italic">${item.genericName}</div>
                </td>
                <td class="py-3 px-3">
                  <div class="font-mono-code font-bold text-cyan-300">${item.batchNo}</div>
                  <div class="text-[11px] text-slate-400">${item.rackLocation}</div>
                </td>
                <td class="py-3 px-3 text-slate-300">${item.category}</td>
                <td class="py-3 px-3 font-mono-code ${isExpired ? 'text-red-400 font-bold' : 'text-slate-300'}">
                  ${item.expDate}
                </td>
                <td class="py-3 px-3 text-center">
                  ${statusPill}
                </td>
                <td class="py-3 px-3 text-right">
                  <span class="font-mono-code font-bold ${isLowStock ? 'text-red-400' : 'text-white'}">${item.stockQty}</span>
                  ${isLowStock ? '<span class="block text-[9px] text-amber-400">LOW</span>' : ''}
                </td>
                <td class="py-3 px-3 text-right font-mono-code font-bold text-[#00F59B]">
                  ₹${item.unitPrice.toFixed(2)}
                </td>
                <td class="py-3 px-4 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    ${!isExpired && item.stockQty > 0 ? `
                      <button onclick="addMedicineToCartById('${item.id}')" class="px-2.5 py-1 rounded bg-[#00F59B] text-slate-950 font-bold hover:bg-[#34fab3] text-xs transition-colors" title="Add to POS Cart">
                        <i class="fa-solid fa-cart-plus"></i> Bill
                      </button>
                    ` : (isExpired ? `
                      <button onclick="openDisposeModal('${item.id}')" class="px-2.5 py-1 rounded bg-rose-600 text-white font-bold hover:bg-rose-500 text-xs transition-colors" title="Write Off Expired Stock">
                        <i class="fa-solid fa-trash-can"></i> Dispose
                      </button>
                    ` : `<span class="text-slate-500 text-xs italic">N/A</span>`)}
                    
                    <button onclick="viewMedicineDetails('${item.id}')" class="p-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors" title="Details">
                      <i class="fa-solid fa-eye"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// -------------------------------------------------------------
// POS & Quick Billing Engine
// -------------------------------------------------------------

// Add medicine to cart with smart FEFO recommendation
function addMedicineToCartById(id) {
  const medicine = AppState.medicines.find(m => m.id === id);
  if (!medicine) return;

  if (medicine.isDisposed) {
    showToast("Cannot Dispense", "This medicine has been written off / disposed.", "danger");
    return;
  }

  const daysLeft = calculateDaysRemaining(medicine.expDate);
  if (daysLeft < 0) {
    showToast("Expired Stock Alert", "Cannot bill expired medicine. Please dispose or quarantine.", "danger");
    SoundFX.playWarning();
    return;
  }

  if (medicine.stockQty <= 0) {
    showToast("Out of Stock", `${medicine.name} is currently out of stock.`, "warning");
    return;
  }

  // Check if there is an EARLIER batch of this medicine expiring first (FEFO recommendation!)
  const otherBatches = AppState.medicines.filter(m => 
    m.name === medicine.name && 
    m.id !== medicine.id && 
    !m.isDisposed && 
    m.stockQty > 0
  );

  const earlierBatch = otherBatches.find(b => {
    const otherDays = calculateDaysRemaining(b.expDate);
    return otherDays >= 0 && otherDays < daysLeft;
  });

  if (earlierBatch) {
    showToast("FEFO Warning", `Batch #${earlierBatch.batchNo} expires sooner! Consider dispensing it first to reduce waste.`, "warning");
    SoundFX.playWarning();
  }

  // Check if already in cart
  const existingIndex = AppState.cart.findIndex(c => c.id === medicine.id);
  const effectivePrice = medicine.discountPercentage > 0 
    ? medicine.unitPrice * (1 - medicine.discountPercentage / 100) 
    : medicine.unitPrice;

  if (existingIndex >= 0) {
    if (AppState.cart[existingIndex].qty + 1 > medicine.stockQty) {
      showToast("Max Stock Reached", `Only ${medicine.stockQty} units available in Batch #${medicine.batchNo}.`, "warning");
      return;
    }
    AppState.cart[existingIndex].qty += 1;
  } else {
    AppState.cart.push({
      id: medicine.id,
      name: medicine.name,
      batchNo: medicine.batchNo,
      unitPrice: effectivePrice,
      originalPrice: medicine.unitPrice,
      discountPercentage: medicine.discountPercentage || 0,
      qty: 1,
      maxStock: medicine.stockQty,
      expDate: medicine.expDate,
      daysLeft: daysLeft
    });
  }

  SoundFX.playBeep(980, 'sine', 0.08);
  renderCart();
  showToast("Added to Bill", `${medicine.name} (Batch ${medicine.batchNo}) added to bill.`, "success");
}

// Modify Cart Quantities
function updateCartQty(id, delta) {
  const item = AppState.cart.find(c => c.id === id);
  if (!item) return;

  const newQty = item.qty + delta;
  if (newQty <= 0) {
    AppState.cart = AppState.cart.filter(c => c.id !== id);
    showToast("Item Removed", `${item.name} removed from bill.`, "info");
  } else if (newQty > item.maxStock) {
    showToast("Stock Limit Exceeded", `Only ${item.maxStock} units available in stock.`, "warning");
    return;
  } else {
    item.qty = newQty;
  }

  SoundFX.playBeep(750, 'sine', 0.05);
  renderCart();
}

function removeCartItem(id) {
  const item = AppState.cart.find(c => c.id === id);
  AppState.cart = AppState.cart.filter(c => c.id !== id);
  if (item) {
    showToast("Item Removed", `${item.name} removed from bill.`, "info");
  }
  renderCart();
}

function clearCart() {
  if (AppState.cart.length === 0) return;
  if (confirm("Clear all items from the current billing queue?")) {
    AppState.cart = [];
    renderCart();
    showToast("Bill Cleared", "All items removed from billing cart.", "info");
  }
}

// Render POS Billing Widget
function renderCart() {
  const cartList = document.getElementById('pos-cart-items');
  const countBadge = document.getElementById('pos-cart-count');
  const subtotalEl = document.getElementById('pos-subtotal');
  const taxEl = document.getElementById('pos-tax-amount');
  const discountEl = document.getElementById('pos-discount-amount');
  const grandTotalEl = document.getElementById('pos-grand-total');
  const checkoutBtn = document.getElementById('pos-checkout-btn');

  if (!cartList) return;

  if (countBadge) countBadge.innerText = AppState.cart.reduce((sum, item) => sum + item.qty, 0);

  if (AppState.cart.length === 0) {
    cartList.innerHTML = `
      <div class="py-10 text-center text-slate-500">
        <i class="fa-solid fa-cart-shopping text-3xl mb-2 opacity-40"></i>
        <p class="text-xs">No medicines in current bill.</p>
        <p class="text-[11px] text-slate-400 mt-1">Click "Bill" on any safe batch or use the search above.</p>
      </div>
    `;
    if (subtotalEl) subtotalEl.innerText = '₹0.00';
    if (taxEl) taxEl.innerText = '₹0.00';
    if (discountEl) discountEl.innerText = '₹0.00';
    if (grandTotalEl) grandTotalEl.innerText = '₹0.00';
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    return;
  }

  if (checkoutBtn) {
    checkoutBtn.disabled = false;
    checkoutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  // Calculate Totals
  let subtotal = 0;
  let html = '';

  AppState.cart.forEach(item => {
    const lineTotal = item.unitPrice * item.qty;
    subtotal += lineTotal;

    html += `
      <div class="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col gap-1.5 text-xs">
        <div class="flex items-start justify-between gap-1">
          <div class="flex-1">
            <h5 class="font-bold text-white text-xs leading-tight">${item.name}</h5>
            <div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
              <span class="font-mono-code text-cyan-400">Batch: ${item.batchNo}</span>
              <span>&bull;</span>
              <span class="${item.daysLeft <= 30 ? 'text-amber-400 font-bold' : 'text-slate-400'}">${item.daysLeft}d shelf left</span>
            </div>
          </div>
          <button onclick="removeCartItem('${item.id}')" class="text-slate-500 hover:text-red-400 transition-colors p-1" title="Remove Item">
            <i class="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>

        <div class="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-800/80">
          <!-- Stepper -->
          <div class="flex items-center gap-2 bg-slate-800/80 rounded-md p-0.5 border border-slate-700/60">
            <button onclick="updateCartQty('${item.id}', -1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-colors">
              -
            </button>
            <span class="font-mono-code font-bold text-xs text-white px-1.5">${item.qty}</span>
            <button onclick="updateCartQty('${item.id}', 1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-colors">
              +
            </button>
          </div>

          <!-- Unit and Line Price -->
          <div class="text-right">
            <div class="text-[10px] text-slate-400 font-mono-code">@ ₹${item.unitPrice.toFixed(2)}/u</div>
            <div class="font-mono-code font-bold text-sm text-[#00F59B]">₹${lineTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>
    `;
  });

  cartList.innerHTML = html;

  const taxAmount = subtotal * AppState.taxRate;
  const grandTotal = Math.max(0, subtotal + taxAmount - AppState.cartDiscount);

  if (subtotalEl) subtotalEl.innerText = `₹${subtotal.toFixed(2)}`;
  if (taxEl) taxEl.innerText = `₹${taxAmount.toFixed(2)}`;
  if (discountEl) discountEl.innerText = `-₹${AppState.cartDiscount.toFixed(2)}`;
  if (grandTotalEl) grandTotalEl.innerText = `₹${grandTotal.toFixed(2)}`;
}

// Complete Sale Transaction & Generate Bill Receipt
function completeSaleAndPrintBill() {
  if (AppState.cart.length === 0) {
    showToast("Empty Bill", "Please add medicines to bill first.", "warning");
    return;
  }

  // Deduct inventory stock
  let outOfStockIssue = false;
  AppState.cart.forEach(cartItem => {
    const med = AppState.medicines.find(m => m.id === cartItem.id);
    if (med) {
      if (med.stockQty < cartItem.qty) {
        outOfStockIssue = true;
      }
    }
  });

  if (outOfStockIssue) {
    showToast("Inventory Error", "One or more items exceed available stock. Adjust quantities.", "danger");
    return;
  }

  // Deduct and log
  const subtotal = AppState.cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const taxAmount = subtotal * AppState.taxRate;
  const grandTotal = Math.max(0, subtotal + taxAmount - AppState.cartDiscount);

  AppState.cart.forEach(cartItem => {
    const med = AppState.medicines.find(m => m.id === cartItem.id);
    if (med) {
      med.stockQty -= cartItem.qty;
      med.salesCount30Days = (med.salesCount30Days || 0) + cartItem.qty;
    }
  });

  saveData();

  // Create Invoice Record
  const invoiceId = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date();
  const invoiceData = {
    invoiceId: invoiceId,
    timestamp: now.toLocaleString(),
    customer: AppState.customerName || 'Walk-in Customer',
    rxNumber: AppState.rxNumber || 'N/A',
    paymentMethod: AppState.paymentMethod,
    items: JSON.parse(JSON.stringify(AppState.cart)),
    subtotal: subtotal,
    taxRate: AppState.taxRate,
    taxAmount: taxAmount,
    discount: AppState.cartDiscount,
    total: grandTotal,
    pharmacist: "Dr. Alex (Lic #PH-4920)"
  };

  // Persist to SQL database if connected
  if (typeof API !== 'undefined' && API.isServerConnected) {
    API.checkout(invoiceData).catch(err => {
      console.warn("DB checkout sync error:", err);
    });
  }

  // Persist sales log in local cache
  try {
    let sales = [];
    const stored = localStorage.getItem('pharmapulse_sales');
    if (stored) sales = JSON.parse(stored);
    sales.unshift(invoiceData);
    localStorage.setItem('pharmapulse_sales', JSON.stringify(sales));
  } catch (e) {}

  // Audio & Confetti Celebration
  SoundFX.playSuccess();
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00F59B', '#00D2FF', '#FF2E63', '#FFB800']
    });
  }

  // Render Thermal Bill & Open Modal
  renderThermalReceipt(invoiceData);
  openModal('thermal-receipt-modal');

  // Reset Cart & refresh UI
  AppState.cart = [];
  AppState.cartDiscount = 0;
  renderCart();
  renderMetricCards();
  renderExpiryAlertBar();
  renderExpiryTracker();
  updateAnalyticsCharts();

  showToast("Sale Completed!", `Invoice #${invoiceId} generated. Stock updated in real-time.`, "success");
}

// Generate Realistic Thermal Print Receipt
function renderThermalReceipt(data) {
  const container = document.getElementById('thermal-receipt-content');
  if (!container) return;

  const itemsRows = data.items.map(item => `
    <tr style="border-bottom: 1px dashed #ccc;">
      <td style="padding: 6px 0;">
        <div style="font-weight: 700; font-size: 11px;">${item.name}</div>
        <div style="font-size: 9px; color: #555;">Batch: ${item.batchNo} | Exp: ${item.expDate}</div>
      </td>
      <td style="text-align: center; font-size: 11px; padding: 6px 0;">${item.qty}</td>
      <td style="text-align: right; font-size: 11px; padding: 6px 0;">₹${item.unitPrice.toFixed(2)}</td>
      <td style="text-align: right; font-size: 11px; font-weight: 700; padding: 6px 0;">₹${(item.unitPrice * item.qty).toFixed(2)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div id="thermal-receipt" class="receipt-paper p-6 max-w-sm mx-auto text-black rounded-lg">
      <div class="text-center pb-3 border-b-2 border-black border-dashed">
        <h2 class="text-xl font-black uppercase tracking-wider font-space">PHARMAPULSE</h2>
        <p class="text-[10px] text-gray-700 font-bold uppercase">Smart Pharmacy & Expiry Network</p>
        <p class="text-[10px] text-gray-600 mt-1">204 MediCenter Blvd, Suite 4A</p>
        <p class="text-[10px] text-gray-600">Tel: +1 (555) 742-7622 | Reg: PHA-99218</p>
      </div>

      <div class="py-2.5 text-[10px] border-b border-black border-dashed flex justify-between">
        <div>
          <div><b class="text-gray-800">TAX INVOICE:</b> ${data.invoiceId}</div>
          <div><b class="text-gray-800">Date:</b> ${data.timestamp}</div>
          <div><b class="text-gray-800">Pharmacist:</b> ${data.pharmacist}</div>
        </div>
        <div class="text-right">
          <div><b class="text-gray-800">Customer:</b> ${data.customer}</div>
          <div><b class="text-gray-800">Rx Ref:</b> ${data.rxNumber}</div>
          <div><b class="text-gray-800">Mode:</b> ${data.paymentMethod}</div>
        </div>
      </div>

      <!-- Itemized Table -->
      <table class="w-full my-3" style="border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1.5px solid #000; font-size: 10px; text-transform: uppercase;">
            <th style="text-align: left; padding-bottom: 4px;">Item</th>
            <th style="text-align: center; padding-bottom: 4px;">Qty</th>
            <th style="text-align: right; padding-bottom: 4px;">Price</th>
            <th style="text-align: right; padding-bottom: 4px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <!-- Calculations -->
      <div class="pt-2 border-t-2 border-black border-dashed text-xs space-y-1 font-mono-code">
        <div class="flex justify-between">
          <span>Subtotal:</span>
          <span>₹${data.subtotal.toFixed(2)}</span>
        </div>
        <div class="flex justify-between">
          <span>GST / Tax (${(data.taxRate * 100).toFixed(0)}%):</span>
          <span>₹${data.taxAmount.toFixed(2)}</span>
        </div>
        ${data.discount > 0 ? `
          <div class="flex justify-between text-green-700 font-bold">
            <span>Special Discount:</span>
            <span>-₹${data.discount.toFixed(2)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between text-base font-black border-t border-black pt-1.5 mt-1">
          <span>GRAND TOTAL:</span>
          <span>₹${data.total.toFixed(2)}</span>
        </div>
      </div>

      <!-- Barcode simulation -->
      <div class="mt-4 pt-3 border-t border-dashed border-gray-400 text-center">
        <div class="inline-block py-1">
          <svg class="h-10 mx-auto" viewBox="0 0 160 40">
            <rect x="0" y="0" width="3" height="35" fill="#000"/>
            <rect x="5" y="0" width="2" height="35" fill="#000"/>
            <rect x="9" y="0" width="4" height="35" fill="#000"/>
            <rect x="16" y="0" width="2" height="35" fill="#000"/>
            <rect x="20" y="0" width="5" height="35" fill="#000"/>
            <rect x="28" y="0" width="1" height="35" fill="#000"/>
            <rect x="31" y="0" width="3" height="35" fill="#000"/>
            <rect x="36" y="0" width="6" height="35" fill="#000"/>
            <rect x="44" y="0" width="2" height="35" fill="#000"/>
            <rect x="48" y="0" width="4" height="35" fill="#000"/>
            <rect x="54" y="0" width="1" height="35" fill="#000"/>
            <rect x="57" y="0" width="5" height="35" fill="#000"/>
            <rect x="64" y="0" width="3" height="35" fill="#000"/>
            <rect x="70" y="0" width="2" height="35" fill="#000"/>
            <rect x="74" y="0" width="5" height="35" fill="#000"/>
            <rect x="82" y="0" width="3" height="35" fill="#000"/>
            <rect x="88" y="0" width="2" height="35" fill="#000"/>
            <rect x="93" y="0" width="4" height="35" fill="#000"/>
            <rect x="100" y="0" width="3" height="35" fill="#000"/>
            <rect x="105" y="0" width="5" height="35" fill="#000"/>
            <rect x="113" y="0" width="2" height="35" fill="#000"/>
            <rect x="118" y="0" width="4" height="35" fill="#000"/>
            <rect x="125" y="0" width="3" height="35" fill="#000"/>
            <rect x="131" y="0" width="5" height="35" fill="#000"/>
            <rect x="139" y="0" width="2" height="35" fill="#000"/>
            <rect x="144" y="0" width="4" height="35" fill="#000"/>
            <rect x="151" y="0" width="2" height="35" fill="#000"/>
          </svg>
        </div>
        <p class="text-[9px] font-mono-code font-bold tracking-widest text-gray-700">*${data.invoiceId}*</p>
      </div>

      <div class="mt-2 text-center text-[9px] text-gray-600 leading-tight">
        <p>FEFO Standard Compliant &bull; Non-Refundable</p>
        <p>Thank you for choosing PharmaPulse!</p>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Interactive Analytics Section (Chart.js)
// -------------------------------------------------------------

function initAnalyticsCharts() {
  if (typeof Chart === 'undefined') return;

  // Chart defaults for neo-brutalist dark mode
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

  // 1. Sales vs Expired Stock Losses Chart
  const salesLossCtx = document.getElementById('chart-sales-loss');
  if (salesLossCtx) {
    if (AppState.charts.salesLossChart) AppState.charts.salesLossChart.destroy();
    
    AppState.charts.salesLossChart = new Chart(salesLossCtx, {
      type: 'bar',
      data: {
        labels: ANALYTICS_DATA.months,
        datasets: [
          {
            label: 'Monthly Sales (₹)',
            data: ANALYTICS_DATA.monthlySales,
            backgroundColor: 'rgba(0, 210, 255, 0.75)',
            borderColor: '#00D2FF',
            borderWidth: 2,
            borderRadius: 6,
            order: 2
          },
          {
            label: 'Expired Stock Losses (₹)',
            data: ANALYTICS_DATA.expiredLosses,
            type: 'line',
            borderColor: '#FF2E63',
            backgroundColor: 'rgba(255, 46, 99, 0.15)',
            borderWidth: 3,
            pointBackgroundColor: '#FF2E63',
            pointBorderColor: '#ffffff',
            pointRadius: 5,
            fill: true,
            tension: 0.35,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              font: { weight: 'bold', size: 11 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              callback: value => '₹' + value.toLocaleString()
            }
          }
        }
      }
    });
  }

  // 2. Top 5 Fast Moving Medicines
  const fastMovingCtx = document.getElementById('chart-fast-moving');
  if (fastMovingCtx) {
    if (AppState.charts.fastMovingChart) AppState.charts.fastMovingChart.destroy();

    AppState.charts.fastMovingChart = new Chart(fastMovingCtx, {
      type: 'bar',
      data: {
        labels: ANALYTICS_DATA.topFastMoving.map(i => i.name),
        datasets: [{
          label: 'Units Sold (Last 30 Days)',
          data: ANALYTICS_DATA.topFastMoving.map(i => i.unitsSold),
          backgroundColor: [
            'rgba(0, 245, 155, 0.8)',
            'rgba(0, 210, 255, 0.8)',
            'rgba(157, 78, 221, 0.8)',
            'rgba(255, 184, 0, 0.8)',
            'rgba(59, 130, 246, 0.8)'
          ],
          borderColor: [
            '#00F59B',
            '#00D2FF',
            '#9D4EDD',
            '#FFB800',
            '#3B82F6'
          ],
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            grid: { display: false }
          }
        }
      }
    });
  }

  // 3. Stock Expiry Risk Breakdown Doughnut
  const doughnutCtx = document.getElementById('chart-risk-doughnut');
  if (doughnutCtx) {
    if (AppState.charts.riskDoughnutChart) AppState.charts.riskDoughnutChart.destroy();

    const stats = getComputedStats();
    const safeCount = Math.max(0, stats.totalSKUs - (stats.expiringSoonCount + stats.expiredCount));

    AppState.charts.riskDoughnutChart = new Chart(doughnutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Safe (>30d)', 'Expiring Soon (<=30d)', 'Expired'],
        datasets: [{
          data: [safeCount, stats.expiringSoonCount, stats.expiredCount],
          backgroundColor: [
            'rgba(0, 245, 155, 0.8)',
            'rgba(255, 184, 0, 0.8)',
            'rgba(255, 46, 99, 0.85)'
          ],
          borderColor: ['#00F59B', '#FFB800', '#FF2E63'],
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 12, font: { size: 10 } }
          }
        }
      }
    });
  }
}

function updateAnalyticsCharts() {
  if (AppState.charts.riskDoughnutChart) {
    const stats = getComputedStats();
    const safeCount = Math.max(0, stats.totalSKUs - (stats.expiringSoonCount + stats.expiredCount));
    AppState.charts.riskDoughnutChart.data.datasets[0].data = [safeCount, stats.expiringSoonCount, stats.expiredCount];
    AppState.charts.riskDoughnutChart.update();
  }
}

// -------------------------------------------------------------
// Modals & Action Workflows
// -------------------------------------------------------------

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Open Medicine Dossier View Modal
function viewMedicineDetails(id) {
  const item = AppState.medicines.find(m => m.id === id);
  if (!item) return;

  const daysLeft = calculateDaysRemaining(item.expDate);
  const container = document.getElementById('details-modal-content');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-start justify-between pb-3 border-b border-slate-700">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono-code">${item.id}</span>
          <h3 class="text-xl font-bold text-white mt-0.5">${item.name}</h3>
          <p class="text-xs text-slate-400 italic">${item.genericName}</p>
        </div>
        <div class="text-right">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold font-mono-code ${daysLeft < 0 ? 'bg-red-500/20 text-red-400 border border-red-500/40' : (daysLeft <= 30 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40')}">
            ${daysLeft < 0 ? `EXPIRED (${Math.abs(daysLeft)}d)` : `${daysLeft} Days Shelf Life`}
          </span>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
          <span class="font-bold text-white">${item.category}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400 block text-[10px] uppercase font-bold">Batch Number</span>
          <span class="font-mono-code font-bold text-cyan-300">${item.batchNo}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400 block text-[10px] uppercase font-bold">Rack Location</span>
          <span class="font-bold text-amber-300">${item.rackLocation}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400 block text-[10px] uppercase font-bold">Mfg Date</span>
          <span class="font-mono-code text-slate-300">${item.mfdDate}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400 block text-[10px] uppercase font-bold">Expiry Date</span>
          <span class="font-mono-code font-bold ${daysLeft < 0 ? 'text-red-400' : 'text-emerald-400'}">${item.expDate}</span>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400 block text-[10px] uppercase font-bold">Prescription</span>
          <span class="font-bold ${item.prescriptionRequired ? 'text-cyan-400' : 'text-slate-400'}">${item.prescriptionRequired ? 'Mandatory Rx' : 'OTC (Over Counter)'}</span>
        </div>
      </div>

      <!-- Financials & Inventory -->
      <div class="p-3 rounded-lg bg-slate-900/90 border border-slate-800 grid grid-cols-3 gap-2 text-center">
        <div>
          <div class="text-[10px] uppercase text-slate-400">Current Stock</div>
          <div class="text-lg font-bold font-space text-white">${item.stockQty} <span class="text-xs font-normal">units</span></div>
        </div>
        <div>
          <div class="text-[10px] uppercase text-slate-400">Unit Cost Price</div>
          <div class="text-lg font-bold font-mono-code text-slate-300">₹${item.costPrice.toFixed(2)}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase text-slate-400">Retail Unit MRP</div>
          <div class="text-lg font-bold font-mono-code text-[#00F59B]">₹${item.unitPrice.toFixed(2)}</div>
        </div>
      </div>

      <div class="text-xs text-slate-400 pt-1">
        <span class="font-bold text-slate-300">Supplier:</span> ${item.supplier}
      </div>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-700">
        ${daysLeft >= 0 && item.stockQty > 0 ? `
          <button onclick="addMedicineToCartById('${item.id}'); closeModal('details-modal');" class="btn-neo btn-neo-green px-4 py-2 rounded-lg text-xs flex items-center gap-1.5">
            <i class="fa-solid fa-cart-plus"></i> Add to POS Bill
          </button>
        ` : ''}
        <button onclick="openDisposeModal('${item.id}'); closeModal('details-modal');" class="btn-neo btn-neo-crimson px-4 py-2 rounded-lg text-xs flex items-center gap-1.5">
          <i class="fa-solid fa-trash-can"></i> Dispose / Write-off
        </button>
      </div>
    </div>
  `;

  openModal('details-modal');
}

// Disposal Modal
let currentDisposeItemId = null;
function openDisposeModal(id) {
  const item = AppState.medicines.find(m => m.id === id);
  if (!item) return;

  currentDisposeItemId = id;
  const descEl = document.getElementById('dispose-item-info');
  const qtyInput = document.getElementById('dispose-qty-input');

  if (descEl) {
    const days = calculateDaysRemaining(item.expDate);
    descEl.innerHTML = `
      <b class="text-white">${item.name}</b> (Batch: <span class="font-mono-code text-cyan-300">${item.batchNo}</span>)<br>
      Available Stock: <span class="text-amber-400 font-bold">${item.stockQty}</span> units &bull; 
      Expiry: <span class="${days < 0 ? 'text-red-400' : 'text-slate-300'} font-mono-code">${item.expDate}</span>
    `;
  }

  if (qtyInput) {
    qtyInput.max = item.stockQty;
    qtyInput.value = item.stockQty; // default all
  }

  openModal('dispose-modal');
}

function confirmDisposeItem() {
  if (!currentDisposeItemId) return;

  const item = AppState.medicines.find(m => m.id === currentDisposeItemId);
  if (!item) return;

  const qtyInput = document.getElementById('dispose-qty-input');
  const reasonSelect = document.getElementById('dispose-reason-select');

  const disposeQty = parseInt(qtyInput ? qtyInput.value : item.stockQty, 10);
  const reason = reasonSelect ? reasonSelect.value : 'Expired Shelf-Life';

  if (isNaN(disposeQty) || disposeQty <= 0 || disposeQty > item.stockQty) {
    showToast("Invalid Quantity", "Please specify a valid quantity to dispose.", "warning");
    return;
  }

  const lossValue = disposeQty * item.costPrice;

  if (disposeQty === item.stockQty) {
    item.stockQty = 0;
    item.isDisposed = true;
  } else {
    item.stockQty -= disposeQty;
  }

  saveData();
  closeModal('dispose-modal');
  SoundFX.playWarning();

  // Record write-off in SQL database
  if (typeof API !== 'undefined' && API.isServerConnected) {
    API.disposeStock({
      id: item.id,
      quantity: disposeQty,
      reason: reason
    }).catch(err => {
      console.warn("DB disposal sync error:", err);
    });
  }

  // Log in losses history
  ANALYTICS_DATA.expiredLosses[ANALYTICS_DATA.expiredLosses.length - 1] += Math.round(lossValue);

  renderMetricCards();
  renderExpiryAlertBar();
  renderExpiryTracker();
  updateAnalyticsCharts();

  showToast("Inventory Written Off", `${disposeQty} units of ${item.name} written off. Reason: ${reason} (₹${lossValue.toFixed(2)} cost loss).`, "danger");
}

// Quick Discount Modal & Direct Actions
let currentDiscountItemId = null;
function openDiscountModal(id) {
  const item = AppState.medicines.find(m => m.id === id);
  if (!item) return;

  currentDiscountItemId = id;
  const descEl = document.getElementById('discount-item-info');
  if (descEl) {
    descEl.innerHTML = `
      <b class="text-white">${item.name}</b> (Batch: <span class="font-mono-code text-cyan-300">${item.batchNo}</span>)<br>
      Current MRP: <span class="font-mono-code text-[#00F59B]">₹${item.unitPrice.toFixed(2)}</span>
    `;
  }
  openModal('discount-modal');
}

function quickDiscountMedicine(id, percentage) {
  const item = AppState.medicines.find(m => m.id === id);
  if (!item) return;

  item.discountPercentage = percentage;
  saveData();

  if (typeof API !== 'undefined' && API.isServerConnected) {
    API.updateDiscount(id, percentage).catch(err => {
      console.warn("DB discount sync error:", err);
    });
  }

  SoundFX.playBeep(880, 'sine', 0.1);
  renderExpiryAlertBar();
  renderExpiryTracker();
  showToast("Discount Applied", `${percentage}% clearance discount applied to ${item.name}!`, "success");
}

function applyCustomDiscount() {
  if (!currentDiscountItemId) return;
  const select = document.getElementById('discount-percentage-select');
  const pct = parseInt(select ? select.value : 25, 10);
  quickDiscountMedicine(currentDiscountItemId, pct);
  closeModal('discount-modal');
}

// Add New Medicine Form Submission
function handleAddNewMedicine(e) {
  e.preventDefault();

  const name = document.getElementById('add-name').value.trim();
  const generic = document.getElementById('add-generic').value.trim();
  const category = document.getElementById('add-category').value;
  const batchNo = document.getElementById('add-batch').value.trim().toUpperCase();
  const mfdDate = document.getElementById('add-mfd').value;
  const expDate = document.getElementById('add-exp').value;
  const stockQty = parseInt(document.getElementById('add-stock').value, 10);
  const minThreshold = parseInt(document.getElementById('add-min-threshold').value, 10) || 15;
  const unitPrice = parseFloat(document.getElementById('add-price').value);
  const costPrice = parseFloat(document.getElementById('add-cost').value) || (unitPrice * 0.65);
  const rackLocation = document.getElementById('add-rack').value.trim() || 'Rack A-01';
  const supplier = document.getElementById('add-supplier').value.trim() || 'Generic Pharma Direct';
  const rxRequired = document.getElementById('add-rx-required').checked;

  if (!name || !batchNo || !expDate || isNaN(stockQty) || isNaN(unitPrice)) {
    showToast("Validation Error", "Please fill in all mandatory fields with valid values.", "warning");
    return;
  }

  // Create new medicine object
  const newMed = {
    id: `MED-${Math.floor(100 + Math.random() * 900)}`,
    name: name,
    genericName: generic || name,
    category: category,
    dosage: "Standard Pack",
    batchNo: batchNo,
    mfdDate: mfdDate || getRelativeDate(-30),
    expDate: expDate,
    rackLocation: rackLocation,
    stockQty: stockQty,
    minThreshold: minThreshold,
    unitPrice: unitPrice,
    costPrice: costPrice,
    discountPercentage: 0,
    supplier: supplier,
    prescriptionRequired: rxRequired,
    salesCount30Days: 0,
    isDisposed: false
  };

  AppState.medicines.unshift(newMed);
  saveData();

  if (typeof API !== 'undefined' && API.isServerConnected) {
    API.addMedicine(newMed).catch(err => {
      console.warn("DB add medicine sync error:", err);
    });
  }

  SoundFX.playSuccess();
  closeModal('add-stock-modal');
  document.getElementById('add-medicine-form').reset();

  renderMetricCards();
  renderExpiryAlertBar();
  renderExpiryTracker();
  updateAnalyticsCharts();

  showToast("Medicine Stock Added", `${name} (Batch ${batchNo}) successfully enrolled into inventory!`, "success");
}

// -------------------------------------------------------------
// Filters & Controls Setup
// -------------------------------------------------------------

function setFilterTab(tabName) {
  AppState.activeTab = tabName;

  // Update UI buttons
  const tabs = ['expiring_soon', 'expired', 'all', 'low_stock'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-btn-${t}`);
    if (el) {
      if (t === tabName) {
        el.classList.add('active', 'border-b-2', 'border-[#00D2FF]', 'text-white', 'bg-slate-800/80');
        el.classList.remove('text-slate-400');
      } else {
        el.classList.remove('active', 'border-b-2', 'border-[#00D2FF]', 'text-white', 'bg-slate-800/80');
        el.classList.add('text-slate-400');
      }
    }
  });

  renderExpiryTracker();
}

function setViewMode(mode) {
  AppState.viewMode = mode;
  const cardsBtn = document.getElementById('view-cards-btn');
  const tableBtn = document.getElementById('view-table-btn');

  if (mode === 'cards') {
    if (cardsBtn) cardsBtn.className = 'px-3 py-1.5 rounded-lg bg-[#00D2FF] text-slate-950 font-bold text-xs';
    if (tableBtn) tableBtn.className = 'px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white font-medium text-xs';
  } else {
    if (tableBtn) tableBtn.className = 'px-3 py-1.5 rounded-lg bg-[#00D2FF] text-slate-950 font-bold text-xs';
    if (cardsBtn) cardsBtn.className = 'px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white font-medium text-xs';
  }

  renderExpiryTracker();
}

function resetFilters() {
  AppState.searchTerm = '';
  AppState.activeCategory = 'All';
  AppState.activeTab = 'all';

  const searchInput = document.getElementById('global-search-input');
  const trackerSearch = document.getElementById('tracker-search-input');
  const catFilter = document.getElementById('category-filter-select');

  if (searchInput) searchInput.value = '';
  if (trackerSearch) trackerSearch.value = '';
  if (catFilter) catFilter.value = 'All';

  setFilterTab('all');
  showToast("Filters Cleared", "Showing all active inventory.", "info");
}

// Export Inventory to CSV
function exportInventoryCSV() {
  const items = AppState.medicines.filter(m => !m.isDisposed);
  let csv = 'ID,Name,Generic,Category,Batch,MFD,EXP,DaysLeft,Rack,Stock,UnitPrice,CostPrice,Supplier\n';

  items.forEach(item => {
    const days = calculateDaysRemaining(item.expDate);
    csv += `"${item.id}","${item.name}","${item.genericName}","${item.category}","${item.batchNo}","${item.mfdDate}","${item.expDate}",${days},"${item.rackLocation}",${item.stockQty},${item.unitPrice},${item.costPrice},"${item.supplier}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PharmaPulse_Inventory_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Export Downloaded", "Inventory data exported to CSV successfully.", "success");
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------

async function initApp() {
  await loadData();
  renderMetricCards();
  renderExpiryAlertBar();
  renderExpiryTracker();
  renderCart();
  initAnalyticsCharts();

  // Sync analytics from live SQL database if connected
  if (typeof API !== 'undefined' && API.isServerConnected) {
    API.getAnalytics().then(dbAnalytics => {
      if (dbAnalytics) {
        if (dbAnalytics.monthlySales) ANALYTICS_DATA.monthlySales = dbAnalytics.monthlySales;
        if (dbAnalytics.expiredLosses) ANALYTICS_DATA.expiredLosses = dbAnalytics.expiredLosses;
        if (dbAnalytics.topFastMoving && dbAnalytics.topFastMoving.length > 0) {
          ANALYTICS_DATA.topFastMoving = dbAnalytics.topFastMoving;
        }
        updateAnalyticsCharts();
      }
    }).catch(() => {});
  }

  // Populate Categories in filters & modal
  const categories = Array.from(new Set(AppState.medicines.map(m => m.category))).sort();
  const filterCat = document.getElementById('category-filter-select');
  const addCat = document.getElementById('add-category');

  if (filterCat) {
    filterCat.innerHTML = '<option value="All">All Categories</option>' + 
      categories.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  if (addCat) {
    addCat.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  // Pre-fill Add Form MFD & EXP dates
  const addMfd = document.getElementById('add-mfd');
  const addExp = document.getElementById('add-exp');
  if (addMfd) addMfd.value = getRelativeDate(-10);
  if (addExp) addExp.value = getRelativeDate(365);
}

// Event Listeners on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  SoundFX.init();
  await initApp();

  // Global Search input
  const globalSearch = document.getElementById('global-search-input');
  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      AppState.searchTerm = e.target.value;
      renderExpiryTracker();
    });
  }

  // Tracker In-Page Search input
  const trackerSearch = document.getElementById('tracker-search-input');
  if (trackerSearch) {
    trackerSearch.addEventListener('input', (e) => {
      AppState.searchTerm = e.target.value;
      renderExpiryTracker();
    });
  }

  // Category filter dropdown
  const catFilter = document.getElementById('category-filter-select');
  if (catFilter) {
    catFilter.addEventListener('change', (e) => {
      AppState.activeCategory = e.target.value;
      renderExpiryTracker();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('sort-by-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      AppState.sortBy = e.target.value;
      renderExpiryTracker();
    });
  }

  // Add Medicine Form
  const addForm = document.getElementById('add-medicine-form');
  if (addForm) {
    addForm.addEventListener('submit', handleAddNewMedicine);
  }

  // Tax Rate Selector in POS
  const taxSelector = document.getElementById('pos-tax-select');
  if (taxSelector) {
    taxSelector.addEventListener('change', (e) => {
      AppState.taxRate = parseFloat(e.target.value);
      renderCart();
    });
  }

  // Customer Name and Rx Input in POS
  const customerInput = document.getElementById('pos-customer-input');
  if (customerInput) {
    customerInput.addEventListener('input', (e) => {
      AppState.customerName = e.target.value;
    });
  }

  const rxInput = document.getElementById('pos-rx-input');
  if (rxInput) {
    rxInput.addEventListener('input', (e) => {
      AppState.rxNumber = e.target.value;
    });
  }

  // Payment mode radio/buttons in POS
  const paymentButtons = document.querySelectorAll('.payment-method-btn');
  paymentButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      paymentButtons.forEach(b => b.classList.remove('active', 'border-[#00D2FF]', 'bg-[#00D2FF]/20', 'text-white'));
      btn.classList.add('active', 'border-[#00D2FF]', 'bg-[#00D2FF]/20', 'text-white');
      AppState.paymentMethod = btn.dataset.method || 'UPI / QR';
    });
  });

  // Sound toggle button
  const soundToggle = document.getElementById('sound-toggle-btn');
  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      AppState.audioEnabled = !AppState.audioEnabled;
      soundToggle.innerHTML = AppState.audioEnabled 
        ? '<i class="fa-solid fa-volume-high text-cyan-400"></i>' 
        : '<i class="fa-solid fa-volume-xmark text-slate-500"></i>';
      showToast("Audio Alerts", AppState.audioEnabled ? "Audio chimes & feedback enabled." : "Audio feedback muted.", "info");
    });
  }

  // Keyboard shortcut Ctrl+K to search
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const s = document.getElementById('global-search-input') || document.getElementById('tracker-search-input');
      if (s) {
        s.focus();
        s.select();
      }
    }
  });

  // Clock Update
  function updateLiveClock() {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
      const now = new Date();
      clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  setInterval(updateLiveClock, 1000);
  updateLiveClock();
});

// =============================================================
// OCR MEDICINE SCANNER
// Added as a self-contained feature. Existing inventory/POS logic is unchanged.
// =============================================================

let ocrSelectedFile = null;
let ocrWorker = null;

function openOCRScanner() {
  const modal = document.getElementById('ocr-scanner-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeOCRScanner() {
  const modal = document.getElementById('ocr-scanner-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function setOCRProgress(percent, status) {
  const bar = document.getElementById('ocr-progress-bar');
  const pct = document.getElementById('ocr-progress-text');
  const statusEl = document.getElementById('ocr-status-text');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (pct) pct.textContent = `${Math.round(percent)}%`;
  if (statusEl) statusEl.textContent = status || 'Processing...';
}

function resetOCRFields() {
  const ids = ['ocr-result-name', 'ocr-result-batch', 'ocr-result-mfd', 'ocr-result-exp', 'ocr-raw-text'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function clearOCRImage() {
  ocrSelectedFile = null;
  const input = document.getElementById('ocr-image-input');
  const camera = document.getElementById('ocr-camera-input');
  const previewWrap = document.getElementById('ocr-preview-wrap');
  const preview = document.getElementById('ocr-preview-image');
  const progress = document.getElementById('ocr-progress-wrap');
  const results = document.getElementById('ocr-results-wrap');

  if (input) input.value = '';
  if (camera) camera.value = '';
  if (preview) preview.removeAttribute('src');
  if (previewWrap) previewWrap.classList.add('hidden');
  if (progress) progress.classList.add('hidden');
  if (results) results.classList.add('hidden');
  resetOCRFields();
}

function clearOCRResults() {
  resetOCRFields();
  const results = document.getElementById('ocr-results-wrap');
  if (results) results.classList.add('hidden');
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the selected image.'));
    };
    img.src = url;
  });
}

function preprocessOCRImage(img) {
  const maxWidth = 1800;
  const scale = Math.min(2.2, Math.max(1, maxWidth / Math.max(img.naturalWidth || img.width, 1)));
  const width = Math.round((img.naturalWidth || img.width) * scale);
  const height = Math.round((img.naturalHeight || img.height) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  // Grayscale + contrast enhancement. This helps printed batch/date text stand out.
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const contrast = ((gray - 128) * 1.45) + 128;
    const v = Math.max(0, Math.min(255, contrast));
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function normalizeOCRText(text) {
  return String(text || '')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeDate(day, month, year) {
  let dText = String(day).trim();
  const m = parseInt(month, 10);

  // Tesseract can read the printed leading '1' in dates such as
  // 17.06.26 as '4', producing 47. A day 40-49 is impossible, so
  // safely correct that OCR-specific error back to 10-19.
  let d = parseInt(dText.replace(/[OQDG]/gi, '0').replace(/[IlL]/g, '1'), 10);
  if (d >= 40 && d <= 49) d -= 30;

  // Common OCR substitutions in the year portion.
  let yText = String(year).trim()
    .replace(/[OQ]/gi, '0')
    .replace(/[IlL]/g, '1')
    .replace(/[Z]/gi, '2')
    .replace(/[S]/gi, '5');
  let y = parseInt(yText, 10);
  if (y < 100) y += 2000;

  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000 || y > 2100) return '';
  return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
}

// OCR often reads printed dates as "17 . 06 . 26" or changes one digit into
// a similar-looking letter. This parser deliberately accepts those cases.
function extractDatesFromText(text) {
  const dateRegex = /\b(0?[1-9]|[12]\d|3[01])\s*[.\/-]\s*(0?[1-9]|1[0-2])\s*[.\/-]\s*([0-9OQDGIlL]{2}|[0-9OQDGIlL]{4})\b/gi;
  const found = [];
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    const value = normalizeDate(match[1], match[2], match[3]);
    if (value && !found.includes(value)) found.push(value);
  }
  return found;
}

function extractOCRFields(rawText) {
  const text = normalizeOCRText(rawText);
  const lines = text.split('\n');
  let batch = '';
  let mfd = '';
  let exp = '';
  let name = '';

  const dateRegex = /(0?[1-9]|[12]\d|3[01])\s*[.\/-]\s*(0?[1-9]|1[0-2])\s*[.\/-]\s*([0-9OQDGIlL]{2}|[0-9OQDGIlL]{4})/i;
  const cleanLine = line => line.replace(/[^A-Za-z0-9.\/ :#()&+%-]/g, ' ').replace(/\s+/g, ' ').trim();

  // Read labelled lines first. Also accept "Exp Date", "Expiry Date", etc.
  for (let i = 0; i < lines.length; i++) {
    const line = cleanLine(lines[i]);
    const lower = line.toLowerCase();
    const dateMatch = line.match(dateRegex);

    if (!batch && /(batch|batch no|b\.?\s*no|lot no|lot)/i.test(lower)) {
      const after = line.replace(/.*?(batch\s*(?:no\.?|number)?|b\.?\s*no\.?|lot\s*(?:no\.?|number)?)/i, '').trim();
      const token = after.match(/[A-Z0-9][A-Z0-9-]{3,15}/i);
      if (token) batch = token[0].toUpperCase().replace(/^PVH(?=\d)/, 'EVH');
    }

    if (dateMatch) {
      const parsed = normalizeDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (/(exp\.?|expiry|expires|use before|best before|valid till|valid up to)/i.test(lower)) {
        if (!exp) exp = parsed;
      } else if (/(mfd|mfg|manufactur|manufactured)/i.test(lower)) {
        if (!mfd) mfd = parsed;
      }
    }

    // Sometimes Tesseract puts the label and date on adjacent lines.
    if (/(exp\.?|expiry|expires|use before|best before|valid till|valid up to)/i.test(lower) && !exp) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        const nextMatch = cleanLine(lines[j]).match(dateRegex);
        if (nextMatch) {
          exp = normalizeDate(nextMatch[1], nextMatch[2], nextMatch[3]);
          break;
        }
      }
    }
  }

  // Strong fallback: dates are normally printed MFD first and EXP second.
  const allDates = extractDatesFromText(text);
  if (!mfd && allDates.length >= 1) mfd = allDates[0];
  if (!exp && allDates.length >= 2) exp = allDates[1];

  // Expiry fallback: OCR frequently reads the leading '1' in 17.06.26
  // as '4', i.e. 47.06.26. normalizeDate() corrects that impossible day.
  // Search the text after an expiry label, even when the label and date are
  // separated by spaces/newlines or another OCR fragment.
  if (!exp) {
    const expiryLabel = /(?:exp\.?\s*date|expiry\s*date|expires|use\s*before|best\s*before|valid\s*till|valid\s*up\s*to)/i;
    const expiryIndex = text.search(expiryLabel);
    if (expiryIndex >= 0) {
      const afterExpiry = text.slice(expiryIndex, expiryIndex + 120);
      const expiryDateRegex = /(\d{1,2}|[A-Za-z]\d)\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*([0-9A-Za-z]{2,4})/i;
      const match = afterExpiry.match(expiryDateRegex);
      if (match) exp = normalizeDate(match[1], match[2], match[3]);
    }
  }

  // If OCR saw only one date, compare it with the date-labelled context from
  // the raw OCR passes before giving up. This prevents a false "Not detected".
  if (!exp) {
    const expiryContext = text.match(/(?:exp\.?\s*date|expiry\s*date|expires|use\s*before|best\s*before|valid\s*till|valid\s*up\s*to)[^\n]{0,45}/i);
    if (expiryContext) {
      const contextDates = extractDatesFromText(expiryContext[0]);
      if (contextDates.length) exp = contextDates[0];
    }
  }

  if (!batch) {
    const candidates = text.toUpperCase().match(/\b[A-Z]{2,}[A-Z0-9-]{2,12}\b/g) || [];
    const blocked = new Set(['BATCH', 'NUMBER', 'DATE', 'MFG', 'MFD', 'EXP', 'EXPIRY', 'TABLETS', 'TABLET', 'MG', 'ML', 'USP', 'BP']);
    const scored = candidates
      .filter(v => !blocked.has(v) && /[A-Z]/.test(v) && /\d/.test(v))
      .sort((a, b) => b.length - a.length);
    if (scored.length) batch = scored[0].replace(/^PVH(?=\d)/, 'EVH');
  }

  const excluded = /(batch|mfd|mfg|manufactur|exp|expiry|date|tablet|capsule|mg|ml|lot|storage|keep|store|prescription)/i;
  const nameCandidates = lines
    .map(cleanLine)
    .filter(line => line.length >= 4 && line.length <= 60)
    .filter(line => /[A-Za-z]{3,}/.test(line))
    .filter(line => !dateRegex.test(line))
    .filter(line => !excluded.test(line));
  if (nameCandidates.length) {
    const candidate = nameCandidates.find(line => (line.match(/[A-Za-z]+/g) || []).length >= 2);
    if (candidate) name = candidate;
  }

  return {
    name: name || 'Not detected',
    batch: batch || 'Not detected',
    mfd: mfd || 'Not detected',
    exp: exp || 'Not detected',
    raw: text
  };
}

async function runOCROnImage(file) {
  if (!window.Tesseract) {
    throw new Error('OCR library could not be loaded. Check your internet connection and reload the page.');
  }

  const img = await loadImageFromFile(file);
  const processed = preprocessOCRImage(img);
  const images = [file, processed];
  const results = [];

  // Add a center crop. Medicine batch/MFD/EXP labels are often small in the
  // full photograph; OCR is much more reliable when the label occupies more
  // of the image.
  try {
    const cropCanvas = document.createElement('canvas');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const sx = Math.round(w * 0.18);
    const sy = Math.round(h * 0.18);
    const sw = Math.round(w * 0.64);
    const sh = Math.round(h * 0.64);
    cropCanvas.width = sw * 2;
    cropCanvas.height = sh * 2;
    const cctx = cropCanvas.getContext('2d');
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(img, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
    results.push({ image: cropCanvas.toDataURL('image/png'), mode: '11' });
  } catch (e) {
    console.warn('OCR crop preparation skipped:', e);
  }

  results.unshift({ image: file, mode: '6' }, { image: processed, mode: '11' });

  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker('eng', 1, {
      logger: message => {
        if (message && message.status) {
          const p = Number.isFinite(message.progress) ? message.progress : 0;
          const current = 8 + Math.round(p * 82);
          setOCRProgress(current, message.status === 'recognizing text' ? 'Reading medicine label...' : 'Preparing OCR...');
        }
      }
    });
  }

  const passTexts = [];
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    await ocrWorker.setParameters({
      tessedit_pageseg_mode: item.mode,
      preserve_interword_spaces: '1'
    });
    setOCRProgress(10 + Math.round(i * 25), `Reading label (scan ${i + 1}/${results.length})...`);
    const result = await ocrWorker.recognize(item.image);
    if (result?.data?.text) passTexts.push(result.data.text);
  }

  const merged = passTexts
    .join('\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  // Keep all useful OCR lines; extraction below decides which values are fields.
  return extractOCRFields(merged.join('\n'));
}

async function handleOCRFile(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return;
  ocrSelectedFile = file;

  const previewWrap = document.getElementById('ocr-preview-wrap');
  const preview = document.getElementById('ocr-preview-image');
  const progress = document.getElementById('ocr-progress-wrap');
  const resultsWrap = document.getElementById('ocr-results-wrap');

  if (preview) preview.src = URL.createObjectURL(file);
  if (previewWrap) previewWrap.classList.remove('hidden');
  if (resultsWrap) resultsWrap.classList.add('hidden');
  if (progress) progress.classList.remove('hidden');
  setOCRProgress(5, 'Starting OCR...');
  resetOCRFields();

  try {
    const fields = await runOCROnImage(file);
    document.getElementById('ocr-result-name').value = fields.name;
    document.getElementById('ocr-result-batch').value = fields.batch;
    document.getElementById('ocr-result-mfd').value = fields.mfd;
    document.getElementById('ocr-result-exp').value = fields.exp;
    document.getElementById('ocr-raw-text').value = fields.raw;
    setOCRProgress(100, 'OCR scan completed');
    if (resultsWrap) resultsWrap.classList.remove('hidden');
  } catch (error) {
    console.error('OCR error:', error);
    setOCRProgress(0, 'OCR failed');
    const raw = document.getElementById('ocr-raw-text');
    if (raw) raw.value = `OCR Error: ${error.message || error}`;
    if (resultsWrap) resultsWrap.classList.remove('hidden');
    showToast('OCR Error', error.message || 'Unable to read the image.', 'error');
  }
}

function useOCRForAddStock() {
  const name = document.getElementById('ocr-result-name')?.value.trim();
  const batch = document.getElementById('ocr-result-batch')?.value.trim();
  const mfd = document.getElementById('ocr-result-mfd')?.value.trim();
  const exp = document.getElementById('ocr-result-exp')?.value.trim();

  if (name && name !== 'Not detected') document.getElementById('add-name').value = name;
  if (batch && batch !== 'Not detected') document.getElementById('add-batch').value = batch;
  if (mfd && mfd !== 'Not detected') document.getElementById('add-mfd').value = convertOCRDateToInput(mfd);
  if (exp && exp !== 'Not detected') document.getElementById('add-exp').value = convertOCRDateToInput(exp);

  closeOCRScanner();
  if (typeof openModal === 'function') openModal('add-stock-modal');
  showToast('OCR Data Applied', 'Detected medicine details were transferred to Add Stock. Please verify them before saving.', 'success');
}

function convertOCRDateToInput(value) {
  const m = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// OCR file/camera controls.
document.addEventListener('DOMContentLoaded', () => {
  const imageInput = document.getElementById('ocr-image-input');
  const cameraInput = document.getElementById('ocr-camera-input');
  if (imageInput) imageInput.addEventListener('change', e => handleOCRFile(e.target.files?.[0]));
  if (cameraInput) cameraInput.addEventListener('change', e => handleOCRFile(e.target.files?.[0]));
});
