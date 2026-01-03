// ============================================================
// ARCHIVO: preload.js
// Bridge seguro entre el proceso principal y el renderer
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

// Exponer API segura al renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Configuración
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    updatePrinterMapping: (mappings) => ipcRenderer.invoke('update-printer-mapping', mappings),

    // Impresoras
    getPrinters: () => ipcRenderer.invoke('get-printers'),

    // Trabajos
    getStats: () => ipcRenderer.invoke('get-stats'),
    getJobs: () => ipcRenderer.invoke('get-jobs'),
    retryJob: (jobId) => ipcRenderer.invoke('retry-job', jobId),

    // Listeners para eventos del main process
    onJobsUpdate: (callback) => {
        ipcRenderer.on('jobs-update', (event, jobs) => callback(jobs));
    },

    onJobStatus: (callback) => {
        ipcRenderer.on('job-status', (event, data) => callback(data));
    },

    onConnectionStatus: (callback) => {
        ipcRenderer.on('connection-status', (event, isConnected) => callback(isConnected));
    },

    // Remover listeners
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('jobs-update');
        ipcRenderer.removeAllListeners('job-status');
        ipcRenderer.removeAllListeners('connection-status');
    }
});