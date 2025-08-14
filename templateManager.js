const fs = require("fs");
const path = require("path");

const templatesFile = path.join(__dirname, "templates.json");

function getTemplate(type) {
  const templates = loadTemplates();
  return templates[type] || null;
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

module.exports = { getTemplate, saveTemplate, loadTemplates };
