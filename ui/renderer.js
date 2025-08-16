
// --- UI Elements ---
const tabLinks = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Printer tab
const printerIpInput = document.getElementById('printer-ip');
const connectPrinterBtn = document.getElementById('connect-printer');
const testPrintBtn = document.getElementById('test-print');
const savePrinterSettingsBtn = document.getElementById('save-printer-settings');
const printerStatusElement = document.getElementById('printer-status');

// Socket tab
const socketUrlInput = document.getElementById('socket-url');
const connectSocketBtn = document.getElementById('connect-socket');
const saveSocketSettingsBtn = document.getElementById('save-socket-settings');
const socketStatusElement = document.getElementById('socket-status');

// Templates tab
const templatesList = document.getElementById('templates-list');
const templateNameInput = document.getElementById('template-name');
const templateContentInput = document.getElementById('template-content');
const setAsDefaultSelect = document.getElementById('set-as-default');
const addTemplateBtn = document.getElementById('add-template');
const saveTemplateBtn = document.getElementById('save-template');
const deleteTemplateBtn = document.getElementById('delete-template');

// Logs tab
const logFilterEventSelect = document.getElementById('log-filter-event');
const logFilterStatusSelect = document.getElementById('log-filter-status');
const logFilterDateStartInput = document.getElementById('log-filter-date-start');
const logFilterDateEndInput = document.getElementById('log-filter-date-end');
const applyLogFilterBtn = document.getElementById('apply-log-filter');
const clearLogFilterBtn = document.getElementById('clear-log-filter');
const logsTableBody = document.querySelector('#logs-table tbody');
const clearLogsBtn = document.getElementById('clear-logs');

// --- State ---
let currentState = {
  templates: {},
  defaultTemplates: {},
  selectedTemplateId: null
};

