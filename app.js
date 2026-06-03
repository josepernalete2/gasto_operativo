// ============================================================================
// APP STATE & CONSTANTS
// ============================================================================

let expenses = [];
let BRANCHES = [];
let CATEGORIES = [];
let RECURRING_TEMPLATES = [];
let editingId = null; // Stores ID of the row being edited in-line
let editingSettingId = null; // Stores "branch-X" or "category-X" while editing settings
let ACTIVE_RATES = { bcv: 40.0, paralelo: 40.0, euro: 45.0, usdt: 40.0 };
let CURRENT_USER = null;
let USERS_LIST = [];

const BRANCH_COLORS = [
    '#3b82f6', // Norte - Blue
    '#10b981', // Sur - Green
    '#f59e0b', // Este - Orange
    '#8b5cf6', // Oeste - Purple
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316', // Orange-red
    '#14b8a6'  // Teal
];

// Chart.js instances
let branchChartInstance = null;
let categoryChartInstance = null;
let statusChartInstance = null;

// Check if running directly from local filesystem (file://)
Object.defineProperty(window, 'isLocalFile', {
    get: function() {
        return window.location.protocol === 'file:';
    },
    configurable: true
});

// Define API Base URL dynamically
const isLocalhost = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname === '[::1]';

const DEFAULT_API_URL = 'https://gasto-operativo-onrender-com.onrender.com';
const storedApiUrl = localStorage.getItem("custom_api_url");

const API_BASE_URL = isLocalFile 
    ? '' 
    : (isLocalhost 
        ? (window.location.port === '3000' ? '' : 'http://localhost:3000') 
        : (storedApiUrl || DEFAULT_API_URL));
// Helper to format money values
function formatCurrencyUsd(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value);
}

function formatCurrencyVes(value) {
    return 'Bs. ' + new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

// Helper to perform fetch and validate JSON response content-type
async function safeFetchJson(url, options = {}) {
    const token = localStorage.getItem("auth_token");
    if (token) {
        if (!options.headers) {
            options.headers = {};
        }
        options.headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    
    if (!isJson) {
        throw new Error("El servidor no devolvió una respuesta JSON válida. Asegúrate de que el backend esté activo y configurado.");
    }
    
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `Error del servidor (Código ${response.status})`);
    }
    return data;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initApp() {
    // Seed local users if running locally
    if (isLocalFile) {
        let storedUsers = localStorage.getItem("users_data");
        if (!storedUsers) {
            storedUsers = [
                { id: "admin-id", username: "admin", password: "admin 123", name: "Administrador", role: "admin" }
            ];
            localStorage.setItem("users_data", JSON.stringify(storedUsers));
        }
    }

    // Always setup login listeners first
    setupLoginListeners();

    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        // Stop loading further app details, wait for login success
        return;
    }
    
    // Load rates first
    await loadRates();
    // Load expenses
    await loadExpenses();
    
    // Populate filter and form dropdown options dynamically
    populateDropdowns();
    
    // Populate header date
    initHeaderDate();
    
    // Initialize Charts
    initCharts();
    
    // Render Dashboard UI
    renderDashboard();
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Initialize settings modal events
    initSettingsModal();
    
    // Render Lucide Icons
    lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", async () => {
    // Initialize Theme (Light / Dark) on start
    initTheme();
    await initApp();
});

// Load Exchange Rates (Dual Mode)
async function loadRates() {
    if (isLocalFile) {
        const stored = localStorage.getItem("exchange_rates");
        if (stored) {
            ACTIVE_RATES = JSON.parse(stored);
        } else {
            ACTIVE_RATES = { bcv: 40.0, paralelo: 40.0, euro: 45.0, usdt: 40.0 };
            localStorage.setItem("exchange_rates", JSON.stringify(ACTIVE_RATES));
        }
    } else {
        try {
            const data = await safeFetchJson(`${API_BASE_URL}/api/settings/rates`);
            ACTIVE_RATES = data;
        } catch (error) {
            console.error("Error loading rates from server:", error);
            showToast("Error al cargar las tasas de cambio en tiempo real. Usando valores por defecto.", "warning");
            ACTIVE_RATES = { bcv: 40.0, paralelo: 40.0, euro: 45.0, usdt: 40.0 };
        }
    }
    
    // Render rates to DOM elements
    document.getElementById("rate-bcv-value").textContent = `Bs. ${ACTIVE_RATES.bcv.toFixed(2)}`;
    document.getElementById("rate-paralelo-value").textContent = `Bs. ${ACTIVE_RATES.paralelo.toFixed(2)}`;
    document.getElementById("rate-euro-value").textContent = `Bs. ${ACTIVE_RATES.euro.toFixed(2)}`;
    document.getElementById("rate-usdt-value").textContent = `Bs. ${ACTIVE_RATES.usdt.toFixed(2)}`;
    
    const todayStr = new Date().toLocaleDateString('es-ES', { hour: '2-digit', minute: '2-digit' });
    document.getElementById("rate-bcv-date").textContent = `Última act: ${todayStr}`;
    document.getElementById("rate-paralelo-date").textContent = `Última act: ${todayStr}`;
    document.getElementById("rate-euro-date").textContent = `Última act: ${todayStr}`;
    document.getElementById("rate-usdt-date").textContent = `Última act: ${todayStr}`;
}

// Load expenses data (Dual-Mode: LocalStorage fallback vs API Server)
async function loadExpenses() {
    if (isLocalFile) {
        // --- LOCALSTORAGE FALLBACK MODE ---
        const storedBranches = localStorage.getItem("branches_data");
        if (storedBranches) {
            BRANCHES = JSON.parse(storedBranches);
        } else {
            BRANCHES = ["Sede Norte", "Sede Sur", "Sede Este", "Sede Oeste"];
            localStorage.setItem("branches_data", JSON.stringify(BRANCHES));
        }

        const storedCategories = localStorage.getItem("categories_data");
        if (storedCategories) {
            CATEGORIES = JSON.parse(storedCategories);
        } else {
            CATEGORIES = ["Servicios", "Nómina", "Proveedores", "Mantenimiento", "Tecnología", "Marketing"];
            localStorage.setItem("categories_data", JSON.stringify(CATEGORIES));
        }

        const stored = localStorage.getItem("expenses_data");
        if (stored) {
            expenses = JSON.parse(stored);
        } else {
            expenses = [];
            saveExpensesToStorage();
        }
        
        // Backfill calculated fields for LocalStorage mock expenses
        expenses.forEach(e => {
            if (e.currency === undefined) e.currency = "USD";
            if (e.exchangeRate === undefined) e.exchangeRate = 1.0;
            if (e.amountUsd === undefined) {
                e.amountUsd = e.currency === "VES" ? e.amount / ACTIVE_RATES.bcv : e.amount;
            }
            if (e.amountVes === undefined) {
                e.amountVes = e.currency === "VES" ? e.amount : e.amount * ACTIVE_RATES.bcv;
            }
        });

        // Autogenerate monthly local recurring payments
        generateLocalRecurringExpenses();
        
        setTimeout(() => {
            showToast("Ejecutando en Modo Local (LocalStorage). Abre http://localhost:3000 para usar la Base de Datos.", "info");
        }, 800);
        
    } else {
        // --- SERVER DATABASE MODE ---
        try {
            const data = await safeFetchJson(`${API_BASE_URL}/api/data`);
            expenses = data.expenses || [];
            BRANCHES = data.branches || [];
            CATEGORIES = data.categories || [];
            RECURRING_TEMPLATES = data.recurring || [];
        } catch (error) {
            console.error("Database connection error:", error);
            showToast("Error al conectar con la base de datos.", "danger");
        }
    }
}

function generateLocalRecurringExpenses() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentDay = today.getDate();
    
    const storedTemplates = localStorage.getItem("recurring_templates");
    if (storedTemplates) {
        RECURRING_TEMPLATES = JSON.parse(storedTemplates);
    } else {
        RECURRING_TEMPLATES = [
            { id: "default-condominio", description: "Pago de Condominio - Mensualidad", dayOfMonth: 5, amount: 120.0, branch: "Sede Norte", category: "Servicios" }
        ];
        localStorage.setItem("recurring_templates", JSON.stringify(RECURRING_TEMPLATES));
    }
    
    let updated = false;
    const monthPrefix = `${currentYear}-${currentMonth}`;
    
    RECURRING_TEMPLATES.forEach(template => {
        if (currentDay >= template.dayOfMonth) {
            const scheduledDayStr = String(template.dayOfMonth).padStart(2, '0');
            const scheduledDate = `${monthPrefix}-${scheduledDayStr}`;
            
            const existing = expenses.find(e => e.description === template.description && e.category === template.category && e.date.startsWith(monthPrefix));
            
            if (!existing) {
                const nextIdNumber = expenses.reduce((max, curr) => {
                    const parts = curr.id.split("-");
                    if (parts.length === 2) {
                        const num = parseInt(parts[1]);
                        if (!isNaN(num)) return num > max ? num : max;
                    }
                    return max;
                }, 100) + 1;
                const newId = `EXP-${nextIdNumber}`;
                
                const amountUsd = template.amount;
                const amountVes = amountUsd * ACTIVE_RATES.bcv;
                
                expenses.push({
                    id: newId,
                    date: scheduledDate,
                    branch: template.branch,
                    category: template.category,
                    description: template.description,
                    amount: amountUsd,
                    currency: "USD",
                    exchangeRate: 1.0,
                    amountUsd: amountUsd,
                    amountVes: amountVes,
                    status: "Pendiente"
                });
                updated = true;
                console.log(`Auto-generated local recurring expense: ${template.description}`);
            }
        }
    });
    
    if (updated) {
        saveExpensesToStorage();
    }
}

