const fs = require('fs');
const path = require('path');
const settings = require('./settings');

let translations = {};
let currentLanguage = 'ru'; // Язык по умолчанию

// Загружает переводы для указанного языка
function loadTranslations(lang) {
  try {
    const filePath = path.join(__dirname, 'locales', `${lang}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`Translation file for language '${lang}' not found, falling back to 'ru'`);
      return loadTranslations('ru');
    }
    
    const translationsData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(translationsData);
  } catch (error) {
    console.error(`Error loading translations for ${lang}:`, error);
    
    // Если произошла ошибка и это не русский язык, пробуем загрузить русский
    if (lang !== 'ru') {
      console.warn('Falling back to Russian language');
      return loadTranslations('ru');
    }
    
    // Если и с русским проблема, возвращаем пустой объект
    return {};
  }
}

// Инициализирует систему локализации с указанным языком
function initialize() {
  const userSettings = settings.getSettings();
  currentLanguage = userSettings.language || 'ru';
  translations = loadTranslations(currentLanguage);
  console.log(`Localization initialized with language: ${currentLanguage}`);
  return currentLanguage;
}

// Меняет язык
function setLanguage(lang) {
  if (lang !== currentLanguage) {
    currentLanguage = lang;
    translations = loadTranslations(lang);
    console.log(`Language changed to: ${lang}`);
    return true;
  }
  return false;
}

// Получает текущий язык
function getCurrentLanguage() {
  return currentLanguage;
}

// Получает перевод по ключу
function translate(key) {
  const parts = key.split('.');
  let value = translations;
  
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key; // Возвращаем исходный ключ, если перевод не найден
    }
  }
  
  return value;
}

// Получает все доступные языки
function getAvailableLanguages() {
  try {
    const localesDir = path.join(__dirname, 'locales');
    const files = fs.readdirSync(localesDir);
    
    const languages = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
    
    return languages;
  } catch (error) {
    console.error('Error getting available languages:', error);
    return ['ru', 'en', 'uz']; // Возвращаем минимальный набор по умолчанию
  }
}

module.exports = {
  initialize,
  setLanguage,
  getCurrentLanguage,
  translate,
  getAvailableLanguages
};
