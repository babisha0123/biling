const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database/db');
const { exportSalesReportToExcel } = require('./main/reports');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // Uncomment for debugging
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Database
ipcMain.handle('db-query', async (event, { sql, params, type = 'all' }) => {
    return new Promise((resolve, reject) => {
        if (type === 'run') {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        } else if (type === 'get') {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        } else {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }
    });
});

// High-level Save Bill IPC
ipcMain.handle("save-bill", async (event, data) => {
    try {
        const result = await saveBill(data);
        return result;
    } catch (error) {
        console.error("IPC Save Bill Error:", error);
        throw error;
    }
});

// Professional Printing IPC
ipcMain.handle('print-invoice', async (event, data) => {
    try {
        let html;
        if (typeof data === 'string') {
            html = data;
        } else {
            // 1. Get Selected Format
            const setting = await getQuery("SELECT value FROM settings WHERE key = 'invoiceFormat'");
            const format = setting ? setting.value : 'Traditional';
            const templateFile = format === 'Modern' ? 'invoice_modern.html' : 'invoice_traditional.html';

            // 2. Load Template
            const fs = require('fs');
            html = fs.readFileSync(path.join(__dirname, templateFile), 'utf8');

            // 3. Populate Data (Simple Placeholder Replacement)
            const safeNum = (val) => {
                const num = parseFloat(val);
                return isNaN(num) ? 0 : num;
            };

            const placeholders = {
                '{{invoiceNumber}}': data.invoiceNumber || 'N/A',
                '{{date}}': new Date().toLocaleDateString(),
                '{{customerName}}': data.customerName || 'N/A',
                '{{customerAddress}}': data.customerAddress || 'N/A',
                '{{customerPhone}}': data.customerPhone || 'N/A',
                '{{customerGst}}': data.customerGst || '',
                '{{totalTaxable}}': safeNum(data.totalAmount).toFixed(2),
                '{{discountPercent}}': safeNum(data.discountPercent).toFixed(2),
                '{{discountAmount}}': safeNum(data.discountAmount).toFixed(2),
                '{{netTaxable}}': safeNum(data.netTaxable).toFixed(2),
                '{{cgst}}': (safeNum(data.gstAmount) / 2).toFixed(2),
                '{{sgst}}': (safeNum(data.gstAmount) / 2).toFixed(2),
                '{{grandTotal}}': safeNum(data.grandTotal).toFixed(2),
                '{{paymentMode}}': data.paymentMode || 'Cash',
                '{{amountInWords}}': numberToWordsIndian(safeNum(data.grandTotal))
            };

            for (let [key, val] of Object.entries(placeholders)) {
                html = html.split(key).join(val);
            }

            // Handle Items Loop
            const itemRowMatch = html.match(/{{#each items}}([\s\S]*?){{\/each}}/);
            if (itemRowMatch && data.items) {
                const rowTemplate = itemRowMatch[1];
                const itemsHtml = data.items.map((item, idx) => {
                    let row = rowTemplate;
                    const itemData = {
                        '{{index}}': idx + 1,
                        '{{name}}': item.name || 'Product',
                        '{{hsn}}': item.hsn || 'N/A',
                        '{{qty}}': item.quantity || 0,
                        '{{price}}': safeNum(item.price).toFixed(2),
                        '{{taxable}}': (safeNum(item.price) * safeNum(item.quantity)).toFixed(2),
                        '{{cgst}}': (safeNum(item.gst) / 2).toFixed(2),
                        '{{sgst}}': (safeNum(item.gst) / 2).toFixed(2),
                        '{{total}}': safeNum(item.total).toFixed(2)
                    };
                    for (let [ik, iv] of Object.entries(itemData)) {
                        row = row.split(ik).join(iv);
                    }
                    return row;
                }).join('');
                html = html.replace(itemRowMatch[0], itemsHtml);
            }

            // Handle Conditionals
            html = html.replace(/{{#if customerGst}}([\s\S]*?){{\/if}}/, data.customerGst ? '$1' : '');
            html = html.replace(/{{#if discount}}([\s\S]*?){{\/if}}/, (data.discount || 0) > 0 ? '$1' : '');
        }

        let printWindow = new BrowserWindow({ show: false });
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({
                silent: false,
                printBackground: true
            }, (success) => {
                printWindow.close();
            });
        });
        return { success: true };
    } catch (error) {
        console.error("Print IPC Error:", error);
        throw error;
    }
});

function numberToWordsIndian(num) {
    if (num === 0) return 'Zero Only';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const inWords = (n) => {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
        return '';
    };
    let n = Math.floor(num);
    let str = '';
    if (n >= 10000000) { str += inWords(Math.floor(n / 10000000)) + 'Crore '; n %= 10000000; }
    if (n >= 100000) { str += inWords(Math.floor(n / 100000)) + 'Lakh '; n %= 100000; }
    if (n >= 1000) { str += inWords(Math.floor(n / 1000)) + 'Thousand '; n %= 1000; }
    str += inWords(n);
    return str.trim() + ' Only';
}

/**
 * Core Bill Saving Logic (Main Process)
 */
let isSaving = false;
async function saveBill(data) {
    if (isSaving) {
        throw new Error("A save operation is already in progress. Please wait.");
    }
    isSaving = true;

    return new Promise((resolve, reject) => {
        db.serialize(async () => {
            try {
                await runQuery("BEGIN TRANSACTION");

                // 1. Generate Unique Invoice Number
                const invoiceNumber = await generateInvoiceNumber();

                // 2. Insert Bill
                const billRes = await runQuery(
                    `INSERT INTO bills (invoiceNumber, customerId, totalAmount, discountPercent, discountAmount, netTaxable, gstAmount, exchangeValue, grandTotal, paymentMode) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        invoiceNumber,
                        data.customerId,
                        data.totalAmount,
                        data.discountPercent,
                        data.discountAmount,
                        data.netTaxable,
                        data.gstAmount,
                        data.exchangeValue,
                        data.grandTotal,
                        data.paymentMode
                    ]
                );
                const billId = billRes.id;

                // 2. Process Items
                for (let item of data.items) {
                    const product = await getQuery("SELECT stock, name, category, warrantyMonths, hsnCode FROM products WHERE id = ?", [item.productId]);

                    if (!product) throw new Error(`Product not found: ${item.name || item.productId}`);
                    if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

                    // Calculate CGST / SGST (50/50 split)
                    const totalGst = item.gst || 0;
                    const cgst = totalGst / 2;
                    const sgst = totalGst / 2;

                    // Insert Item
                    await runQuery(
                        `INSERT INTO bill_items (billId, productId, quantity, price, gstAmount, cgstAmount, sgstAmount, totalGstAmount, total) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [billId, item.productId, item.quantity, item.price, totalGst, cgst, sgst, totalGst, item.total]
                    );

                    // Update Stock
                    await runQuery("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.productId]);

                    // Warranty
                    if (product.warrantyMonths > 0) {
                        const expiryDate = new Date();
                        expiryDate.setMonth(expiryDate.getMonth() + product.warrantyMonths);

                        await runQuery(
                            `INSERT INTO warranties 
                             (productId, customerId, billId, serialNumber, saleDate, warrantyMonths, expiryDate, status)
                             VALUES (?, ?, ?, ?, datetime('now'), ?, ?, 'Active')`,
                            [item.productId, data.customerId, billId, item.serialNumber || ('SN-' + Math.random().toString(36).substring(7).toUpperCase()), product.warrantyMonths, expiryDate.toISOString()]
                        );
                    }
                }

                await runQuery("COMMIT");
                resolve({ success: true, billId, invoiceNumber });

            } catch (error) {
                await runQuery("ROLLBACK");
                reject(error);
            } finally {
                isSaving = false;
            }
        });
    });
}

// Helper Wrappers for main process DB access
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

/**
 * Generate Next Unique Invoice Number
 */
async function generateInvoiceNumber() {
    let nextNum = 1;
    const lastInvoice = await getQuery("SELECT invoiceNumber FROM bills ORDER BY id DESC LIMIT 1");

    if (lastInvoice && lastInvoice.invoiceNumber) {
        const lastPart = parseInt(lastInvoice.invoiceNumber.split('-')[1]);
        if (!isNaN(lastPart)) nextNum = lastPart + 1;
    }

    let invoiceNumber = 'INV-' + nextNum.toString().padStart(4, '0');

    // Safety check: ensure it doesn't already exist (handles gaps/deletions/manual edits)
    let exists = await getQuery("SELECT 1 FROM bills WHERE invoiceNumber = ?", [invoiceNumber]);
    while (exists) {
        nextNum++;
        invoiceNumber = 'INV-' + nextNum.toString().padStart(4, '0');
        exists = await getQuery("SELECT 1 FROM bills WHERE invoiceNumber = ?", [invoiceNumber]);
    }

    return invoiceNumber;
}

async function generateHTMLFromBillId(billId) {
    // This would fetch bill details and return the template. 
    // For now, we'll assume the renderer generates and passes the HTML as it did before, 
    // or we can implement a basic fetch here if needed.
    // The user's request says: await ipcRenderer.invoke("print-invoice", result.billId);
    // Which implies the main process should handle the template generation if it's separate.
    // However, the previous print-invoice took htmlContent. 
    // I will implement a minimal version to avoid breaking things.
    return "<h1>Invoice Details</h1><p>Invoice ID: " + billId + "</p><p>Please note: Full template implementation in main process is pending.</p>";
}

// Excel Export IPC
ipcMain.handle("export-sales-excel", async (event, reportData) => {
    try {
        return await exportSalesReportToExcel(reportData);
    } catch (error) {
        console.error("Excel Export IPC Error:", error);
        throw error;
    }
});


