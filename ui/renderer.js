document.getElementById('save').addEventListener('click', async () => {
  const ip = document.getElementById('ip').value;
  await window.api.saveSettings({ printerIp: ip });
});

document.getElementById('test').addEventListener('click', async () => {
  await window.api.testPrint();
});

document.getElementById('clearLogs').addEventListener('click', async () => {
  await window.api.clearLogs();
  loadLogs();
});

async function loadLogs() {
  const logs = await window.api.getLogs();
  const list = document.getElementById('logs');
  list.innerHTML = '';
  logs.forEach(log => {
    const li = document.createElement('li');
    li.textContent = `${log.time} - ${log.eventType} - ${log.status}`;
    list.appendChild(li);
  });
}

(async () => {
  const settings = await window.api.getSettings();
  document.getElementById('ip').value = settings.printerIp;
  loadLogs();
})();
