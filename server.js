require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gasto_corp_super_secret_key_987';

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

// Seeding function
async function seedIfNeeded() {
    try {
        const branchCount = await prisma.branch.count();
        const categoryCount = await prisma.category.count();
        const expenseCount = await prisma.expense.count();
        const userCount = await prisma.user.count();
        const rateCount = await prisma.exchangeRate.count();

        if (branchCount === 0) {
            console.log("Seeding default branches...");
            await prisma.branch.createMany({
                data: DEFAULT_BRANCHES.map(name => ({ name }))
            });
        }

        if (categoryCount === 0) {
            console.log("Seeding default categories...");
            await prisma.category.createMany({
                data: DEFAULT_CATEGORIES.map(name => ({ name }))
            });
        }

        if (userCount === 0) {
            console.log("Seeding default admin user...");
            const hashedPassword = await bcrypt.hash("admin123", 10);
            await prisma.user.create({
                data: {
                    username: "admin",
                    password: hashedPassword,
                    role: "ADMIN"
                }
            });
        }

        if (rateCount === 0) {
            console.log("Seeding default exchange rates...");
            await prisma.exchangeRate.create({
                data: {
                    id: "latest",
                    vesRate: 40.0,
                    eurRate: 0.92
                }
            });
        }

        if (expenseCount === 0) {
            console.log("Seeding default expenses...");
            await prisma.expense.createMany({
                data: DEFAULT_EXPENSES.map(e => ({
                    ...e,
                    currency: "USD",
                    exchangeRate: 1.0,
                    amountUsd: e.amount
                }))
            });
        }
    } catch (error) {
        console.error("Error during database seeding:", error);
    }
}

// ============================================================================
// AUTH MIDDLEWARES
// ============================================================================

function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Token de autenticación no provisto." });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: "Formato de token inválido." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Token inválido o expirado." });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Acceso denegado. Se requieren privilegios de Administrador." });
    }
    next();
}

// ============================================================================
// AUTH & USER ENDPOINTS
// ============================================================================

// 1. Login user
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Usuario y contraseña requeridos." });
    }

    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: "Credenciales incorrectas." });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Credenciales incorrectas." });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, branch: user.branch },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                username: user.username,
                role: user.role,
                branch: user.branch
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Error interno en el inicio de sesión." });
    }
});

// 2. Get current user profile
app.get('/api/auth/me', authenticateJWT, (req, res) => {
    res.json({ user: req.user });
});

// 3. Create user account (Admin only)
app.post('/api/settings/users', authenticateJWT, requireAdmin, async (req, res) => {
    const { username, password, role, branch } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: "Datos de usuario incompletos." });
    }

    if (role !== "ADMIN" && role !== "SEDE") {
        return res.status(400).json({ error: "Rol inválido. Debe ser 'ADMIN' o 'SEDE'." });
    }

    if (role === "SEDE" && (!branch || branch.trim() === "")) {
        return res.status(400).json({ error: "Las cuentas de sede deben tener una sede asignada." });
    }

    try {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ error: "El nombre de usuario ya está registrado." });
        }

        // Verify branch exists if role is SEDE
        if (role === "SEDE") {
            const dbBranch = await prisma.branch.findUnique({ where: { name: branch } });
            if (!dbBranch) {
                return res.status(400).json({ error: `La sede '${branch}' no existe. Regístrala primero.` });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                role,
                branch: role === "SEDE" ? branch : null
            }
        });

        res.status(201).json({
            message: "Usuario creado exitosamente.",
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role,
                branch: newUser.branch
            }
        });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ error: "Error interno del servidor al crear el usuario." });
    }
});

