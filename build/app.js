// ============================================================
// PrintStation - Dashboard Application
// ============================================================

// State Management
const state = {
    config: null,
    printers: [],
    jobs: [],
    stats: {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
    },
    isConnected: false
};

// ============================================================
// DOM Elements
// ============================================================
const elements = {
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    contentSections: document.querySelectorAll('.content-section'),

    // Connection Status
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.getElementById('statusText'),
    configStatus: document.getElementById('configStatus'),

    // Stats
    statPending: document.getElementById('stat-pending'),
    statProcessing: document.getElementById('stat-processing'),
    statCompleted: document.getElementById('stat-completed'),
    statFailed: document.getElementById('stat-failed'),

    // Jobs
    recentJobsList: document.getElementById('recentJobsList'),
    allJobsList: document.getElementById('allJobsList'),
    refreshJobsBtn: document.getElementById('refreshJobsBtn'),

    // Printers
    printersList: document.getElementById('printersList'),
    refreshPrintersBtn: document.getElementById('refreshPrintersBtn'),
    saveMappingsBtn: document.getElementById('saveMappingsBtn'),

    // Config Form
    configForm: document.getElementById('configForm'),
    clientIdInput: document.getElementById('clientId'),
    apiUrlInput: document.getElementById('apiUrl'),
    apiKeyInput: document.getElementById('apiKey'),
    saveConfigBtn: document.getElementById('saveConfigBtn'),
    testConnectionBtn: document.getElementById('testConnectionBtn'),

    // Toast
    toastContainer: document.getElementById('toastContainer'),

    // Startup Settings
    openAtLoginInput: document.getElementById('openAtLogin'),
    openAsHiddenInput: document.getElementById('openAsHidden'),

    // Factory Reset
    clearConfigBtn: document.getElementById('clearConfigBtn')
};

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🖨️ PrintStation Dashboard Initialized');

    // Setup navigation
    setupNavigation();

    // Setup event listeners
    setupEventListeners();

    // Load initial data
    const config = await loadConfig(); // Modified to return config

    // STARTUP REDIRECTION LOGIC
    if (!config || !config.apiUrl) {
        console.log('No configuration found. Redirecting to Config...');
        showSection('config');
        showToast('Por favor configura la aplicación primero', 'info');
    } else {
        // Default to dashboard
        showSection('dashboard');

        // Continue loading data
        await loadStartupSettings();
        await loadPrinters();
        await loadStats();
        await loadJobs();
    }

    // Setup IPC listeners
    setupIPCListeners();
});

// ============================================================
// Navigation
// ============================================================
// ============================================================
// Navigation
// ============================================================
function showSection(sectionId) {
    // Update active nav item
    elements.navItems.forEach(nav => {
        if (nav.dataset.section === sectionId) {
            nav.classList.add('active');
        } else {
            nav.classList.remove('active');
        }
    });

    // Show corresponding section
    elements.contentSections.forEach(section => {
        section.classList.remove('active');
    });
    const targetSection = document.getElementById(`section-${sectionId}`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
}

function setupNavigation() {
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;
            showSection(sectionId);
        });
    });
}

// ============================================================
// Event Listeners
// ============================================================
function setupEventListeners() {
    // Config Form
    elements.configForm.addEventListener('submit', handleConfigSubmit);
    if (elements.testConnectionBtn) {
        elements.testConnectionBtn.addEventListener('click', handleTestConnection);
    }

    if (elements.clearConfigBtn) {
        elements.clearConfigBtn.addEventListener('click', handleClearConfig);
    }

    // Printers
    elements.refreshPrintersBtn.addEventListener('click', loadPrinters);
    elements.saveMappingsBtn.addEventListener('click', handleSaveMappings);

    // Jobs
    elements.refreshJobsBtn.addEventListener('click', loadJobs);

    // Startup Settings
    if (elements.openAtLoginInput) {
        elements.openAtLoginInput.addEventListener('change', handleStartupSettingChange);
    }
    if (elements.openAsHiddenInput) {
        elements.openAsHiddenInput.addEventListener('change', handleStartupSettingChange);
    }
}

