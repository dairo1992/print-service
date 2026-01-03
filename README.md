# PrintStation - Sistema de Impresión Distribuida

Sistema autocontenido de impresión local para aplicaciones web. Un único instalador sin dependencias adicionales.

## 📋 Características

✅ **Instalación única** - Sin dependencias adicionales, todo incluido
✅ **Configuración simple** - Solo requiere Client ID y API Key
✅ **Autocontenido** - Incluye Chromium para renderizado HTML
✅ **Multi-impresora** - Mapeo automático según tipo de documento
✅ **Cross-platform** - Windows, Mac, Linux
✅ **Polling inteligente** - Consulta automática cada 5 segundos
✅ **Reintentos automáticos** - Manejo robusto de errores
✅ **Sin navegador** - Funciona en background (system tray)

---

## 🚀 Instalación Rápida

### Para el Usuario Final (Cliente)

1. **Descargar instalador** según tu sistema operativo:
   - Windows: `PrintStation-Setup-1.0.0.exe`
   - Mac: `PrintStation-1.0.0.dmg`
   - Linux: `PrintStation-1.0.0.AppImage`

2. **Ejecutar instalador** (siguiente, siguiente, finalizar)

3. **Configurar en primer uso:**
   ```
   Client ID:  ALMACEN-01
   URL Servidor: https://tu-dominio.com
   API Key: sk_live_xxxxxxxxxxxxxxxxx
   ```

4. **Mapear impresoras** (la app detecta las impresoras instaladas):
   ```
   Facturas  → HP LaserJet Pro
   Etiquetas → Zebra ZD421
   Reportes  → HP LaserJet Pro
   ```

5. **¡Listo!** La aplicación se minimiza a la bandeja del sistema y trabaja automáticamente.

---

## 🛠️ Para Desarrolladores

### Requisitos del Sistema de Desarrollo

- **Node.js** 18.x o superior
- **npm** o **yarn**
- **Git**

### Clonar e Instalar

```bash
# Clonar repositorio
git clone https://github.com/tu-empresa/printstation.git
cd printstation

# Instalar dependencias (esto puede tardar, descarga Chromium ~150MB)
npm install

# Desarrollo
npm run dev

# Construir instaladores
npm run build:win     # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux
npm run build:all     # Todos los sistemas
```

### Estructura del Proyecto

```
printstation/
├── main.js              # Proceso principal Electron
├── preload.js           # Bridge seguro
├── package.json         # Configuración y dependencias
├── src/
│   └── renderer/        # Interfaz React (opcional)
├── assets/
│   ├── icon.ico         # Icono Windows
│   ├── icon.icns        # Icono Mac
│   ├── icon.png         # Icono Linux
│   └── tray-icon.png    # Icono bandeja
└── build/               # Archivos compilados
```

### Dependencias Incluidas

```json
{
  "axios": "^1.6.2",           // Cliente HTTP
  "electron-store": "^8.1.0",  // Almacenamiento local encriptado
  "pdf-to-printer": "^5.6.0",  // Driver de impresión
  "puppeteer": "^21.6.1"       // Renderizado HTML (incluye Chromium)
}
```

**Nota:** Puppeteer descarga Chromium automáticamente (~150MB), por eso el instalador final pesa ~180-200MB.

---

## 🔧 Configuración del Servidor (VPS)

### 1. Instalación Laravel (Backend)

```bash
# En tu VPS
cd /var/www/tu-aplicacion

# Ejecutar migraciones
php artisan migrate

# Crear cliente de prueba
php artisan tinker
```

```php
// En tinker
use App\Models\Client;
use Illuminate\Support\Facades\Hash;

$client = Client::create([
    'client_id' => 'ALMACEN-01',
    'name' => 'Almacén Principal',
    'location' => 'Bodega Central',
    'api_key_hash' => Hash::make('tu-api-key-secreta'),
    'printer_mappings' => [
        'invoice' => '',
        'label' => '',
        'report' => ''
    ]
]);

echo "Cliente creado con ID: " . $client->client_id;
echo "\nAPI Key: tu-api-key-secreta";
```

