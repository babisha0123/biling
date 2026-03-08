const router = {
    navigate: (view) => {
        // Highlight active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.innerText.toLowerCase().includes(view)) {
                item.classList.add('active');
            }
        });

        const container = document.getElementById('view-container');

        switch (view) {
            case 'dashboard':
                dashboard.render(container);
                break;
            case 'products':
                products.render(container);
                break;
            case 'customers':
                customers.render(container);
                break;
            case 'billing':
                billing.render(container);
                break;
            case 'warranty':
                warranty.render(container);
                break;
            case 'reports':
                reports.render(container);
                break;
            case 'settings':
                settings.render(container);
                break;
        }
    }
};

const utils = {
    showToast: (msg, type = 'success') => {
        const toast = document.getElementById('toast');
        toast.innerText = msg;
        toast.className = `toast-${type}`;
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    },

    formatCurrency: (val) => {
        return '₹' + parseFloat(val).toFixed(2);
    },

    showLoader: (state) => {
        const loader = document.getElementById('loading-overlay');
        if (loader) {
            loader.style.display = state ? 'flex' : 'none';
        }
    },


    // Promise-based Modal Helper
    showModal: ({ title, body, confirmText = 'Confirm', showCancel = true, isInput = false, defaultValue = '' }) => {
        return new Promise((resolve) => {
            const modal = document.getElementById('generic-modal');
            const titleEl = document.getElementById('modal-title');
            const bodyEl = document.getElementById('modal-body');
            const confirmBtn = document.getElementById('modal-confirm-btn');
            const cancelBtn = document.getElementById('modal-cancel-btn');

            titleEl.innerText = title;
            confirmBtn.innerText = confirmText;
            cancelBtn.style.display = showCancel ? 'block' : 'none';

            if (isInput) {
                bodyEl.innerHTML = `<input type="text" id="modal-input-val" value="${defaultValue}" style="margin-top:0;">`;
                setTimeout(() => document.getElementById('modal-input-val').focus(), 100);
            } else {
                bodyEl.innerHTML = body;
            }

            modal.style.display = 'flex';

            const handleConfirm = () => {
                const val = isInput ? document.getElementById('modal-input-val').value : true;
                cleanup();
                resolve(val);
            };

            const handleCancel = () => {
                cleanup();
                resolve(null);
            };

            const cleanup = () => {
                modal.style.display = 'none';
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
        });
    },

    numberToWords: (num) => {
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

        if (n >= 10000000) {
            str += inWords(Math.floor(n / 10000000)) + 'Crore ';
            n %= 10000000;
        }
        if (n >= 100000) {
            str += inWords(Math.floor(n / 100000)) + 'Lakh ';
            n %= 100000;
        }
        if (n >= 1000) {
            str += inWords(Math.floor(n / 1000)) + 'Thousand ';
            n %= 1000;
        }
        str += inWords(n);

        return str.trim() + ' Only';
    }
};


// Global dashboard object (placeholder until implemented)
const dashboard = {
    render: async (container) => {
        const stats = await window.api.dbQuery("SELECT COUNT(*) as count FROM products");
        const sales = await window.api.dbQuery("SELECT SUM(grandTotal) as total FROM bills WHERE date(createdAt) = date('now')");
        const lowStock = await window.api.dbQuery("SELECT COUNT(*) as count FROM products WHERE stock < 5");
        const customers = await window.api.dbQuery("SELECT COUNT(*) as count FROM customers");
        const recentBills = await window.api.dbQuery("SELECT b.*, c.name as customerName FROM bills b JOIN customers c ON b.customerId = c.id ORDER BY b.createdAt DESC LIMIT 5");

        container.innerHTML = `
            <div class="dash-cta">
                <div>
                    <h2>Welcome to PowerBill Pro</h2>
                    <p style="opacity: 0.8; margin-top: 0.5rem;">Manage your shop's billing and inventory with ease.</p>
                </div>
                <button class="btn" style="background: var(--primary); color: white; padding: 1rem 2rem; font-size: 1.1rem;" onclick="router.navigate('billing')">➕ Create New Invoice</button>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-title">Today's Sales</div>
                    <div class="stat-value">${utils.formatCurrency(sales[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Total Products</div>
                    <div class="stat-value">${stats[0]?.count || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Low Stock Alert</div>
                    <div class="stat-value" style="color: var(--danger)">${lowStock[0]?.count || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Total Customers</div>
                    <div class="stat-value">${customers[0]?.count || 0}</div>
                </div>
            </div>

            <div style="background: white; padding: 1.5rem; border-radius: 1rem; border: 1px solid var(--border);">
                <h3>Recent Invoices</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Invoice #</th>
                            <th>Customer</th>
                            <th>Total</th>
                            <th>Method</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentBills.map(b => `
                            <tr>
                                <td>${b.invoiceNumber}</td>
                                <td>${b.customerName}</td>
                                <td>${utils.formatCurrency(b.grandTotal)}</td>
                                <td>${b.paymentMode}</td>
                                <td>${new Date(b.createdAt).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                        ${recentBills.length === 0 ? '<tr><td colspan="5" style="text-align:center">No invoices yet</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;
    }
};

// Initialize after DOM load
window.addEventListener('DOMContentLoaded', () => {
    // Check for login state or just start with auth
});
