// ============================================================
// ARCHIVO: main.js (Proceso Principal de Electron)
// ============================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const printer = require('pdf-to-printer');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const os = require('os');

// Inicializar Store con manejo de errores
let store;

// Almacenamiento persistente local
try {
    const storeFilePath = path.join(app.getPath('userData'), 'config.json');
    store = {
        get: (key) => {
            try {
                const data = require('fs').readFileSync(storeFilePath, 'utf8');
                const parsed = JSON.parse(data);
                return parsed[key];
            } catch {
                return null;
            }
        },
        set: (key, value) => {
            try {
                let data = {};
                try {
                    data = JSON.parse(require('fs').readFileSync(storeFilePath, 'utf8'));
                } catch { }
                data[key] = value;
                require('fs').writeFileSync(storeFilePath, JSON.stringify(data, null, 2));
            } catch (err) {
                console.error('Error guardando configuración:', err);
            }
        }
    };
    console.log('⚠ Usando almacenamiento fallback JSON');
} catch (error) {
    console.error('Error inicializando almacenamiento JSON:', error);
    console.error('Stack:', error.stack);
}

let mainWindow = null;
let tray = null;
let pollingInterval = null;
let browserInstance = null;

// Exponential Backoff Configuration
let currentPollingInterval = 5000; // Start at 5 seconds
const MIN_POLLING_INTERVAL = 5000; // 5 seconds
const MAX_POLLING_INTERVAL = 60000; // 60 seconds
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

// Startup Configuration
const STARTUP_HIDDEN_FLAG = '--hidden';

// ============================================================
// INICIALIZACIÃ“N DE LA APLICACIÃ“N
// ============================================================
async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    // Cargar la interfaz
    mainWindow.loadFile(path.join(__dirname, 'build/index.html'));

    // Abrir DevTools en modo desarrollo
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.once('ready-to-show', () => {
        // Check if launched with hidden flag (from startup registry)
        const isHidden = process.argv.includes(STARTUP_HIDDEN_FLAG);

        if (!isHidden) {
            mainWindow.show();
        } else {
            console.log('Iniciando minimizado (background mode)');
        }
    });

    // Minimizar a bandeja en lugar de cerrar
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Crear icono en bandeja del sistema
    createTray();
}

