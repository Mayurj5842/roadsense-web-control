const fs = require('fs');
const path = require('path');

const fwPath = path.join(__dirname, '..', 'firmware', 'roadsense-rover', 'roadsense-rover.ino');
const bePath = path.join(__dirname, '..', 'backend', '.env');

const fw = fs.readFileSync(fwPath, 'utf8');
const m = fw.match(/DEVICE_API_KEY\s*=\s*"([^"]+)"/);
const bk = fs.readFileSync(bePath, 'utf8').split(/\r?\n/).find(l => l.startsWith('DEVICE_API_KEY=')).split('=')[1].trim();
const fk = m ? m[1] : null;

console.log('FW_LEN:', fk ? fk.length : null);
console.log('BK_LEN:', bk.length);
console.log('MATCH:', fk === bk);
if (fk && bk && fk !== bk) {
  const min = Math.min(fk.length, bk.length);
  for (let i = 0; i < min; i++) {
    if (fk.charCodeAt(i) !== bk.charCodeAt(i)) {
      console.log('DIFF_AT:', i, 'fw=0x' + fk.charCodeAt(i).toString(16), 'bk=0x' + bk.charCodeAt(i).toString(16));
      break;
    }
  }
  if (fk.length !== bk.length) console.log('LENGTH_DIFFERENT');
}
