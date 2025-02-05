import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Environment Test Results:');
console.log('------------------------');
console.log('Node.js Version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('CPU Cores:', os.cpus().length);
console.log('Total Memory:', Math.round(os.totalmem() / (1024 * 1024 * 1024)), 'GB');
console.log('Free Memory:', Math.round(os.freemem() / (1024 * 1024 * 1024)), 'GB');
console.log('Current Directory:', __dirname);
console.log('Environment Variables:', process.env.NODE_ENV || 'not set');
console.log('------------------------'); 