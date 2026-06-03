require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gastoscorp-super-secret-key-2026';

// Middleware to authenticate JWT tokens
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Acceso denegado. Se requiere iniciar sesión." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Sesión inválida o expirada." });
        }
        req.user = user;
        next();
    });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serves index.html, styles.css, app.js directly

// Seed Data
const DEFAULT_BRANCHES = ["Sede Norte", "Sede Sur", "Sede Este", "Sede Oeste"];
const DEFAULT_CATEGORIES = ["Servicios", "Nómina", "Proveedores", "Mantenimiento", "Tecnología", "Marketing"];

// Helper to fetch rates from external APIs (DolarApi & CriptoYa)
async function fetchVenezuelaRates() {
    try {
        console.log("Fetching live rates from external APIs...");
        // Fetch Dollar BCV (oficial) and Parallel
        const dollarsRes = await fetch('https://ve.dolarapi.com/v1/dolares');
        const dollars = await dollarsRes.json();
        
        // Fetch Euro BCV
        const eurosRes = await fetch('https://ve.dolarapi.com/v1/euros');
        const euros = await eurosRes.json();
        
        // Fetch USDT from CriptoYa (Binance P2P)
        const usdtRes = await fetch('https://criptoya.com/api/binancep2p/USDT/VES/1');
        const usdtData = await usdtRes.json();
        
        // Parse results
        const bcv = dollars.find(d => d.fuente === 'oficial')?.promedio || 40.0;
        const paralelo = dollars.find(d => d.fuente === 'paralelo')?.promedio || 40.0;
        const euro = euros.find(e => e.fuente === 'oficial')?.promedio || 45.0;
        const usdt = usdtData?.ask || 40.0;
        
        console.log(`Live rates: BCV=${bcv}, Parallel=${paralelo}, Euro=${euro}, USDT=${usdt}`);
        
        const rates = await prisma.exchangeRate.upsert({
            where: { id: "latest" },
            update: { bcv, paralelo, euro, usdt },
            create: { id: "latest", bcv, paralelo, euro, usdt }
        });
        
        return rates;
    } catch (error) {
        console.error("Error fetching rates from external APIs:", error);
        // Fallback to database
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } });
        return rates || { bcv: 40.0, paralelo: 40.0, euro: 45.0, usdt: 40.0 };
    }
}

// Automatically generate recurring expenses for the current month if not yet generated
async function generateRecurringExpenses() {
    try {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
        const currentDay = today.getDate();
        
        const templates = await prisma.recurringPayment.findMany();
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } }) || { bcv: 40.0 };
        const monthPrefix = `${currentYear}-${currentMonth}`;

        for (const template of templates) {
            if (currentDay >= template.dayOfMonth) {
                const scheduledDayStr = String(template.dayOfMonth).padStart(2, '0');
                const scheduledDate = `${monthPrefix}-${scheduledDayStr}`;

                const existing = await prisma.expense.findFirst({
                    where: {
                        description: template.description,
                        category: template.category,
                        date: {
                            startsWith: monthPrefix
                        }
                    }
                });

                if (!existing) {
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

                    const amountUsd = template.amount;
                    const amountVes = amountUsd * rates.bcv;

                    await prisma.expense.create({
                        data: {
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
                        }
                    });
                    console.log(`Auto-generated recurring expense: ${template.description} (${newId})`);
                }
            }
        }
    } catch (error) {
        console.error("Error auto-generating recurring expenses:", error);
    }
}

// Seeding function
async function seedIfNeeded() {
    try {
        const branchCount = await prisma.branch.count();
        const categoryCount = await prisma.category.count();
        const rateCount = await prisma.exchangeRate.count();
        const templateCount = await prisma.recurringPayment.count();

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

        if (rateCount === 0) {
            console.log("Seeding default exchange rates...");
            await fetchVenezuelaRates();
        }

        if (templateCount === 0) {
            console.log("Seeding default recurring templates...");
            await prisma.recurringPayment.create({
                data: {
                    id: "default-condominio",
                    description: "Pago de Condominio - Mensualidad",
                    dayOfMonth: 5,
                    amount: 120.00,
                    branch: "Sede Norte",
                    category: "Servicios"
                }
            });
        }

        const userCount = await prisma.user.count();
        if (userCount === 0) {
            console.log("Seeding default administrator user...");
            const hashedPassword = await bcrypt.hash("admin 123", 10);
            await prisma.user.create({
                data: {
                    username: "admin",
                    password: hashedPassword,
                    name: "Administrador",
                    role: "admin"
                }
            });
        }
    } catch (error) {
        console.error("Error during database seeding:", error);
    }
}

