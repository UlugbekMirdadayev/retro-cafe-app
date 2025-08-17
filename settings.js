const fs = require("fs");
const path = require("path");

const settingsFile = path.join(__dirname, "settings.json");
const DEFAULT_SETTINGS = { 
  printerIp: "192.168.123.100",
  socketUrl: "http://localhost:8080",
  language: "ru" // Язык по умолчанию
};

function getSettings() {
  try {
    if (!fs.existsSync(settingsFile)) {
      console.log("Settings file not found, using default settings");
      saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    
    const settingsData = fs.readFileSync(settingsFile, "utf8");
    console.log("Reading settings from file:", settingsFile);
    
    const settings = JSON.parse(settingsData);
    
    // Убедимся, что все обязательные поля присутствуют
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...settings
    };
    
    return mergedSettings;
  } catch (error) {
    console.error("Error reading settings:", error);
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(newSettings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(newSettings, null, 2));
    console.log("Settings saved successfully");
    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    return false;
  }
}

module.exports = { getSettings, saveSettings };
