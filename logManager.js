const fs = require("fs");
const path = require("path");

const logsFile = path.join(__dirname, "logs.json");

function getLogs() {
  if (!fs.existsSync(logsFile)) return [];
  return JSON.parse(fs.readFileSync(logsFile));
}

function addLog(eventType, templateName, status) {
  const logs = getLogs();
  logs.push({
    time: new Date().toISOString(),
    eventType,
    templateName,
    status,
  });
  fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));
}

function clearLogs() {
  fs.writeFileSync(logsFile, JSON.stringify([], null, 2));
}

module.exports = { getLogs, addLog, clearLogs };