// 4. Update current user profile (username / password)
app.put('/api/auth/profile', authenticateJWT, async (req, res) => {
    const { username, password } = req.body;
    const userId = req.user.id;

    try {
        const updateData = {};
        if (username && username.trim() !== "") {
            const trimmedUsername = username.trim();
            if (trimmedUsername !== req.user.username) {
                const existing = await prisma.user.findUnique({ where: { username: trimmedUsername } });
                if (existing) {
                    return res.status(400).json({ error: "El nombre de usuario ya está en uso." });
                }
            }
            updateData.username = trimmedUsername;
        }

        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 10);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "No se enviaron datos para actualizar." });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        const token = jwt.sign(
            { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role, branch: updatedUser.branch },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            message: "Perfil actualizado correctamente.",
            token,
            user: {
                username: updatedUser.username,
                role: updatedUser.role,
                branch: updatedUser.branch
            }
        });
    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ error: "Error al actualizar el perfil." });
    }
});

// 5. Get all users list (Admin only)
app.get('/api/settings/users', authenticateJWT, requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                role: true,
                branch: true,
                createdAt: true
            }
        });
        res.json(users);
    } catch (error) {
        console.error("Error listing users:", error);
        res.status(500).json({ error: "Error al listar los usuarios." });
    }
});

// 6. Delete user account (Admin only)
app.delete('/api/settings/users/:id', authenticateJWT, requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
    }

    if (userId === req.user.id) {
        return res.status(400).json({ error: "No puedes eliminar tu propia cuenta de administrador." });
    }

    try {
        await prisma.user.delete({ where: { id: userId } });
        res.json({ message: "Usuario eliminado correctamente." });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ error: "Error al eliminar el usuario." });
    }
});

// ============================================================================
// EXCHANGE RATE ENDPOINTS
// ============================================================================

// Get Exchange Rates
app.get('/api/settings/rates', authenticateJWT, async (req, res) => {
    try {
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } });
        res.json(rates || { vesRate: 40.0, eurRate: 0.92 });
    } catch (error) {
        console.error("Error getting exchange rates:", error);
        res.status(500).json({ error: "Error al obtener las tasas de cambio." });
    }
});

// Update Exchange Rates (Admin only)
app.put('/api/settings/rates', authenticateJWT, requireAdmin, async (req, res) => {
    const { vesRate, eurRate } = req.body;
    
    if (isNaN(vesRate) || vesRate <= 0 || isNaN(eurRate) || eurRate <= 0) {
        return res.status(400).json({ error: "Tasas de cambio inválidas. Deben ser mayores a cero." });
    }

    try {
        const rates = await prisma.exchangeRate.upsert({
            where: { id: "latest" },
            update: {
                vesRate: parseFloat(vesRate),
                eurRate: parseFloat(eurRate)
            },
            create: {
                id: "latest",
                vesRate: parseFloat(vesRate),
                eurRate: parseFloat(eurRate)
            }
        });

        // Update amountUsd of all historical expenses? No, the instructions say:
        // "cada gasto registre el monto, la moneda seleccionada (VES, USD, o EUR) y la tasa de cambio que estaba activa en el momento de la transacción."
        // This implies historical expenses keep their rate. Only new transactions get the new rate. So we don't recalculate past expenses.
        
        res.json(rates);
    } catch (error) {
        console.error("Error updating exchange rates:", error);
        res.status(500).json({ error: "Error al actualizar las tasas de cambio." });
    }
});

// ============================================================================
// API ENDPOINTS (PROTECTED BY JWT)
// ============================================================================

// 1. Get all database data (with RBAC filtering)
app.get('/api/data', authenticateJWT, async (req, res) => {
    try {
        const isSede = req.user.role === 'SEDE';
        
        // Filter expenses
        const expenses = await prisma.expense.findMany({
            where: isSede ? { branch: req.user.branch } : undefined
        });

        // Filter branches
        const dbBranches = await prisma.branch.findMany();
        const filteredBranches = isSede 
            ? dbBranches.filter(b => b.name === req.user.branch)
            : dbBranches;

        const dbCategories = await prisma.category.findMany();

        res.json({
            expenses: expenses,
            branches: filteredBranches.map(b => b.name),
            categories: dbCategories.map(c => c.name)
        });
    } catch (error) {
        console.error("Error fetching data from database:", error);
        res.status(500).json({ error: "Error al obtener datos de la base de datos." });
    }
});

