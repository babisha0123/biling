const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    dbQuery: (sql, params, type) => ipcRenderer.invoke('db-query', { sql, params, type }),
    print: () => window.print(),
    printInvoice: (data) => ipcRenderer.invoke('print-invoice', data),
    saveBill: (data) => ipcRenderer.invoke('save-bill', data),
    exportExcel: (data) => ipcRenderer.invoke('export-sales-excel', data)
});
