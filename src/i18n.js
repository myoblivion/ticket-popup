import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';

i18n
  .use(HttpApi) // Loads translations from /public/locales
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    fallbackLng: 'en', // Use 'en' if detected language is not available
    debug: true,       // Logs info to console
    interpolation: {
      escapeValue: false, // React already safes from XSS
    },
    // Tell it where to find the JSON files
    backend: {
      loadPath: '/locales/{{lng}}/translation.json',
    },
  });

export default i18n;