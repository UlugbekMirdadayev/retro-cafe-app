const fs = require("fs");
const path = require("path");

const templatesFile = path.join(__dirname, "templates.json");

function getTemplate(type) {
  const templates = loadTemplates();
  return templates[type] || null;
}

// Helper function to get template by ID (for socket bindings)
function getTemplateById(templateId) {
  const templates = loadTemplates();
  return templates[templateId] || null;
}

function saveTemplate(type, template) {
  const templates = loadTemplates();
  templates[type] = template;
  fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2));
}

function loadTemplates() {
  if (!fs.existsSync(templatesFile)) return {};
  return JSON.parse(fs.readFileSync(templatesFile));
}

/**
 * Сохраняет все шаблоны
 * @param {Object} templates - объект со всеми шаблонами
 * @returns {boolean} - результат операции сохранения
 */
function saveTemplates(templates) {
  try {
    fs.writeFileSync(templatesFile, JSON.stringify(templates, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving templates:', error);
    return false;
  }
}

module.exports = { getTemplate, getTemplateById, saveTemplate, loadTemplates, saveTemplates };