### 2. Configurar .env

```env
# En tu archivo .env
APP_COMPANY_NAME="Tu Empresa S.A."
APP_COMPANY_ADDRESS="Calle 123 #45-67"
APP_COMPANY_PHONE="+57 300 123 4567"
APP_COMPANY_EMAIL="info@tuempresa.com"
```

### 3. Crear Trabajo de Impresión (Ejemplo)

```php
use App\Models\PrintJob;

// Cuando se crea una factura
$invoice = Invoice::create([...]);

// Crear trabajo de impresión
PrintJob::create([
    'client_id' => 'ALMACEN-01',       // A qué cliente/estación enviar
    'document_type' => 'invoice',       // Tipo de documento
    'document_id' => $invoice->id,      // ID del documento
    'status' => 'pending',              // Estado inicial
    'priority' => 1,                    // 1=normal, 2=alta, 3=urgente
    'format' => 'A4',                   // Formato de página
    'copies' => 1                       // Número de copias
]);

// ¡Listo! La app de escritorio lo detectará automáticamente
```

---

## 📊 Flujo de Funcionamiento

```
┌──────────────────────────────────────────────────────┐
│ 1. Usuario genera factura en navegador web          │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 2. Sistema web (Laravel) crea PrintJob en BD        │
│    - client_id: "ALMACEN-01"                        │
│    - document_type: "invoice"                        │
│    - status: "pending"                               │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 3. PrintStation hace polling cada 5 segundos        │
│    GET /api/print/pending                            │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 4. Detecta nuevo trabajo, solicita HTML             │
│    GET /api/print/render/{job_id}                    │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 5. Servidor retorna HTML completo de la factura     │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 6. PrintStation renderiza HTML a PDF (Puppeteer)    │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 7. Selecciona impresora según mapping               │
│    invoice → HP LaserJet Pro                         │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 8. Imprime documento                                 │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 9. Notifica al servidor: "completed"                │
│    POST /api/print/status                            │
└──────────────────────────────────────────────────────┘
```

---

## 🔐 Seguridad

### Autenticación

- **Token Bearer JWT** generado por Sanctum
- **API Keys** hasheadas con bcrypt
- **Client ID** único por estación
- **HTTPS obligatorio** en producción

### Almacenamiento Local

- Configuración encriptada con AES-256 (`electron-store`)
- Tokens guardados de forma segura
- Sin datos sensibles en texto plano

### Mejores Prácticas

```php
// ❌ MAL - No expongas API keys en el código
$apiKey = "sk_live_123456789";

// ✅ BIEN - Genera API keys únicas por cliente
$apiKey = Str::random(40);
$client->api_key_hash = Hash::make($apiKey);
$client->save();

// Entrégale la API key AL CLIENTE UNA SOLA VEZ
// Nunca la almacenes en texto plano
```

---

## 🐛 Solución de Problemas

### La aplicación no se conecta al servidor

**Síntomas:** Estado "Desconectado" en la aplicación

**Soluciones:**
1. Verificar que la URL del servidor sea correcta (debe incluir `https://`)
2. Verificar que el Client ID existe en la base de datos
3. Verificar que la API Key sea correcta
4. Revisar logs del servidor Laravel (`storage/logs/laravel.log`)
5. Verificar firewall/CORS en el servidor

```bash
# Ver logs en tiempo real
tail -f storage/logs/laravel.log
```

### Las impresoras no aparecen

**Síntomas:** Lista de impresoras vacía

**Soluciones:**
1. Verificar que haya impresoras instaladas en el sistema
2. Reiniciar el servicio de impresión del sistema operativo
3. **Windows:** `services.msc` → Buscar "Print Spooler" → Reiniciar
4. **Linux:** `sudo systemctl restart cups`
5. **Mac:** Preferencias del Sistema → Impresoras

