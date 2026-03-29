import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '../src/locales');

const patches = {
    "zh-TW": {
        nav_stats: "學習統計",
        stats: { title: "學習統計", dailyTime: "每日學習時長", accuracyTrend: "正確率走勢", minutes: "分鐘", accuracy: "發音得分均值", last7Days: "最近 7 天", last30Days: "最近 30 天", mastered: "累積完成複讀", learning: "能力分布", new: "複述完成", totalTime: "今日學習時長", streak: "連續學習", days: "天" },
        ab_b: "標記 B"
    },
    "ja": {
        nav_stats: "統計",
        stats: { title: "学習統計", dailyTime: "毎日の学習時間", accuracyTrend: "正解率の推移", minutes: "分", accuracy: "発音平均スコア", last7Days: "直近7日間", last30Days: "直近30日間", mastered: "シャドーイング完了", learning: "能力分布", new: "スピーキング完了", totalTime: "今日の学習時間", streak: "連続学習", days: "日" },
        ab_b: "マーク B"
    },
    "ko": {
        nav_stats: "학습 통계",
        stats: { title: "학습 통계", dailyTime: "일일 학습 시간", accuracyTrend: "정확도 추이", minutes: "분", accuracy: "발음 평균 점수", last7Days: "최근 7일", last30Days: "최근 30일", mastered: "반복 학습 완료", learning: "능력 분포", new: "말하기 완료", totalTime: "오늘 학습 시간", streak: "연속 학습", days: "일" },
        ab_b: "마크 B"
    },
    "ru": {
        nav_stats: "Статистика",
        stats: { title: "Статистика обучения", dailyTime: "Время обучения за день", accuracyTrend: "Динамика точности", minutes: "мин.", accuracy: "Средний балл произношения", last7Days: "За 7 дней", last30Days: "За 30 дней", mastered: "Повторения завершены", learning: "Распределение навыков", new: "Практика речи завершена", totalTime: "Время обучения сегодня", streak: "Дней подряд", days: "дн." },
        ab_b: "Отметка B"
    },
    "pt": {
        nav_stats: "Estatísticas",
        stats: { title: "Estatísticas de Estudo", dailyTime: "Tempo de Estudo Diário", accuracyTrend: "Tendência de Precisão", minutes: "min", accuracy: "Pontuação Média", last7Days: "Últimos 7 dias", last30Days: "Últimos 30 dias", mastered: "Repetições Concluídas", learning: "Distribuição de Habilidades", new: "Prática de Fala", totalTime: "Tempo de Estudo Hoje", streak: "Dias Seguidos", days: "dias" },
        ab_b: "Marcar B"
    },
    "es": {
        nav_stats: "Estadísticas",
        stats: { title: "Estadísticas", dailyTime: "Tiempo Diario", accuracyTrend: "Tendencia de Precisión", minutes: "min", accuracy: "Puntuación Media", last7Days: "Últimos 7 días", last30Days: "Últimos 30 días", mastered: "Repeticiones", learning: "Distribución de Habilidades", new: "Práctica de Habla", totalTime: "Tiempo de Estudio Hoy", streak: "Racha", days: "días" },
        ab_b: "Marcar B"
    },
    "fr": {
        nav_stats: "Statistiques",
        stats: { title: "Statistiques", dailyTime: "Temps d'étude quotidien", accuracyTrend: "Tendance de précision", minutes: "min", accuracy: "Score moyen", last7Days: "7 derniers jours", last30Days: "30 derniers jours", mastered: "Répétitions", learning: "Distribution", new: "Pratique orale", totalTime: "Temps d'étude", streak: "Série", days: "jours" },
        ab_b: "Marquer B"
    },
    "de": {
        nav_stats: "Statistiken",
        stats: { title: "Lernstatistiken", dailyTime: "Tägliche Lernzeit", accuracyTrend: "Genauigkeitstrend", minutes: "Min.", accuracy: "Durchschn. Bewertung", last7Days: "Letzte 7 Tage", last30Days: "Letzte 30 Tage", mastered: "Wiederholungen", learning: "Fähigkeitsverteilung", new: "Sprechübung", totalTime: "Lernzeit Heute", streak: "Streak", days: "Tage" },
        ab_b: "Markiere B"
    },
    "ar": {
        nav_stats: "الإحصائيات",
        stats: { title: "إحصائيات", dailyTime: "وقت الدراسة", accuracyTrend: "اتجاه الدقة", minutes: "دقائق", accuracy: "متوسط الدرجة", last7Days: "آخر 7 أيام", last30Days: "آخر 30 يومًا", mastered: "اكتمل التكرار", learning: "المهارات", new: "ممارسة التحدث", totalTime: "وقت الدراسة", streak: "أيام متتالية", days: "أيام" },
        ab_b: "علامة B"
    },
    "he": {
        nav_stats: "סטטיסטיקות",
        stats: { title: "סטטיסטיקות", dailyTime: "זמן לימוד יומי", accuracyTrend: "מגמת דיוק", minutes: "דקות", accuracy: "ציון ממוצע", last7Days: "7 ימים", last30Days: "30 ימים", mastered: "חזרות", learning: "חילוק יכולות", new: "תרגול דיבור", totalTime: "זמן לימוד היום", streak: "רצף ימים", days: "ימים" },
        ab_b: "סמן B"
    }
};

let count = 0;
Object.keys(patches).forEach(locale => {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        try {
            const data = JSON.parse(content);

            if (data.nav) {
                data.nav.stats = patches[locale].nav_stats;
            }
            // Always set stats object
            data.stats = patches[locale].stats;

            if (data.workspace_v2) {
                data.workspace_v2.ab_b = patches[locale].ab_b;
            }

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