// 2. Add dynamic expense
app.post('/api/expenses', authenticateJWT, async (req, res) => {
    let { date, branch, category, description, amount, status, currency } = req.body;
    
    // Default currency to USD if not specified
    if (!currency) currency = "USD";

    // RBAC: Sede can only add expenses to their own branch
    if (req.user.role === 'SEDE') {
        branch = req.user.branch;
    }

    // Server-side validation
    if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
        return res.status(400).json({ error: "Datos de gasto incompletos o inválidos." });
    }
    
    try {
        // Fetch active exchange rates
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } }) || { vesRate: 40.0, eurRate: 0.92 };
        
        let rate = 1.0;
        if (currency === "VES") rate = rates.vesRate;
        else if (currency === "EUR") rate = rates.eurRate;

        const amountUsd = parseFloat(amount) / rate;

        const allExpenses = await prisma.expense.findMany({ select: { id: true } });
        const nextIdNumber = allExpenses.reduce((max, curr) => {
            const parts = curr.id.split("-");
            if (parts.length === 2) {
                const num = parseInt(parts[1]);
                if (!isNaN(num)) return num > max ? num : max;
            }
            return max;
        }, 100) + 1;
        const newId = `EXP-${nextIdNumber}`;
        
        const newExpense = await prisma.expense.create({
            data: {
                id: newId,
                date,
                branch,
                category,
                description,
                amount: parseFloat(amount),
                currency,
                exchangeRate: rate,
                amountUsd,
                status
            }
        });
        
        res.status(201).json(newExpense);
    } catch (error) {
        console.error("Error creating expense:", error);
        res.status(500).json({ error: "Error interno del servidor al registrar el gasto." });
    }
});

// 3. Edit dynamic expense
app.put('/api/expenses/:id', authenticateJWT, async (req, res) => {
    const expenseId = req.params.id;
    let { date, branch, category, description, amount, status, currency } = req.body;
    
    try {
        const existingExpense = await prisma.expense.findUnique({ where: { id: expenseId } });
        if (!existingExpense) {
            return res.status(404).json({ error: "Gasto no encontrado." });
        }

        // RBAC Check
        if (req.user.role === 'SEDE') {
            if (existingExpense.branch !== req.user.branch) {
                return res.status(403).json({ error: "Acceso denegado. No puedes editar gastos de otras sedes." });
            }
            branch = req.user.branch; // Force self-branch
        }

        if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
            return res.status(400).json({ error: "Datos de edición incompletos o inválidos." });
        }

        if (!currency) currency = "USD";

        // Fetch active exchange rates
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } }) || { vesRate: 40.0, eurRate: 0.92 };
        
        let rate = 1.0;
        if (currency === "VES") rate = rates.vesRate;
        else if (currency === "EUR") rate = rates.eurRate;

        const amountUsd = parseFloat(amount) / rate;

        const updatedExpense = await prisma.expense.update({
            where: { id: expenseId },
            data: {
                date,
                branch,
                category,
                description,
                amount: parseFloat(amount),
                currency,
                exchangeRate: rate,
                amountUsd,
                status
            }
        });
        res.json(updatedExpense);
    } catch (error) {
        console.error("Error updating expense:", error);
        res.status(500).json({ error: "Error interno del servidor al actualizar el gasto." });
    }
});

// 4. Delete expense
app.delete('/api/expenses/:id', authenticateJWT, async (req, res) => {
    const expenseId = req.params.id;
    
    try {
        const existingExpense = await prisma.expense.findUnique({ where: { id: expenseId } });
        if (!existingExpense) {
            return res.status(404).json({ error: "Gasto no encontrado." });
        }

        // RBAC Check
        if (req.user.role === 'SEDE' && existingExpense.branch !== req.user.branch) {
            return res.status(403).json({ error: "Acceso denegado. No puedes eliminar gastos de otras sedes." });
        }

        await prisma.expense.delete({
            where: { id: expenseId }
        });
        res.json({ success: true, message: `Gasto ${expenseId} eliminado correctamente.` });
    } catch (error) {
        console.error("Error deleting expense:", error);
        res.status(500).json({ error: "Error interno del servidor al eliminar el gasto." });
    }
});