### El documento no se imprime

**Síntomas:** Trabajo queda en estado "failed"

**Soluciones:**
1. Verificar que la impresora esté encendida y conectada
2. Revisar que haya papel en la impresora
3. Comprobar que la impresora no tenga trabajos atascados
4. Ver logs de la aplicación (menú → Ver Logs)
5. Reintentar manualmente desde la interfaz

### Rendimiento lento

**Síntomas:** Demora en procesar trabajos

**Soluciones:**
1. Reducir intervalo de polling (por defecto 5 segundos)
2. Aumentar RAM disponible (mínimo 4GB recomendado)
3. Cerrar aplicaciones que consuman recursos
4. Verificar velocidad de conexión a internet

---

## 📈 Optimizaciones de Producción

### Backend (Laravel)

```php
// Indexar la tabla de trabajos
Schema::table('print_jobs', function (Blueprint $table) {
    $table->index(['client_id', 'status', 'priority']);
});

// Limpiar trabajos antiguos (ejecutar diariamente)
PrintJob::where('status', 'completed')
    ->where('completed_at', '<', now()->subDays(30))
    ->delete();
```

### Electron App

```javascript
// Ajustar intervalo de polling según necesidad
const POLLING_INTERVAL = process.env.POLLING_MS || 5000;

// Limitar trabajos simultáneos
const MAX_CONCURRENT_JOBS = 3;

// Timeout para requests
const REQUEST_TIMEOUT = 30000; // 30 segundos
```

---

## 📦 Distribución

### Crear Instaladores

```bash
# Windows (desde Windows o Linux con Wine)
npm run build:win

# Genera:
# - PrintStation-Setup-1.0.0.exe (instalador NSIS)
# - PrintStation-Portable-1.0.0.exe (portable)

# Mac (solo desde Mac)
npm run build:mac

# Genera:
# - PrintStation-1.0.0.dmg
# - PrintStation-1.0.0-mac.zip

# Linux
npm run build:linux

# Genera:
# - PrintStation-1.0.0.AppImage
# - PrintStation-1.0.0.deb
```

### Subir a tu servidor

```bash
# Crear directorio de descargas
mkdir -p public/downloads/printstation

# Copiar instaladores
cp release/*.exe public/downloads/printstation/
cp release/*.dmg public/downloads/printstation/
cp release/*.AppImage public/downloads/printstation/

# Hacer accesibles vía web
# https://tu-dominio.com/downloads/printstation/
```

---

## 🎯 Casos de Uso

### 1. Restaurante con múltiples estaciones

```
Cliente hace pedido en POS → 
  → Factura imprime en caja (HP LaserJet)
  → Ticket cocina imprime en cocina (Impresora térmica)
  → Factura duplicada en bar (HP LaserJet)
```

### 2. Almacén con etiquetado

```
Operario escanea producto →
  → Sistema genera etiqueta →
  → Imprime en impresora Zebra local →
  → Etiqueta lista en 2 segundos
```

### 3. Oficina distribuida

```
Gerente aprueba reporte en sistema web →
  → Reporte imprime en oficina central
  → Reporte imprime en sucursales
  → Sin intervención manual
```

---

## 📞 Soporte

- **Documentación:** https://docs.tu-empresa.com/printstation
- **Issues:** https://github.com/tu-empresa/printstation/issues
- **Email:** soporte@tu-empresa.com

---

## 📄 Licencia

MIT License - Ver archivo `LICENSE` para más detalles.

---

## 🙏 Créditos

- Electron: https://electronjs.org
- Puppeteer: https://pptr.dev
- pdf-to-printer: https://github.com/artiebits/pdf-to-printer
- Laravel Sanctum: https://laravel.com/docs/sanctum

---

**¡Eso es todo! Ahora tienes un sistema completo de impresión distribuida sin dependencias adicionales.** 🎉