// ============================================================================
// APP STATE & CONSTANTS
// ============================================================================

const SEED_EXPENSES = [
    { id: "EXP-101", date: "2026-05-10", branch: "Sede Norte", category: "Nómina", description: "Nómina quincenal de personal operativo", amount: 4850.00, status: "Pagado" },
    { id: "EXP-102", date: "2026-05-12", branch: "Sede Sur", category: "Servicios", description: "Consumo eléctrico oficinas administrativas - Abril", amount: 385.50, status: "Pagado" },
    { id: "EXP-103", date: "2026-05-15", branch: "Sede Este", category: "Proveedores", description: "Compra de suministros y consumibles de oficina", amount: 890.00, status: "Pendiente" },
    { id: "EXP-104", date: "2026-05-18", branch: "Sede Oeste", category: "Mantenimiento", description: "Mantenimiento preventivo de aire acondicionado central", amount: 1250.00, status: "Pagado" },
    { id: "EXP-105", date: "2026-05-20", branch: "Sede Norte", category: "Tecnología", description: "Suscripción anual a licencias ERP en la nube", amount: 2400.00, status: "Pendiente" },
    { id: "EXP-106", date: "2026-05-22", branch: "Sede Sur", category: "Marketing", description: "Campaña publicitaria Google Ads & Redes Sociales", amount: 1500.00, status: "Pagado" },
    { id: "EXP-107", date: "2026-05-24", branch: "Sede Oeste", category: "Proveedores", description: "Servicio externo de mensajería y distribución", amount: 620.00, status: "Pagado" },
    { id: "EXP-108", date: "2026-05-25", branch: "Sede Este", category: "Servicios", description: "Servicio de internet simétrico y telefonía VoIP", amount: 180.00, status: "Pagado" }
];

let BRANCHES = [];
let CATEGORIES = [];
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

let expenses = [];
let editingId = null; // Stores ID of the row being edited in-line

// Chart.js instances
let branchChartInstance = null;
let categoryChartInstance = null;
let statusChartInstance = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Load expenses from LocalStorage or initialize with seed data
    loadExpenses();
    
    // Populate filter and form dropdown options dynamically
    populateDropdowns();
    
    // Initialize Theme (Light / Dark)
    initTheme();
    
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
});

// Load expenses data
function loadExpenses() {
    // Load branches
    const storedBranches = localStorage.getItem("branches_data");
    if (storedBranches) {
        BRANCHES = JSON.parse(storedBranches);
    } else {
        BRANCHES = ["Sede Norte", "Sede Sur", "Sede Este", "Sede Oeste"];
        localStorage.setItem("branches_data", JSON.stringify(BRANCHES));
    }

    // Load categories
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
        expenses = [...SEED_EXPENSES];
        saveExpensesToStorage();
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

function saveExpensesToStorage() {
    localStorage.setItem("expenses_data", JSON.stringify(expenses));
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
    updateThemeToggleIcon(storedTheme);
    
    toggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        updateThemeToggleIcon(newTheme);
        
        // Dynamic Chart styling updates on theme change
        updateChartsThemeColors();
    });
}