function saveExpensesToStorage() {
    if (isLocalFile) {
        localStorage.setItem("expenses_data", JSON.stringify(expenses));
    }
}

// Generate dynamic select options for filters and add forms
function populateDropdowns() {
    // 1. filter-branch dropdown
    const filterBranch = document.getElementById("filter-branch");
    const currentBranchFilterVal = filterBranch.value;
    filterBranch.innerHTML = '<option value="all">Todas las Sedes</option>' + 
        BRANCHES.map(b => `<option value="${b}">${b}</option>`).join("");
    
    if (BRANCHES.includes(currentBranchFilterVal)) {
        filterBranch.value = currentBranchFilterVal;
    } else {
        filterBranch.value = "all";
    }

    // 2. filter-category dropdown
    const filterCat = document.getElementById("filter-category");
    const currentCatFilterVal = filterCat.value;
    filterCat.innerHTML = '<option value="all">Todas las Categorías</option>' + 
        CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
    
    if (CATEGORIES.includes(currentCatFilterVal)) {
        filterCat.value = currentCatFilterVal;
    } else {
        filterCat.value = "all";
    }

    // 3. form-branch dropdown (Add Modal Form)
    const formBranch = document.getElementById("form-branch");
    formBranch.innerHTML = '<option value="" disabled selected>Seleccione una sede...</option>' + 
        BRANCHES.map(b => `<option value="${b}">${b}</option>`).join("");

    // 4. form-category dropdown (Add Modal Form)
    const formCat = document.getElementById("form-category");
    formCat.innerHTML = '<option value="" disabled selected>Seleccione una categoría...</option>' + 
        CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
}

function initHeaderDate() {
    const dateEl = document.getElementById("header-date");
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('es-ES', options);
    }
}

// ============================================================================
// THEME MANAGEMENT (LIGHT / DARK)
// ============================================================================

function initTheme() {
    const toggleBtn = document.getElementById("theme-toggle");
    const storedTheme = localStorage.getItem("theme") || 
                        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    
    document.documentElement.setAttribute("data-theme", storedTheme);
    
    toggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        
        // Dynamic Chart styling updates on theme change
        updateChartsThemeColors();
    });
}

// Helper to get colors depending on theme
function getThemeColors() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
        text: isDark ? "#9ca3af" : "#64748b",
        grid: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)",
        tooltipBg: isDark ? "#1f2937" : "#0f172a",
        tooltipText: isDark ? "#f9fafb" : "#ffffff",
        cardBorder: isDark ? "#374151" : "#e2e8f0"
    };
}

// ============================================================================
// NOTIFICATION TOASTS
// ============================================================================

function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconName = "check-circle-2";
    if (type === "warning") iconName = "alert-circle";
    if (type === "danger") iconName = "x-circle";
    if (type === "info") iconName = "info";
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="${iconName}"></i>
        </div>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// ============================================================================
// KPI CALCULATIONS
// ============================================================================

function updateKPIs(filteredData) {
    // 1. Total General
    const totalUsd = filteredData.reduce((acc, curr) => acc + curr.amountUsd, 0);
    const totalVes = filteredData.reduce((acc, curr) => acc + curr.amountVes, 0);
    document.getElementById("kpi-value-total").innerHTML = `
        <div>${formatCurrencyUsd(totalUsd)}</div>
        <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 4px; font-weight: 500;">${formatCurrencyVes(totalVes)}</div>
    `;
    
    // 2. Paid
    const paidExpenses = filteredData.filter(e => e.status === "Pagado");
    const paidUsd = paidExpenses.reduce((acc, curr) => acc + curr.amountUsd, 0);
    const paidVes = paidExpenses.reduce((acc, curr) => acc + curr.amountVes, 0);
    document.getElementById("kpi-value-paid").innerHTML = `
        <div>${formatCurrencyUsd(paidUsd)}</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; font-weight: 500;">${formatCurrencyVes(paidVes)}</div>
    `;
    document.getElementById("kpi-sub-paid").textContent = `${paidExpenses.length} transacciones liquidadas`;
    
    // 3. Pending
    const pendingExpenses = filteredData.filter(e => e.status === "Pendiente");
    const pendingUsd = pendingExpenses.reduce((acc, curr) => acc + curr.amountUsd, 0);
    const pendingVes = pendingExpenses.reduce((acc, curr) => acc + curr.amountVes, 0);
    document.getElementById("kpi-value-pending").innerHTML = `
        <div>${formatCurrencyUsd(pendingUsd)}</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; font-weight: 500;">${formatCurrencyVes(pendingVes)}</div>
    `;
    document.getElementById("kpi-sub-pending").textContent = `${pendingExpenses.length} transacciones por pagar`;
    
    // 4. Sede con Mayor Gasto
    const branchTotals = {};
    BRANCHES.forEach(b => branchTotals[b] = 0);
    filteredData.forEach(e => {
        if (branchTotals[e.branch] !== undefined) {
            branchTotals[e.branch] += e.amountUsd;
        }
    });
    
    let topBranch = "Ninguna";
    let maxAmount = 0;
    
    Object.keys(branchTotals).forEach(b => {
        if (branchTotals[b] > maxAmount) {
            maxAmount = branchTotals[b];
            topBranch = b;
        }
    });
    
    document.getElementById("kpi-value-branch").textContent = topBranch;
    document.getElementById("kpi-sub-branch").textContent = maxAmount > 0 
        ? `Consumo: ${formatCurrencyUsd(maxAmount)}`
        : "Sin registros cargados";
}

// ============================================================================
// CHART GENERATION & UPDATES
// ============================================================================

