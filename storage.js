// ============================================================
// ARCHIVO: storage.js
// Sistema de almacenamiento personalizado para Electron
// Sin dependencias externas, usa solo Node.js nativo
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

class SecureStorage {
    constructor(options = {}) {
        // Directorio de datos de usuario de Electron
        this.storageDir = app.getPath('userData');
        this.storageFile = path.join(this.storageDir, 'config.json');
        this.encryptionKey = options.encryptionKey || 'default-key-change-in-production';
        this.data = {};

        // Crear directorio si no existe
        this.ensureStorageDir();

        // Cargar datos existentes
        this.load();

        console.log('✓ Sistema de almacenamiento inicializado');
        console.log(`  Ubicación: ${this.storageFile}`);
    }

    ensureStorageDir() {
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    // Encriptar datos (opcional, puedes desactivar si quieres)
    encrypt(text) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(algorithm, key, iv);

            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('Error encriptando:', error);
            return text; // Fallback a texto plano si falla
        }
    }

    // Desencriptar datos
    decrypt(text) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const parts = text.split(':');

            if (parts.length !== 2) {
                // No está encriptado, retornar como está
                return text;
            }

            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = parts[1];
            const decipher = crypto.createDecipheriv(algorithm, key, iv);

            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('Error desencriptando:', error);
            return text; // Fallback a texto original si falla
        }
    }

    // Cargar datos desde archivo
    load() {
        try {
            if (fs.existsSync(this.storageFile)) {
                const rawData = fs.readFileSync(this.storageFile, 'utf8');

                // Intentar desencriptar
                let decrypted = rawData;
                if (rawData.includes(':') && rawData.split(':').length === 2) {
                    decrypted = this.decrypt(rawData);
                }

                this.data = JSON.parse(decrypted);
                console.log('✓ Datos cargados correctamente');
            } else {
                console.log('ℹ No hay datos previos, iniciando con configuración vacía');
                this.data = {};
            }
        } catch (error) {
            console.error('Error cargando datos:', error);
            console.log('⚠ Iniciando con configuración vacía');
            this.data = {};
        }
    }

    // Guardar datos a archivo
    save() {
        try {
            const jsonString = JSON.stringify(this.data, null, 2);

            // Opcional: encriptar antes de guardar
            // const encrypted = this.encrypt(jsonString);
            // fs.writeFileSync(this.storageFile, encrypted, 'utf8');

            // Sin encriptar (más simple para debugging)
            fs.writeFileSync(this.storageFile, jsonString, 'utf8');

            console.log('✓ Datos guardados correctamente');
        } catch (error) {
            console.error('Error guardando datos:', error);
            throw error;
        }
    }

    // Obtener valor por clave
    get(key, defaultValue = null) {
        try {
            if (key in this.data) {
                return this.data[key];
            }
            return defaultValue;
        } catch (error) {
            console.error(`Error obteniendo clave '${key}':`, error);
            return defaultValue;
        }
    }

    // Establecer valor por clave
    set(key, value) {
        try {
            this.data[key] = value;
            this.save();
            return true;
        } catch (error) {
            console.error(`Error estableciendo clave '${key}':`, error);
            return false;
        }
    }

    // Eliminar clave
    delete(key) {
        try {
            if (key in this.data) {
                delete this.data[key];
                this.save();
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Error eliminando clave '${key}':`, error);
            return false;
        }
    }

    // Verificar si existe una clave
    has(key) {
        return key in this.data;
    }

    // Limpiar todo
    clear() {
        try {
            this.data = {};
            this.save();
            console.log('✓ Almacenamiento limpiado');
            return true;
        } catch (error) {
            console.error('Error limpiando almacenamiento:', error);
            return false;
        }
    }

    // Obtener todas las claves
    keys() {
        return Object.keys(this.data);
    }

    // Obtener todos los datos (cuidado con datos sensibles)
    getAll() {
        return { ...this.data };
    }

    // Exportar datos a archivo
    export(filepath) {
        try {
            const jsonString = JSON.stringify(this.data, null, 2);
            fs.writeFileSync(filepath, jsonString, 'utf8');
            console.log(`✓ Datos exportados a: ${filepath}`);
            return true;
        } catch (error) {
            console.error('Error exportando datos:', error);
            return false;
        }
    }

    // Importar datos desde archivo
    import(filepath) {
        try {
            const rawData = fs.readFileSync(filepath, 'utf8');
            this.data = JSON.parse(rawData);
            this.save();
            console.log(`✓ Datos importados desde: ${filepath}`);
            return true;
        } catch (error) {
            console.error('Error importando datos:', error);
            return false;
        }
    }
}

module.exports = SecureStorage;