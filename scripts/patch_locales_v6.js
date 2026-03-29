import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');

const deleteTranslations = {
    "en": "Delete",
    "zh-CN": "删除",
    "zh-TW": "刪除",
    "ja": "削除",
    "ko": "삭제",
    "ru": "Удалить",
    "pt": "Excluir",
    "es": "Eliminar",
    "fr": "Supprimer",
    "de": "Löschen",
    "ar": "حذف",
    "he": "מחק"
};

let count = 0;
Object.keys(deleteTranslations).forEach(locale => {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        try {
            const data = JSON.parse(content);
            if (!data.common) {
                data.common = {};
            }
            data.common.delete = deleteTranslations[locale];

            fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
            console.log(`Updated ${locale}.json`);
            count++;
        } catch (e) {
            console.error(`Error processing ${locale}.json`, e);
        }
    } else {
        console.warn(`File ${filePath} does not exist`);
    }
});
console.log(`Finished processing ${count} files.`);