function createTray() {
    // Esto asegura que la ruta sea correcta sin importar desde dÃ³nde se ejecute el proceso
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);

    // Verifica si el icono es vÃ¡lido antes de crear el Tray
    if (icon.isEmpty()) {
        console.error("No se pudo encontrar el icono en:", iconPath);
        return;
    }

    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Mostrar PrintStation',
            click: () => {
                mainWindow.show();
            }
        },
        {
            label: 'Estado: Conectado',
            enabled: false
        },
        { type: 'separator' },
        {
            label: 'Pausar impresiÃ³n',
            type: 'checkbox',
            checked: false,
            click: (menuItem) => {
                if (menuItem.checked) {
                    stopPolling();
                } else {
                    startPolling();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Salir',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('PrintStation - Sistema de ImpresiÃ³n');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

app.whenReady().then(async () => {
    await createWindow();

    // Si ya estÃ¡ configurado, iniciar polling automÃ¡ticamente
    if (isConfigured()) {
        await initializePrintSystem();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ============================================================
// SISTEMA DE AUTENTICACIÃ“N Y CONFIGURACIÃ“N
// ============================================================
function isConfigured() {
    const config = store.get('config');
    return config && config.clientId && config.apiKey && config.apiUrl;
}

ipcMain.handle('get-config', async () => {
    return store.get('config') || null;
});

ipcMain.handle('save-config', async (event, config) => {
    try {
        // Validar credenciales con el servidor
        const response = await axios.post(`${config.apiUrl}?action=validate`, {
            client_id: config.clientId,
            api_key: config.apiKey
        }, {
            timeout: 10000
        });

        if (response.data.success) {
            // Guardar configuraciÃ³n localmente
            store.set('config', {
                clientId: config.clientId,
                apiUrl: config.apiUrl,
                apiKey: config.apiKey,
                token: response.data.token,
                printers: response.data.printers || []
            });

            // Inicializar sistema de impresiÃ³n (no bloqueante)
            initializePrintSystem().catch(err => {
                log('ERROR', `Error inicializando sistema de impresión: ${err.message}`);
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('print-system-error', {
                        message: 'Error al inicializar el sistema de impresión. Ejecuta: npx puppeteer browsers install chrome'
                    });
                }
            });

            return { success: true, data: response.data };
        } else {
            return { success: false, error: 'Credenciales invÃ¡lidas' };
        }
    } catch (error) {
        console.error('Error al validar configuraciÃ³n:', error);
        return {
            success: false,
            error: error.response?.data?.message || error.message || 'Error al conectar con el servidor'
        };
    }
});

ipcMain.handle('update-printer-mapping', async (event, mappings) => {
    const config = store.get('config');
    config.printers = mappings;
    store.set('config', config);
    return { success: true };
    return { success: true };
});

ipcMain.handle('get-startup-settings', async () => {
    const loginSettings = app.getLoginItemSettings();
    return {
        openAtLogin: loginSettings.openAtLogin,
        openAsHidden: loginSettings.args.includes(STARTUP_HIDDEN_FLAG)
    };
});

ipcMain.handle('set-startup-settings', async (event, settings) => {
    try {
        const args = settings.openAsHidden ? [STARTUP_HIDDEN_FLAG] : [];

        app.setLoginItemSettings({
            openAtLogin: settings.openAtLogin,
            openAsHidden: settings.openAsHidden, // MacOS support
            args: args // Windows support (passed as CLI args)
        });

        return { success: true };
    } catch (error) {
        console.error('Error setting startup options:', error);
        return { success: false, error: error.message };
    }
});

// ============================================================
// DETECCIÓN Y GESTIÓN DE IMPRESORAS
// ============================================================
ipcMain.handle('get-printers', async () => {
    try {
        const printers = await printer.getPrinters();

        return printers.map(p => ({
            name: p.name || p.deviceId,
            deviceId: p.deviceId,
            status: p.status || 'ready',
            isDefault: p.isDefault || false
        }));
    } catch (error) {
        console.error('Error obteniendo impresoras:', error);
        return [];
    }
});

// ============================================================
// SISTEMA DE POLLING Y PROCESAMIENTO DE TRABAJOS
// ============================================================
async function initializePrintSystem() {
    console.log('Inicializando sistema de impresión...');

    // Inicializar navegador headless para renderizado
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    // Iniciar polling
    startPolling();
}

function startPolling() {
    if (pollingInterval) return;

    log('INFO', 'Iniciando polling de trabajos...');

    // Reset backoff on start
    currentPollingInterval = MIN_POLLING_INTERVAL;
    consecutiveFailures = 0;

    scheduleNextPoll();
}

function scheduleNextPoll() {
    if (pollingInterval) {
        clearTimeout(pollingInterval);
    }

    pollingInterval = setTimeout(async () => {
        await fetchAndProcessJobs();
        scheduleNextPoll();
    }, currentPollingInterval);

    // Execute immediately on first call
    if (consecutiveFailures === 0) {
        fetchAndProcessJobs();
    }
}

function stopPolling() {
    if (pollingInterval) {
        clearTimeout(pollingInterval);
        pollingInterval = null;
        log('INFO', 'Polling detenido');
    }
}

function adjustPollingInterval(success) {
    if (success) {
        // Reset to minimum on success
        consecutiveFailures = 0;
        currentPollingInterval = MIN_POLLING_INTERVAL;
    } else {
        // Exponential backoff on failure
        consecutiveFailures++;
        currentPollingInterval = Math.min(
            currentPollingInterval * 2,
            MAX_POLLING_INTERVAL
        );
        log('WARN', `Backoff activado: siguiente intento en ${currentPollingInterval / 1000}s (fallo ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
    }
}

function log(level, message) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    switch (level) {
        case 'ERROR':
            console.error(`${prefix} ${message}`);
            break;
        case 'WARN':
            console.warn(`${prefix} ${message}`);
            break;
        default:
            console.log(`${prefix} ${message}`);
    }
}

async function fetchAndProcessJobs() {
    const config = store.get('config');
    if (!config) {
        log('WARN', 'No hay configuraciÃ³n guardada, saltando polling');
        return;
    }

    const url = `${config.apiUrl}?action=pending`;
    log('INFO', `[POLLING] GET ${url}`);
    log('INFO', `[POLLING] Headers: X-Client-Id=${config.clientId}`);

    try {
        // Consultar servidor por trabajos pendientes
        const response = await axios.get(url, {
            headers: {
                'X-Client-Id': config.clientId
            },
            timeout: 10000
        });

        // Log de la respuesta
        log('INFO', `[POLLING] Respuesta status: ${response.status}`);
        log('INFO', `[POLLING] Respuesta data: ${JSON.stringify(response.data)}`);

        // Aceptar tanto 'jobs' como 'pendientes' del API
        const newJobs = response.data.jobs || response.data.pendientes || [];

        // Actualizar historia de trabajos (merge)
        updateLocalJobHistory(newJobs);

        // Obtener la lista completa actualizada para enviarla a la UI
        const allJobs = store.get('jobs') || [];

        // Connection successful - reset backoff
        adjustPollingInterval(true);

        // Notify renderer of connection status
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('connection-status', true);
        }

        if (newJobs.length > 0) {
            log('INFO', `${newJobs.length} nuevos trabajos encontrados`);

            // Notificar al renderer con la lista COMPLETA
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('jobs-update', allJobs);
            }

            // Procesar cada NUEVO trabajo
            for (const job of newJobs) {
                await processJob(job);
            }
        } else {
            log('INFO', '[POLLING] No hay trabajos pendientes');
            // Notificar lista completa al renderer (para mantener la UI actualizada)
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('jobs-update', allJobs);
            }
        }
    } catch (error) {
        // Apply exponential backoff
        adjustPollingInterval(false);

        log('ERROR', `[POLLING] Error: ${error.message}`);

        if (error.response) {
            log('ERROR', `[POLLING] Response status: ${error.response.status}`);
            log('ERROR', `[POLLING] Response data: ${JSON.stringify(error.response.data)}`);
        }

        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            log('ERROR', `No se pudo conectar al servidor: ${error.code}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('connection-status', false);
            }
        } else if (error.response) {
            // Server responded with error status
            log('ERROR', `Error del servidor: ${error.response.status} - ${error.response.statusText}`);
            if (error.response.status === 401) {
                log('WARN', 'Token expirado o invÃ¡lido. Requiere reconfiguraciÃ³n.');
            }
        } else {
            log('ERROR', `Error en polling: ${error.message}`);
        }
    }
}

// ============================================================
// PROCESAMIENTO DE TRABAJOS DE IMPRESIÃ“N
// ============================================================
async function processJob(job) {
    const config = store.get('config');

    // Normalizar el tipo de documento (soportar 'type' o 'printer')
    const jobType = job.type || job.printer;

    try {
        log('INFO', `Procesando trabajo ${job.id} (${jobType})`);

        // Notificar inicio de procesamiento
        await notifyServer(job.id, 'processing');
        updateLocalJobStatus(job.id, 'processing'); // Actualizar localmente

        if (mainWindow) {
            mainWindow.webContents.send('job-status', {
                id: job.id,
                status: 'processing'
            });
        }

        // 1. Obtener HTML del servidor
        const renderUrl = `${config.apiUrl}?action=render&id=${job.id}`;
        log('INFO', `[RENDER] GET ${renderUrl}`);

        let htmlResponse;
        try {
            htmlResponse = await axios.get(renderUrl, {
                headers: {
                    'Authorization': `Bearer ${config.token}`
                },
                timeout: 30000
            });
        } catch (renderError) {
            // Log detallado del error del servidor
            if (renderError.response) {
                const errorData = JSON.stringify(renderError.response.data).substring(0, 500); // Primeros 500 chars
                log('ERROR', `[RENDER] Fallo servidor (${renderError.response.status}): ${errorData}`);
                throw new Error(`Servidor devolvió error ${renderError.response.status} al renderizar: ${errorData}`);
            }
            throw renderError;
        }

        const htmlContent = htmlResponse.data;
        log('INFO', `[RENDER] HTML recibido: ${htmlContent.length} caracteres`);

        // 2. Renderizar a PDF
        const pdfBuffer = await renderHTMLToPDF(htmlContent, job);

        // 3. Seleccionar impresora
        console.log('Configured Printers:', JSON.stringify(config.printers));
        console.log('Job Type:', jobType);

        let printerName = selectPrinter(jobType, config.printers);
        console.log('Selected Printer Name:', printerName);

        if (!printerName) {
            // Intentar buscar la impresora por defecto del sistema
            try {
                console.log('No se seleccionó impresora de la configuración, buscando por defecto del sistema...');
                const systemPrinters = await printer.getPrinters();
                const defaultPrinter = systemPrinters.find(p => p.isDefault);

                if (defaultPrinter) {
                    printerName = defaultPrinter.name || defaultPrinter.deviceId;
                    console.log(`Usando impresora por defecto del sistema: ${printerName}`);
                }
            } catch (err) {
                console.warn('Error buscando impresora por defecto del sistema:', err);
            }
        }

        if (!printerName) {
            throw new Error(`No hay impresora configurada y no se encontró una por defecto en el sistema`);
        }

        // 4. Imprimir
        await printPDF(pdfBuffer, printerName, job);

        // 5. Notificar Ã©xito
        await notifyServer(job.id, 'completed', {
            printer: printerName,
            timestamp: new Date().toISOString()
        });
        updateLocalJobStatus(job.id, 'completed'); // Actualizar localmente

        if (mainWindow) {
            mainWindow.webContents.send('job-status', {
                id: job.id,
                status: 'completed'
            });
        }

        console.log(`âœ“ Trabajo ${job.id} completado exitosamente`);

    } catch (error) {
        console.error(`âœ— Error procesando trabajo ${job.id}:`, error.message);

        // Notificar error
        await notifyServer(job.id, 'failed', {
            error: error.message,
            timestamp: new Date().toISOString()
        });
        updateLocalJobStatus(job.id, 'failed', error.message); // Actualizar localmente

        if (mainWindow) {
            mainWindow.webContents.send('job-status', {
                id: job.id,
                status: 'failed',
                error: error.message
            });
        }
    }
}

async function renderHTMLToPDF(htmlContent, job) {
    const page = await browserInstance.newPage();

    try {
        await page.setContent(htmlContent, {
            waitUntil: 'networkidle0'
        });

        // Esperar a que se carguen las fuentes e imágenes
        await page.evaluateHandle('document.fonts.ready');

        // Detectar si es impresiÃ³n POS (tÃ©rmica)
        // Se considera POS si el formato es '80mm', '58mm' o si el tipo es cocina/bar/ticket
        const jobType = (job.type || job.printer || '').toLowerCase();
        const format = (job.format || '').toLowerCase();

        const isPos = ['cocina', 'bar', 'ticket', 'pos'].includes(jobType) ||
            format === '80mm' ||
            format === '58mm';

        let pdfOptions = {
            printBackground: true
        };

        if (isPos) {
            // ConfiguraciÃ³n Ã³ptima para POS / TÃ©rmica
            // 1. Calcular altura dinÃ¡mica basada en el contenido
            const bodyHeight = await page.evaluate(() => {
                // Agregar un pequeÃ±o padding para asegurar que no se corte
                return document.body.scrollHeight + 50;
            });

            // 2. Ancho fijo (default 80mm o lo que diga el formato)
            const width = format === '58mm' ? '58mm' : '80mm';

            pdfOptions.width = width;
            pdfOptions.height = `${bodyHeight}px`;
            pdfOptions.margin = {
                top: '0mm',
                right: '0mm',
                bottom: '0mm',
                left: '0mm'
            };

            console.log(`[RENDER] Generando PDF POS: ${width} x ${bodyHeight}px`);
        } else {
            // ConfiguraciÃ³n estÃ¡ndar A4/Letter
            pdfOptions.format = (format && format !== 'a4') ? format : 'A4';
            pdfOptions.margin = {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            };
        }

        // Generar PDF
        const pdfBuffer = await page.pdf(pdfOptions);

        return pdfBuffer;
    } finally {
        await page.close();
    }
}

function selectPrinter(documentType, mappings) {
    // Obtener impresora configurada para este tipo de documento
    const printerName = mappings[documentType];

    if (printerName) {
        return printerName;
    }

    // Fallback a impresora por defecto
    console.warn(`No hay mapeo para tipo ${documentType}, usando impresora por defecto`);
    return mappings.default || null;
}

async function printPDF(pdfBuffer, printerName, job) {
    // Crear archivo temporal
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `print-${job.id}-${Date.now()}.pdf`);

    try {
        // Escribir PDF a archivo temporal
        await fs.writeFile(tempFile, pdfBuffer);

        // Detectar si es POS para ajustar opciones de impresión
        const jobType = (job.type || job.printer || '').toLowerCase();
        const format = (job.format || '').toLowerCase();
        const isPos = ['cocina', 'bar', 'ticket', 'pos'].includes(jobType) ||
            format === '80mm' ||
            format === '58mm';

        const printOptions = {
            printer: printerName,
            copies: job.copies || 1,
            // Para POS usamos 'noscale' para evitar que se reduzca el ticket
            scale: isPos ? 'noscale' : 'fit'
        };

        // Función de impresión con timeout
        const tryPrint = async () => {
            const TIMEOUT_MS = 30000; // 30 segundos timeout

            const printPromise = printer.print(tempFile, printOptions);

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Tiempo de espera agotado al enviar a la impresora (30s)')), TIMEOUT_MS);
            });

            await Promise.race([printPromise, timeoutPromise]);
        };

        // Reintentar hasta 3 veces
        await retryOperation(tryPrint, 3, 2000, `Imprimir job ${job.id} en ${printerName}`);

        console.log(`Impreso en: ${printerName}`);
    } finally {
        // Limpiar archivo temporal
        try {
            await fs.unlink(tempFile);
        } catch (err) {
            // Ignorar errores al eliminar
        }
    }
}

async function notifyServer(jobId, status, details = {}) {
    const config = store.get('config');

    const url = `${config.apiUrl}?action=status`;
    const payload = {
        job_id: jobId,
        status: status,
        client_id: config.clientId,
        details: details
    };

    log('INFO', `[STATUS] POST ${url}`);
    log('INFO', `[STATUS] Payload: ${JSON.stringify(payload)}`);

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });

        log('INFO', `[STATUS] Respuesta: ${response.status} - ${JSON.stringify(response.data)}`);
    } catch (error) {
        log('ERROR', `[STATUS] Error notificando al servidor: ${error.message}`);
        if (error.response) {
            log('ERROR', `[STATUS] Response: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
    }
}

// ============================================================
// HANDLERS IPC PARA LA INTERFAZ
// ============================================================
ipcMain.handle('get-stats', async () => {
    // Retornar estadÃ­sticas desde almacenamiento local
    return store.get('stats') || {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
    };
});

ipcMain.handle('get-jobs', async () => {
    // Retornar trabajos desde almacenamiento local
    return store.get('jobs') || [];
});

ipcMain.handle('retry-job', async (event, jobId) => {
    const jobs = store.get('jobs') || [];
    const job = jobs.find(j => j.id === jobId);

    if (job) {
        // No esperar a que termine (fire-and-forget) para no bloquear la UI
        processJob(job).catch(err => {
            console.error(`Error en reintento manual del trabajo ${jobId}:`, err);
        });
        return { success: true };
    }

    return { success: false, error: 'Trabajo no encontrado' };
});

// Limpieza al cerrar
app.on('before-quit', async () => {
    stopPolling();

    if (browserInstance) {
        await browserInstance.close();
    }
});

// ============================================================
// HELPER FUNCTIONS FOR LOCAL STATE MANAGEMENT
// ============================================================
function updateLocalJobHistory(newJobs) {
    if (!newJobs || newJobs.length === 0) return;

    // Get existing jobs
    let currentJobs = store.get('jobs') || [];

    // Merge new jobs (avoid duplicates)
    newJobs.forEach(newJob => {
        const index = currentJobs.findIndex(j => j.id === newJob.id);
        if (index === -1) {
            // New job - add to beginning
            currentJobs.unshift(newJob);
        } else {
            // Existing job - update only if status changed?
            // Usually we trust the server for new jobs, so update props
            currentJobs[index] = { ...currentJobs[index], ...newJob };
        }
    });

    // Limit history to last 50 jobs to avoid bloat
    if (currentJobs.length > 50) {
        currentJobs = currentJobs.slice(0, 50);
    }

    store.set('jobs', currentJobs);
    calculateStats(currentJobs);
}

function updateLocalJobStatus(jobId, status, errorMessage = null) {
    let currentJobs = store.get('jobs') || [];
    const index = currentJobs.findIndex(j => j.id === jobId);

    if (index !== -1) {
        currentJobs[index].status = status;
        if (errorMessage) {
            currentJobs[index].error_message = errorMessage;
        }
        store.set('jobs', currentJobs);
        calculateStats(currentJobs);
    }
}

function calculateStats(jobs) {
    const stats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
    };

    jobs.forEach(job => {
        if (stats.hasOwnProperty(job.status)) {
            stats[job.status]++;
        }
    });

    store.set('stats', stats);

    // Notify renderer of stats update
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('stats-update', stats);
    }
}

async function retryOperation(operation, maxAttempts, delayMs, description) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (attempt > 1) {
                log('INFO', `Reintento ${attempt}/${maxAttempts} para: ${description}`);
            }
            return await operation();
        } catch (error) {
            lastError = error;
            log('WARN', `Fallo intento ${attempt}/${maxAttempts} en ${description}: ${error.message}`);

            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    throw lastError || new Error(`Fallaron todos los intentos para: ${description}`);
}