function initCharts() {
    const colors = getThemeColors();
    
    // Chart 1: Expenses by Branch (Doughnut)
    const ctxBranch = document.getElementById("branchChart").getContext("2d");
    branchChartInstance = new Chart(ctxBranch, {
        type: 'doughnut',
        data: {
            labels: BRANCHES,
            datasets: [{
                data: BRANCHES.map(() => 0),
                backgroundColor: BRANCHES.map((_, i) => BRANCH_COLORS[i % BRANCH_COLORS.length]),
                borderWidth: 2,
                borderColor: document.documentElement.getAttribute("data-theme") === "dark" ? "#1f2937" : "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: colors.text,
                        font: { family: 'Plus Jakarta Sans', size: 12, weight: '500' },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${formatCurrencyUsd(context.raw)}`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });

    // Chart 2: Expenses by Category (Bar Chart)
    const ctxCategory = document.getElementById("categoryChart").getContext("2d");
    categoryChartInstance = new Chart(ctxCategory, {
        type: 'bar',
        data: {
            labels: CATEGORIES,
            datasets: [{
                label: 'Gasto por Categoría',
                data: CATEGORIES.map(() => 0),
                backgroundColor: 'rgba(79, 70, 229, 0.85)',
                hoverBackgroundColor: 'rgba(67, 56, 202, 1)',
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    callbacks: {
                        label: function(context) {
                            return ` Total: ${formatCurrencyUsd(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        callback: function(value) { return '$' + value; }
                    },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: colors.text,
                        font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' }
                    }
                }
            }
        }
    });

    // Chart 3: Paid vs Pending (Pie Chart)
    const ctxStatus = document.getElementById("statusChart").getContext("2d");
    statusChartInstance = new Chart(ctxStatus, {
        type: 'pie',
        data: {
            labels: ['Pagado', 'Pendiente'],
            datasets: [{
                data: [0, 0],
                backgroundColor: [
                    '#10b981', // Success - Pagado
                    '#f59e0b'  // Warning - Pendiente
                ],
                borderWidth: 2,
                borderColor: document.documentElement.getAttribute("data-theme") === "dark" ? "#1f2937" : "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: colors.text,
                        font: { family: 'Plus Jakarta Sans', size: 12, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${formatCurrencyUsd(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function updateChartsData(filteredData) {
    if (!branchChartInstance || !categoryChartInstance || !statusChartInstance) return;
    
    // 1. Recalculate Branch totals in USD
    const branchTotals = BRANCHES.map(branch => {
        return filteredData
            .filter(e => e.branch === branch)
            .reduce((sum, curr) => sum + curr.amountUsd, 0);
    });
    
    branchChartInstance.data.datasets[0].data = branchTotals;
    branchChartInstance.update();

    // 2. Recalculate Category totals in USD
    const categoryTotals = CATEGORIES.map(cat => {
        return filteredData
            .filter(e => e.category === cat)
            .reduce((sum, curr) => sum + curr.amountUsd, 0);
    });
    
    categoryChartInstance.data.datasets[0].data = categoryTotals;
    categoryChartInstance.update();

    // 3. Recalculate Paid vs Pending in USD
    const paidSum = filteredData.filter(e => e.status === "Pagado").reduce((sum, curr) => sum + curr.amountUsd, 0);
    const pendingSum = filteredData.filter(e => e.status === "Pendiente").reduce((sum, curr) => sum + curr.amountUsd, 0);
    
    statusChartInstance.data.datasets[0].data = [paidSum, pendingSum];
    statusChartInstance.update();
}

function updateChartsStructure() {
    if (!branchChartInstance || !categoryChartInstance) return;
    
    // Update Branch labels and colors
    branchChartInstance.data.labels = BRANCHES;
    branchChartInstance.data.datasets[0].backgroundColor = BRANCHES.map((_, i) => BRANCH_COLORS[i % BRANCH_COLORS.length]);
    
    // Update Category labels
    categoryChartInstance.data.labels = CATEGORIES;
}

function updateChartsThemeColors() {
    if (!branchChartInstance || !categoryChartInstance || !statusChartInstance) return;
    
    const colors = getThemeColors();
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const borderColor = isDark ? "#1f2937" : "#ffffff";
    
    // Update Branch Chart
    branchChartInstance.options.plugins.legend.labels.color = colors.text;
    branchChartInstance.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
    branchChartInstance.options.plugins.tooltip.titleColor = colors.tooltipText;
    branchChartInstance.options.plugins.tooltip.bodyColor = colors.tooltipText;
    branchChartInstance.data.datasets[0].borderColor = borderColor;
    branchChartInstance.update();
    
    // Update Category Chart
    categoryChartInstance.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
    categoryChartInstance.options.plugins.tooltip.titleColor = colors.tooltipText;
    categoryChartInstance.options.plugins.tooltip.bodyColor = colors.tooltipText;
    categoryChartInstance.options.scales.y.grid.color = colors.grid;
    categoryChartInstance.options.scales.y.ticks.color = colors.text;
    categoryChartInstance.options.scales.x.ticks.color = colors.text;
    categoryChartInstance.update();
    
    // Update Status Chart
    statusChartInstance.options.plugins.legend.labels.color = colors.text;
    statusChartInstance.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
    statusChartInstance.options.plugins.tooltip.titleColor = colors.tooltipText;
    statusChartInstance.options.plugins.tooltip.bodyColor = colors.tooltipText;
    statusChartInstance.data.datasets[0].borderColor = borderColor;
    statusChartInstance.update();
}

// ============================================================================
// DATA FILTERING
// ============================================================================

function getFilteredData() {
    const searchVal = document.getElementById("filter-search").value.trim().toLowerCase();
    const branchVal = document.getElementById("filter-branch").value;
    const categoryVal = document.getElementById("filter-category").value;
    const dateStartVal = document.getElementById("filter-date-start").value;
    const dateEndVal = document.getElementById("filter-date-end").value;
    
    return expenses.filter(exp => {
        // Global Search (Matches Description or ID)
        if (searchVal) {
            const idMatch = exp.id.toLowerCase().includes(searchVal);
            const descMatch = exp.description.toLowerCase().includes(searchVal);
            if (!idMatch && !descMatch) return false;
        }
        
        // Branch Filter
        if (branchVal !== "all" && exp.branch !== branchVal) {
            return false;
        }
        
        // Category Filter
        if (categoryVal !== "all" && exp.category !== categoryVal) {
            return false;
        }
        
        // Date Start Filter
        if (dateStartVal && exp.date < dateStartVal) {
            return false;
        }
        
        // Date End Filter
        if (dateEndVal && exp.date > dateEndVal) {
            return false;
        }
        
        return true;
    });
}

// ============================================================================
// TABLE RENDERING & INLINE EDITING
// ============================================================================

function renderTable(filteredData) {
    const tbody = document.getElementById("table-body");
    const emptyState = document.getElementById("table-empty");
    const countBadge = document.getElementById("expenses-count");
    
    tbody.innerHTML = "";
    countBadge.textContent = `${filteredData.length} ${filteredData.length === 1 ? 'Gasto' : 'Gastos'}`;
    
    if (filteredData.length === 0) {
        emptyState.classList.remove("hidden");
        return;
    } else {
        emptyState.classList.add("hidden");
    }
    
    // Sort expenses in descending order
    const sortedData = [...filteredData].sort((a, b) => {
        if (b.date !== a.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return b.id.localeCompare(a.id);
    });
    
    sortedData.forEach(exp => {
        const tr = document.createElement("tr");
        tr.id = `row-${exp.id}`;
        
        if (editingId === exp.id) {
            tr.className = "editing-row";
            tr.innerHTML = getInlineEditingTemplate(exp);
        } else {
            let branchClass = "norte";
            if (exp.branch) {
                const branchNameLower = exp.branch.toLowerCase();
                if (branchNameLower.includes("norte")) branchClass = "norte";
                else if (branchNameLower.includes("sur")) branchClass = "sur";
                else if (branchNameLower.includes("este")) branchClass = "este";
                else if (branchNameLower.includes("oeste")) branchClass = "oeste";
                else {
                    const idx = BRANCHES.indexOf(exp.branch);
                    const classes = ["norte", "sur", "este", "oeste"];
                    branchClass = idx !== -1 ? classes[idx % classes.length] : "norte";
                }
            }
            const statusClass = exp.status.toLowerCase();
            
            tr.innerHTML = `
                <td style="font-weight: 700;">${exp.id}</td>
                <td>${formatDate(exp.date)}</td>
                <td>
                    <span class="branch-pill ${branchClass}">
                        ${exp.branch}
                    </span>
                </td>
                <td><span style="font-weight: 500;">${exp.category}</span></td>
                <td>${exp.description}</td>
                <td class="text-right" style="font-weight: 700; font-size: 0.95rem;">
                    ${formatCurrencyUsd(exp.amountUsd)}
                </td>
                <td class="text-right" style="font-weight: 700; font-size: 0.95rem; color: #10b981;">
                    ${formatCurrencyVes(exp.amountVes)}
                </td>
                <td>
                    <span class="status-pill ${statusClass}">
                        <i data-lucide="${exp.status === 'Pagado' ? 'check' : 'clock-3'}" style="width:12px; height:12px;"></i>
                        ${exp.status}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon edit" onclick="startInlineEdit('${exp.id}')" title="Editar registro">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button class="btn-icon delete" onclick="deleteExpense('${exp.id}')" title="Eliminar registro">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;
        }
        
        if (editingId !== exp.id) {
            tr.addEventListener("dblclick", () => {
                startInlineEdit(exp.id);
            });
        }
        
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

function getInlineEditingTemplate(exp) {
    const branchOptions = BRANCHES.map(b => 
        `<option value="${b}" ${exp.branch === b ? 'selected' : ''}>${b}</option>`
    ).join("");
    
    const categoryOptions = CATEGORIES.map(c => 
        `<option value="${c}" ${exp.category === c ? 'selected' : ''}>${c}</option>`
    ).join("");

    return `
        <td style="font-weight: 700; vertical-align: middle;">${exp.id}</td>
        <td>
            <input type="date" class="table-edit-input" id="edit-date-${exp.id}" value="${exp.date}" required>
        </td>
        <td>
            <select class="table-edit-input" id="edit-branch-${exp.id}" required>
                ${branchOptions}
            </select>
        </td>
        <td>
            <select class="table-edit-input" id="edit-category-${exp.id}" required>
                ${categoryOptions}
            </select>
        </td>
        <td>
            <input type="text" class="table-edit-input" id="edit-desc-${exp.id}" value="${exp.description}" required>
        </td>
        <td>
            <input type="number" class="table-edit-input text-right" id="edit-amount-usd-${exp.id}" value="${exp.amountUsd.toFixed(2)}" min="0.01" step="0.01" style="font-weight: 700; width: 90px;" oninput="updateInlineEditRates('${exp.id}', 'usd')" required>
        </td>
        <td>
            <input type="number" class="table-edit-input text-right" id="edit-amount-ves-${exp.id}" value="${exp.amountVes.toFixed(2)}" min="0.01" step="0.01" style="font-weight: 700; width: 120px;" oninput="updateInlineEditRates('${exp.id}', 'ves')" required>
        </td>
        <td>
            <select class="table-edit-input" id="edit-status-${exp.id}" required>
                <option value="Pagado" ${exp.status === 'Pagado' ? 'selected' : ''}>Pagado</option>
                <option value="Pendiente" ${exp.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
            </select>
        </td>
        <td>
            <div class="table-actions">
                <button class="btn-icon save" onclick="saveInlineEdit('${exp.id}')" title="Guardar cambios">
                    <i data-lucide="check"></i>
                </button>
                <button class="btn-icon" onclick="cancelInlineEdit()" title="Cancelar">
                    <i data-lucide="x"></i>
                </button>
            </div>
        </td>
    `;
}

window.updateInlineEditRates = function(id, type) {
    const usdInput = document.getElementById(`edit-amount-usd-${id}`);
    const vesInput = document.getElementById(`edit-amount-ves-${id}`);
    if (!usdInput || !vesInput) return;
    
    if (type === 'usd') {
        const usdVal = parseFloat(usdInput.value) || 0;
        if (usdVal > 0) {
            vesInput.value = (usdVal * ACTIVE_RATES.bcv).toFixed(2);
        } else {
            vesInput.value = "";
        }
    } else {
        const vesVal = parseFloat(vesInput.value) || 0;
        if (vesVal > 0) {
            usdInput.value = (vesVal / ACTIVE_RATES.bcv).toFixed(2);
        } else {
            usdInput.value = "";
        }
    }
};

function formatDate(dateStr) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function renderDashboard() {
    const filtered = getFilteredData();
    updateKPIs(filtered);
    updateChartsData(filtered);
    renderTable(filtered);
    renderNotifications();
}

function renderNotifications() {
    const listEl = document.getElementById("notifications-list");
    const countEl = document.getElementById("notification-count");
    if (!listEl || !countEl) return;

    // Filter all pending expenses
    const pending = expenses.filter(e => e.status === "Pendiente");

    listEl.innerHTML = "";
    
    if (pending.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 24px 8px; color: var(--text-muted); font-size: 0.8rem;">
                <i data-lucide="check-circle-2" style="width: 24px; height: 24px; margin-bottom: 8px; color: var(--success); opacity: 0.7;"></i>
                <p>Al día. No hay pagos pendientes.</p>
            </div>
        `;
        countEl.textContent = "0";
        countEl.classList.add("hidden");
        lucide.createIcons();
        return;
    }

    countEl.textContent = pending.length;
    countEl.classList.remove("hidden");

    pending.forEach(item => {
        const div = document.createElement("div");
        div.className = "notification-item";
        div.style.cssText = "padding: 10px; border-radius: 8px; background-color: var(--bg-primary); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 6px; position: relative;";
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); line-height: 1.2;">${item.description}</span>
                <span style="font-size: 0.7rem; font-weight: 700; color: var(--warning); background-color: var(--warning-bg); padding: 2px 6px; border-radius: 20px;">Pendiente</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary);">
                <span>${formatDate(item.date)}</span>
                <strong style="color: var(--primary);">${formatCurrencyUsd(item.amountUsd)}</strong>
            </div>
            <button onclick="quickPayExpense('${item.id}')" style="background-color: var(--primary); color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.7rem; font-weight: 600; cursor: pointer; align-self: flex-end; display: flex; align-items: center; gap: 4px; transition: background-color 0.2s; margin-top: 4px;">
                <i data-lucide="check" style="width: 12px; height: 12px;"></i>
                <span>Pagar</span>
            </button>
        `;
        listEl.appendChild(div);
    });

    lucide.createIcons();
}

window.quickPayExpense = async function(id) {
    if (isLocalFile) {
        const index = expenses.findIndex(e => e.id === id);
        if (index !== -1) {
            expenses[index].status = "Pagado";
            saveExpensesToStorage();
            renderDashboard();
            showToast(`Pago de ${id} registrado en LocalStorage.`, "success");
        }
    } else {
        try {
            const exp = expenses.find(e => e.id === id);
            if (!exp) return;

            const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: exp.date,
                    branch: exp.branch,
                    category: exp.category,
                    description: exp.description,
                    amount: exp.amount,
                    currency: exp.currency,
                    status: "Pagado"
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "No se pudo registrar el pago.");
            }

            const updated = await response.json();
            const index = expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                expenses[index] = updated;
            }

            renderDashboard();
            showToast(`Pago de ${id} registrado con éxito.`, "success");
        } catch (error) {
            showToast(`Error al pagar: ${error.message}`, "danger");
        }
    }
};

// ============================================================================
// DATA MUTATION HANDLERS (DUAL SYNC)
// ============================================================================

window.startInlineEdit = function(id) {
    editingId = id;
    renderDashboard();
};

window.cancelInlineEdit = function() {
    editingId = null;
    renderDashboard();
};

window.saveInlineEdit = async function(id) {
    const dateInput = document.getElementById(`edit-date-${id}`);
    const branchInput = document.getElementById(`edit-branch-${id}`);
    const categoryInput = document.getElementById(`edit-category-${id}`);
    const descInput = document.getElementById(`edit-desc-${id}`);
    const amountUsdInput = document.getElementById(`edit-amount-usd-${id}`);
    const amountVesInput = document.getElementById(`edit-amount-ves-${id}`);
    const statusInput = document.getElementById(`edit-status-${id}`);
    
    const dateVal = dateInput.value;
    const branchVal = branchInput.value;
    const categoryVal = categoryInput.value;
    const descVal = descInput.value.trim();
    const amountUsdVal = parseFloat(amountUsdInput.value);
    const amountVesVal = parseFloat(amountVesInput.value);
    const statusVal = statusInput.value;
    
    if (!dateVal || !branchVal || !categoryVal || !descVal || isNaN(amountUsdVal) || amountUsdVal <= 0 || isNaN(amountVesVal) || amountVesVal <= 0) {
        showToast("Error: Complete todos los campos con valores válidos.", "danger");
        return;
    }
    
    if (isLocalFile) {
        const index = expenses.findIndex(e => e.id === id);
        if (index !== -1) {
            expenses[index] = {
                id,
                date: dateVal,
                branch: branchVal,
                category: categoryVal,
                description: descVal,
                amount: amountUsdVal,
                currency: "USD",
                exchangeRate: 1.0,
                amountUsd: amountUsdVal,
                amountVes: amountVesVal,
                status: statusVal
            };
            saveExpensesToStorage();
            editingId = null;
            renderDashboard();
            showToast(`Registro ${id} actualizado en LocalStorage.`, "success");
        }
    } else {
        try {
            const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: dateVal,
                    branch: branchVal,
                    category: categoryVal,
                    description: descVal,
                    amount: amountUsdVal,
                    currency: "USD",
                    status: statusVal
                })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "No se pudo guardar la modificación.");
            }
            
            const updated = await response.json();
            const index = expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                expenses[index] = updated;
            }
            
            editingId = null;
            renderDashboard();
            showToast(`Registro ${id} actualizado correctamente.`, "success");
        } catch (error) {
            showToast(`Error: ${error.message}`, "danger");
        }
    }
};

window.deleteExpense = async function(id) {
    if (confirm(`¿Está seguro de que desea eliminar el registro de gasto ${id}?`)) {
        if (isLocalFile) {
            expenses = expenses.filter(e => e.id !== id);
            saveExpensesToStorage();
            if (editingId === id) editingId = null;
            renderDashboard();
            showToast(`Registro ${id} eliminado de LocalStorage.`, "info");
        } else {
            try {
                const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "No se pudo eliminar.");
                }
                
                expenses = expenses.filter(e => e.id !== id);
                if (editingId === id) editingId = null;
                renderDashboard();
                showToast(`Registro ${id} eliminado con éxito.`, "info");
            } catch (error) {
                showToast(`Error: ${error.message}`, "danger");
            }
        }
    }
};

// ============================================================================
// EVENT LISTENERS & MODAL MANAGEMENT
// ============================================================================

function setupEventListeners() {
    // 1. Filtering Inputs
    document.getElementById("filter-search").addEventListener("input", renderDashboard);
    document.getElementById("filter-branch").addEventListener("change", renderDashboard);
    document.getElementById("filter-category").addEventListener("change", renderDashboard);
    document.getElementById("filter-date-start").addEventListener("change", renderDashboard);
    document.getElementById("filter-date-end").addEventListener("change", renderDashboard);
    
    // 2. Clear Filters Button
    document.getElementById("btn-clear-filters").addEventListener("click", () => {
        document.getElementById("filter-search").value = "";
        document.getElementById("filter-branch").value = "all";
        document.getElementById("filter-category").value = "all";
        document.getElementById("filter-date-start").value = "";
        document.getElementById("filter-date-end").value = "";
        renderDashboard();
        showToast("Filtros restablecidos", "info");
    });
    
    // 3. Modal Add-Form Controls
    const modalOverlay = document.getElementById("modal-overlay");
    const openModalBtn = document.getElementById("btn-open-modal");
    const closeModalBtn = document.getElementById("btn-close-modal");
    const cancelModalBtn = document.getElementById("btn-cancel-modal");
    const expenseForm = document.getElementById("expense-form");
    
    const openModal = () => {
        document.getElementById("form-date").value = new Date().toISOString().substring(0, 10);
        document.getElementById("form-amount-usd").value = "";
        document.getElementById("form-amount-ves").value = "";
        
        const formGroups = expenseForm.querySelectorAll(".form-group");
        formGroups.forEach(g => g.classList.remove("invalid"));
        modalOverlay.classList.remove("hidden");
    };
    
    const closeModal = () => {
        expenseForm.reset();
        modalOverlay.classList.add("hidden");
    };
    
    openModalBtn.addEventListener("click", openModal);
    closeModalBtn.addEventListener("click", closeModal);
    cancelModalBtn.addEventListener("click", closeModal);
    
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    const amountUsdInput = document.getElementById("form-amount-usd");
    const amountVesInput = document.getElementById("form-amount-ves");
    
    if (amountUsdInput) {
        amountUsdInput.addEventListener("input", (e) => {
            const usdVal = parseFloat(e.target.value) || 0;
            if (usdVal > 0) {
                amountVesInput.value = (usdVal * ACTIVE_RATES.bcv).toFixed(2);
            } else {
                amountVesInput.value = "";
            }
        });
    }
    
    if (amountVesInput) {
        amountVesInput.addEventListener("input", (e) => {
            const vesVal = parseFloat(e.target.value) || 0;
            if (vesVal > 0) {
                amountUsdInput.value = (vesVal / ACTIVE_RATES.bcv).toFixed(2);
            } else {
                amountUsdInput.value = "";
            }
        });
    }
    
    // 4. Modal Form Submit handler (Dual-Mode)
    expenseForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const dateInput = document.getElementById("form-date");
        const branchInput = document.getElementById("form-branch");
        const categoryInput = document.getElementById("form-category");
        const descInput = document.getElementById("form-description");
        const amountUsdInput = document.getElementById("form-amount-usd");
        const amountVesInput = document.getElementById("form-amount-ves");
        const statusInputs = document.getElementsByName("form-status");
        
        let statusVal = "Pagado";
        for (const radio of statusInputs) {
            if (radio.checked) {
                statusVal = radio.value;
                break;
            }
        }
        
        let isValid = true;
        
        if (!dateInput.value) { invalidateField(dateInput); isValid = false; } else { validateField(dateInput); }
        if (!branchInput.value) { invalidateField(branchInput); isValid = false; } else { validateField(branchInput); }
        if (!categoryInput.value) { invalidateField(categoryInput); isValid = false; } else { validateField(categoryInput); }
        if (!descInput.value.trim()) { invalidateField(descInput); isValid = false; } else { validateField(descInput); }
        
        const amountUsdVal = parseFloat(amountUsdInput.value);
        if (isNaN(amountUsdVal) || amountUsdVal <= 0) { invalidateField(amountUsdInput); isValid = false; } else { validateField(amountUsdInput); }
        
        const amountVesVal = parseFloat(amountVesInput.value);
        if (isNaN(amountVesVal) || amountVesVal <= 0) { invalidateField(amountVesInput); isValid = false; } else { validateField(amountVesInput); }
        
        if (!isValid) return;
        
        if (isLocalFile) {
            const nextIdNumber = expenses.reduce((max, curr) => {
                const num = parseInt(curr.id.split("-")[1]);
                return num > max ? num : max;
            }, 100) + 1;
            const newId = `EXP-${nextIdNumber}`;
            
            const newExpense = {
                id: newId,
                date: dateInput.value,
                branch: branchInput.value,
                category: categoryInput.value,
                description: descInput.value.trim(),
                amount: amountUsdVal,
                currency: "USD",
                exchangeRate: 1.0,
                amountUsd: amountUsdVal,
                amountVes: amountVesVal,
                status: statusVal
            };
            
            expenses.push(newExpense);
            saveExpensesToStorage();
            
            renderDashboard();
            closeModal();
            showToast(`Gasto ${newId} registrado con éxito en LocalStorage.`, "success");
        } else {
            try {
                const response = await fetch(`${API_BASE_URL}/api/expenses`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        date: dateInput.value,
                        branch: branchInput.value,
                        category: categoryInput.value,
                        description: descInput.value.trim(),
                        amount: amountUsdVal,
                        currency: "USD",
                        status: statusVal
                    })
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "No se pudo guardar el gasto.");
                }
                
                const addedExpense = await response.json();
                expenses.push(addedExpense);
                
                renderDashboard();
                closeModal();
                showToast(`Gasto ${addedExpense.id} registrado con éxito.`, "success");
            } catch (error) {
                showToast(`Error: ${error.message}`, "danger");
            }
        }
    });

    // 5. Print Report Button Click handler
    document.getElementById("btn-print-report").addEventListener("click", () => {
        const printDateEl = document.getElementById("print-date");
        const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        printDateEl.textContent = new Date().toLocaleString('es-ES', options);
        
        const searchVal = document.getElementById("filter-search").value.trim();
        const branchVal = document.getElementById("filter-branch").value;
        const categoryVal = document.getElementById("filter-category").value;
        const dateStartVal = document.getElementById("filter-date-start").value;
        const dateEndVal = document.getElementById("filter-date-end").value;
        
        let filtersText = [];
        if (searchVal) filtersText.push(`Buscador: "${searchVal}"`);
        if (branchVal !== "all") filtersText.push(`Sede: ${branchVal}`);
        if (categoryVal !== "all") filtersText.push(`Categoría: ${categoryVal}`);
        if (dateStartVal) filtersText.push(`Desde: ${formatDate(dateStartVal)}`);
        if (dateEndVal) filtersText.push(`Hasta: ${formatDate(dateEndVal)}`);
        
        document.getElementById("print-filters-applied").textContent = filtersText.length > 0 
            ? filtersText.join(" | ")
            : "Ninguno (Mostrando reporte completo de egresos)";
        
        window.print();
    });

    // 6. Notifications Toggle Handler
    const btnNotifications = document.getElementById("btn-notifications");
    const notificationsDropdown = document.getElementById("notifications-dropdown");
    
    if (btnNotifications && notificationsDropdown) {
        btnNotifications.addEventListener("click", (e) => {
            e.stopPropagation();
            notificationsDropdown.classList.toggle("hidden");
        });
        
        document.addEventListener("click", (e) => {
            if (!notificationsDropdown.contains(e.target) && e.target !== btnNotifications) {
                notificationsDropdown.classList.add("hidden");
            }
        });
        
        const btnClearBadge = document.getElementById("btn-clear-notifications-badge");
        if (btnClearBadge) {
            btnClearBadge.addEventListener("click", (e) => {
                e.stopPropagation();
                notificationsDropdown.classList.add("hidden");
                showToast("Para borrar las notificaciones, marque cada pago como 'Pagar'.", "info");
            });
        }
    }
}

function invalidateField(inputEl) {
    const parent = inputEl.closest(".form-group");
    if (parent) parent.classList.add("invalid");
}

// Renaming Sede
window.saveSettingsBranch = async function(index) {
    const input = document.getElementById(`edit-branch-input-${index}`);
    const newName = input.value.trim();
    const oldName = BRANCHES[index];
    
    if (!newName) return;
    if (newName === oldName) {
        cancelSettingsEdit();
        return;
    }
    
    if (isLocalFile) {
        if (BRANCHES.includes(newName)) {
            showToast("Error: Ya existe una sede con ese nombre.", "danger");
            return;
        }
        expenses.forEach(exp => {
            if (exp.branch === oldName) exp.branch = newName;
        });
        BRANCHES[index] = newName;
        
        localStorage.setItem("branches_data", JSON.stringify(BRANCHES));
        saveExpensesToStorage();
        
        editingSettingId = null;
        populateDropdowns();
        updateChartsStructure();
        renderDashboard();
        renderSettingsLists();
        
        showToast(`Sede renombrada a "${newName}" en LocalStorage.`, "success");
    } else {
        try {
            const response = await fetch(`${API_BASE_URL}/api/settings/branches`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldName, newName })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "No se pudo renombrar la sede.");
            }
            
            const result = await response.json();
            BRANCHES = result.branches;
            expenses = result.expenses;
            
            editingSettingId = null;
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            
            showToast(`Sede renombrada de "${oldName}" a "${newName}" con éxito.`, "success");
        } catch (error) {
            showToast(`Error: ${error.message}`, "danger");
        }
    }
};

// Renaming Categoría
window.saveSettingsCategory = async function(index) {
    const input = document.getElementById(`edit-category-input-${index}`);
    const newName = input.value.trim();
    const oldName = CATEGORIES[index];
    
    if (!newName) return;
    if (newName === oldName) {
        cancelSettingsEdit();
        return;
    }
    
    if (isLocalFile) {
        if (CATEGORIES.includes(newName)) {
            showToast("Error: Ya existe una categoría con ese nombre.", "danger");
            return;
        }
        expenses.forEach(exp => {
            if (exp.category === oldName) exp.category = newName;
        });
        CATEGORIES[index] = newName;
        
        localStorage.setItem("categories_data", JSON.stringify(CATEGORIES));
        saveExpensesToStorage();
        
        editingSettingId = null;
        populateDropdowns();
        updateChartsStructure();
        renderDashboard();
        renderSettingsLists();
        
        showToast(`Categoría renombrada a "${newName}" en LocalStorage.`, "success");
    } else {
        try {
            const response = await fetch(`${API_BASE_URL}/api/settings/categories`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldName, newName })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "No se pudo renombrar la categoría.");
            }
            
            const result = await response.json();
            CATEGORIES = result.categories;
            expenses = result.expenses;
            
            editingSettingId = null;
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            
            showToast(`Categoría renombrada de "${oldName}" a "${newName}" con éxito.`, "success");
        } catch (error) {
            showToast(`Error: ${error.message}`, "danger");
        }
    }
};

// Deleting Sede
window.deleteSettingsBranch = async function(index) {
    const branchName = BRANCHES[index];
    
    if (isLocalFile) {
        const associatedCount = expenses.filter(exp => exp.branch === branchName).length;
        if (associatedCount > 0) {
            showToast(`No se puede eliminar "${branchName}" porque tiene ${associatedCount} transacciones asociadas.`, "warning");
            return;
        }
        
        if (confirm(`¿Está seguro de que desea eliminar la sede "${branchName}"?`)) {
            BRANCHES.splice(index, 1);
            localStorage.setItem("branches_data", JSON.stringify(BRANCHES));
            
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            
            showToast(`Sede "${branchName}" eliminada de LocalStorage.`, "info");
        }
    } else {
        try {
            const response = await fetch(`${API_BASE_URL}/api/settings/branches/${encodeURIComponent(branchName)}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "No se pudo eliminar la sede.");
            }
            
            BRANCHES = await response.json();
            
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            
            showToast(`Sede "${branchName}" eliminada correctamente.`, "info");
        } catch (error) {
            showToast(`Error: ${error.message}`, "warning");
        }
    }
};

// Deleting Categoría
window.deleteSettingsCategory = async function(index) {
    const catName = CATEGORIES[index];
    
    if (isLocalFile) {
        const associatedCount = expenses.filter(exp => exp.category === catName).length;
        if (associatedCount > 0) {
            showToast(`No se puede eliminar la categoría "${catName}" porque tiene ${associatedCount} transacciones asociadas.`, "warning");
            return;
        }
        
        if (confirm(`¿Está seguro de que desea eliminar la categoría "${catName}"?`)) {
            CATEGORIES.splice(index, 1);
            localStorage.setItem("categories_data", JSON.stringify(CATEGORIES));
            
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            
            showToast(`Categoría "${catName}" eliminada de LocalStorage.`, "info");
        }
    } else {
        try {
            const response = await fetch(`${API_BASE_URL}/api/settings/categories/${encodeURIComponent(catName)}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "No se pudo eliminar la categoría.");
            }
            
            CATEGORIES = await response.json();
            
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            
            showToast(`Categoría "${catName}" eliminada correctamente.`, "info");
        } catch (error) {
            showToast(`Error: ${error.message}`, "warning");
        }
    }
};

function validateField(inputEl) {
    const parent = inputEl.closest(".form-group");
    if (parent) parent.classList.remove("invalid");
}

// ============================================================================
// SYSTEM PARAMETERS SETTINGS MODAL & LISTS
// ============================================================================

function initSettingsModal() {
    const settingsOverlay = document.getElementById("modal-settings-overlay");
    const navSettingsBtn = document.getElementById("nav-settings");
    const closeSettingsBtn = document.getElementById("btn-close-settings");
    const closeSettingsFooter = document.getElementById("btn-close-settings-footer");
    
    const openSettings = () => {
        editingSettingId = null;
        
        // Populate profile inputs
        if (CURRENT_USER) {
            const pUser = document.getElementById("profile-username");
            const pPass = document.getElementById("profile-password");
            if (pUser) pUser.value = CURRENT_USER.username;
            if (pPass) pPass.value = "";
        }
        
        const recBranchSelect = document.getElementById("new-rec-branch");
        const recCatSelect = document.getElementById("new-rec-category");
        if (recBranchSelect && recCatSelect) {
            recBranchSelect.innerHTML = '<option value="" disabled selected>Sede...</option>' + 
                BRANCHES.map(b => `<option value="${b}">${b}</option>`).join("");
            recCatSelect.innerHTML = '<option value="" disabled selected>Categoría...</option>' + 
                CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
        }

        renderSettingsLists();
        switchSettingsTab('branches');
        settingsOverlay.classList.remove("hidden");
    };
    
    const closeSettings = () => {
        settingsOverlay.classList.add("hidden");
    };
    
    navSettingsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openSettings();
    });
    
    closeSettingsBtn.addEventListener("click", closeSettings);
    closeSettingsFooter.addEventListener("click", closeSettings);
    
    settingsOverlay.addEventListener("click", (e) => {
        if (e.target === settingsOverlay) {
            closeSettings();
        }
    });
    
    document.getElementById("tab-branches").addEventListener("click", () => switchSettingsTab('branches'));
    document.getElementById("tab-categories").addEventListener("click", () => switchSettingsTab('categories'));
    
    const tabUsers = document.getElementById("tab-users");
    if (tabUsers) {
        tabUsers.addEventListener("click", () => switchSettingsTab('users'));
    }
    
    const addBranchForm = document.getElementById("add-branch-form");
    const addCategoryForm = document.getElementById("add-category-form");
    
    // Add Branch
    addBranchForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("new-branch-name");
        const name = input.value.trim();
        
        if (!name) return;
        
        if (isLocalFile) {
            if (BRANCHES.includes(name)) {
                showToast("Error: La sede ya está registrada.", "danger");
                return;
            }
            BRANCHES.push(name);
            localStorage.setItem("branches_data", JSON.stringify(BRANCHES));
            input.value = "";
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            showToast(`Sede "${name}" agregada correctamente en LocalStorage.`, "success");
        } else {
            try {
                const response = await fetch(`${API_BASE_URL}/api/settings/branches`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "No se pudo agregar la sede.");
                }
                
                BRANCHES = await response.json();
                input.value = "";
                populateDropdowns();
                updateChartsStructure();
                renderDashboard();
                renderSettingsLists();
                showToast(`Sede "${name}" agregada correctamente.`, "success");
            } catch (error) {
                showToast(`Error: ${error.message}`, "danger");
            }
        }
    });
    
    // Add Category
    addCategoryForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("new-category-name");
        const name = input.value.trim();
        
        if (!name) return;
        
        if (isLocalFile) {
            if (CATEGORIES.includes(name)) {
                showToast("Error: La categoría ya está registrada.", "danger");
                return;
            }
            CATEGORIES.push(name);
            localStorage.setItem("categories_data", JSON.stringify(CATEGORIES));
            input.value = "";
            populateDropdowns();
            updateChartsStructure();
            renderDashboard();
            renderSettingsLists();
            showToast(`Categoría "${name}" agregada en LocalStorage.`, "success");
        } else {
            try {
                const response = await fetch(`${API_BASE_URL}/api/settings/categories`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "No se pudo agregar la categoría.");
                }
                
                CATEGORIES = await response.json();
                input.value = "";
                populateDropdowns();
                updateChartsStructure();
                renderDashboard();
                renderSettingsLists();
                showToast(`Categoría "${name}" agregada correctamente.`, "success");
            } catch (error) {
                showToast(`Error: ${error.message}`, "danger");
            }
        }
    });

    // ==========================================
    // RECURRING PAYMENTS CONFIGURATION EVENT HANDLERS
    // ==========================================
    document.getElementById("tab-recurring").addEventListener("click", () => switchSettingsTab('recurring'));

    const addRecurringForm = document.getElementById("add-recurring-form");
    
    // Add recurring template
    addRecurringForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const descInput = document.getElementById("new-rec-desc");
        const dayInput = document.getElementById("new-rec-day");
        const amountInput = document.getElementById("new-rec-amount");
        const branchInput = document.getElementById("new-rec-branch");
        const catInput = document.getElementById("new-rec-category");
        
        const description = descInput.value.trim();
        const dayOfMonth = parseInt(dayInput.value);
        const amount = parseFloat(amountInput.value);
        const branch = branchInput.value;
        const category = catInput.value;

        if (!description || !dayOfMonth || isNaN(amount) || amount <= 0 || !branch || !category) {
            showToast("Datos de mensualidad inválidos.", "danger");
            return;
        }

        if (isLocalFile) {
            const newTemplate = {
                id: 'rec-' + Date.now(),
                description,
                dayOfMonth,
                amount,
                branch,
                category
            };
            RECURRING_TEMPLATES.push(newTemplate);
            localStorage.setItem("recurring_templates", JSON.stringify(RECURRING_TEMPLATES));
            
            // Clean inputs
            descInput.value = "";
            dayInput.value = "";
            amountInput.value = "";
            branchInput.selectedIndex = 0;
            catInput.selectedIndex = 0;

            // Generate immediately
            generateLocalRecurringExpenses();
            
            renderDashboard();
            renderSettingsLists();
            showToast(`Mensualidad "${description}" programada localmente.`, "success");
        } else {
            try {
                const response = await fetch(`${API_BASE_URL}/api/settings/recurring`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ description, dayOfMonth, amount, branch, category })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "No se pudo registrar la mensualidad.");
                }

                RECURRING_TEMPLATES = await response.json();
                
                // Clean inputs
                descInput.value = "";
                dayInput.value = "";
                amountInput.value = "";
                branchInput.selectedIndex = 0;
                catInput.selectedIndex = 0;

                // Reload expenses data to get newly auto-generated transactions
                await loadExpenses();
                
                renderDashboard();
                renderSettingsLists();
                showToast(`Mensualidad "${description}" programada con éxito.`, "success");
            } catch (error) {
                showToast(`Error: ${error.message}`, "danger");
            }
        }
    });

    window.deleteRecurringTemplate = async function(id) {
        if (confirm("¿Está seguro de que desea eliminar esta mensualidad programada?")) {
            if (isLocalFile) {
                RECURRING_TEMPLATES = RECURRING_TEMPLATES.filter(t => t.id !== id);
                localStorage.setItem("recurring_templates", JSON.stringify(RECURRING_TEMPLATES));
                renderSettingsLists();
                showToast("Mensualidad eliminada localmente.", "info");
            } else {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/settings/recurring/${id}`, {
                        method: 'DELETE'
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || "No se pudo eliminar la mensualidad.");
                    }

                    RECURRING_TEMPLATES = await response.json();
                    renderSettingsLists();
                    showToast("Mensualidad eliminada correctamente.", "info");
                } catch (error) {
                    showToast(`Error: ${error.message}`, "danger");
                }
            }
        }
    };

    // ==========================================
    // BACKUP & RESTORE EVENT HANDLERS
    // ==========================================
    document.getElementById("tab-backup").addEventListener("click", () => switchSettingsTab('backup'));

    const btnExportBackup = document.getElementById("btn-export-backup");
    const btnTriggerImport = document.getElementById("btn-trigger-import");
    const importBackupFile = document.getElementById("import-backup-file");

    // Export Backup
    btnExportBackup.addEventListener("click", async () => {
        try {
            let backupData;
            if (isLocalFile) {
                // LocalStorage Mode
                backupData = {
                    version: "1.2",
                    exportedAt: new Date().toISOString(),
                    expenses: expenses,
                    branches: BRANCHES,
                    categories: CATEGORIES,
                    rates: ACTIVE_RATES,
                    recurring: RECURRING_TEMPLATES
                };
            } else {
                // Server Mode
                backupData = await safeFetchJson(`${API_BASE_URL}/api/backup`);
            }

            // Trigger Browser Download
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const downloadAnchor = document.createElement('a');
            const todayStr = new Date().toISOString().split('T')[0];
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `respaldo_gastos_${todayStr}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();

            showToast("Copia de seguridad exportada con éxito.", "success");
        } catch (error) {
            showToast(`Error al exportar respaldo: ${error.message}`, "danger");
        }
    });

    // Trigger file picker
    btnTriggerImport.addEventListener("click", () => {
        importBackupFile.click();
    });

    // Handle file selection and import
    importBackupFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const backup = JSON.parse(event.target.result);

                // Validation
                if (!backup.expenses || !Array.isArray(backup.expenses) ||
                    !backup.branches || !Array.isArray(backup.branches) ||
                    !backup.categories || !Array.isArray(backup.categories)) {
                    throw new Error("El archivo no tiene el formato de respaldo válido.");
                }

                const confirmRestore = confirm("¿Está seguro de que desea restaurar los datos? Esta acción eliminará permanentemente todos los gastos, sedes y categorías registrados actualmente en el sistema.");
                if (!confirmRestore) {
                    importBackupFile.value = ""; // Reset input
                    return;
                }

                if (isLocalFile) {
                    // LocalStorage Mode
                    expenses = backup.expenses;
                    BRANCHES = backup.branches;
                    CATEGORIES = backup.categories;
                    if (backup.rates) {
                        ACTIVE_RATES = backup.rates;
                        localStorage.setItem("exchange_rates", JSON.stringify(ACTIVE_RATES));
                    }
                    if (backup.recurring) {
                        RECURRING_TEMPLATES = backup.recurring;
                        localStorage.setItem("recurring_templates", JSON.stringify(RECURRING_TEMPLATES));
                    }

                    localStorage.setItem("expenses_data", JSON.stringify(expenses));
                    localStorage.setItem("branches_data", JSON.stringify(BRANCHES));
                    localStorage.setItem("categories_data", JSON.stringify(CATEGORIES));

                    // Refresh rates on DOM
                    loadRates();
                    
                    // Refresh UI
                    populateDropdowns();
                    updateChartsStructure();
                    renderDashboard();
                    renderSettingsLists();
                    closeSettings();

                    showToast("Datos restaurados correctamente en LocalStorage.", "success");
                } else {
                    // Server Mode
                    const response = await fetch(`${API_BASE_URL}/api/backup/restore`, {
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(backup)
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || "No se pudo restaurar el respaldo en el servidor.");
                    }

                    const result = await response.json();
                    expenses = result.expenses;
                    BRANCHES = result.branches;
                    CATEGORIES = result.categories;
                    if (result.rates) {
                        ACTIVE_RATES = result.rates;
                    }
                    if (result.recurring) {
                        RECURRING_TEMPLATES = result.recurring;
                    }

                    // Refresh rates on DOM
                    await loadRates();

                    // Refresh UI
                    populateDropdowns();
                    updateChartsStructure();
                    renderDashboard();
                    renderSettingsLists();
                    closeSettings();

                    showToast("Datos restaurados correctamente en el servidor.", "success");
                }
            } catch (err) {
                showToast(`Error al restaurar: ${err.message}`, "danger");
            } finally {
                importBackupFile.value = ""; // Reset input
            }
        };
        reader.readAsText(file);
    });

    // Edit Profile form
    const editProfileForm = document.getElementById("edit-profile-form");
    if (editProfileForm) {
        editProfileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById("profile-username").value.trim().toLowerCase();
            const passwordInput = document.getElementById("profile-password").value;
            
            if (!usernameInput) {
                showToast("El usuario es obligatorio.", "warning");
                return;
            }
            
            if (isLocalFile) {
                let localUsers = JSON.parse(localStorage.getItem("users_data") || "[]");
                
                // Check if username is taken by someone else
                const existing = localUsers.find(u => u.username === usernameInput && u.id !== CURRENT_USER.id);
                if (existing) {
                    showToast("El nombre de usuario ya está registrado.", "danger");
                    return;
                }
                
                // Update user
                localUsers = localUsers.map(u => {
                    if (u.id === CURRENT_USER.id) {
                        const updated = { ...u, username: usernameInput };
                        if (passwordInput.trim() !== "") {
                            updated.password = passwordInput;
                        }
                        return updated;
                    }
                    return u;
                });
                
                localStorage.setItem("users_data", JSON.stringify(localUsers));
                // Update current user
                CURRENT_USER.username = usernameInput;
                // Also update localStorage auth_token since it stores username
                localStorage.setItem("auth_token", usernameInput);
                
                updateSidebarUser();
                document.getElementById("profile-password").value = "";
                showToast("Perfil actualizado localmente.", "success");
                loadUsersList();
            } else {
                try {
                    const response = await safeFetchJson(`${API_BASE_URL}/api/settings/users/profile`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: usernameInput, password: passwordInput })
                    });
                    
                    localStorage.setItem("auth_token", response.token);
                    CURRENT_USER = response.user;
                    
                    updateSidebarUser();
                    document.getElementById("profile-password").value = "";
                    showToast("Perfil actualizado correctamente.", "success");
                    loadUsersList();
                } catch (error) {
                    showToast(`Error: ${error.message}`, "danger");
                }
            }
        });
    }
    
    // Add User form
    const addUserForm = document.getElementById("add-user-form");
    if (addUserForm) {
        addUserForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById("new-user-name");
            const usernameInput = document.getElementById("new-user-username");
            const passwordInput = document.getElementById("new-user-password");
            
            const name = nameInput.value.trim();
            const username = usernameInput.value.trim().toLowerCase();
            const password = passwordInput.value;
            
            if (!name || !username || !password) {
                showToast("Todos los campos son obligatorios.", "warning");
                return;
            }
            if (password.length < 4) {
                showToast("La contraseña debe tener al menos 4 caracteres.", "warning");
                return;
            }
            
            if (isLocalFile) {
                const localUsers = JSON.parse(localStorage.getItem("users_data") || "[]");
                const existing = localUsers.find(u => u.username === username);
                if (existing) {
                    showToast("El nombre de usuario ya está registrado.", "danger");
                    return;
                }
                
                const newUser = {
                    id: "user-" + Date.now(),
                    name,
                    username,
                    password,
                    role: "admin"
                };
                localUsers.push(newUser);
                localStorage.setItem("users_data", JSON.stringify(localUsers));
                
                nameInput.value = "";
                usernameInput.value = "";
                passwordInput.value = "";
                
                showToast(`Usuario "${username}" registrado localmente.`, "success");
                loadUsersList();
            } else {
                try {
                    const response = await safeFetchJson(`${API_BASE_URL}/api/settings/users`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, username, password })
                    });
                    
                    USERS_LIST = response;
                    
                    nameInput.value = "";
                    usernameInput.value = "";
                    passwordInput.value = "";
                    
                    showToast(`Usuario "${username}" registrado correctamente.`, "success");
                    loadUsersList();
                } catch (error) {
                    showToast(`Error: ${error.message}`, "danger");
                }
            }
        });
    }
}

function switchSettingsTab(tabName) {
    const tabs = ['branches', 'categories', 'backup', 'recurring', 'users'];
    tabs.forEach(t => {
        const tabBtn = document.getElementById(`tab-${t}`);
        const tabContent = document.getElementById(`content-${t}`);
        if (t === tabName) {
            if (tabBtn) tabBtn.classList.add("active");
            if (tabContent) tabContent.classList.remove("hidden");
        } else {
            if (tabBtn) tabBtn.classList.remove("active");
            if (tabContent) tabContent.classList.add("hidden");
        }
    });
    
    if (tabName === 'users') {
        loadUsersList();
    }
}

function renderSettingsLists() {
    const branchList = document.getElementById("settings-branches-list");
    branchList.innerHTML = "";
    
    BRANCHES.forEach((branch, index) => {
        const li = document.createElement("li");
        li.className = "settings-item";
        
        if (editingSettingId === `branch-${index}`) {
            li.innerHTML = `
                <input type="text" class="settings-item-edit-input" id="edit-branch-input-${index}" value="${branch}">
                <div class="settings-item-actions">
                    <button class="btn-icon save" onclick="saveSettingsBranch(${index})" title="Guardar cambios">
                        <i data-lucide="check"></i>
                    </button>
                    <button class="btn-icon" onclick="cancelSettingsEdit()" title="Cancelar">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            `;
        } else {
            li.innerHTML = `
                <span class="settings-item-text">${branch}</span>
                <div class="settings-item-actions">
                    <button class="btn-icon edit" onclick="startSettingsEdit('branch', ${index})" title="Editar nombre">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn-icon delete" onclick="deleteSettingsBranch(${index})" title="Eliminar sede">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
        }
        branchList.appendChild(li);
    });
    
    const categoryList = document.getElementById("settings-categories-list");
    categoryList.innerHTML = "";
    
    CATEGORIES.forEach((category, index) => {
        const li = document.createElement("li");
        li.className = "settings-item";
        
        if (editingSettingId === `category-${index}`) {
            li.innerHTML = `
                <input type="text" class="settings-item-edit-input" id="edit-category-input-${index}" value="${category}">
                <div class="settings-item-actions">
                    <button class="btn-icon save" onclick="saveSettingsCategory(${index})" title="Guardar cambios">
                        <i data-lucide="check"></i>
                    </button>
                    <button class="btn-icon" onclick="cancelSettingsEdit()" title="Cancelar">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            `;
        } else {
            li.innerHTML = `
                <span class="settings-item-text">${category}</span>
                <div class="settings-item-actions">
                    <button class="btn-icon edit" onclick="startSettingsEdit('category', ${index})" title="Editar nombre">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn-icon delete" onclick="deleteSettingsCategory(${index})" title="Eliminar categoría">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
        }
        categoryList.appendChild(li);
    });

    // Render Recurring Payments List
    const recurringList = document.getElementById("settings-recurring-list");
    if (recurringList) {
        recurringList.innerHTML = "";
        RECURRING_TEMPLATES.forEach(t => {
            const li = document.createElement("li");
            li.className = "settings-item";
            li.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                    <span class="settings-item-text" style="font-weight: 600;">${t.description}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">
                        Día ${t.dayOfMonth} | Sede: ${t.branch} | Cat: ${t.category} | <strong>$${t.amount.toFixed(2)}</strong>
                    </span>
                </div>
                <div class="settings-item-actions">
                    <button class="btn-icon delete" onclick="deleteRecurringTemplate('${t.id}')" title="Eliminar mensualidad">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            recurringList.appendChild(li);
        });
    }
    
    // Render Users List
    const usersListEl = document.getElementById("settings-users-list");
    if (usersListEl) {
        usersListEl.innerHTML = "";
        USERS_LIST.forEach(u => {
            const li = document.createElement("li");
            li.className = "settings-item";
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "8px 12px";
            
            // Cannot delete yourself
            const isSelf = CURRENT_USER && CURRENT_USER.id === u.id;
            const deleteButtonHtml = isSelf
                ? `<span style="font-size: 0.72rem; color: var(--text-secondary); font-style: italic; padding: 4px 8px;">Tú</span>`
                : `<button class="btn-icon delete" onclick="deleteSystemUser('${u.id}')" title="Eliminar usuario">
                       <i data-lucide="trash-2"></i>
                   </button>`;
            
            li.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${u.name}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">@${u.username} (${u.role})</span>
                </div>
                <div class="settings-item-actions">
                    ${deleteButtonHtml}
                </div>
            `;
            usersListEl.appendChild(li);
        });
    }
    
    lucide.createIcons();
}

async function loadUsersList() {
    if (isLocalFile) {
        const localUsers = JSON.parse(localStorage.getItem("users_data") || "[]");
        USERS_LIST = localUsers.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role }));
        renderSettingsLists();
    } else {
        try {
            const users = await safeFetchJson(`${API_BASE_URL}/api/settings/users`);
            USERS_LIST = users;
            renderSettingsLists();
        } catch (error) {
            console.error("Error loading users:", error);
            showToast("No se pudo cargar la lista de usuarios.", "danger");
        }
    }
}

async function checkAuth() {
    const token = localStorage.getItem("auth_token");
    if (!token) {
        showLoginOverlay();
        return false;
    }
    
    if (isLocalFile) {
        const localUsers = JSON.parse(localStorage.getItem("users_data") || "[]");
        const found = localUsers.find(u => u.username === token);
        if (found) {
            CURRENT_USER = { id: found.id, username: found.username, name: found.name, role: found.role };
            updateSidebarUser();
            hideLoginOverlay();
            return true;
        } else {
            localStorage.removeItem("auth_token");
            showLoginOverlay();
            return false;
        }
    } else {
        try {
            const data = await safeFetchJson(`${API_BASE_URL}/api/auth/me`);
            CURRENT_USER = data;
            updateSidebarUser();
            hideLoginOverlay();
            return true;
        } catch (error) {
            console.error("Session verification failed:", error);
            localStorage.removeItem("auth_token");
            showLoginOverlay();
            return false;
        }
    }
}

function showLoginOverlay() {
    const loginOverlay = document.getElementById("login-overlay");
    const dashboardSection = document.getElementById("dashboard-section");
    if (loginOverlay) loginOverlay.style.display = "flex";
    if (dashboardSection) dashboardSection.style.display = "none";
}

function hideLoginOverlay() {
    const loginOverlay = document.getElementById("login-overlay");
    const dashboardSection = document.getElementById("dashboard-section");
    if (loginOverlay) loginOverlay.style.display = "none";
    if (dashboardSection) dashboardSection.style.display = "flex";
}

function updateSidebarUser() {
    if (CURRENT_USER) {
        const nameEl = document.getElementById("sidebar-user-name");
        const roleEl = document.getElementById("sidebar-user-role");
        const avatarEl = document.getElementById("sidebar-user-avatar");
        
        if (nameEl) nameEl.textContent = CURRENT_USER.name || CURRENT_USER.username;
        if (roleEl) roleEl.textContent = `@${CURRENT_USER.username}`;
        if (avatarEl) {
            const firstLetter = (CURRENT_USER.name || CURRENT_USER.username).charAt(0).toUpperCase();
            avatarEl.textContent = firstLetter;
        }
    }
}

function setupLoginListeners() {
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;
    
    // Remove existing submit event listener if any by cloning
    const newForm = loginForm.cloneNode(true);
    loginForm.parentNode.replaceChild(newForm, loginForm);
    
    newForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById("login-username").value.trim().toLowerCase();
        const passwordInput = document.getElementById("login-password").value;
        
        if (!usernameInput || !passwordInput) {
            showToast("Por favor complete todos los campos.", "warning");
            return;
        }
        
        if (isLocalFile) {
            const localUsers = JSON.parse(localStorage.getItem("users_data") || "[]");
            const found = localUsers.find(u => u.username === usernameInput);
            if (found && found.password === passwordInput) {
                localStorage.setItem("auth_token", found.username);
                CURRENT_USER = { id: found.id, username: found.username, name: found.name, role: found.role };
                
                showToast("Inicio de sesión exitoso (Modo Local).", "success");
                hideLoginOverlay();
                await initAppAfterLogin();
            } else {
                showToast("Usuario o contraseña incorrectos.", "danger");
            }
        } else {
            try {
                const data = await safeFetchJson(`${API_BASE_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: usernameInput, password: passwordInput })
                });
                
                localStorage.setItem("auth_token", data.token);
                CURRENT_USER = data.user;
                
                showToast("Inicio de sesión exitoso.", "success");
                hideLoginOverlay();
                await initAppAfterLogin();
            } catch (error) {
                showToast(error.message || "Error al iniciar sesión.", "danger");
            }
        }
    });
    
    // API custom URL config toggling
    const btnToggleApi = document.getElementById("btn-toggle-api-config");
    const apiConfigContainer = document.getElementById("api-config-container");
    const customApiInput = document.getElementById("custom-api-url-input");
    const btnSaveApi = document.getElementById("btn-save-api-url");
    
    if (btnToggleApi && apiConfigContainer) {
        btnToggleApi.addEventListener("click", () => {
            apiConfigContainer.classList.toggle("hidden");
        });
    }
    
    if (customApiInput) {
        customApiInput.value = localStorage.getItem("custom_api_url") || DEFAULT_API_URL;
    }
    
    if (btnSaveApi && customApiInput) {
        btnSaveApi.addEventListener("click", () => {
            const urlVal = customApiInput.value.trim();
            if (urlVal === "") {
                localStorage.removeItem("custom_api_url");
                showToast("URL restablecida al valor por defecto.", "info");
            } else {
                localStorage.setItem("custom_api_url", urlVal);
                showToast("URL del servidor actualizada. Recargando...", "success");
            }
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        });
    }
    
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        // Clone to avoid multiple listners
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        
        newLogoutBtn.addEventListener("click", () => {
            localStorage.removeItem("auth_token");
            showToast("Sesión cerrada.", "info");
            setTimeout(() => {
                window.location.reload();
            }, 800);
        });
    }
}

async function initAppAfterLogin() {
    updateSidebarUser();
    
    // Load rates first
    await loadRates();
    // Load expenses
    await loadExpenses();
    
    // Populate filter and form dropdown options dynamically
    populateDropdowns();
    
    // Populate header date
    initHeaderDate();
    
    // Initialize Charts
    initCharts();
    
    // Render Dashboard UI
    renderDashboard();
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Initialize settings modal events
    initSettingsModal();
    
    // Render Lucide Icons
    lucide.createIcons();
}

window.deleteSystemUser = async function(id) {
    if (!CURRENT_USER) return;
    if (CURRENT_USER.id === id) {
        showToast("No puedes eliminar tu propio usuario.", "danger");
        return;
    }
    if (confirm("¿Está seguro de que desea eliminar este usuario?")) {
        if (isLocalFile) {
            let localUsers = JSON.parse(localStorage.getItem("users_data") || "[]");
            localUsers = localUsers.filter(u => u.id !== id);
            localStorage.setItem("users_data", JSON.stringify(localUsers));
            USERS_LIST = localUsers.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role }));
            renderSettingsLists();
            showToast("Usuario eliminado (Modo Local).", "info");
        } else {
            try {
                const response = await safeFetchJson(`${API_BASE_URL}/api/settings/users/${id}`, {
                    method: 'DELETE'
                });
                USERS_LIST = response;
                renderSettingsLists();
                showToast("Usuario eliminado correctamente.", "success");
            } catch (error) {
                showToast(`Error: ${error.message}`, "danger");
            }
        }
    }
};