// ============================================================================
// EXCHANGE RATE ENDPOINTS (PUBLIC)
// ============================================================================

// Get Exchange Rates
app.get('/api/settings/rates', async (req, res) => {
    try {
        const rates = await fetchVenezuelaRates();
        res.json(rates);
    } catch (error) {
        console.error("Error getting exchange rates:", error);
        res.status(500).json({ error: "Error al obtener las tasas de cambio." });
    }
});

// Update Exchange Rates manually
app.put('/api/settings/rates', async (req, res) => {
    const { bcv, paralelo, euro, usdt } = req.body;
    
    if (isNaN(bcv) || bcv <= 0 || isNaN(paralelo) || paralelo <= 0 || isNaN(euro) || euro <= 0 || isNaN(usdt) || usdt <= 0) {
        return res.status(400).json({ error: "Tasas de cambio inválidas. Deben ser mayores a cero." });
    }

    try {
        const rates = await prisma.exchangeRate.upsert({
            where: { id: "latest" },
            update: {
                bcv: parseFloat(bcv),
                paralelo: parseFloat(paralelo),
                euro: parseFloat(euro),
                usdt: parseFloat(usdt)
            },
            create: {
                id: "latest",
                bcv: parseFloat(bcv),
                paralelo: parseFloat(paralelo),
                euro: parseFloat(euro),
                usdt: parseFloat(usdt)
            }
        });
        res.json(rates);
    } catch (error) {
        console.error("Error updating exchange rates:", error);
        res.status(500).json({ error: "Error al actualizar las tasas de cambio." });
    }
});

// ============================================================================
// BACKUP & RESTORE ENDPOINTS (PUBLIC)
// ============================================================================

// Get complete database backup
app.get('/api/backup', async (req, res) => {
    try {
        const expenses = await prisma.expense.findMany();
        const dbBranches = await prisma.branch.findMany();
        const dbCategories = await prisma.category.findMany();
        const dbRecurring = await prisma.recurringPayment.findMany();
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } });

        res.json({
            version: "1.2",
            exportedAt: new Date().toISOString(),
            expenses: expenses,
            branches: dbBranches.map(b => b.name),
            categories: dbCategories.map(c => c.name),
            recurring: dbRecurring,
            rates: rates || { bcv: 40.0, paralelo: 40.0, euro: 45.0, usdt: 40.0 }
        });
    } catch (error) {
        console.error("Error creating backup:", error);
        res.status(500).json({ error: "Error al generar la copia de seguridad." });
    }
});

// Restore database from backup
app.post('/api/backup/restore', async (req, res) => {
    const { expenses, branches, categories, rates, recurring } = req.body;

    if (!Array.isArray(expenses) || !Array.isArray(branches) || !Array.isArray(categories)) {
        return res.status(400).json({ error: "Estructura del archivo de respaldo inválida o incompleta." });
    }

    try {
        await prisma.$transaction([
            // 1. Delete all current data
            prisma.expense.deleteMany(),
            prisma.branch.deleteMany(),
            prisma.category.deleteMany(),
            prisma.exchangeRate.deleteMany(),
            prisma.recurringPayment.deleteMany(),

            // 2. Insert branches
            prisma.branch.createMany({
                data: branches.map(name => ({ name: name.trim() }))
            }),

            // 3. Insert categories
            prisma.category.createMany({
                data: categories.map(name => ({ name: name.trim() }))
            }),

            // 4. Insert exchange rates
            prisma.exchangeRate.create({
                data: {
                    id: "latest",
                    bcv: parseFloat(rates?.bcv || 40.0),
                    paralelo: parseFloat(rates?.paralelo || 40.0),
                    euro: parseFloat(rates?.euro || 45.0),
                    usdt: parseFloat(rates?.usdt || 40.0)
                }
            }),

            // 5. Insert recurring payments (if present in backup)
            ...(recurring && Array.isArray(recurring) && recurring.length > 0 ? [
                prisma.recurringPayment.createMany({
                    data: recurring.map(r => ({
                        id: r.id,
                        description: r.description.trim(),
                        dayOfMonth: parseInt(r.dayOfMonth),
                        amount: parseFloat(r.amount),
                        branch: r.branch.trim(),
                        category: r.category.trim()
                    }))
                })
            ] : []),

            // 6. Insert expenses (only if there are expenses in the backup)
            ...(expenses.length > 0 ? [
                prisma.expense.createMany({
                    data: expenses.map(e => ({
                        id: e.id,
                        date: e.date,
                        branch: e.branch,
                        category: e.category,
                        description: e.description,
                        amount: parseFloat(e.amount),
                        currency: e.currency || "USD",
                        exchangeRate: parseFloat(e.exchangeRate || 1.0),
                        amountUsd: parseFloat(e.amountUsd || e.amount),
                        amountVes: parseFloat(e.amountVes || e.amount),
                        status: e.status
                    }))
                })
            ] : [])
        ]);

        // Fetch restored data to return to client
        const updatedExpenses = await prisma.expense.findMany();
        const updatedBranches = await prisma.branch.findMany();
        const updatedCategories = await prisma.category.findMany();
        const updatedRates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } });
        const updatedRecurring = await prisma.recurringPayment.findMany();

        res.json({
            expenses: updatedExpenses,
            branches: updatedBranches.map(b => b.name),
            categories: updatedCategories.map(c => c.name),
            rates: updatedRates,
            recurring: updatedRecurring
        });
    } catch (error) {
        console.error("Error restoring database from backup:", error);
        res.status(500).json({ error: "Error al restaurar los datos en el servidor." });
    }
});