// --- Tab Navigation ---
tabLinks.forEach(link => {
  link.addEventListener('click', () => {
    tabLinks.forEach(l => l.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    link.classList.add('active');
    const tabId = link.getAttribute('data-tab');
    document.getElementById(`${tabId}-tab`).classList.add('active');
  });
});

// --- Printer ---
savePrinterSettingsBtn.addEventListener('click', async () => {
  const ip = printerIpInput.value.trim();
  if (!ip) return showToast('Введите IP принтера', 'error');
  await window.api.saveSettings({ printerIp: ip });
  showToast('IP принтера сохранён', 'success');
});

connectPrinterBtn.addEventListener('click', async () => {
  const ip = printerIpInput.value.trim();
  if (!ip) return showToast('Введите IP принтера', 'error');
  
  showToast('Подключение к принтеру...', 'info');
  showPrinterStatus('connecting');
  
  try {
    const result = await window.api.connectPrinter(ip);
    if (result.success) {
      showToast('Принтер успешно подключен', 'success');
      showPrinterStatus('connected');
    } else {
      showToast('Ошибка подключения: ' + result.error, 'error');
      showPrinterStatus('error');
    }
  } catch (e) {
    showToast('Ошибка подключения к принтеру', 'error');
    showPrinterStatus('error');
  }
});

testPrintBtn.addEventListener('click', async () => {
  try {
    showToast('Отправка тестовой печати...', 'info');
    await window.api.testPrint();
    showToast('Тестовая печать отправлена', 'success');
  } catch (e) {
    showToast('Ошибка тестовой печати', 'error');
  }
});

function showPrinterStatus(status) {
  printerStatusElement.className = 'status ' + 'status-' + status;
  const dot = printerStatusElement.querySelector('.status-dot');
  const text = printerStatusElement.querySelector('span:last-child');
  if (dot) {
    dot.className = 'status-dot status-dot-' + status;
  }
  if (text) {
    text.textContent = status === 'connected' ? 'Подключен' : status === 'connecting' ? 'Подключение...' : status === 'error' ? 'Ошибка' : 'Отключен';
  }
}

// --- Socket ---
saveSocketSettingsBtn.addEventListener('click', async () => {
  const url = socketUrlInput.value.trim();
  if (!url) return showToast('Введите URL сервера', 'error');
  await window.api.saveSettings({ socketUrl: url });
  showToast('URL сервера сохранён', 'success');
});

connectSocketBtn.addEventListener('click', async () => {
  const url = socketUrlInput.value.trim();
  if (!url) return showToast('Введите URL сервера', 'error');
  
  showToast('Подключение к серверу...', 'info');
  showSocketStatus('connecting');
  
  try {
    const result = await window.api.connectSocket(url);
    if (result.success) {
      showToast('Запрос на подключение к серверу отправлен', 'success');
    } else {
      showToast('Ошибка подключения: ' + result.error, 'error');
      showSocketStatus('error');
    }
  } catch (e) {
    showToast('Ошибка подключения к серверу', 'error');
    showSocketStatus('error');
  }
});

function showSocketStatus(status) {
  socketStatusElement.className = 'status ' + 'status-' + status;
  const dot = socketStatusElement.querySelector('.status-dot');
  const text = socketStatusElement.querySelector('span:last-child');
  if (dot) {
    dot.className = 'status-dot status-dot-' + status;
  }
  if (text) {
    text.textContent = status === 'connected' ? 'Подключен' : status === 'connecting' ? 'Подключение...' : status === 'error' ? 'Ошибка' : 'Отключен';
  }
}

// --- Templates ---
addTemplateBtn.addEventListener('click', () => {
  const id = 'template_' + Date.now();
  currentState.templates[id] = { name: 'Новый шаблон', content: '' };
  renderTemplatesList();
  selectTemplate(id);
});

saveTemplateBtn.addEventListener('click', async () => {
  const id = currentState.selectedTemplateId;
  if (!id) return showToast('Выберите шаблон', 'error');
  const name = templateNameInput.value.trim();
  const content = templateContentInput.value;
  if (!name) return showToast('Введите название', 'error');
  currentState.templates[id] = { name, content };
  renderTemplatesList();
  selectTemplate(id);
  showToast('Шаблон сохранён', 'success');
});

deleteTemplateBtn.addEventListener('click', () => {
  const id = currentState.selectedTemplateId;
  if (!id) return;
  delete currentState.templates[id];
  currentState.selectedTemplateId = null;
  renderTemplatesList();
  templateNameInput.value = '';
  templateContentInput.value = '';
  showToast('Шаблон удалён', 'success');
});

function renderTemplatesList() {
  templatesList.innerHTML = '';
  Object.entries(currentState.templates).forEach(([id, tpl]) => {
    const li = document.createElement('li');
    li.textContent = tpl.name;
    if (id === currentState.selectedTemplateId) li.classList.add('active');
    li.addEventListener('click', () => selectTemplate(id));
    templatesList.appendChild(li);
  });
}

function selectTemplate(id) {
  currentState.selectedTemplateId = id;
  renderTemplatesList();
  const tpl = currentState.templates[id];
  if (tpl) {
    templateNameInput.value = tpl.name;
    templateContentInput.value = tpl.content;
  }
}

// --- Logs ---
async function loadLogs(filter = {}) {
  const logs = await window.api.getLogs();
  renderLogs(logs);
}

function renderLogs(logs) {
  logsTableBody.innerHTML = '';
  if (!logs.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="text-center">Нет записей</td>';
    logsTableBody.appendChild(tr);
    return;
  }
  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(log.time).toLocaleString()}</td>
      <td>${log.eventType}</td>
      <td>${log.templateName || '-'}</td>
      <td>${log.status === 'success' ? 'Успешно' : 'Ошибка'}</td>
      <td></td>
    `;
    logsTableBody.appendChild(tr);
  });
}

applyLogFilterBtn.addEventListener('click', () => loadLogs());
clearLogFilterBtn.addEventListener('click', () => loadLogs());
clearLogsBtn.addEventListener('click', async () => {
  await window.api.clearLogs();
  loadLogs();
  showToast('Журнал очищен', 'success');
});

// --- Toast ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.querySelector('.toast-container').appendChild(toast);
  setTimeout(() => { toast.remove(); }, 2500);
}

// --- Init ---
async function initApp() {
  try {
    const settings = await window.api.getSettings();
    printerIpInput.value = settings.printerIp || '';
    socketUrlInput.value = settings.socketUrl || '';
    
    showPrinterStatus('disconnected');
    showSocketStatus('disconnected');
    
    // Загружаем шаблоны
    const templates = await window.api.getTemplates();
    if (templates) {
      currentState.templates = templates;
      renderTemplatesList();
    }
    
    // Загружаем логи
    loadLogs();
    
    // Подписываемся на события обновления статусов
    window.api.onPrinterStatus((data) => {
      showPrinterStatus(data.status);
      if (data.status === 'error' && data.details) {
        showToast('Ошибка принтера: ' + data.details, 'error');
      }
    });
    
    window.api.onSocketStatus((data) => {
      showSocketStatus(data.status);
      if (data.status === 'error' && data.details) {
        showToast('Ошибка сервера: ' + data.details, 'error');
      } else if (data.status === 'connected') {
        showToast('Подключено к серверу', 'success');
      }
    });
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    showToast('Ошибка при загрузке приложения', 'error');
  }
}

document.addEventListener('DOMContentLoaded', initApp);
