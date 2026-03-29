import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const locales = ['en', 'zh-CN', 'ar', 'he', 'de', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-TW'];

const additions = {
    'en': 'User Profile',
    'zh-CN': '个人中心',
    'zh-TW': '個人中心',
    'ja': 'プロフィール',
    'ar': 'الملف الشخصي',
    'he': 'פרופיל משתמש',
    'de': 'Benutzerprofil',
    'es': 'Perfil de Usuario',
    'fr': 'Profil Utilisateur',
    'ko': '사용자 프로필',
    'pt': 'Perfil de Usuário',
    'ru': 'Профиль пользователя'
};

locales.forEach(loc => {
    const file = path.join(__dirname, `../src/locales/${loc}.json`);
    if (fs.existsSync(file)) {
        let data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.nav && !data.nav.profile) {
            data.nav.profile = additions[loc] || additions['en'];
            fs.writeFileSync(file, JSON.stringify(data, null, 4));
            console.log(`Updated nav.profile in ${loc}.json`);
        }
    }
});