// 5. Add Branch (Admin only)
app.post('/api/settings/branches', authenticateJWT, requireAdmin, async (req, res) => {
    const { name } = req.body;
    
    if (!name || name.trim() === "") {
        return res.status(400).json({ error: "El nombre de la sede es obligatorio." });
    }
    
    const trimmedName = name.trim();
    
    try {
        const existing = await prisma.branch.findUnique({
            where: { name: trimmedName }
        });
        if (existing) {
            return res.status(400).json({ error: "La sede ya existe." });
        }
        
        await prisma.branch.create({
            data: { name: trimmedName }
        });
        
        const allBranches = await prisma.branch.findMany();
        res.status(201).json(allBranches.map(b => b.name));
    } catch (error) {
        console.error("Error creating branch:", error);
        res.status(500).json({ error: "Error interno del servidor al crear la sede." });
    }
});

// 6. Rename Branch (Cascade rename expenses - Admin only)
app.put('/api/settings/branches', authenticateJWT, requireAdmin, async (req, res) => {
    const { oldName, newName } = req.body;
    
    if (!oldName || !newName || newName.trim() === "") {
        return res.status(400).json({ error: "Faltan parámetros para renombrar." });
    }
    
    const trimmedNewName = newName.trim();
    
    try {
        const oldBranchExists = await prisma.branch.findUnique({ where: { name: oldName } });
        if (!oldBranchExists) {
            return res.status(404).json({ error: "Sede de origen no encontrada." });
        }
        
        if (oldName !== trimmedNewName) {
            const newBranchExists = await prisma.branch.findUnique({ where: { name: trimmedNewName } });
            if (newBranchExists) {
                return res.status(400).json({ error: "El nombre nuevo ya está registrado." });
            }
            
            await prisma.$transaction([
                prisma.branch.create({ data: { name: trimmedNewName } }),
                prisma.expense.updateMany({
                    where: { branch: oldName },
                    data: { branch: trimmedNewName }
                }),
                // Update associated users too
                prisma.user.updateMany({
                    where: { branch: oldName },
                    data: { branch: trimmedNewName }
                }),
                prisma.branch.delete({ where: { name: oldName } })
            ]);
        }
        
        const allBranches = await prisma.branch.findMany();
        const allExpenses = await prisma.expense.findMany();
        
        res.json({
            branches: allBranches.map(b => b.name),
            expenses: allExpenses
        });
    } catch (error) {
        console.error("Error renaming branch:", error);
        res.status(500).json({ error: "Error interno del servidor al renombrar la sede." });
    }
});

// 7. Delete Branch (Admin only)
app.delete('/api/settings/branches/:name', authenticateJWT, requireAdmin, async (req, res) => {
    const branchName = req.params.name;
    
    try {
        const branchExists = await prisma.branch.findUnique({ where: { name: branchName } });
        if (!branchExists) {
            return res.status(404).json({ error: "Sede no encontrada." });
        }
        
        // Integrity check: block if there are expenses associated
        const count = await prisma.expense.count({
            where: { branch: branchName }
        });
        if (count > 0) {
            return res.status(400).json({ error: `No se puede eliminar la sede porque tiene ${count} gastos asociados.` });
        }

        // Integrity check: check if there are users associated
        const userCount = await prisma.user.count({
            where: { branch: branchName }
        });
        if (userCount > 0) {
            return res.status(400).json({ error: `No se puede eliminar la sede porque tiene ${userCount} usuarios asociados.` });
        }
        
        await prisma.branch.delete({
            where: { name: branchName }
        });
        
        const allBranches = await prisma.branch.findMany();
        res.json(allBranches.map(b => b.name));
    } catch (error) {
        console.error("Error deleting branch:", error);
        res.status(500).json({ error: "Error interno del servidor al eliminar la sede." });
    }
});

