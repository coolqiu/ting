import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '../src/locales');

const patches = {
    "zh-TW": {
        learningLanguage: "學習目標語言",
        learningLanguageDesc: "您目前正在學習的語言（影響口語評測與翻譯）",
        ab_a: "標記 A",
        dictation_quick_submit: "按 Ctrl+Enter 快速提交",
        faq_db: "資料重設：刪除 AppData/Roaming/org.listenmate.pp/db 資料夾。"
    },
    "ja": {
        learningLanguage: "学習対象言語",
        learningLanguageDesc: "現在学習している言語（スピーキング評価と翻訳に影響します）",
        ab_a: "マーク A",
        dictation_quick_submit: "Ctrl+Enter で送信",
        faq_db: "データのリセット: AppData/Roaming/org.listenmate.pp/db フォルダを削除します。"
    },
    "ko": {
        learningLanguage: "학습 대상 언어",
        learningLanguageDesc: "현재 학습 중인 언어 (말하기 평가 및 번역에 영향을 미침)",
        ab_a: "마크 A",
        dictation_quick_submit: "Ctrl+Enter 를 눌러 빠른 제출",
        faq_db: "데이터 재설정: AppData/Roaming/org.listenmate.pp/db 폴더를 삭제하십시오."
    },
    "ru": {
        learningLanguage: "Язык изучения",
        learningLanguageDesc: "Язык, который вы сейчас изучаете (влияет на оценку речи и перевод)",
        ab_a: "Отметка A",
        dictation_quick_submit: "Нажмите Ctrl+Enter для отправки",
        faq_db: "Сброс данных: Удалите папку AppData/Roaming/org.listenmate.pp/db."
    },
    "pt": {
        learningLanguage: "Idioma de Estudo",
        learningLanguageDesc: "O idioma que você está estudando (afeta a avaliação de fala e tradução)",
        ab_a: "Marcar A",
        dictation_quick_submit: "Pressione Ctrl+Enter para enviar",
        faq_db: "Redefinição de dados: Exclua a pasta AppData/Roaming/org.listenmate.pp/db."
    },
    "es": {
        learningLanguage: "Idioma de Estudio",
        learningLanguageDesc: "El idioma que estás estudiando (afecta la evaluación oral y la traducción)",
        ab_a: "Marcar A",
        dictation_quick_submit: "Presione Ctrl+Enter para enviar",
        faq_db: "Restablecer datos: Elimina la carpeta AppData/Roaming/org.listenmate.pp/db."
    },
    "fr": {
        learningLanguage: "Langue d'étude",
        learningLanguageDesc: "La langue que vous étudiez (affecte l'évaluation orale et la traduction)",
        ab_a: "Marquer A",
        dictation_quick_submit: "Appuyez sur Ctrl+Enter pour envoyer",
        faq_db: "Réinitialisation des données : Supprimez le dossier AppData/Roaming/org.listenmate.pp/db."
    },
    "de": {
        learningLanguage: "Lernsprache",
        learningLanguageDesc: "Die Sprache, die Sie gerade lernen (wirkt sich auf die Sprechbewertung und Übersetzung aus)",
        ab_a: "Markiere A",
        dictation_quick_submit: "Drücken Sie Ctrl+Enter zum Senden",
        faq_db: "Daten zurücksetzen: Löschen Sie den Ordner AppData/Roaming/org.listenmate.pp/db."
    },
    "ar": {
        learningLanguage: "لغة التعلم",
        learningLanguageDesc: "اللغة التي تتعلمها حاليًا (تؤثر على تقييم التحدث والترجمة)",
        ab_a: "علامة A",
        dictation_quick_submit: "اضغط على Ctrl+Enter للإرسال",
        faq_db: "إعادة ضبط البيانات: احذف مجلد AppData/Roaming/org.listenmate.pp/db."
    },
    "he": {
        learningLanguage: "שפת למידה",
        learningLanguageDesc: "השפה שאתה לומד כעת (משפיעה על הערכת הדיבור והתרגום)",
        ab_a: "סמן A",
        dictation_quick_submit: "הקש Ctrl+Enter כדי לשלוח",
        faq_db: "איפוס נתונים: מחק את התיקייה AppData/Roaming/org.listenmate.pp/db."
    }
};

let count = 0;
Object.keys(patches).forEach(locale => {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        try {
            const data = JSON.parse(content);

            if (data.settings) {
                data.settings.learningLanguage = patches[locale].learningLanguage;
                data.settings.learningLanguageDesc = patches[locale].learningLanguageDesc;
            }
            if (data.workspace_v2) {
                data.workspace_v2.ab_a = patches[locale].ab_a;
                data.workspace_v2.dictation_quick_submit = patches[locale].dictation_quick_submit;
            }
            if (data.help) {
                data.help.faq_db = patches[locale].faq_db;
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
