// ============================================================
// ARCHIVO: preload.js
// Bridge seguro entre el proceso principal y el renderer
// ============================================================
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded successfully');

// Exponer API segura al renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Configuración
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    testConnection: (config) => ipcRenderer.invoke('test-connection', config),
    clearConfig: () => ipcRenderer.invoke('clear-config'),
    updatePrinterMapping: (mappings) => ipcRenderer.invoke('update-printer-mapping', mappings),

    // Impresoras
    getPrinters: () => ipcRenderer.invoke('get-printers'),

    // Trabajos
    getStats: () => ipcRenderer.invoke('get-stats'),
    getJobs: () => ipcRenderer.invoke('get-jobs'),
    retryJob: (jobId) => ipcRenderer.invoke('retry-job', jobId),

    // Configuración de Inicio
    getStartupSettings: () => ipcRenderer.invoke('get-startup-settings'),
    setStartupSettings: (settings) => ipcRenderer.invoke('set-startup-settings', settings),

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

    onStatsUpdate: (callback) => {
        ipcRenderer.on('stats-update', (event, stats) => callback(stats));
    },

    // Remover listeners
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('jobs-update');
        ipcRenderer.removeAllListeners('job-status');
        ipcRenderer.removeAllListeners('connection-status');
    }
});