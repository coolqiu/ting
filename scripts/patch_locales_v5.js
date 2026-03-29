import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const locales = ['en', 'zh-CN', 'ar', 'he', 'de', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-TW'];

const defaultProfile = {
    title: "User Profile",
    notLoggedIn: "Not logged in",
    joined: "Joined",
    currentStreak: "Current Streak",
    totalStudyTime: "Total Study Time (30 days)",
    days: "days",
    minutes: "min"
};

const additions = {
    'zh-CN': {
        title: "个人中心",
        notLoggedIn: "未登录",
        joined: "加入时间",
        currentStreak: "连续学习",
        totalStudyTime: "30天总学习时长",
        days: "天",
        minutes: "分钟"
    },
    'zh-TW': {
        title: "個人中心",
        notLoggedIn: "未登入",
        joined: "加入時間",
        currentStreak: "連續學習",
        totalStudyTime: "30天總學習時長",
        days: "天",
        minutes: "分鐘"
    },
    'ja': {
        title: "プロフィール",
        notLoggedIn: "未ログイン",
        joined: "参加日",
        currentStreak: "連続学習",
        totalStudyTime: "30日間の合計学習時間",
        days: "日",
        minutes: "分"
    },
    'ar': {
        title: "الملف الشخصي",
        notLoggedIn: "لم يتم تسجيل الدخول",
        joined: "انضم في",
        currentStreak: "سلسلة التعلم الحالية",
        totalStudyTime: "إجمالي وقت الدراسة (30 يومًا)",
        days: "أيام",
        minutes: "دقيقة"
    },
    'he': {
        title: "פרופיל משתמש",
        notLoggedIn: "לא מחובר",
        joined: "הצטרף/ה ב",
        currentStreak: "רצף נוכחי",
        totalStudyTime: "זמן למידה כולל (30 ימים)",
        days: "ימים",
        minutes: "דקות"
    }
};

locales.forEach(loc => {
    const file = path.join(__dirname, `../src/locales/${loc}.json`);
    if (fs.existsSync(file)) {
        let data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!data.profile) {
            data.profile = additions[loc] || defaultProfile;
            fs.writeFileSync(file, JSON.stringify(data, null, 4));
            console.log(`Updated ${loc}.json`);
        }
    }
});