// ============================================================================
// API ENDPOINTS (PUBLIC - NO AUTH REQUIRED)
// ============================================================================

// 1. Get all database data
app.get('/api/data', async (req, res) => {
    try {
        await generateRecurringExpenses();
        const expenses = await prisma.expense.findMany();
        const dbBranches = await prisma.branch.findMany();
        const dbCategories = await prisma.category.findMany();
        const dbRecurring = await prisma.recurringPayment.findMany();

        res.json({
            expenses: expenses,
            branches: dbBranches.map(b => b.name),
            categories: dbCategories.map(c => c.name),
            recurring: dbRecurring
        });
    } catch (error) {
        console.error("Error fetching data from database:", error);
        res.status(500).json({ error: "Error al obtener datos de la base de datos." });
    }
});

// 2. Add dynamic expense
app.post('/api/expenses', async (req, res) => {
    let { date, branch, category, description, amount, status, currency } = req.body;
    
    if (!currency) currency = "USD";

    // Server-side validation
    if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
        return res.status(400).json({ error: "Datos de gasto incompletos o inválidos." });
    }
    
    try {
        // Fetch active exchange rates
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } }) || { bcv: 40.0 };
        
        let amountUsd = 0.0;
        let amountVes = 0.0;
        let rate = 1.0;

        if (currency === "VES") {
            rate = rates.bcv;
            amountVes = parseFloat(amount);
            amountUsd = amountVes / rates.bcv;
        } else {
            // USD
            rate = 1.0;
            amountUsd = parseFloat(amount);
            amountVes = amountUsd * rates.bcv;
        }

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
                amountVes,
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
    let { date, branch, category, description, amount, status, currency } = req.body;
    
    if (!date || !branch || !category || !description || isNaN(amount) || amount <= 0 || !status) {
        return res.status(400).json({ error: "Datos de edición incompletos o inválidos." });
    }

    if (!currency) currency = "USD";
    
    try {
        const existingExpense = await prisma.expense.findUnique({ where: { id: expenseId } });
        if (!existingExpense) {
            return res.status(404).json({ error: "Gasto no encontrado." });
        }

        // Fetch active exchange rates
        const rates = await prisma.exchangeRate.findUnique({ where: { id: "latest" } }) || { bcv: 40.0 };
        
        let amountUsd = 0.0;
        let amountVes = 0.0;
        let rate = 1.0;

        if (currency === "VES") {
            rate = rates.bcv;
            amountVes = parseFloat(amount);
            amountUsd = amountVes / rates.bcv;
        } else {
            // USD
            rate = 1.0;
            amountUsd = parseFloat(amount);
            amountVes = amountUsd * rates.bcv;
        }

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
                amountVes,
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
app.delete('/api/expenses/:id', async (req, res) => {
    const expenseId = req.params.id;
    
    try {
        const existingExpense = await prisma.expense.findUnique({ where: { id: expenseId } });
        if (!existingExpense) {
            return res.status(404).json({ error: "Gasto no encontrado." });
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

// ============================================================================
// RECURRING PAYMENTS CONFIGURATION ENDPOINTS
// ============================================================================

// Get all recurring payments
app.get('/api/settings/recurring', async (req, res) => {
    try {
        const templates = await prisma.recurringPayment.findMany();
        res.json(templates);
    } catch (error) {
        console.error("Error fetching recurring payments:", error);
        res.status(500).json({ error: "Error al obtener las mensualidades programadas." });
    }
});

// Create recurring payment
app.post('/api/settings/recurring', async (req, res) => {
    const { description, dayOfMonth, amount, branch, category } = req.body;

    if (!description || !dayOfMonth || isNaN(amount) || amount <= 0 || !branch || !category) {
        return res.status(400).json({ error: "Datos de mensualidad incompletos o inválidos." });
    }

    try {
        await prisma.recurringPayment.create({
            data: {
                description: description.trim(),
                dayOfMonth: parseInt(dayOfMonth),
                amount: parseFloat(amount),
                branch: branch.trim(),
                category: category.trim()
            }
        });

        // Run auto-generation check immediately
        await generateRecurringExpenses();

        const allTemplates = await prisma.recurringPayment.findMany();
        res.status(201).json(allTemplates);
    } catch (error) {
        console.error("Error creating recurring payment:", error);
        res.status(500).json({ error: "Error interno al programar la mensualidad." });
    }
});

// Delete recurring payment
app.delete('/api/settings/recurring/:id', async (req, res) => {
    const templateId = req.params.id;

    try {
        const existing = await prisma.recurringPayment.findUnique({ where: { id: templateId } });
        if (!existing) {
            return res.status(404).json({ error: "Mensualidad programada no encontrada." });
        }

        await prisma.recurringPayment.delete({ where: { id: templateId } });
        
        const allTemplates = await prisma.recurringPayment.findMany();
        res.json(allTemplates);
    } catch (error) {
        console.error("Error deleting recurring payment:", error);
        res.status(500).json({ error: "Error interno al eliminar la mensualidad programada." });
    }
});

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

// User login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Usuario y contraseña requeridos." });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { username: username.trim().toLowerCase() }
        });

        if (!user) {
            return res.status(401).json({ error: "Nombre de usuario o contraseña incorrectos." });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Nombre de usuario o contraseña incorrectos." });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Error en el servidor al iniciar sesión." });
    }
});

