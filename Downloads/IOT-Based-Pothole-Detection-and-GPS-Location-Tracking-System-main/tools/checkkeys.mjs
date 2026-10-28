import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fwPath = path.join(__dirname, '..', 'firmware', 'roadsense-rover', 'roadsense-rover.ino');
const bePath = path.join(__dirname, '..', 'backend', '.env');

const fw = fs.readFileSync(fwPath, 'utf8');
const m = fw.match(/DEVICE_API_KEY\s*=\s*"([^"]+)"/);
const beContent = fs.readFileSync(bePath, 'utf8');
const bkLine = beContent.split(/\r?\n/).find(l => l.startsWith('DEVICE_API_KEY='));
const bk = bkLine ? bkLine.split('=')[1].trim() : null;
const fk = m ? m[1] : null;

console.log('FW_LEN:', fk ? fk.length : null);
console.log('BK_LEN:', bk ? bk.length : null);
console.log('MATCH:', fk === bk);
if (fk && bk && fk !== bk) {
  const min = Math.min(fk.length, bk.length);
  for (let i = 0; i < min; i++) {
    if (fk.charCodeAt(i) !== bk.charCodeAt(i)) {
      console.log('DIFF_AT:', i, 'fw=0x' + fk.charCodeAt(i).toString(16), 'bk=0x' + bk.charCodeAt(i).toString(16), 'fwChar=' + fk[i], 'bkChar=' + bk[i]);
      break;
    }
  }
  if (fk.length !== bk.length) console.log('LENGTH_DIFFERENT');
}