function updateThemeToggleIcon(theme) {
    // Lucide automatically updates class names, but we handle it via CSS visibility
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
    
    // Automatically delete from DOM after animations complete
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// ============================================================================
// KPI CALCULATIONS
// ============================================================================

function updateKPIs(filteredData) {
    // 1. Total General
    const total = filteredData.reduce((acc, curr) => acc + curr.amount, 0);
    document.getElementById("kpi-value-total").textContent = formatCurrency(total);
    
    // 2. Paid
    const paidExpenses = filteredData.filter(e => e.status === "Pagado");
    const totalPaid = paidExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    document.getElementById("kpi-value-paid").textContent = formatCurrency(totalPaid);
    document.getElementById("kpi-sub-paid").textContent = `${paidExpenses.length} transacciones liquidadas`;
    
    // 3. Pending
    const pendingExpenses = filteredData.filter(e => e.status === "Pendiente");
    const totalPending = pendingExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    document.getElementById("kpi-value-pending").textContent = formatCurrency(totalPending);
    document.getElementById("kpi-sub-pending").textContent = `${pendingExpenses.length} transacciones por pagar`;
    
    // 4. Branch with maximum expenses
    const branchTotals = {};
    BRANCHES.forEach(b => branchTotals[b] = 0);
    filteredData.forEach(e => {
        if (branchTotals[e.branch] !== undefined) {
            branchTotals[e.branch] += e.amount;
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
        ? `Consumo: ${formatCurrency(maxAmount)}`
        : "Sin registros cargados";
}

// Helper to format money values
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value);
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
                            return ` ${context.label}: ${formatCurrency(context.raw)}`;
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
                            return ` Total: ${formatCurrency(context.raw)}`;
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
                            return ` ${context.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function updateChartsData(filteredData) {
    if (!branchChartInstance || !categoryChartInstance || !statusChartInstance) return;
    
    // 1. Recalculate Branch totals
    const branchTotals = BRANCHES.map(branch => {
        return filteredData
            .filter(e => e.branch === branch)
            .reduce((sum, curr) => sum + curr.amount, 0);
    });
    
    branchChartInstance.data.datasets[0].data = branchTotals;
    branchChartInstance.update();

    // 2. Recalculate Category totals
    const categoryTotals = CATEGORIES.map(cat => {
        return filteredData
            .filter(e => e.category === cat)
            .reduce((sum, curr) => sum + curr.amount, 0);
    });
    
    categoryChartInstance.data.datasets[0].data = categoryTotals;
    categoryChartInstance.update();

    // 3. Recalculate Paid vs Pending
    const paidSum = filteredData.filter(e => e.status === "Pagado").reduce((sum, curr) => sum + curr.amount, 0);
    const pendingSum = filteredData.filter(e => e.status === "Pendiente").reduce((sum, curr) => sum + curr.amount, 0);
    
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
    
    // Sort expenses in descending order by date & id so latest shows up first
    const sortedData = [...filteredData].sort((a, b) => {
        if (b.date !== a.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return b.id.localeCompare(a.id);
    });
    
    sortedData.forEach(exp => {
        const tr = document.createElement("tr");
        tr.id = `row-${exp.id}`;
        
        // Check if this row is in edit-mode
        if (editingId === exp.id) {
            tr.className = "editing-row";
            tr.innerHTML = getInlineEditingTemplate(exp);
        } else {
            // Standard static display
            // Safe branch pill style resolution
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
            const statusClass = exp.status.toLowerCase(); // pagado, pendiente
            
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
                    ${formatCurrency(exp.amount)}
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
        
        // Add double click listener to rows for faster inline edit activation
        if (editingId !== exp.id) {
            tr.addEventListener("dblclick", () => {
                startInlineEdit(exp.id);
            });
        }
        
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

// Generate inline editor inputs for active editing row
function getInlineEditingTemplate(exp) {
    // Generate Select Options for Branch
    const branchOptions = BRANCHES.map(b => 
        `<option value="${b}" ${exp.branch === b ? 'selected' : ''}>${b}</option>`
    ).join("");
    
    // Generate Select Options for Category
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
            <input type="number" class="table-edit-input text-right" id="edit-amount-${exp.id}" value="${exp.amount}" min="0.01" step="0.01" style="font-weight: 700;" required>
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

// Date helper to make formats look more polished
function formatDate(dateStr) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
        // Displays as DD/MM/YYYY
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Trigger render, charts, and metrics
function renderDashboard() {
    const filtered = getFilteredData();
    updateKPIs(filtered);
    updateChartsData(filtered);
    renderTable(filtered);
}

// ============================================================================
// DATA MUTATION HANDLERS
// ============================================================================

// Inline Editing Control: Enable row input templates
window.startInlineEdit = function(id) {
    editingId = id;
    renderDashboard();
};

// Inline Editing Control: Cancel edit mode
window.cancelInlineEdit = function() {
    editingId = null;
    renderDashboard();
};

// Inline Editing Control: Save edited values
window.saveInlineEdit = function(id) {
    const dateInput = document.getElementById(`edit-date-${id}`);
    const branchInput = document.getElementById(`edit-branch-${id}`);
    const categoryInput = document.getElementById(`edit-category-${id}`);
    const descInput = document.getElementById(`edit-desc-${id}`);
    const amountInput = document.getElementById(`edit-amount-${id}`);
    const statusInput = document.getElementById(`edit-status-${id}`);
    
    // Inline validation checks
    const dateVal = dateInput.value;
    const branchVal = branchInput.value;
    const categoryVal = categoryInput.value;
    const descVal = descInput.value.trim();
    const amountVal = parseFloat(amountInput.value);
    const statusVal = statusInput.value;
    
    if (!dateVal || !branchVal || !categoryVal || !descVal || isNaN(amountVal) || amountVal <= 0) {
        showToast("Error: Complete todos los campos con valores válidos.", "danger");
        return;
    }
    
    // Find item and update properties
    const index = expenses.findIndex(e => e.id === id);
    if (index !== -1) {
        expenses[index] = {
            id,
            date: dateVal,
            branch: branchVal,
            category: categoryVal,
            description: descVal,
            amount: amountVal,
            status: statusVal
        };
        
        saveExpensesToStorage();
        editingId = null;
        renderDashboard();
        showToast(`Registro ${id} actualizado correctamente.`, "success");
    }
};

// Delete record action
window.deleteExpense = function(id) {
    if (confirm(`¿Está seguro de que desea eliminar el registro de gasto ${id}?`)) {
        expenses = expenses.filter(e => e.id !== id);
        saveExpensesToStorage();
        
        // If the item deleted was in edit mode, reset the edit state
        if (editingId === id) {
            editingId = null;
        }
        
        renderDashboard();
        showToast(`Registro ${id} eliminado con éxito.`, "info");
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
        // Set default date to today in form
        document.getElementById("form-date").value = new Date().toISOString().substring(0, 10);
        
        // Remove validation classes
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
    
    // Close modal when clicking outside overlay
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });
    
    // 4. Modal Form Submit handler
    expenseForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        // Retrieve inputs
        const dateInput = document.getElementById("form-date");
        const branchInput = document.getElementById("form-branch");
        const categoryInput = document.getElementById("form-category");
        const descInput = document.getElementById("form-description");
        const amountInput = document.getElementById("form-amount");
        const statusInputs = document.getElementsByName("form-status");
        
        let statusVal = "Pagado";
        for (const radio of statusInputs) {
            if (radio.checked) {
                statusVal = radio.value;
                break;
            }
        }
        
        // Validation Checks
        let isValid = true;
        
        // Date Check
        if (!dateInput.value) {
            invalidateField(dateInput);
            isValid = false;
        } else {
            validateField(dateInput);
        }
        
        // Branch Check
        if (!branchInput.value) {
            invalidateField(branchInput);
            isValid = false;
        } else {
            validateField(branchInput);
        }
        
        // Category Check
        if (!categoryInput.value) {
            invalidateField(categoryInput);
            isValid = false;
        } else {
            validateField(categoryInput);
        }
        
        // Description Check
        if (!descInput.value.trim()) {
            invalidateField(descInput);
            isValid = false;
        } else {
            validateField(descInput);
        }
        
        // Amount Check
        const amountVal = parseFloat(amountInput.value);
        if (isNaN(amountVal) || amountVal <= 0) {
            invalidateField(amountInput);
            isValid = false;
        } else {
            validateField(amountInput);
        }
        
        // If not valid, stop
        if (!isValid) return;
        
        // Generate new custom ID EXP-XXX
        const nextIdNumber = expenses.reduce((max, curr) => {
            const num = parseInt(curr.id.split("-")[1]);
            return num > max ? num : max;
        }, 100) + 1;
        const newId = `EXP-${nextIdNumber}`;
        
        // Construct new expense object
        const newExpense = {
            id: newId,
            date: dateInput.value,
            branch: branchInput.value,
            category: categoryInput.value,
            description: descInput.value.trim(),
            amount: amountVal,
            status: statusVal
        };
        
        // Save to state & LocalStorage
        expenses.push(newExpense);
        saveExpensesToStorage();
        
        // Render & close
        renderDashboard();
        closeModal();
        
        showToast(`Gasto ${newId} registrado con éxito.`, "success");
    });

    // 5. Print Report Button Click handler
    document.getElementById("btn-print-report").addEventListener("click", () => {
        // Populates Date/Time
        const printDateEl = document.getElementById("print-date");
        const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        printDateEl.textContent = new Date().toLocaleString('es-ES', options);
        
        // Populates Applied Filters Summary
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
}

// Helpers for modal field validations visual state
function invalidateField(inputEl) {
    const parent = inputEl.closest(".form-group");
    if (parent) parent.classList.add("invalid");
}

function validateField(inputEl) {
    const parent = inputEl.closest(".form-group");
    if (parent) parent.classList.remove("invalid");
}

// ============================================================================
// SYSTEM PARAMETERS SETTINGS MODAL & LISTS
// ============================================================================

let editingSettingId = null; // Stores "branch-X" or "category-X" while editing

function initSettingsModal() {
    const settingsOverlay = document.getElementById("modal-settings-overlay");
    const navSettingsBtn = document.getElementById("nav-settings");
    const closeSettingsBtn = document.getElementById("btn-close-settings");
    const closeSettingsFooter = document.getElementById("btn-close-settings-footer");
    
    const openSettings = () => {
        editingSettingId = null;
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
    
    // Tab Toggles
    document.getElementById("tab-branches").addEventListener("click", () => switchSettingsTab('branches'));
    document.getElementById("tab-categories").addEventListener("click", () => switchSettingsTab('categories'));
    
    // Add Forms
    const addBranchForm = document.getElementById("add-branch-form");
    const addCategoryForm = document.getElementById("add-category-form");
    
    addBranchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("new-branch-name");
        const name = input.value.trim();
        
        if (!name) return;
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
        showToast(`Sede "${name}" agregada correctamente.`, "success");
    });
    
    addCategoryForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("new-category-name");
        const name = input.value.trim();
        
        if (!name) return;
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
        showToast(`Categoría "${name}" agregada correctamente.`, "success");
    });
}

function switchSettingsTab(tabName) {
    const tabBranches = document.getElementById("tab-branches");
    const tabCategories = document.getElementById("tab-categories");
    const contentBranches = document.getElementById("content-branches");
    const contentCategories = document.getElementById("content-categories");
    
    if (tabName === 'branches') {
        tabBranches.classList.add("active");
        tabCategories.classList.remove("active");
        contentBranches.classList.remove("hidden");
        contentCategories.classList.add("hidden");
    } else {
        tabBranches.classList.remove("active");
        tabCategories.classList.add("active");
        contentBranches.classList.add("hidden");
        contentCategories.classList.remove("hidden");
    }
}

function renderSettingsLists() {
    // 1. Render Branches
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
    
    // 2. Render Categories
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
    
    lucide.createIcons();
}

window.startSettingsEdit = function(type, index) {
    editingSettingId = `${type}-${index}`;
    renderSettingsLists();
};

window.cancelSettingsEdit = function() {
    editingSettingId = null;
    renderSettingsLists();
};

// Renaming Branch Logic
window.saveSettingsBranch = function(index) {
    const input = document.getElementById(`edit-branch-input-${index}`);
    const newName = input.value.trim();
    const oldName = BRANCHES[index];
    
    if (!newName) return;
    if (newName === oldName) {
        cancelSettingsEdit();
        return;
    }
    if (BRANCHES.includes(newName)) {
        showToast("Error: Ya existe una sede con ese nombre.", "danger");
        return;
    }
    
    // Rename occurrences in expenses array
    expenses.forEach(exp => {
        if (exp.branch === oldName) {
            exp.branch = newName;
        }
    });
    
    // Update branch array
    BRANCHES[index] = newName;
    
    // Save to LocalStorage
    localStorage.setItem("branches_data", JSON.stringify(BRANCHES));
    saveExpensesToStorage();
    
    // Reset state & refresh UI
    editingSettingId = null;
    populateDropdowns();
    updateChartsStructure();
    renderDashboard();
    renderSettingsLists();
    
    showToast(`Sede renombrada de "${oldName}" a "${newName}" con éxito.`, "success");
};

// Renaming Category Logic
window.saveSettingsCategory = function(index) {
    const input = document.getElementById(`edit-category-input-${index}`);
    const newName = input.value.trim();
    const oldName = CATEGORIES[index];
    
    if (!newName) return;
    if (newName === oldName) {
        cancelSettingsEdit();
        return;
    }
    if (CATEGORIES.includes(newName)) {
        showToast("Error: Ya existe una categoría con ese nombre.", "danger");
        return;
    }
    
    // Rename occurrences in expenses array
    expenses.forEach(exp => {
        if (exp.category === oldName) {
            exp.category = newName;
        }
    });
    
    // Update category array
    CATEGORIES[index] = newName;
    
    // Save to LocalStorage
    localStorage.setItem("categories_data", JSON.stringify(CATEGORIES));
    saveExpensesToStorage();
    
    // Reset state & refresh UI
    editingSettingId = null;
    populateDropdowns();
    updateChartsStructure();
    renderDashboard();
    renderSettingsLists();
    
    showToast(`Categoría renombrada de "${oldName}" a "${newName}" con éxito.`, "success");
};

// Deleting Branch Logic
window.deleteSettingsBranch = function(index) {
    const branchName = BRANCHES[index];
    
    // Integrity check
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
        
        showToast(`Sede "${branchName}" eliminada correctamente.`, "info");
    }
};

// Deleting Category Logic
window.deleteSettingsCategory = function(index) {
    const catName = CATEGORIES[index];
    
    // Integrity check
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
        
        showToast(`Categoría "${catName}" eliminada correctamente.`, "info");
    }
};

