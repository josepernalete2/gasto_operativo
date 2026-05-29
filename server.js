require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

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

        if (expenseCount === 0) {
            console.log("Seeding default expenses...");
            await prisma.expense.createMany({
                data: DEFAULT_EXPENSES
            });
        }
    } catch (error) {
        console.error("Error during database seeding:", error);
    }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// 1. Get all database data
app.get('/api/data', async (req, res) => {
    try {
        const expenses = await prisma.expense.findMany();
        const dbBranches = await prisma.branch.findMany();
        const dbCategories = await prisma.category.findMany();

        res.json({
            expenses: expenses,
            branches: dbBranches.map(b => b.name),
            categories: dbCategories.map(c => c.name)
        });
    } catch (error) {
        console.error("Error fetching data from database:", error);
        res.status(500).json({ error: "Error al obtener datos de la base de datos." });
    }
});

// 2. Add dynamic expense
app.post('/api/expenses', async (req, res) => {
    const { date, branch, category, description, amount, status } = req.body;
    
    // Server-side validation
    if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
        return res.status(400).json({ error: "Datos de gasto incompletos o inválidos." });
    }
    
    try {
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
app.put('/api/expenses/:id', async (req, res) => {
    const expenseId = req.params.id;
    const { date, branch, category, description, amount, status } = req.body;
    
    if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
        return res.status(400).json({ error: "Datos de edición incompletos o inválidos." });
    }
    
    try {
        const updatedExpense = await prisma.expense.update({
            where: { id: expenseId },
            data: {
                date,
                branch,
                category,
                description,
                amount: parseFloat(amount),
                status
            }
        });
        res.json(updatedExpense);
    } catch (error) {
        console.error("Error updating expense:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Gasto no encontrado." });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar el gasto." });
    }
});

// 4. Delete expense
app.delete('/api/expenses/:id', async (req, res) => {
    const expenseId = req.params.id;
    
    try {
        await prisma.expense.delete({
            where: { id: expenseId }
        });
        res.json({ success: true, message: `Gasto ${expenseId} eliminado correctamente.` });
    } catch (error) {
        console.error("Error deleting expense:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Gasto no encontrado." });
        }
        res.status(500).json({ error: "Error interno del servidor al eliminar el gasto." });
    }
});

// 5. Add Branch
app.post('/api/settings/branches', async (req, res) => {
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

// 6. Rename Branch (Cascade rename expenses)
app.put('/api/settings/branches', async (req, res) => {
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

// 7. Delete Branch
app.delete('/api/settings/branches/:name', async (req, res) => {
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

// 8. Add Category
app.post('/api/settings/categories', async (req, res) => {
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

// 9. Rename Category (Cascade rename expenses)
app.put('/api/settings/categories', async (req, res) => {
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

// 10. Delete Category
app.delete('/api/settings/categories/:name', async (req, res) => {
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
