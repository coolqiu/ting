import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');

const enFile = path.join(localesDir, 'en.json');
const enData = JSON.parse(fs.readFileSync(enFile, 'utf8'));

// Deep merge where base (en) provides missing keys, but target retains existing ones
function deepMerge(base, target) {
    const result = { ...base };
    for (const key in target) {
        if (typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
            result[key] = deepMerge(base[key] || {}, target[key]);
        } else {
            // Keep the target's translated value
            result[key] = target[key];
        }
    }
    return result;
}

const files = fs.readdirSync(localesDir);
let count = 0;
files.forEach(file => {
    // Skip en and zh-CN as they are our primary maintained files
    if (file === 'en.json' || file === 'zh-CN.json' || !file.endsWith('.json')) return;

    const filePath = path.join(localesDir, file);
    const targetData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const merged = deepMerge(enData, targetData);

    fs.writeFileSync(filePath, JSON.stringify(merged, null, 4), 'utf8');
    console.log(`Synced missing keys for ${file} using English defaults.`);
    count++;
});
console.log(`Finished processing ${count} files.`);