// Verify current session
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }
        res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
    } catch (error) {
        console.error("Auth me error:", error);
        res.status(500).json({ error: "Error en el servidor al verificar sesión." });
    }
});

// ============================================================================
// USER MANAGEMENT SETTINGS ENDPOINTS
// ============================================================================

// Get list of all users
app.get('/api/settings/users', authenticateToken, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, username: true, name: true, role: true }
        });
        res.json(users);
    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({ error: "Error al obtener usuarios." });
    }
});

// Create new user
app.post('/api/settings/users', authenticateToken, async (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
        return res.status(400).json({ error: "Todos los campos son obligatorios." });
    }

    const cleanUsername = username.trim().toLowerCase();

    try {
        const existing = await prisma.user.findUnique({
            where: { username: cleanUsername }
        });
        if (existing) {
            return res.status(400).json({ error: "El nombre de usuario ya está registrado." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                username: cleanUsername,
                password: hashedPassword,
                name: name.trim(),
                role: "admin"
            }
        });

        const allUsers = await prisma.user.findMany({
            select: { id: true, username: true, name: true, role: true }
        });
        res.status(201).json(allUsers);
    } catch (error) {
        console.error("Create user error:", error);
        res.status(500).json({ error: "Error al registrar el usuario." });
    }
});

// Update own profile credentials
app.put('/api/settings/users/profile', authenticateToken, async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || username.trim() === "") {
        return res.status(400).json({ error: "El nombre de usuario es requerido." });
    }

    const cleanUsername = username.trim().toLowerCase();

    try {
        // Check if username is taken by another user
        const existing = await prisma.user.findUnique({
            where: { username: cleanUsername }
        });

        if (existing && existing.id !== req.user.id) {
            return res.status(400).json({ error: "El nombre de usuario ya está en uso." });
        }

        const updateData = { username: cleanUsername };
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData
        });

        // Generate a new token with updated username
        const token = jwt.sign(
            { id: updatedUser.id, username: updatedUser.username, name: updatedUser.name, role: updatedUser.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: { id: updatedUser.id, username: updatedUser.username, name: updatedUser.name, role: updatedUser.role }
        });
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: "Error al actualizar el perfil." });
    }
});

// Delete user
app.delete('/api/settings/users/:id', authenticateToken, async (req, res) => {
    const deleteId = req.params.id;

    if (deleteId === req.user.id) {
        return res.status(400).json({ error: "No puedes eliminar tu propio usuario." });
    }

    try {
        const existing = await prisma.user.findUnique({ where: { id: deleteId } });
        if (!existing) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }

        await prisma.user.delete({ where: { id: deleteId } });

        const allUsers = await prisma.user.findMany({
            select: { id: true, username: true, name: true, role: true }
        });
        res.json(allUsers);
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ error: "Error al eliminar el usuario." });
    }
});

// Fallback for API routes (returns JSON)
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: "Ruta de API no encontrada." });
});

// Serve index.html as fallback for SPA routing if needed (non-api routes)
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
