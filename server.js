const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serves index.html, styles.css, app.js directly

// Seed Data
const DEFAULT_BRANCHES = ["Sede Norte", "Sede Sur", "Sede Este", "Sede Oeste"];
const DEFAULT_CATEGORIES = ["Servicios", "Nómina", "Proveedores", "Mantenimiento", "Tecnología", "Marketing"];
const DEFAULT_EXPENSES = [
    { id: "EXP-101", date: "2026-05-10", branch: "Sede Norte", category: "Nómina", description: "Nómina quincenal de personal operativo", amount: 4850.00, status: "Pagado" },
    { id: "EXP-102", date: "2026-05-12", branch: "Sede Sur", category: "Servicios", description: "Consumo eléctrico oficinas administrativas - Abril", amount: 385.50, status: "Pagado" },
    { id: "EXP-103", date: "2026-05-15", branch: "Sede Este", category: "Proveedores", description: "Compra de suministros y consumibles de oficina", amount: 890.00, status: "Pendiente" },
    { id: "EXP-104", date: "2026-05-18", branch: "Sede Oeste", category: "Mantenimiento", description: "Mantenimiento preventivo de aire acondicionado central", amount: 1250.00, status: "Pagado" },
    { id: "EXP-105", date: "2026-05-20", branch: "Sede Norte", category: "Tecnología", description: "Suscripción anual a licencias ERP en la nube", amount: 2400.00, status: "Pendiente" },
    { id: "EXP-106", date: "2026-05-22", branch: "Sede Sur", category: "Marketing", description: "Campaña publicitaria Google Ads & Redes Sociales", amount: 1500.00, status: "Pagado" },
    { id: "EXP-107", date: "2026-05-24", branch: "Sede Oeste", category: "Proveedores", description: "Servicio externo de mensajería y distribución", amount: 620.00, status: "Pagado" },
    { id: "EXP-108", date: "2026-05-25", branch: "Sede Este", category: "Servicios", description: "Servicio de internet simétrico y telefonía VoIP", amount: 180.00, status: "Pagado" }
];

// Database Helpers
function readDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const fileData = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(fileData);
        } else {
            const initialData = {
                branches: DEFAULT_BRANCHES,
                categories: DEFAULT_CATEGORIES,
                expenses: DEFAULT_EXPENSES
            };
            writeDB(initialData);
            return initialData;
        }
    } catch (error) {
        console.error("Error reading database:", error);
        return { branches: [], categories: [], expenses: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error("Error writing to database:", error);
    }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// 1. Get all database data
app.get('/api/data', (req, res) => {
    const data = readDB();
    res.json(data);
});

// 2. Add dynamic expense
app.post('/api/expenses', (req, res) => {
    const data = readDB();
    const { date, branch, category, description, amount, status } = req.body;
    
    // Server-side validation
    if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
        return res.status(400).json({ error: "Datos de gasto incompletos o inválidos." });
    }
    
    // Generate autoincremental EXP-XXX ID
    const nextIdNumber = data.expenses.reduce((max, curr) => {
        const num = parseInt(curr.id.split("-")[1]);
        return num > max ? num : max;
    }, 100) + 1;
    const newId = `EXP-${nextIdNumber}`;
    
    const newExpense = {
        id: newId,
        date,
        branch,
        category,
        description,
        amount: parseFloat(amount),
        status
    };
    
    data.expenses.push(newExpense);
    writeDB(data);
    
    res.status(201).json(newExpense);
});

// 3. Edit dynamic expense
app.put('/api/expenses/:id', (req, res) => {
    const data = readDB();
    const expenseId = req.params.id;
    const { date, branch, category, description, amount, status } = req.body;
    
    const index = data.expenses.findIndex(e => e.id === expenseId);
    if (index === -1) {
        return res.status(404).json({ error: "Gasto no encontrado." });
    }
    
    if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
        return res.status(400).json({ error: "Datos de edición incompletos o inválidos." });
    }
    
    data.expenses[index] = {
        id: expenseId,
        date,
        branch,
        category,
        description,
        amount: parseFloat(amount),
        status
    };
    
    writeDB(data);
    res.json(data.expenses[index]);
});

// 4. Delete expense
app.delete('/api/expenses/:id', (req, res) => {
    const data = readDB();
    const expenseId = req.params.id;
    
    const index = data.expenses.findIndex(e => e.id === expenseId);
    if (index === -1) {
        return res.status(404).json({ error: "Gasto no encontrado." });
    }
    
    data.expenses.splice(index, 1);
    writeDB(data);
    
    res.json({ success: true, message: `Gasto ${expenseId} eliminado correctamente.` });
});

