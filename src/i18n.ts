import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import he from "./locales/he.json";
import ar from "./locales/ar.json";

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            "zh-CN": { translation: zhCN },
            "zh-TW": { translation: zhTW },
            en: { translation: en },
            ru: { translation: ru },
            ja: { translation: ja },
            ko: { translation: ko },
            fr: { translation: fr },
            de: { translation: de },
            es: { translation: es },
            pt: { translation: pt },
            he: { translation: he },
            ar: { translation: ar },
        },
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ["localStorage", "navigator"],
            caches: ["localStorage"],
        },
    });

export default i18n;