// 8. Add Category (Admin only)
app.post('/api/settings/categories', authenticateJWT, requireAdmin, async (req, res) => {
    const { name } = req.body;
    
    if (!name || name.trim() === "") {
        return res.status(400).json({ error: "El nombre de la categoría es obligatorio." });
    }
    
    const trimmedName = name.trim();
    
    try {
        const existing = await prisma.category.findUnique({
            where: { name: trimmedName }
        });
        if (existing) {
            return res.status(400).json({ error: "La categoría ya existe." });
        }
        
        await prisma.category.create({
            data: { name: trimmedName }
        });
        
        const allCategories = await prisma.category.findMany();
        res.status(201).json(allCategories.map(c => c.name));
    } catch (error) {
        console.error("Error creating category:", error);
        res.status(500).json({ error: "Error interno del servidor al crear la categoría." });
    }
});

// 9. Rename Category (Cascade rename expenses - Admin only)
app.put('/api/settings/categories', authenticateJWT, requireAdmin, async (req, res) => {
    const { oldName, newName } = req.body;
    
    if (!oldName || !newName || newName.trim() === "") {
        return res.status(400).json({ error: "Faltan parámetros para renombrar." });
    }
    
    const trimmedNewName = newName.trim();
    
    try {
        const oldCategoryExists = await prisma.category.findUnique({ where: { name: oldName } });
        if (!oldCategoryExists) {
            return res.status(404).json({ error: "Categoría de origen no encontrada." });
        }
        
        if (oldName !== trimmedNewName) {
            const newCategoryExists = await prisma.category.findUnique({ where: { name: trimmedNewName } });
            if (newCategoryExists) {
                return res.status(400).json({ error: "El nombre nuevo ya está registrado." });
            }
            
            await prisma.$transaction([
                prisma.category.create({ data: { name: trimmedNewName } }),
                prisma.expense.updateMany({
                    where: { category: oldName },
                    data: { category: trimmedNewName }
                }),
                prisma.category.delete({ where: { name: oldName } })
            ]);
        }
        
        const allCategories = await prisma.category.findMany();
        const allExpenses = await prisma.expense.findMany();
        
        res.json({
            categories: allCategories.map(c => c.name),
            expenses: allExpenses
        });
    } catch (error) {
        console.error("Error renaming category:", error);
        res.status(500).json({ error: "Error interno del servidor al renombrar la categoría." });
    }
});

// 10. Delete Category (Admin only)
app.delete('/api/settings/categories/:name', authenticateJWT, requireAdmin, async (req, res) => {
    const catName = req.params.name;
    
    try {
        const categoryExists = await prisma.category.findUnique({ where: { name: catName } });
        if (!categoryExists) {
            return res.status(404).json({ error: "Categoría no encontrada." });
        }
        
        // Integrity check
        const count = await prisma.expense.count({
            where: { category: catName }
        });
        if (count > 0) {
            return res.status(400).json({ error: `No se puede eliminar la categoría porque tiene ${count} gastos asociados.` });
        }
        
        await prisma.category.delete({
            where: { name: catName }
        });
        
        const allCategories = await prisma.category.findMany();
        res.json(allCategories.map(c => c.name));
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ error: "Error interno del servidor al eliminar la categoría." });
    }
});

// Serve index.html as fallback for SPA routing if needed
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, async () => {
    console.log(`Servidor de Control de Gastos corriendo en: http://localhost:${PORT}`);
    try {
        await seedIfNeeded();
        console.log("Base de datos verificada e inicializada correctamente.");
    } catch (error) {
        console.error("Error al inicializar la base de datos:", error);
    }
});
