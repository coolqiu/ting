import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');

const translations = {
    "ar": {
        settings: {
            microphone: "جهاز إدخال الصوت",
            microphoneDesc: "اختر الميكروفون المستخدم لممارسة التحدث",
            exportData: "تصدير البيانات",
            exportDataDesc: "تصدير تقدم دراستك إلى نسخة احتياطية بصيغة JSON",
            clearCache: "مسح ذاكرة التخزين المؤقت",
            clearCacheDesc: "حذف الملفات الصوتية المؤقتة لتفريغ مساحة التخزين",
            confirmClearCache: "هل أنت متأكد من مسح جميع الملفات الصوتية؟ لن يؤثر ذلك على تقدمك.",
            defaultDevice: "الافتراضي للنظام"
        },
        profile: {
            dailyGoal: "هدف الدراسة اليومي",
            goalUnset: "غير محدد",
            goal15: "15 دقيقة",
            goal30: "30 دقيقة",
            goal60: "60 دقيقة",
            editUsername: "تعديل اسم المستخدم",
        },
        stats: {
            pronunciationTracking: "تتبع النطق",
            noPronunciationData: "لا توجد بيانات نطق بعد",
            activeStudyHeatmap: "خريطة نشاط التعلم",
        },
        library: {
            emptyDesc: "ابدأ رحلة التعلم الخاصة بك باستيراد رابط فيديو أو ملف محلي."
        }
    },
    "he": {
        settings: {
            microphone: "התקן קלט שמע",
            microphoneDesc: "בחר את המיקרופון המשמש לאימון דיבור",
            exportData: "ייצוא נתונים",
            exportDataDesc: "ייצא את התקדמות הלמידה שלך כגיבוי JSON",
            clearCache: "נקה מטמון שמע",
            clearCacheDesc: "מחק קבצי שמע זמניים כדי לפנות שטח אחסון",
            confirmClearCache: "האם אתה בטוח שברצונך למחוק את כל קבצי השמע? זה לא ישפיע על התקדמותך.",
            defaultDevice: "ברירת המחדל של המערכת"
        },
        profile: {
            dailyGoal: "יעד למידה יומי",
            goalUnset: "לא הוגדר",
            goal15: "15 דקות",
            goal30: "30 דקות",
            goal60: "60 דקות",
            editUsername: "ערוך שם משתמש",
        },
        stats: {
            pronunciationTracking: "מעקב הגייה",
            noPronunciationData: "אין עדיין נתוני הגייה",
            activeStudyHeatmap: "מפת פעילות למידה",
        },
        library: {
            emptyDesc: "התחל את מסע הלמידה שלך באמצעות ייבוא קישור וידאו או קובץ מקומי."
        }
    },
    "ja": {
        settings: {
            microphone: "音声入力デバイス",
            microphoneDesc: "スピーキング練習に使用するマイクを選択します",
            exportData: "学習記録のエクスポート",
            exportDataDesc: "学習の進捗状況をJSON形式でバックアップします",
            clearCache: "キャッシュのクリア",
            clearCacheDesc: "ダウンロードした一時的な音声ファイルを削除して容量を解放します",
            confirmClearCache: "すべての音声キャッシュファイルを削除しますか？学習の進捗には影響しません。",
            defaultDevice: "システムデフォルト"
        },
        profile: {
            dailyGoal: "1日の目標",
            goalUnset: "未設定",
            goal15: "15 分",
            goal30: "30 分",
            goal60: "60 分",
            editUsername: "ユーザー名の変更",
        },
        stats: {
            pronunciationTracking: "発音トラッキング",
            noPronunciationData: "発音データはまだありません",
            activeStudyHeatmap: "アクティブ学習ヒートマップ",
        },
        library: {
            emptyDesc: "ビデオURLやローカルファイルをインポートして、学習を始めましょう！"
        }
    },
    "ko": {
        settings: {
            microphone: "오디오 입력 장치",
            microphoneDesc: "말하기 연습에 사용할 마이크를 선택하세요",
            exportData: "학습 기록 내보내기",
            exportDataDesc: "모든 학습 진행 상황을 JSON으로 백업합니다",
            clearCache: "캐시 지우기",
            clearCacheDesc: "임시 오디오 파일을 삭제하여 디스크 공간을 확보합니다",
            confirmClearCache: "모든 오디오 캐시 파일을 삭제하시겠습니까? 학습 진행에는 영향을 주지 않습니다.",
            defaultDevice: "시스템 기본값"
        },
        profile: {
            dailyGoal: "일일 목표",
            goalUnset: "설정 안 됨",
            goal15: "15 분",
            goal30: "30 분",
            goal60: "60 분",
            editUsername: "사용자 이름 수정",
        },
        stats: {
            pronunciationTracking: "발음 추적",
            noPronunciationData: "발음 데이터가 아직 없습니다",
            activeStudyHeatmap: "학습 활동 히트맵",
        },
        library: {
            emptyDesc: "비디오 URL이나 로컬 파일을 가져와 학습을 시작하세요!"
        }
    },
    "de": {
        settings: {
            microphone: "Audio-Eingabegerät",
            microphoneDesc: "Wählen Sie das Mikrofon für die Sprechübung",
            exportData: "Lernfortschritt exportieren",
            exportDataDesc: "Exportieren Sie Ihren Lernfortschritt als JSON-Backup",
            clearCache: "Audio-Cache leeren",
            clearCacheDesc: "Löschen Sie temporäre Audio-Dateien, um Speicherplatz freizugeben",
            confirmClearCache: "Sind Sie sicher, dass Sie alle Audio-Cache-Dateien löschen möchten? Ihr Fortschritt bleibt erhalten.",
            defaultDevice: "Systemstandard"
        },
        profile: {
            dailyGoal: "Tägliches Lernziel",
            goalUnset: "Nicht festgelegt",
            goal15: "15 Min",
            goal30: "30 Min",
            goal60: "60 Min",
            editUsername: "Benutzername bearbeiten",
        },
        stats: {
            pronunciationTracking: "Aussprache-Verlauf",
            noPronunciationData: "Noch keine Aussprache-Daten",
            activeStudyHeatmap: "Aktivitäts-Heatmap",
        },
        library: {
            emptyDesc: "Starten Sie Ihre Lernreise, indem Sie ein Video importieren!"
        }
    },
    "es": {
        settings: {
            microphone: "Dispositivo de entrada de audio",
            microphoneDesc: "Seleccione el micrófono para las prácticas de habla",
            exportData: "Exportar datos",
            exportDataDesc: "Exporta tu progreso de estudio a un archivo JSON",
            clearCache: "Borrar caché de audio",
            clearCacheDesc: "Elimine los archivos de audio temporales para liberar espacio",
            confirmClearCache: "¿Seguro que desea borrar todos los archivos de audio? Su progreso no se verá afectado.",
            defaultDevice: "Predeterminado del sistema"
        },
        profile: {
            dailyGoal: "Objetivo diario",
            goalUnset: "Sin configurar",
            goal15: "15 min",
            goal30: "30 min",
            goal60: "60 min",
            editUsername: "Editar usuario",
        },
        stats: {
            pronunciationTracking: "Seguimiento de pronunciación",
            noPronunciationData: "Aún no hay datos de pronunciación",
            activeStudyHeatmap: "Mapa de calor de estudio",
        },
        library: {
            emptyDesc: "¡Comienza tu viaje de aprendizaje importando un vídeo o archivo!"
        }
    },
    "fr": {
        settings: {
            microphone: "Périphérique d'entrée audio",
            microphoneDesc: "Sélectionnez le microphone pour la pratique orale",
            exportData: "Exporter les données",
            exportDataDesc: "Exportez votre progression sous forme de sauvegarde JSON",
            clearCache: "Vider le cache",
            clearCacheDesc: "Supprimez les fichiers audio temporaires pour libérer de l'espace",
            confirmClearCache: "Voulez-vous vraiment supprimer les fichiers cache? Votre progression sera conservée.",
            defaultDevice: "Défaut du système"
        },
        profile: {
            dailyGoal: "Objectif quotidien",
            goalUnset: "Non défini",
            goal15: "15 min",
            goal30: "30 min",
            goal60: "60 min",
            editUsername: "Modifier le pseudo",
        },
        stats: {
            pronunciationTracking: "Suivi de la prononciation",
            noPronunciationData: "Pas encore de données de prononciation",
            activeStudyHeatmap: "Carte thermique d'activité",
        },
        library: {
            emptyDesc: "Commencez votre apprentissage en important une vidéo ou un fichier local!"
        }
    },
    "ru": {
        settings: {
            microphone: "Устройство ввода аудио",
            microphoneDesc: "Выберите микрофон для практики речи",
            exportData: "Экспорт данных",
            exportDataDesc: "Экспортируйте прогресс обучения в JSON",
            clearCache: "Очистить кэш",
            clearCacheDesc: "Удалить временные аудиофайлы для освобождения места",
            confirmClearCache: "Вы уверены, что хотите удалить временные аудиофайлы? Ваш прогресс не будет затронут.",
            defaultDevice: "Системный"
        },
        profile: {
            dailyGoal: "Ежедневная цель",
            goalUnset: "Не задано",
            goal15: "15 мин",
            goal30: "30 мин",
            goal60: "60 мин",
            editUsername: "Изменить имя",
        },
        stats: {
            pronunciationTracking: "Трекинг произношения",
            noPronunciationData: "Пока нет данных о произношении",
            activeStudyHeatmap: "Тепловая карта активности",
        },
        library: {
            emptyDesc: "Начните обучение, добавив видео или файл!"
        }
    },
    "pt": {
        settings: {
            microphone: "Dispositivo de entrada",
            microphoneDesc: "Selecione o microfone para práticas orais",
            exportData: "Exportar Dados",
            exportDataDesc: "Exporte seu progresso em um arquivo JSON",
            clearCache: "Limpar cache",
            clearCacheDesc: "Exclua arquivos de áudio temporários para liberar espaço",
            confirmClearCache: "Tem certeza de que deseja limpar os arquivos de cache? O seu progresso não será afetado.",
            defaultDevice: "Padrão do sistema"
        },
        profile: {
            dailyGoal: "Meta diária",
            goalUnset: "Não definido",
            goal15: "15 min",
            goal30: "30 min",
            goal60: "60 min",
            editUsername: "Editar nome",
        },
        stats: {
            pronunciationTracking: "Rastreamento de pronúncia",
            noPronunciationData: "Ainda não há dados de pronúncia",
            activeStudyHeatmap: "Mapa de calor de atividade",
        },
        library: {
            emptyDesc: "Comece sua jornada de aprendizado importando um link de vídeo!"
        }
    },
    "zh-TW": {
        settings: {
            microphone: "音頻輸入設備",
            microphoneDesc: "選擇跟讀時使用的麥克風",
            exportData: "導出學習記錄",
            exportDataDesc: "將所有的學習進度、複習任務導出為 JSON 備份",
            clearCache: "清理音頻緩存",
            clearCacheDesc: "刪除因下載和轉錄產生的臨時錄音文件，釋放磁盤空間",
            confirmClearCache: "確定要清空所有音頻緩存文件嗎？這不會影響您的學習進度和字幕記錄。",
            defaultDevice: "系統默認"
        },
        profile: {
            dailyGoal: "每日學習目標",
            goalUnset: "未設置",
            goal15: "15 分鐘",
            goal30: "30 分鐘",
            goal60: "60 分鐘",
            editUsername: "修改用戶名",
        },
        stats: {
            pronunciationTracking: "發音追踪",
            noPronunciationData: "暫無發音數據",
            activeStudyHeatmap: "活躍學習熱力圖",
        },
        library: {
            emptyDesc: "導入視頻鏈接或本地音頻文件，開始你的學習之旅吧！"
        }
    }
};

Object.keys(translations).forEach(locale => {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (fs.existsSync(filePath)) {
        const targetData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const patch = translations[locale];

        ['settings', 'profile', 'stats', 'library'].forEach(section => {
            if (!targetData[section]) targetData[section] = {};
            targetData[section] = { ...targetData[section], ...patch[section] };
        });

        fs.writeFileSync(filePath, JSON.stringify(targetData, null, 4), 'utf8');
        console.log(`Applied translations to ${locale}.json`);
    }
});
