// i18n.js - модуль клиентской локализации

// Кэш переводов
let translationsCache = {};
let currentLanguage = 'ru';

// Инициализирует локализацию
async function initLocalization() {
  try {
    // Получаем текущий язык
    currentLanguage = await window.api.localization.getCurrentLanguage();
    console.log('Current language:', currentLanguage);
    
    // Загружаем переводы
    await updateTranslations();
  } catch (error) {
    console.error('Error initializing localization:', error);
  }
}

// Обновляет переводы для текущего языка
async function updateTranslations() {
  // Загружаем все основные ключи
  const keysToLoad = [
    'app', 'sidebar', 'status', 'printer', 'server', 
    'templates', 'logs', 'settings', 'toasts'
  ];
  
  translationsCache = {};
  
  // Загружаем все переводы из основных разделов
  for (const key of keysToLoad) {
    try {
      translationsCache[key] = await window.api.localization.translate(key);
    } catch (error) {
      console.error(`Error loading translations for ${key}:`, error);
      translationsCache[key] = {};
    }
  }
}

// Меняет язык приложения
async function changeLanguage(language) {
  try {
    await window.api.localization.changeLanguage(language);
    currentLanguage = language;
    await updateTranslations();
    updateAllTranslations();
    return true;
  } catch (error) {
    console.error('Error changing language:', error);
    return false;
  }
}

// Получает перевод по ключу
function t(key) {
  const parts = key.split('.');
  if (parts.length < 2) {
    console.warn(`Invalid translation key: ${key}`);
    return key;
  }
  
  const section = parts[0];
  const subKey = parts[1];
  
  if (!translationsCache[section]) {
    console.warn(`Translation section not found: ${section}`);
    return key;
  }
  
  if (!translationsCache[section][subKey]) {
    console.warn(`Translation key not found: ${section}.${subKey}`);
    return key;
  }
  
  return translationsCache[section][subKey];
}

// Обновляет все элементы с атрибутом data-i18n
function updateAllTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  
  // Обновляем placeholder атрибуты для полей ввода
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  
  // Обновляем заголовок документа
  document.title = t('app.title');
  
  // Дополнительная обработка для select-опций с data-i18n-options
  document.querySelectorAll('[data-i18n-options]').forEach(selectEl => {
    const prefix = selectEl.getAttribute('data-i18n-options');
    Array.from(selectEl.options).forEach(option => {
      const key = `${prefix}.${option.value}`;
      option.textContent = t(key);
    });
  });
}

// Получает текущий язык
function getCurrentLanguage() {
  return currentLanguage;
}

// Экспортируем функции
window.i18n = {
  init: initLocalization,
  t: t,
  changeLanguage: changeLanguage,
  updateAll: updateAllTranslations,
  getCurrentLanguage: getCurrentLanguage
};
