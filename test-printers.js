const printer = require('pdf-to-printer');

(async () => {
    try {
        console.log('Listing printers...');
        const printers = await printer.getPrinters();
        console.log(JSON.stringify(printers, null, 2));
    } catch (e) {
        console.error(e);
    }
})();
