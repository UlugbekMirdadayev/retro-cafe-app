const fs = require("fs");
const path = require("path");

const settingsFile = path.join(__dirname, "settings.json");

function getSettings() {
  if (!fs.existsSync(settingsFile)) return { printerIp: "192.168.123.100" };
  return JSON.parse(fs.readFileSync(settingsFile));
}

function saveSettings(newSettings) {
  fs.writeFileSync(settingsFile, JSON.stringify(newSettings, null, 2));
}

module.exports = { getSettings, saveSettings };