// 5. Add Branch
app.post('/api/settings/branches', (req, res) => {
    const data = readDB();
    const { name } = req.body;
    
    if (!name || name.trim() === "") {
        return res.status(400).json({ error: "El nombre de la sede es obligatorio." });
    }
    
    const trimmedName = name.trim();
    if (data.branches.includes(trimmedName)) {
        return res.status(400).json({ error: "La sede ya existe." });
    }
    
    data.branches.push(trimmedName);
    writeDB(data);
    
    res.status(201).json(data.branches);
});

// 6. Rename Branch (Cascade rename expenses)
app.put('/api/settings/branches', (req, res) => {
    const data = readDB();
    const { oldName, newName } = req.body;
    
    if (!oldName || !newName || newName.trim() === "") {
        return res.status(400).json({ error: "Faltan parámetros para renombrar." });
    }
    
    const trimmedNewName = newName.trim();
    const index = data.branches.indexOf(oldName);
    
    if (index === -1) {
        return res.status(404).json({ error: "Sede de origen no encontrada." });
    }
    if (data.branches.includes(trimmedNewName) && oldName !== trimmedNewName) {
        return res.status(400).json({ error: "El nombre nuevo ya está registrado." });
    }
    
    // Update branch array
    data.branches[index] = trimmedNewName;
    
    // Update in cascade all historical expenses
    data.expenses.forEach(e => {
        if (e.branch === oldName) {
            e.branch = trimmedNewName;
        }
    });
    
    writeDB(data);
    res.json({ branches: data.branches, expenses: data.expenses });
});

// 7. Delete Branch
app.delete('/api/settings/branches/:name', (req, res) => {
    const data = readDB();
    const branchName = req.params.name;
    
    const index = data.branches.indexOf(branchName);
    if (index === -1) {
        return res.status(404).json({ error: "Sede no encontrada." });
    }
    
    // Integrity check: block if there are expenses associated
    const count = data.expenses.filter(e => e.branch === branchName).length;
    if (count > 0) {
        return res.status(400).json({ error: `No se puede eliminar la sede porque tiene ${count} gastos asociados.` });
    }
    
    data.branches.splice(index, 1);
    writeDB(data);
    
    res.json(data.branches);
});

// 8. Add Category
app.post('/api/settings/categories', (req, res) => {
    const data = readDB();
    const { name } = req.body;
    
    if (!name || name.trim() === "") {
        return res.status(400).json({ error: "El nombre de la categoría es obligatorio." });
    }
    
    const trimmedName = name.trim();
    if (data.categories.includes(trimmedName)) {
        return res.status(400).json({ error: "La categoría ya existe." });
    }
    
    data.categories.push(trimmedName);
    writeDB(data);
    
    res.status(201).json(data.categories);
});

// 9. Rename Category (Cascade rename expenses)
app.put('/api/settings/categories', (req, res) => {
    const data = readDB();
    const { oldName, newName } = req.body;
    
    if (!oldName || !newName || newName.trim() === "") {
        return res.status(400).json({ error: "Faltan parámetros para renombrar." });
    }
    
    const trimmedNewName = newName.trim();
    const index = data.categories.indexOf(oldName);
    
    if (index === -1) {
        return res.status(404).json({ error: "Categoría de origen no encontrada." });
    }
    if (data.categories.includes(trimmedNewName) && oldName !== trimmedNewName) {
        return res.status(400).json({ error: "El nombre nuevo ya está registrado." });
    }
    
    // Update category array
    data.categories[index] = trimmedNewName;
    
    // Update in cascade all historical expenses
    data.expenses.forEach(e => {
        if (e.category === oldName) {
            e.category = trimmedNewName;
        }
    });
    
    writeDB(data);
    res.json({ categories: data.categories, expenses: data.expenses });
});

// 10. Delete Category
app.delete('/api/settings/categories/:name', (req, res) => {
    const data = readDB();
    const catName = req.params.name;
    
    const index = data.categories.indexOf(catName);
    if (index === -1) {
        return res.status(404).json({ error: "Categoría no encontrada." });
    }
    
    // Integrity check
    const count = data.expenses.filter(e => e.category === catName).length;
    if (count > 0) {
        return res.status(400).json({ error: `No se puede eliminar la categoría porque tiene ${count} gastos asociados.` });
    }
    
    data.categories.splice(index, 1);
    writeDB(data);
    
    res.json(data.categories);
});

// Serve index.html as fallback for SPA routing if needed
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Servidor de Control de Gastos corriendo en: http://localhost:${PORT}`);
});
