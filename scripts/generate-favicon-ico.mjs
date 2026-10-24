import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const png16 = fs.readFileSync(path.join(rootDir, 'public', 'brand', 'favicon-16.png'));
const png32 = fs.readFileSync(path.join(rootDir, 'public', 'brand', 'favicon-32.png'));

// Build ICO header (6 bytes)
// 0-1: 0 (reserved)
// 2-3: 1 (type: 1 = ICO)
// 4-5: 2 (image count: 2)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(2, 4);

const offset16 = 6 + (16 * 2);
const offset32 = offset16 + png16.length;

// Entry 1: 16x16
const entry16 = Buffer.alloc(16);
entry16.writeUInt8(16, 0);
entry16.writeUInt8(16, 1);
entry16.writeUInt8(0, 2);
entry16.writeUInt8(0, 3);
entry16.writeUInt16LE(1, 4);
entry16.writeUInt16LE(32, 6);
entry16.writeUInt32LE(png16.length, 8);
entry16.writeUInt32LE(offset16, 12);

// Entry 2: 32x32
const entry32 = Buffer.alloc(16);
entry32.writeUInt8(32, 0);
entry32.writeUInt8(32, 1);
entry32.writeUInt8(0, 2);
entry32.writeUInt8(0, 3);
entry32.writeUInt16LE(1, 4);
entry32.writeUInt16LE(32, 6);
entry32.writeUInt32LE(png32.length, 8);
entry32.writeUInt32LE(offset32, 12);

const icoBuffer = Buffer.concat([header, entry16, entry32, png16, png32]);
fs.writeFileSync(path.join(rootDir, 'public', 'favicon.ico'), icoBuffer);
console.log(`Generated public/favicon.ico (${icoBuffer.length} bytes)`);