// ============================================================
// IPC Listeners (from main process)
// ============================================================
function setupIPCListeners() {
    if (!window.electronAPI) {
        console.warn('electronAPI not available - running in browser mode');
        return;
    }

    // Jobs update
    window.electronAPI.onJobsUpdate((jobs) => {
        console.log('Jobs updated:', jobs.length);
        state.jobs = jobs;
        renderJobs();
        updateStats();
    });

    // Job status update
    window.electronAPI.onJobStatus((data) => {
        console.log('Job status:', data);
        updateJobStatus(data);
    });

    // Connection status
    window.electronAPI.onConnectionStatus((isConnected) => {
        updateConnectionStatus(isConnected);
    });

    // Stats update from main process
    if (window.electronAPI.onStatsUpdate) {
        window.electronAPI.onStatsUpdate((stats) => {
            console.log('Stats updated:', stats);
            state.stats = stats;
            updateStatsDisplay();
        });
    }
}

// ============================================================
// Configuration
// ============================================================
async function loadConfig() {
    try {
        if (!window.electronAPI) return null;

        const config = await window.electronAPI.getConfig();
        state.config = config;

        if (config) {
            elements.clientIdInput.value = config.clientId || '';
            elements.apiUrlInput.value = config.apiUrl || '';
            elements.apiKeyInput.value = config.apiKey || '';

            updateConfigStatus(true);
            updateConnectionStatus(!!config.token);

            // Render dynamic printer mappings from server config
            renderPrinterMappingUI();
            return config; // Return for startup logic
        } else {
            updateConfigStatus(false);
            updateConnectionStatus(false);
            return null;
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showToast('Error al cargar la configuración', 'error');
        return null;
    }
}


async function loadStartupSettings() {
    try {
        if (!window.electronAPI) return;

        const settings = await window.electronAPI.getStartupSettings();
        if (settings) {
            elements.openAtLoginInput.checked = settings.openAtLogin || false;
            elements.openAsHiddenInput.checked = settings.openAsHidden || false;
        }
    } catch (error) {
        console.error('Error loading startup settings:', error);
    }
}

async function handleStartupSettingChange() {
    try {
        if (!window.electronAPI) return;

        const settings = {
            openAtLogin: elements.openAtLoginInput.checked,
            openAsHidden: elements.openAsHiddenInput.checked
        };

        const result = await window.electronAPI.setStartupSettings(settings);

        if (result.success) {
            showToast('Configuración de inicio actualizada', 'success');
        } else {
            showToast('Error al actualizar configuración de inicio', 'error');
        }
    } catch (error) {
        console.error('Error saving startup settings:', error);
        showToast('Error al guardar configuración de inicio', 'error');
    }
}

async function handleConfigSubmit(event) {
    event.preventDefault();

    const config = {
        clientId: elements.clientIdInput.value.trim(),
        apiUrl: elements.apiUrlInput.value.trim(),
        apiKey: elements.apiKeyInput.value.trim()
    };

    if (!config.clientId || !config.apiUrl || !config.apiKey) {
        showToast('Por favor, completa todos los campos', 'warning');
        return;
    }

    elements.saveConfigBtn.disabled = true;
    elements.saveConfigBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

    try {
        if (!window.electronAPI) {
            showToast('API no disponible', 'error');
            return;
        }

        const result = await window.electronAPI.saveConfig(config);

        if (result.success) {
            // Store config with printer_mappings from server response
            state.config = {
                ...config,
                printers: result.data.printers || [],
                printerMappings: {}, // Clear/Init legacy
                token: result.data.token
            };

            // Explicitly sync state.config.printers if needed or just rely on store.set from main?
            // Main process returns success=true and data. The app.state should mirror this.

            updateConfigStatus(true);
            updateConnectionStatus(true);
            showToast('✅ Configuración guardada correctamente', 'success');

            // First load printers, then render mappings
            await loadPrinters();
            renderPrinterMappingUI();

            // Redirect to Printers Mapping section on success
            showToast('Redirigiendo a Mapeo de Impresoras...', 'info');
            setTimeout(() => {
                showSection('printers');
            }, 1000);

        } else {
            showToast(result.error || 'Error al guardar la configuración', 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showToast('Error al guardar la configuración', 'error');
    } finally {
        elements.saveConfigBtn.disabled = false;
        elements.saveConfigBtn.innerHTML = '💾 Guardar Configuración';
    }
}

async function handleTestConnection() {
    // Get values from inputs directly
    const config = {
        clientId: elements.clientIdInput.value.trim(),
        apiUrl: elements.apiUrlInput.value.trim(),
        apiKey: elements.apiKeyInput.value.trim()
    };

    if (!config.clientId || !config.apiUrl || !config.apiKey) {
        showToast('Por favor, completa todos los campos para probar la conexión', 'warning');
        return;
    }

    elements.testConnectionBtn.disabled = true;
    elements.testConnectionBtn.innerHTML = '<span class="loading-spinner"></span> Probando...';

    // showToast('Probando conexión...', 'info'); // Option: remove explicit toast if button indicates loading

    try {
        if (!window.electronAPI) {
            showToast('API no disponible', 'error');
            return;
        }

        const result = await window.electronAPI.testConnection(config);

        if (result.success) {
            showToast('✅ Conexión Exitosa', 'success');
            updateConnectionStatus(true);
        } else {
            showToast(result.error || 'Error de conexión', 'error');
            updateConnectionStatus(false);
        }
    } catch (error) {
        console.error('Error testing connection:', error);
        showToast('Error al probar la conexión', 'error');
    } finally {
        elements.testConnectionBtn.disabled = false;
        elements.testConnectionBtn.innerHTML = '🔎 Probar Conexión';
    }
}

async function handleClearConfig() {
    if (!confirm('¿Estás seguro de que deseas borrar TODA la configuración y restablecer la aplicación? Esto no se puede deshacer.')) {
        return;
    }

    try {
        const result = await window.electronAPI.clearConfig();
        if (result.success) {
            alert('Configuración borrada. La aplicación se reiniciará.');
            window.location.reload(); // Reload to trigger startup logic (which will redirect to Config)
        } else {
            showToast('Error al borrar configuración', 'error');
        }
    } catch (error) {
        console.error('Error clearing config:', error);
        showToast('Error al restablecer fábrica', 'error');
    }
}

function updateConfigStatus(isConfigured) {
    if (isConfigured) {
        elements.configStatus.className = 'config-status configured';
        elements.configStatus.textContent = 'Configurado';
    } else {
        elements.configStatus.className = 'config-status not-configured';
        elements.configStatus.textContent = 'No Configurado';
    }
}

function updateConnectionStatus(isConnected) {
    state.isConnected = isConnected;

    if (isConnected) {
        elements.statusIndicator.className = 'status-indicator connected';
        elements.statusText.textContent = 'Conectado';
    } else {
        elements.statusIndicator.className = 'status-indicator disconnected';
        elements.statusText.textContent = 'Desconectado';
    }
}

// ============================================================
// Printers
// ============================================================
async function loadPrinters() {
    try {
        if (!window.electronAPI) return;

        const printers = await window.electronAPI.getPrinters();
        state.printers = printers;

        renderPrintersList();
        updatePrinterSelects();
        loadPrinterMappings();
    } catch (error) {
        console.error('Error loading printers:', error);
        showToast('Error al cargar impresoras', 'error');
    }
}

function renderPrintersList() {
    if (state.printers.length === 0) {
        elements.printersList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🚫</div>
                <p>No se detectaron impresoras</p>
            </div>
        `;
        return;
    }

    elements.printersList.innerHTML = state.printers.map(printer => `
        <div class="printer-mapping-item">
            <div class="printer-type-label">
                <span class="printer-type-icon">${printer.isDefault ? '⭐' : '🖨️'}</span>
                ${escapeHtml(printer.name)}
            </div>
            <span class="job-status ${printer.status === 'ready' ? 'completed' : 'pending'}">
                ${printer.status === 'ready' ? '✓ Listo' : '○ ' + printer.status}
            </span>
        </div>
    `).join('');
}

function updatePrinterSelects() {
    const selects = document.querySelectorAll('.printer-mapping-grid select');
    const options = state.printers.map(p =>
        `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`
    ).join('');

    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = `<option value="">-- Seleccionar --</option>${options}`;
        select.value = currentValue;
    });
}

function loadPrinterMappings() {
    if (!state.config || !state.config.printerMappings) return;

    const mappings = state.config.printerMappings;

    Object.keys(mappings).forEach(type => {
        const select = document.getElementById(`mapping-${type}`);
        if (select) {
            select.value = mappings[type] || '';
        }
    });
}

// Render dynamic printer mapping UI based on server config
function renderPrinterMappingUI() {
    const container = document.getElementById('printerMappingGrid');
    const actionsContainer = document.getElementById('mappingActions');

    // Check if we have either printers list or legacy mappings
    if (!state.config || (!state.config.printers && !state.config.printerMappings)) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚙️</div>
                <p>Configura las credenciales primero para cargar los tipos de documento</p>
            </div>
        `;
        actionsContainer.style.display = 'none';
        return;
    }

    // Determine source of types (Array = List of types, Object = existing mapping)
    const source = state.config.printers || state.config.printerMappings;

    let types = [];
    let currentMappings = {};

    if (Array.isArray(source)) {
        types = source;
        // If it's an array, we don't have mappings yet, or they are stored elsewhere?
        // Assuming we are transitioning from "List of Types" to "Map of Types->Printers"
        // But if 'source' IS the config, and we overwrite it on save, this works for initial load.
        // For values, we might not have them if source is just ["default"].
    } else if (source && typeof source === 'object') {
        types = Object.keys(source);
        currentMappings = source;
    }

    if (types.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>No hay tipos de documento configurados en el servidor</p>
            </div>
        `;
        actionsContainer.style.display = 'none';
        return;
    }

    // Generate printer options HTML
    const printerOptions = state.printers.map(p =>
        `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`
    ).join('');

    // Generate mapping items for each type
    container.innerHTML = types.map(type => {
        const icon = getDocumentTypeIcon(type);
        const label = capitalizeFirst(type);
        const currentValue = currentMappings[type] || '';

        return `
            <div class="printer-mapping-item">
                <div class="printer-type-label">
                    <span class="printer-type-icon">${icon}</span>
                    ${escapeHtml(label)}
                </div>
                <select class="form-select" id="mapping-${escapeHtml(type)}" data-type="${escapeHtml(type)}">
                    <option value="">-- Seleccionar --</option>
                    ${printerOptions}
                </select>
            </div>
        `;
    }).join('');

    // Show save button
    actionsContainer.style.display = 'block';

    // Set current values (defer to loadPrinterMappings if complex, but we set them inline mostly)
    // We still call loadPrinterMappings to handle any specific binding if needed
    // loadPrinterMappings(); // Actually we did it inline above with 'currentValue'? 
    // Wait, the select.value in template string might not work for 'value' attribute if we rely on JS setting it.
    // Better to set 'selected' in options or run JS after. 
    // Current code calls loadPrinterMappings() at the end. Let's keep that.

    // Update loadPrinterMappings to also understand the source
    // But since we are replacing this function, let's just make sure loadPrinterMappings works too.
}

function loadPrinterMappings() {
    // Determine source again
    const source = state.config.printers || state.config.printerMappings;
    if (!source || Array.isArray(source)) return; // If array, no mappings to load yet

    Object.keys(source).forEach(type => {
        const select = document.getElementById(`mapping-${type}`);
        if (select) {
            select.value = source[type] || '';
        }
    });
}

async function handleSaveMappings() {
    const mappings = {};
    const selects = document.querySelectorAll('.printer-mapping-grid select');

    selects.forEach(select => {
        const type = select.dataset.type;
        mappings[type] = select.value;
    });

    try {
        if (!window.electronAPI) {
            showToast('API no disponible', 'error');
            return;
        }

        const result = await window.electronAPI.updatePrinterMapping(mappings);

        if (result.success) {
            if (state.config) {
                state.config.printerMappings = mappings;
            }
            showToast('Mapeo de impresoras guardado', 'success');
        } else {
            showToast('Error al guardar el mapeo', 'error');
        }
    } catch (error) {
        console.error('Error saving mappings:', error);
        showToast('Error al guardar el mapeo', 'error');
    }
}

// ============================================================
// Statistics
// ============================================================
async function loadStats() {
    try {
        if (!window.electronAPI) return;

        const stats = await window.electronAPI.getStats();
        state.stats = stats;
        updateStatsDisplay();
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function updateStats() {
    const stats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
    };

    state.jobs.forEach(job => {
        if (stats.hasOwnProperty(job.status)) {
            stats[job.status]++;
        }
    });

    state.stats = stats;
    updateStatsDisplay();
}

function updateStatsDisplay() {
    animateValue(elements.statPending, state.stats.pending);
    animateValue(elements.statProcessing, state.stats.processing);
    animateValue(elements.statCompleted, state.stats.completed);
    animateValue(elements.statFailed, state.stats.failed);
}

function animateValue(element, newValue) {
    const currentValue = parseInt(element.textContent) || 0;

    if (currentValue === newValue) return;

    const duration = 300;
    const steps = 10;
    const stepDuration = duration / steps;
    const stepValue = (newValue - currentValue) / steps;

    let current = currentValue;
    let step = 0;

    const interval = setInterval(() => {
        step++;
        current += stepValue;
        element.textContent = Math.round(current);

        if (step >= steps) {
            clearInterval(interval);
            element.textContent = newValue;
        }
    }, stepDuration);
}

// ============================================================
// Jobs
// ============================================================
async function loadJobs() {
    try {
        if (!window.electronAPI) return;

        const jobs = await window.electronAPI.getJobs();
        state.jobs = jobs;
        renderJobs();
        updateStats();
    } catch (error) {
        console.error('Error loading jobs:', error);
    }
}

function renderJobs() {
    renderJobList(elements.recentJobsList, state.jobs.slice(0, 5));
    renderJobList(elements.allJobsList, state.jobs);
}

function renderJobList(container, jobs) {
    if (jobs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <p>No hay trabajos en la cola</p>
            </div>
        `;
        return;
    }

    container.innerHTML = jobs.map(job => {
        const jobType = job.type || job.document_type || 'default';
        return `
        <div class="job-item" data-job-id="${job.id}">
            <span class="job-id">#${job.id}</span>
            <span class="job-type">${getDocumentTypeLabel(jobType)}</span>
            <span class="job-printer">${escapeHtml(job.printer || 'Sin asignar')}</span>
            <span class="job-status ${job.status}">
                ${getStatusIcon(job.status)} ${getStatusLabel(job.status)}
            </span>
            <div class="job-actions">
                ${job.status === 'failed' ? `
                    <button class="btn-icon" onclick="retryJob('${job.id}')" title="Reintentar">
                        🔄
                    </button>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
}

function updateJobStatus(data) {
    const jobElement = document.querySelector(`[data-job-id="${data.id}"]`);

    if (jobElement) {
        const statusElement = jobElement.querySelector('.job-status');
        statusElement.className = `job-status ${data.status}`;
        statusElement.innerHTML = `${getStatusIcon(data.status)} ${getStatusLabel(data.status)}`;
    }

    // Update stats
    const job = state.jobs.find(j => j.id === data.id);
    if (job) {
        job.status = data.status;
        updateStats();
    }
}

async function retryJob(jobId) {
    try {
        if (!window.electronAPI) {
            showToast('API no disponible', 'error');
            return;
        }

        showToast('Reintentando trabajo...', 'info');
        const result = await window.electronAPI.retryJob(jobId);

        if (result.success) {
            showToast('Trabajo enviado a la cola', 'success');
        } else {
            showToast(result.error || 'Error al reintentar', 'error');
        }
    } catch (error) {
        console.error('Error retrying job:', error);
        showToast('Error al reintentar el trabajo', 'error');
    }
}

// Make retryJob available globally for onclick
window.retryJob = retryJob;

// ============================================================
// Helper Functions
// ============================================================
function getDocumentTypeLabel(type) {
    const icon = getDocumentTypeIcon(type);
    const label = capitalizeFirst(type);
    return `${icon} ${label}`;
}

function getDocumentTypeIcon(type) {
    const icons = {
        invoice: '🧾',
        factura: '🧾',
        label: '🏷️',
        etiqueta: '🏷️',
        report: '📊',
        reporte: '📊',
        reportes: '📊',
        cocina: '🍳',
        bar: '🍺',
        default: '📄'
    };
    return icons[type.toLowerCase()] || '📄';
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getStatusIcon(status) {
    const icons = {
        pending: '○',
        processing: '◐',
        completed: '✓',
        failed: '✗'
    };
    return icons[status] || '○';
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Pendiente',
        processing: 'Procesando',
        completed: 'Completado',
        failed: 'Fallido'
    };
    return labels[status] || status;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// Toast Notifications
// ============================================================
function showToast(message, type = 'info') {
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    elements.toastContainer.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// ============================================================
// Periodic Updates
// ============================================================
setInterval(async () => {
    if (state.isConnected) {
        await loadStats();
        await loadJobs();
    }
}, 10000); // Update every 10 seconds
