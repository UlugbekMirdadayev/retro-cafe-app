
// --- UI Elements ---
console.log("=== RENDERER.JS LOADED ===");
console.log("window.api exists:", typeof window.api);
console.log("Document ready state:", document.readyState);
console.log("=== STARTING UI INITIALIZATION ===");

// Socket connection manager
let socketConnection = null;
let autoScroll = true;
let messageCount = 0;
let templateEventBindings = {};

const tabLinks = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Кнопки управления окном
const minimizeBtn = document.querySelector('.window-control-minimize');
const maximizeBtn = document.querySelector('.window-control-maximize');
const closeBtn = document.querySelector('.window-control-close');

// Printer tab
const printerIpInput = document.getElementById('printer-ip');
const connectPrinterBtn = document.getElementById('connect-printer');
const testPrintBtn = document.getElementById('test-print');
const testTemplateBtn = document.getElementById('test-template');
const savePrinterSettingsBtn = document.getElementById('save-printer-settings');
const printerStatusElement = document.getElementById('printer-status');
// Sidebar printer status indicator
const sidebarPrinterStatus = document.querySelector('.sidebar-footer .printer-status');

// Socket tab
const socketUrlInput = document.getElementById('socket-url');
const connectSocketBtn = document.getElementById('connect-socket');
const saveSocketSettingsBtn = document.getElementById('save-socket-settings');
const socketStatusElement = document.getElementById('socket-status');
// Sidebar socket status indicator
const sidebarSocketStatus = document.querySelector('.sidebar-footer .socket-status');

// New socket connection elements
const socketServerUrlInput = document.getElementById('socket-server-url');
const saveSocketUrlBtn = document.getElementById('save-socket-url');
const connectSocketNewBtn = document.getElementById('connect-socket-btn');
const disconnectSocketBtn = document.getElementById('disconnect-socket-btn');
const socketConnectionStatus = document.getElementById('socket-connection-status');
const eventNameInput = document.getElementById('event-name');
const templateSelect = document.getElementById('template-select');
const bindTemplateBtn = document.getElementById('bind-template');
const bindingsList = document.getElementById('bindings-list');

// Messages tab elements
const messagesContainer = document.getElementById('messages-container');
const clearMessagesBtn = document.getElementById('clear-messages');
const autoScrollToggle = document.getElementById('auto-scroll-toggle');
const messageEventFilter = document.getElementById('message-event-filter');

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
  if (!ip) return showToast(window.i18n.t('toasts.enter_printer_ip'), 'error');
  await window.api.saveSettings({ printerIp: ip });
  showToast(window.i18n.t('toasts.printer_ip_saved'), 'success');
});

// Функция обработчик для подключения принтера
async function connectPrinterHandler() {
  // Предотвращаем многократные клики
  if (connectPrinterBtn.disabled) return;
  
  const originalText = connectPrinterBtn.textContent;
  connectPrinterBtn.disabled = true;
  connectPrinterBtn.textContent = 'Ulanmoqda...';
  
  const ip = printerIpInput.value.trim();
  if (!ip) {
    showToast('Printer IP manzilini kiriting', 'error');
    connectPrinterBtn.disabled = false;
    connectPrinterBtn.textContent = originalText;
    return;
  }
  
  // Validate IP format before attempting connection
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(ip)) {
    showToast('IP manzil formati noto\'g\'ri (masalan: 192.168.1.100)', 'error');
    connectPrinterBtn.disabled = false;
    connectPrinterBtn.textContent = originalText;
    return;
  }
  
  showToast(`Printer ${ip}:9100 ga ulanmoqda...`, 'info');
  showPrinterStatus('connecting');
  
  try {
    console.log('Отправка запроса на подключение к принтеру:', ip);
    const result = await window.api.connectPrinter(ip);
    
    if (result.success) {
      showToast('Printer muvaffaqiyatli ulandi! ✓', 'success');
      showPrinterStatus('connected');
    } else {
      // Show user-friendly error message
      const errorMsg = result?.userMessage || 'Printerga ulanishda xatolik';
      showToast(errorMsg, 'error');
      showPrinterStatus('error');
      
      // Log technical details for debugging
      if (result.error) {
        console.error('Printer connection error details:', result.error);
      }
    }
  } catch (e) {
    console.error('Printer connection exception:', e);
    showToast('Printer bilan bog\'lanishda kutilmagan xatolik yuz berdi', 'error');
    showPrinterStatus('error');
  } finally {
    // Restore button state
    connectPrinterBtn.disabled = false;
    connectPrinterBtn.textContent = originalText;
  }
}

// Добавляем новый обработчик
connectPrinterBtn.addEventListener('click', connectPrinterHandler);

testPrintBtn.addEventListener('click', async () => {
  // Prevent multiple concurrent test prints
  if (testPrintBtn.disabled) return;
  
  testPrintBtn.disabled = true;
  const originalText = testPrintBtn.textContent;
  
  try {
    // Show better loading state
    testPrintBtn.textContent = 'Test chop etilmoqda...';
    showToast('Printerni tekshirmoqda va test chop etmoqda...', 'info');
    
    const result = await window.api.testPrint();
    
    if (result && result.success) {
      showToast('Test cheki muvaffaqiyatli chop etildi! ✓', 'success');
      // Optionally show stats if available
      if (result.stats) {
        console.log('Print stats:', result.stats);
      }
    } else {
      // Show user-friendly error message
      const errorMsg = result?.userMessage || result?.error || 'Chop etishda xatolik yuz berdi';
      showToast(errorMsg, 'error');
      
      // Log technical details for debugging
      if (result?.error) {
        console.error('Test print error details:', result.error);
      }
    }
  } catch (error) {
    console.error('Test print error:', error);
    
    // Show generic user-friendly error
    showToast('Printerni tekshirishda xatolik yuz berdi', 'error');
  } finally {
    // Restore button state
    testPrintBtn.disabled = false;
    testPrintBtn.textContent = originalText;
  }
});

// Test template without printing
testTemplateBtn?.addEventListener('click', async () => {
  // Prevent multiple concurrent tests
  if (testTemplateBtn.disabled) return;
  
  testTemplateBtn.disabled = true;
  const originalText = testTemplateBtn.textContent;
  
  try {
    // Show better loading state
    testTemplateBtn.textContent = 'Shablon tekshirilmoqda...';
    showToast('Shablon tuzilishi va ma\'lumotlari tekshirilmoqda...', 'info');
    
    const result = await window.api.testTemplate();
    
    if (result && result.success) {
      showToast('Shablon muvaffaqiyatli ishladi! ✓', 'success');
      
      // Show additional stats if available
      if (result.stats) {
        const stats = result.stats;
        const statsMsg = `Jami ${stats.totalSegments} segment, ${stats.processedSegments} ta mazmun bilan, ${stats.skippedConditionalSegments} ta shartli`;
        console.log('Template processing stats:', statsMsg);
        
        // Show detailed success message with stats
        setTimeout(() => {
          showToast(statsMsg, 'info');
        }, 2000);
      }
    } else {
      // Show user-friendly error message
      const errorMsg = result?.userMessage || result?.message || result?.error || 'Shablon ishlov berishda xatolik';
      showToast(errorMsg, 'error');
      
      // Log technical details for debugging
      if (result?.error) {
        console.error('Template test error details:', result);
      }
    }
  } catch (error) {
    console.error('Template test error:', error);
    showToast('Shablonni tekshirishda xatolik yuz berdi', 'error');
  } finally {
    // Restore button state
    testTemplateBtn.disabled = false;
    testTemplateBtn.textContent = originalText;
  }
});

function showPrinterStatus(status) {
  // Обновляем статус на вкладке принтера
  printerStatusElement.className = 'status ' + 'status-' + status;
  const dot = printerStatusElement.querySelector('.status-dot');
  const text = printerStatusElement.querySelector('span:last-child');
  if (dot) {
    dot.className = 'status-dot status-dot-' + status;
  }
  if (text) {
    text.textContent = status === 'connected' ? window.i18n.t('status.connected') : 
                       status === 'connecting' ? window.i18n.t('status.connecting') : 
                       status === 'error' ? window.i18n.t('status.error') : 
                       window.i18n.t('status.disconnected');
  }
  
  // Обновляем статус в боковой панели
  if (sidebarPrinterStatus) {
    // Также обновляем класс родительского элемента для правильного стиля
    // Сначала удаляем все классы status-*, затем добавляем нужный
    sidebarPrinterStatus.classList.remove('status-connected', 'status-disconnected', 'status-connecting', 'status-error');
    sidebarPrinterStatus.classList.add('printer-status', 'status-' + status);
    
    const sidebarDot = sidebarPrinterStatus.querySelector('.status-dot');
    const sidebarText = sidebarPrinterStatus.querySelector('.status-text');
    
    if (sidebarDot) {
      sidebarDot.className = 'status-dot status-dot-' + status;
    }
    
    if (sidebarText) {
      sidebarText.textContent = status === 'connected' ? window.i18n.t('status.connected') : 
                               status === 'connecting' ? window.i18n.t('status.connecting') : 
                               status === 'error' ? window.i18n.t('status.error') : 
                               window.i18n.t('status.disconnected');
    }
  }
}

// --- Socket ---
saveSocketSettingsBtn.addEventListener('click', async () => {
  const url = socketUrlInput.value.trim();
  if (!url) return showToast(window.i18n.t('toasts.enter_server_url'), 'error');
  await window.api.saveSettings({ socketUrl: url });
  showToast(window.i18n.t('toasts.server_url_saved'), 'success');
});

// Функция обработчик для подключения к серверу
async function connectSocketHandler() {
  // Предотвращаем многократные клики
  if (connectSocketBtn.disabled) return;
  connectSocketBtn.disabled = true;
  
  const url = socketUrlInput.value.trim();
  if (!url) {
    showToast(window.i18n.t('toasts.enter_server_url'), 'error');
    connectSocketBtn.disabled = false;
    return;
  }
  
  // Сначала сохраняем URL в настройках
  try {
    await window.api.saveSettings({ socketUrl: url });
    console.log(`URL сервера сохранен в настройках: ${url}`);
  } catch (saveError) {
    console.error('Ошибка при сохранении настроек:', saveError);
  }
  
  showToast(window.i18n.t('toasts.connecting_to_server'), 'info');
  await updateSocketStatusEverywhere('connecting');
  
  try {
    // Предварительная проверка формата URL
    try {
      new URL(url);
    } catch (e) {
      showToast(window.i18n.t('toasts.invalid_url_format'), 'error');
      window.lastErrorDetails = 'Неверный формат URL';
      // Обновляем статус везде
      await updateSocketStatusEverywhere('error');
      connectSocketBtn.disabled = false;
      return;
    }
    
    // Проверка доступности сервера перед подключением
    console.log(`Проверка доступности сервера: ${url}`);
    try {
      await fetch(url, { 
        method: 'HEAD', 
        mode: 'no-cors',
        cache: 'no-cache',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow',
        timeout: 5000
      });
      console.log('Сервер доступен по запросу fetch');
    } catch (fetchError) {
      console.warn('Предварительная проверка сервера не удалась, но продолжаем подключение:', fetchError);
    }
    
    // Отправляем запрос на подключение
    console.log(`Отправка запроса на подключение к: ${url}`);
    const result = await window.api.connectSocket(url);
    
    if (result.success) {
      // Статус будет обновлен через событие onSocketStatus
      console.log('Запрос на подключение успешно отправлен');
    } else {
      console.error('Ошибка подключения:', result.error);
      window.lastErrorDetails = result.error || 'Неизвестная ошибка подключения';
      showToast(window.i18n.t('toasts.server_connection_error') + (result.error || ''), 'error');
      await updateSocketStatusEverywhere('error');
    }
  } catch (e) {
    console.error('Исключение при подключении к серверу:', e);
    window.lastErrorDetails = e.message || 'Неизвестная ошибка подключения';
    showToast(window.i18n.t('toasts.server_connection_error') + (e.message || ''), 'error');
    await updateSocketStatusEverywhere('error');
  } finally {
    // Разблокируем кнопку после завершения запроса
    connectSocketBtn.disabled = false;
  }
}

// Добавляем новый обработчик
connectSocketBtn.addEventListener('click', connectSocketHandler);

// Функция для синхронизации статуса между renderer и main
async function updateSocketStatusEverywhere(status) {
  // Обновляем UI
  showSocketStatus(status);
  
  // Синхронизируем статус с main процессом
  try {
    await window.api.updateSocketStatus(status);
  } catch (apiErr) {
    console.error('Ошибка при обновлении статуса в main процессе:', apiErr);
  }
}

function showSocketStatus(status, details = '') {
  console.log("=== SHOW SOCKET STATUS CALLED ===");
  console.log(`Status: ${status}, Details: ${details}`);
  
  // Принудительно ищем элементы на каждый раз
  const socketStatusElement = document.getElementById('socket-status');
  const sidebarSocketStatus = document.querySelector('.sidebar-footer .socket-status');
  
  console.log(`socketStatusElement found: ${!!socketStatusElement}`);
  console.log(`sidebarSocketStatus found: ${!!sidebarSocketStatus}`);
  
  if (socketStatusElement) {
    console.log(`socketStatusElement current className: "${socketStatusElement.className}"`);
  }
  if (sidebarSocketStatus) {
    console.log(`sidebarSocketStatus current className: "${sidebarSocketStatus.className}"`);
  }

  // Предотвращаем обновление если основной элемент не существует
  if (!socketStatusElement) {
    console.error('socket-status element not found in DOM!');
    console.log('Available elements with IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
    return;
  }

  // Получаем элементы перед обновлением
  const dot = socketStatusElement.querySelector('.status-dot');
  const text = socketStatusElement.querySelector('span:last-child');
  
  console.log(`Dot element found: ${!!dot}`);
  console.log(`Text element found: ${!!text}`);
  
  if (dot) {
    console.log(`Dot current className: "${dot.className}"`);
  }
  if (text) {
    console.log(`Text current content: "${text.textContent}"`);
  }

  // Принудительно обновляем класс элемента
  const newClassName = `status status-${status}`;
  console.log(`Setting new className: "${newClassName}"`);
  socketStatusElement.className = newClassName;
  
  // Проверяем что класс действительно установился
  console.log(`Confirmed className after setting: "${socketStatusElement.className}"`);
  
  if (dot) {
    const oldDotClass = dot.className;
    // Обновляем точку индикатора
    const newDotClass = `status-dot status-dot-${status}`;
    dot.className = newDotClass;
    console.log(`Dot class updated from "${oldDotClass}" to "${dot.className}"`);
    
    // Добавляем анимацию пульсации для активных статусов
    if (status === 'connecting') {
      dot.classList.add('pulse');
      console.log('Added pulse animation to dot');
    } else {
      dot.classList.remove('pulse');
      console.log('Removed pulse animation from dot');
    }
  }
  
  if (text) {
    const oldText = text.textContent;
    // Базовый текст в зависимости от статуса
    const statusText = status === 'connected' ? window.i18n.t('status.connected') : 
                      status === 'connecting' ? window.i18n.t('status.connecting') : 
                      status === 'error' ? window.i18n.t('status.error') : 
                      window.i18n.t('status.disconnected');
    
    text.textContent = statusText;
    console.log(`Text updated from "${oldText}" to "${text.textContent}"`);
                      
    // Добавляем к элементу title с подробной информацией для отображения при наведении
    const titleDetails = details || window.lastErrorDetails || '';
    socketStatusElement.title = status === 'error' ? 
                            `Error: ${titleDetails || 'Unknown connection error'}` : 
                            status === 'connected' ? 
                            'Connected to server' + (titleDetails ? ': ' + titleDetails : '') : 
                            status === 'connecting' ? 
                            'Connecting to server...' : 
                            'Disconnected from server';
    console.log(`Title set to: "${socketStatusElement.title}"`);
  }
  
  // Обновляем статус в боковой панели
  if (sidebarSocketStatus) {
    const oldSidebarClass = sidebarSocketStatus.className;
    // Принудительно обновляем класс элемента боковой панели
    const newSidebarClass = `socket-status status-${status}`;
    sidebarSocketStatus.className = newSidebarClass;
    console.log(`Sidebar class updated from "${oldSidebarClass}" to "${sidebarSocketStatus.className}"`);
    
    const sidebarDot = sidebarSocketStatus.querySelector('.status-dot');
    const sidebarText = sidebarSocketStatus.querySelector('.status-text');
    
    if (sidebarDot) {
      const oldSidebarDotClass = sidebarDot.className;
      const newSidebarDotClass = `status-dot status-dot-${status}`;
      sidebarDot.className = newSidebarDotClass;
      console.log(`Sidebar dot updated from "${oldSidebarDotClass}" to "${sidebarDot.className}"`);
      
      // Добавляем анимацию для connecting статуса
      if (status === 'connecting') {
        sidebarDot.classList.add('pulse');
        console.log('Added pulse animation to sidebar dot');
      } else {
        sidebarDot.classList.remove('pulse');
        console.log('Removed pulse animation from sidebar dot');
      }
    }
    
    if (sidebarText) {
      const oldSidebarText = sidebarText.textContent;
      const statusText = status === 'connected' ? window.i18n.t('status.connected') : 
                        status === 'connecting' ? window.i18n.t('status.connecting') : 
                        status === 'error' ? window.i18n.t('status.error') : 
                        window.i18n.t('status.disconnected');
      
      sidebarText.textContent = statusText;
      console.log(`Sidebar text updated from "${oldSidebarText}" to "${sidebarText.textContent}"`);
    }
  } else {
    console.warn('sidebarSocketStatus element not found in DOM');
    console.log('Available sidebar elements:', Array.from(document.querySelectorAll('.sidebar-footer *')).map(el => el.className));
  }
  
  // Сохраняем последний известный статус в глобальной переменной
  window.currentSocketStatus = status;
  console.log(`Set window.currentSocketStatus to: ${window.currentSocketStatus}`);
  
  // Принудительно перерисовываем элементы для гарантированного обновления
  requestAnimationFrame(() => {
    if (socketStatusElement) {
      socketStatusElement.style.display = 'none';
      socketStatusElement.offsetHeight; // Принудительный reflow
      socketStatusElement.style.display = '';
      console.log('Forced reflow for main status element');
    }
    if (sidebarSocketStatus) {
      sidebarSocketStatus.style.display = 'none';
      sidebarSocketStatus.offsetHeight; // Принудительный reflow  
      sidebarSocketStatus.style.display = '';
      console.log('Forced reflow for sidebar status element');
    }
  });
  
  console.log("=== SHOW SOCKET STATUS COMPLETED ===");
}

// --- Templates ---
// Получаем элементы для работы с HTML шаблонами
const templateTypeSelect = document.getElementById('template-type');
const templatePreview = document.getElementById('template-preview');
const printPreviewBtn = document.getElementById('print-preview');
const htmlPreviewContainer = document.querySelector('.html-preview-container');

// Элементы для переключения между форматами
const legacyFormatRadio = document.querySelector('input[name="template-format"][value="legacy"]');
const segmentsFormatRadio = document.querySelector('input[name="template-format"][value="segments"]');
const legacyEditor = document.getElementById('legacy-editor');
const segmentsEditor = document.getElementById('segments-editor');
const segmentsList = document.getElementById('segments-list');
const addSegmentBtn = document.getElementById('add-segment');

// Обработчики переключения форматов
if (legacyFormatRadio && segmentsFormatRadio) {
  legacyFormatRadio.addEventListener('change', () => {
    if (legacyFormatRadio.checked) {
      legacyEditor.style.display = 'block';
      segmentsEditor.style.display = 'none';
      updateTemplatePreview();
    }
  });

  segmentsFormatRadio.addEventListener('change', () => {
    if (segmentsFormatRadio.checked) {
      legacyEditor.style.display = 'none';
      segmentsEditor.style.display = 'block';
      updateTemplatePreview();
    }
  });
}

// Добавление нового сегмента
if (addSegmentBtn) {
  addSegmentBtn.addEventListener('click', () => {
    addNewSegment();
  });
}

// Массив для хранения текущих сегментов
let currentSegments = [];

function addNewSegment(content = '', settings = null) {
  const segmentId = Date.now() + Math.random();
  const defaultSettings = {
    align: 'left',
    font: 'a',
    size: 0,
    bold: false,
    underline: false,
    italic: false
  };
  
  const segment = {
    id: segmentId,
    content: content,
    settings: settings || defaultSettings
  };
  
  currentSegments.push(segment);
  renderSegment(segment);
  updateTemplatePreview();
}

function renderSegment(segment) {
  const segmentDiv = document.createElement('div');
  segmentDiv.className = 'segment-item';
  segmentDiv.dataset.segmentId = segment.id;
  
  segmentDiv.innerHTML = `
    <div class="segment-header">
      <span>Сегмент ${currentSegments.length}</span>
      <div class="segment-controls">
        <button type="button" class="btn btn-secondary btn-icon-sm" onclick="moveSegmentUp(${segment.id})" title="Поднять вверх">
          <span class="material-icons">keyboard_arrow_up</span>
        </button>
        <button type="button" class="btn btn-secondary btn-icon-sm" onclick="moveSegmentDown(${segment.id})" title="Опустить вниз">
          <span class="material-icons">keyboard_arrow_down</span>
        </button>
        <button type="button" class="btn btn-danger btn-icon-sm" onclick="removeSegment(${segment.id})" title="Удалить">
          <span class="material-icons">delete</span>
        </button>
      </div>
    </div>
    
    <textarea class="segment-content" placeholder="Содержимое сегмента...">${segment.content}</textarea>
    
    <div class="segment-settings">
      <div class="form-group">
        <label>Выравнивание</label>
        <select class="segment-align">
          <option value="left" ${segment.settings.align === 'left' ? 'selected' : ''}>Слева</option>
          <option value="center" ${segment.settings.align === 'center' ? 'selected' : ''}>По центру</option>
          <option value="right" ${segment.settings.align === 'right' ? 'selected' : ''}>Справа</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>Шрифт</label>
        <select class="segment-font">
          <option value="a" ${segment.settings.font === 'a' ? 'selected' : ''}>Шрифт A</option>
          <option value="b" ${segment.settings.font === 'b' ? 'selected' : ''}>Шрифт B</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>Размер</label>
        <select class="segment-size">
          <option value="0" ${segment.settings.size === 0 ? 'selected' : ''}>Обычный</option>
          <option value="1" ${segment.settings.size === 1 ? 'selected' : ''}>Средний</option>
          <option value="2" ${segment.settings.size === 2 ? 'selected' : ''}>Большой</option>
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-check">
          <input type="checkbox" class="segment-bold" ${segment.settings.bold ? 'checked' : ''}>
          <span>Жирный</span>
        </label>
      </div>
      
      <div class="form-group">
        <label class="form-check">
          <input type="checkbox" class="segment-underline" ${segment.settings.underline ? 'checked' : ''}>
          <span>Подчёркнутый</span>
        </label>
      </div>
      
      <div class="form-group">
        <label class="form-check">
          <input type="checkbox" class="segment-italic" ${segment.settings.italic ? 'checked' : ''}>
          <span>Курсив</span>
        </label>
      </div>
    </div>
    
    <div class="segment-preview"></div>
  `;
  
  segmentsList.appendChild(segmentDiv);
  
  // Добавляем обработчики событий
  const contentTextarea = segmentDiv.querySelector('.segment-content');
  const settingsInputs = segmentDiv.querySelectorAll('select, input[type="checkbox"]');
  
  contentTextarea.addEventListener('input', () => {
    updateSegmentData(segment.id);
    updateTemplatePreview();
  });
  
  settingsInputs.forEach(input => {
    input.addEventListener('change', () => {
      updateSegmentData(segment.id);
      updateTemplatePreview();
    });
  });
  
  // Обновляем данные сегмента
  updateSegmentData(segment.id);
}

function updateSegmentData(segmentId) {
  const segment = currentSegments.find(s => s.id === segmentId);
  if (!segment) return;
  
  const segmentDiv = document.querySelector(`[data-segment-id="${segmentId}"]`);
  if (!segmentDiv) return;
  
  // Обновляем содержимое
  segment.content = segmentDiv.querySelector('.segment-content').value;
  
  // Обновляем настройки
  segment.settings = {
    align: segmentDiv.querySelector('.segment-align').value,
    font: segmentDiv.querySelector('.segment-font').value,
    size: parseInt(segmentDiv.querySelector('.segment-size').value),
    bold: segmentDiv.querySelector('.segment-bold').checked,
    underline: segmentDiv.querySelector('.segment-underline').checked,
    italic: segmentDiv.querySelector('.segment-italic').checked
  };
}

function removeSegment(segmentId) {
  currentSegments = currentSegments.filter(s => s.id !== segmentId);
  const segmentDiv = document.querySelector(`[data-segment-id="${segmentId}"]`);
  if (segmentDiv) {
    segmentDiv.remove();
  }
  updateTemplatePreview();
}

function moveSegmentUp(segmentId) {
  const index = currentSegments.findIndex(s => s.id === segmentId);
  if (index > 0) {
    [currentSegments[index], currentSegments[index - 1]] = [currentSegments[index - 1], currentSegments[index]];
    renderAllSegments();
    updateTemplatePreview();
  }
}

function moveSegmentDown(segmentId) {
  const index = currentSegments.findIndex(s => s.id === segmentId);
  if (index < currentSegments.length - 1) {
    [currentSegments[index], currentSegments[index + 1]] = [currentSegments[index + 1], currentSegments[index]];
    renderAllSegments();
    updateTemplatePreview();
  }
}

function renderAllSegments() {
  segmentsList.innerHTML = '';
  currentSegments.forEach(segment => {
    renderSegment(segment);
  });
}

// Глобальные функции для доступа из onclick
window.removeSegment = removeSegment;
window.moveSegmentUp = moveSegmentUp;
window.moveSegmentDown = moveSegmentDown;

addTemplateBtn.addEventListener('click', () => {
  const id = 'template_' + Date.now();
  const newTemplate = { 
    name: window.i18n.t('templates.new_template'), 
    type: 'legacy'  // По умолчанию старый формат для совместимости
  };
  
  // Если выбран новый формат, создаём шаблон с сегментами
  if (segmentsFormatRadio && segmentsFormatRadio.checked) {
    newTemplate.segments = [{
      content: 'Новый сегмент',
      settings: {
        align: 'center',
        font: 'b',
        size: 1,
        bold: true,
        underline: false,
        italic: false
      }
    }];
    newTemplate.globalSettings = {
      beep: { enabled: false, count: 1, duration: 100 },
      encoding: 'cp866',
      paperCut: true
    };
  } else {
    newTemplate.content = '';
    newTemplate.settings = {
      align: 'left',
      font: 'a',
      size: 0,
      bold: false,
      underline: false,
      beep: { enabled: true, count: 1, time: 100 }
    };
  }
  
  currentState.templates[id] = newTemplate;
  renderTemplatesList();
  selectTemplate(id);
});

saveTemplateBtn.addEventListener('click', async () => {
  const id = currentState.selectedTemplateId;
  if (!id) return showToast(window.i18n.t('toasts.select_template'), 'error');
  
  const name = templateNameInput.value.trim();
  if (!name) return showToast(window.i18n.t('toasts.enter_template_name'), 'error');
  
  let templateData = { name };
  
  // Определяем формат шаблона
  if (segmentsFormatRadio && segmentsFormatRadio.checked) {
    // Новый формат с сегментами
    if (currentSegments.length === 0) {
      return showToast('Добавьте хотя бы один сегмент', 'error');
    }
    
    // Обновляем данные всех сегментов перед сохранением
    currentSegments.forEach(segment => {
      updateSegmentData(segment.id);
    });
    
    templateData.segments = currentSegments.map(segment => ({
      content: segment.content,
      settings: segment.settings
    }));
    
    // Добавляем глобальные настройки
    templateData.globalSettings = {
      beep: { enabled: false, count: 1, duration: 100 }, // Звук отключён
      encoding: 'cp866',
      paperCut: true
    };
  } else {
    // Старый формат для обратной совместимости
    const content = templateContentInput.value;
    const templateSettings = getCurrentTemplateSettings();
    
    templateData.content = content;
    templateData.settings = templateSettings;
  }
  
  currentState.templates[id] = templateData;
  
  try {
    await window.api.saveTemplates(currentState.templates);
    renderTemplatesList();
    selectTemplate(id);
    showToast(window.i18n.t('toasts.template_saved'), 'success');
    updateTemplatePreview();
  } catch (error) {
    console.error('Error saving template:', error);
    showToast('Ошибка сохранения шаблона', 'error');
  }
});

deleteTemplateBtn.addEventListener('click', async () => {
  const id = currentState.selectedTemplateId;
  if (!id) return;
  
  delete currentState.templates[id];
  await window.api.saveTemplates(currentState.templates);
  
  currentState.selectedTemplateId = null;
  renderTemplatesList();
  templateNameInput.value = '';
  templateContentInput.value = '';
  toggleHtmlPreview('text');
  
  showToast(window.i18n.t('toasts.template_deleted'), 'success');
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
    console.log('Selecting template:', tpl);
    templateNameInput.value = tpl.name;
    
    // Определяем формат шаблона и переключаем интерфейс
    if (tpl.segments && Array.isArray(tpl.segments)) {
      // Новый формат с сегментами
      console.log('Template has segments:', tpl.segments.length);
      segmentsFormatRadio.checked = true;
      legacyFormatRadio.checked = false;
      legacyEditor.style.display = 'none';
      segmentsEditor.style.display = 'block';
      
      // Загружаем сегменты
      currentSegments = tpl.segments.map((segment, index) => ({
        id: Date.now() + index + Math.random(),
        content: segment.content || '',
        settings: segment.settings || {
          align: 'left',
          font: 'a',
          size: 0,
          bold: false,
          underline: false,
          italic: false
        }
      }));
      
      console.log('Loaded segments:', currentSegments.length);
      renderAllSegments();
      
    } else {
      // Старый формат
      console.log('Template is legacy format');
      legacyFormatRadio.checked = true;
      segmentsFormatRadio.checked = false;
      legacyEditor.style.display = 'block';
      segmentsEditor.style.display = 'none';
      
      templateContentInput.value = tpl.content || '';
      
      // Если у шаблона есть сохраненные настройки, применяем их
      if (tpl.settings) {
        applyTemplateSettings(tpl.settings);
      } else {
        // Применяем настройки по умолчанию
        applyTemplateSettings({
          align: 'left',
          font: 'a',
          size: 0,
          bold: false,
          underline: false,
          beep: {
            enabled: true,
            count: 1,
            time: 100
          }
        });
      }
      
      // Очищаем сегменты
      currentSegments = [];
    }
    
    // Обновляем предпросмотр шаблона
    setTimeout(() => {
      console.log('Updating preview with segments:', currentSegments.length);
      updateTemplatePreview();
    }, 100);
  }
}

// Функция для применения настроек шаблона к элементам интерфейса
function applyTemplateSettings(settings) {
  const alignSelect = document.getElementById('template-align');
  const fontSelect = document.getElementById('template-font');
  const sizeSelect = document.getElementById('template-size');
  const boldCheck = document.getElementById('template-bold');
  const underlineCheck = document.getElementById('template-underline');
  const beepEnabledCheck = document.getElementById('template-beep-enabled');
  const beepCountInput = document.getElementById('template-beep-count');
  const beepDurationInput = document.getElementById('template-beep-duration');
  
  if (alignSelect && settings.align) alignSelect.value = settings.align;
  if (fontSelect && settings.font) fontSelect.value = settings.font;
  if (sizeSelect && settings.size !== undefined) sizeSelect.value = settings.size;
  if (boldCheck) boldCheck.checked = !!settings.bold;
  if (underlineCheck) underlineCheck.checked = !!settings.underline;
  
  if (settings.beep) {
    if (beepEnabledCheck) beepEnabledCheck.checked = !!settings.beep.enabled;
    if (beepCountInput && settings.beep.count) beepCountInput.value = settings.beep.count;
    if (beepDurationInput && settings.beep.time) beepDurationInput.value = settings.beep.time;
  }
}

// Обработчик изменения типа шаблона
if (templateTypeSelect) {
  templateTypeSelect.addEventListener('change', () => {
    const type = templateTypeSelect.value;
    toggleHtmlPreview(type);
  });
}

// Обработчик изменения содержимого шаблона
if (templateContentInput) {
  templateContentInput.addEventListener('input', () => {
    if (templateTypeSelect.value === 'html') {
      updateHtmlPreview();
    }
  });
}

// Функция для обновления предпросмотра текстового шаблона
async function updateTemplatePreview() {
  if (!templatePreview) return;
  
  let template;
  
  // Определяем какой формат используется
  if (segmentsFormatRadio && segmentsFormatRadio.checked) {
    // Новый формат с сегментами
    if (currentSegments.length === 0) {
      templatePreview.textContent = 'Добавьте сегменты для предварительного просмотра';
      return;
    }
    
    // Обновляем данные всех сегментов
    currentSegments.forEach(segment => {
      updateSegmentData(segment.id);
    });
    
    template = {
      segments: currentSegments.map(segment => ({
        content: segment.content,
        settings: segment.settings
      })),
      globalSettings: {
        beep: { enabled: false, count: 1, duration: 100 },
        encoding: 'cp866',
        paperCut: true
      }
    };
  } else {
    // Старый формат
    const content = templateContentInput.value;
    if (!content) {
      templatePreview.textContent = 'Шаблон пуст';
      return;
    }
    
    template = { content: content };
  }
  
  try {
    // Отправляем запрос на предварительный просмотр шаблона
    const templateSettings = getCurrentTemplateSettings();
    const result = await window.api.printTemplatePreview(template, templateSettings);
    
    if (result && result.success) {
      // Обернём предварительный просмотр в контейнер для стилизации под чековую ленту
      templatePreview.innerHTML = '';
      const preContainer = document.createElement('div');
      preContainer.className = 'receipt-preview-container';
      
      const preElement = document.createElement('pre');
      preElement.textContent = result.previewText;
      
      preContainer.appendChild(preElement);
      templatePreview.appendChild(preContainer);
    } else {
      templatePreview.textContent = result.error || 'Ошибка предварительного просмотра';
    }
  } catch (error) {
    console.error('Ошибка при генерации предпросмотра:', error);
    templatePreview.textContent = 'Ошибка загрузки предварительного просмотра';
  }
}

// Функция для добавления обработчиков событий для элементов настроек шаблона
function setupTemplateSettingsHandlers() {
  // Находим все элементы настроек шаблона
  const settingsElements = [
    document.getElementById('template-align'),
    document.getElementById('template-font'),
    document.getElementById('template-size'),
    document.getElementById('template-bold'),
    document.getElementById('template-underline'),
    document.getElementById('template-beep-enabled'),
    document.getElementById('template-beep-count'),
    document.getElementById('template-beep-duration')
  ];
  
  // Добавляем обработчики для обновления превью при изменении настроек
  settingsElements.forEach(element => {
    if (element) {
      const eventType = element.type === 'checkbox' ? 'change' : 'input';
      element.addEventListener(eventType, updateTemplatePreview);
    }
  });
  
  // Также обновляем предпросмотр при изменении содержимого шаблона
  if (templateContentInput) {
    templateContentInput.addEventListener('input', updateTemplatePreview);
  }
}

// Функция для получения текущих настроек шаблона из интерфейса
function getCurrentTemplateSettings() {
  const sizeValue = document.getElementById('template-size') ? document.getElementById('template-size').value : 'normal';
  let numericSize = 0;
  
  // Convert string size to numeric
  switch(sizeValue) {
    case 'normal': numericSize = 0; break;
    case 'doubleWidth': numericSize = 1; break;
    case 'doubleHeight': numericSize = 1; break;
    case 'double': numericSize = 2; break;
    default: numericSize = parseInt(sizeValue) || 0; break;
  }
  
  const settings = {
    align: document.getElementById('template-align') ? document.getElementById('template-align').value : 'left',
    font: document.getElementById('template-font') ? document.getElementById('template-font').value : 'a',
    size: numericSize,
    bold: document.getElementById('template-bold') ? document.getElementById('template-bold').checked : false,
    underline: document.getElementById('template-underline') ? document.getElementById('template-underline').checked : false,
    beep: {
      enabled: document.getElementById('template-beep-enabled') ? document.getElementById('template-beep-enabled').checked : true,
      count: document.getElementById('template-beep-count') ? parseInt(document.getElementById('template-beep-count').value) || 1 : 1,
      duration: document.getElementById('template-beep-duration') ? parseInt(document.getElementById('template-beep-duration').value) || 100 : 100
    },
    encoding: document.getElementById('template-encoding') ? document.getElementById('template-encoding').value : 'cp866',
    paperCut: document.getElementById('template-paper-cut') ? document.getElementById('template-paper-cut').checked : true
  };
  
  return settings;
}

// Обработчик кнопки печати превью шаблона
if (printPreviewBtn) {
  printPreviewBtn.addEventListener('click', async () => {
    const template = {
      name: templateNameInput.value || 'Preview Template',
      content: templateContentInput.value
    };
    
    // Получаем настройки форматирования из интерфейса
    const templateSettings = getCurrentTemplateSettings();
    
    if (!template.content) {
      showToast(window.i18n.t('toasts.no_template_content'), 'error');
      return;
    }
    
    // Отображаем индикатор загрузки в кнопке
    const originalText = printPreviewBtn.innerHTML;
    printPreviewBtn.innerHTML = `<span class="material-icons loading-spinner">sync</span> ${window.i18n.t('toasts.printing')}`;
    printPreviewBtn.disabled = true;
    
    try {
      // Отправляем на печать
      const result = await window.api.testPrint();
      
      if (result && result.success) {
        showToast(window.i18n.t('toasts.receipt_printed'), 'success');
      } else {
        showToast(window.i18n.t('toasts.print_error') + (result && result.error ? result.error : ''), 'error');
      }
    } catch (error) {
      console.error('Ошибка при печати:', error);
      showToast(window.i18n.t('toasts.print_error'), 'error');
    } finally {
      // Восстанавливаем текст и состояние кнопки
      printPreviewBtn.innerHTML = originalText;
      printPreviewBtn.disabled = false;
    }
  });
}// --- Logs ---
async function loadLogs(filter = {}) {
  const logs = await window.api.getLogs();
  renderLogs(logs);
}

function renderLogs(logs) {
  logsTableBody.innerHTML = '';
  if (!logs.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="text-center">${window.i18n.t('logs.no_records')}</td>`;
    logsTableBody.appendChild(tr);
    return;
  }
  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(log.time).toLocaleString()}</td>
      <td>${log.eventType}</td>
      <td>${log.templateName || '-'}</td>
      <td>${log.status === 'success' ? window.i18n.t('logs.success') : window.i18n.t('logs.error')}</td>
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
  showToast(window.i18n.t('toasts.logs_cleared'), 'success');
});

// --- Настройки ---
const startWithWindowsCheckbox = document.getElementById('start-with-windows');
const minimizeToTrayCheckbox = document.getElementById('minimize-to-tray');
const languageSelect = document.getElementById('language-select');

if (startWithWindowsCheckbox) {
  startWithWindowsCheckbox.addEventListener('change', async () => {
    await window.api.saveSettings({ 
      startWithWindows: startWithWindowsCheckbox.checked 
    });
    showToast(startWithWindowsCheckbox.checked ? 
      window.i18n.t('toasts.autostart_enabled') : 
      window.i18n.t('toasts.autostart_disabled'), 'info');
  });
}

if (minimizeToTrayCheckbox) {
  minimizeToTrayCheckbox.addEventListener('change', async () => {
    await window.api.saveSettings({ 
      minimizeToTray: minimizeToTrayCheckbox.checked 
    });
    showToast(minimizeToTrayCheckbox.checked ? 
      window.i18n.t('toasts.tray_enabled') : 
      window.i18n.t('toasts.tray_disabled'), 'info');
  });
}

if (languageSelect) {
  languageSelect.addEventListener('change', async () => {
    const selectedLang = languageSelect.value;
    // Меняем язык через систему локализации
    const success = await window.i18n.changeLanguage(selectedLang);
    
    if (success) {
      // Получаем название языка на текущем языке интерфейса
      const langName = languageSelect.options[languageSelect.selectedIndex].text;
      showToast(window.i18n.t('toasts.language_changed') + langName, 'info');
    }
  });
}

// --- Toast ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  // Добавляем контейнер для toast, если он отсутствует
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  
  // Сначала добавляем элемент в DOM
  toastContainer.appendChild(toast);
  
  // Принудительный reflow для применения начального состояния
  toast.offsetHeight;
  
  // Применяем анимацию появления
  toast.style.animation = 'toast-slide-in 0.3s ease forwards';
  
  // Устанавливаем таймер для анимации исчезновения
  setTimeout(() => {
    toast.style.animation = 'toast-fade-out 0.4s ease forwards';
    
    // Удаляем элемент после завершения анимации исчезновения
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 400);
  }, 2500);
}

// --- Theme Management ---
const themeRadios = document.querySelectorAll('input[name="theme"]');
let currentTheme = localStorage.getItem('theme') || 'system';

// Функция для применения темы
function applyTheme(theme) {
  // Удаляем старые классы темы
  document.body.classList.remove('theme-light', 'theme-dark');
  
  if (theme === 'system') {
    // Определяем системную тему через медиа-запрос
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
  } else {
    // Применяем выбранную тему
    document.body.classList.add(`theme-${theme}`);
  }
  
  // Сохраняем выбор в localStorage
  localStorage.setItem('theme', theme);
  currentTheme = theme;
  
  console.log(`Тема изменена на: ${theme} (${document.body.classList.contains('theme-dark') ? 'тёмная' : 'светлая'})`);
}

// Добавляем обработчик изменения системной темы
const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
darkModeMediaQuery.addEventListener('change', (e) => {
  // Если выбрана системная тема, обновляем её при изменении настроек ОС
  if (currentTheme === 'system') {
    applyTheme('system');
  }
});

// Добавляем обработчики для радиокнопок темы
themeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      applyTheme(radio.value);
      const themeName = radio.nextElementSibling.nextElementSibling.textContent;
      showToast(window.i18n.t('toasts.theme_changed') + themeName, 'success');
    }
  });
});

// --- Init ---
// Переменные для отслеживания статусов
let lastPrinterStatus = 'disconnected';
let lastSocketStatus = 'disconnected';

// Функция для инициализации IPC event listeners
function setupEventListeners() {
  console.log("=== SETTING UP EVENT LISTENERS ===");
  
  // Подписываемся на события обновления статусов принтера
  window.api.onPrinterStatus((data) => {
    console.log("=== PRINTER STATUS EVENT RECEIVED ===");
    console.log("Raw data:", JSON.stringify(data, null, 2));
    console.log("Current lastPrinterStatus:", lastPrinterStatus);
    console.log("New status:", data?.status);
    
    // Проверяем формат полученных данных
    if (!data || typeof data !== 'object' || !data.status) {
      console.error("Invalid printer status data received:", data);
      showPrinterStatus('error');
      showToast(window.i18n.t('toasts.printer_connection_error'), 'error');
      return;
    }
    
    const status = data.status;
    console.log(`Processing printer status: ${status}`);
    
    // Всегда обновляем UI
    showPrinterStatus(status);
    
    // Проверяем, изменился ли статус для показа уведомления
    if (lastPrinterStatus !== status) {
      console.log(`Status changed from ${lastPrinterStatus} to ${status}, showing toast`);
      
      switch(status) {
        case 'connected':
          showToast(window.i18n.t('toasts.printer_connected'), 'success');
          break;
        case 'error':
          const errorMsg = data.details || '';
          showToast(window.i18n.t('toasts.printer_connection_error') + errorMsg, 'error');
          break;
        case 'disconnected':
          if (lastPrinterStatus === 'connected') {
            showToast(window.i18n.t('toasts.printer_disconnected'), 'warning');
          }
          break;
        case 'connecting':
          // При статусе "connecting" не показываем toast
          console.log('Printer connecting, no toast shown');
          break;
      }
      
      // Обновляем последний известный статус
      lastPrinterStatus = status;
      console.log("Updated lastPrinterStatus to:", lastPrinterStatus);
    } else {
      console.log("Status unchanged, UI updated without toast");
    }
    
    console.log("=== PRINTER STATUS EVENT PROCESSED ===");
  });

  // Добавляем обработчик socket status событий
  window.api.onSocketStatus((data) => {
    if (data.status === 'test') {
      console.log("=== TEST IPC EVENT RECEIVED ===");
      console.log("IPC communication is working!");
      console.log("Test data:", JSON.stringify(data, null, 2));
      console.log("=== TEST COMPLETED ===");
      return;
    }
    
    console.log("=== SOCKET STATUS EVENT RECEIVED ===");
    console.log("Raw data:", JSON.stringify(data, null, 2));
    console.log("Data type:", typeof data);
    console.log("Status value:", data?.status);
    console.log("Force flag:", data?.force);
    console.log("Timestamp:", data?.timestamp);
    
    // Проверяем формат полученных данных
    if (!data || typeof data !== 'object') {
      console.error("Invalid socket status data received:", data);
      showSocketStatus('error');
      showToast(window.i18n.t('toasts.server_connection_error'), 'error');
      return;
    }
    
    // Дополнительный лог для отладки
    const status = data.status || 'error';
    console.log(`Processing socket status event: ${status}, force: ${data.force}, timestamp: ${data.timestamp}`);
    console.log("Current lastSocketStatus:", lastSocketStatus);
    
    // Принудительно обновляем статус если получен force флаг или статус изменился
    if (data.force || lastSocketStatus !== status) {
      console.log("=== UPDATING STATUS ===");
      // Сохраняем детали ошибки для отображения в подсказке
      if (status === 'error' && data.details) {
        window.lastErrorDetails = data.details;
      }
      
      // Обновляем UI немедленно
      console.log("Calling showSocketStatus with:", status, data.details);
      showSocketStatus(status, data.details);
      
      // Показываем уведомление только если статус действительно изменился
      if (lastSocketStatus !== status) {
        switch(status) {
          case 'error':
            const errorDetails = data.details || '';
            console.log('Socket connection error details:', errorDetails);
            showToast(window.i18n.t('toasts.server_connection_error') + errorDetails, 'error');
            break;
          case 'connected':
            console.log('Server connected successfully, updating status indicators');
            showToast(window.i18n.t('toasts.server_connected'), 'success');
            break;
          case 'disconnected':
            // Показываем уведомление только если ранее был подключён
            if (lastSocketStatus === 'connected') {
              showToast(window.i18n.t('toasts.server_disconnected'), 'warning');
            }
            break;
          case 'connecting':
            // При состоянии "connecting" не показываем дополнительных уведомлений
            break;
          default:
            showToast(`${window.i18n.t('server.connection_status')}: ${status}`, 'info');
        }
        
        // Обновляем последний известный статус
        lastSocketStatus = status;
        console.log("Updated lastSocketStatus to:", lastSocketStatus);
      } else {
        console.log("Status unchanged, force update applied but no toast shown");
      }
    } else {
      // Если статус не изменился, просто обновляем UI без уведомления
      console.log(`Status unchanged, updating UI only: ${status}`);
      showSocketStatus(status, data.details);
    }
    console.log("=== SOCKET STATUS EVENT PROCESSED ===");
  });

  console.log("=== EVENT LISTENERS SETUP COMPLETED ===");
}

async function initApp() {
  console.log("=== INIT APP START ===");
  
  try {
    // Сначала настраиваем event listeners
    setupEventListeners();
    // Initialize socket manager
    initializeSocketManager();
    // Инициализируем локализацию
    await window.i18n.init();
    
    // Получаем и применяем настройки
    const settings = await window.api.getSettings();
    console.log("Loaded settings:", settings);
    
    // Настройки принтера и сокета
    printerIpInput.value = settings.printerIp || '';
    socketUrlInput.value = settings.socketUrl || '';
    
    // Применяем сохранённую тему
    const savedTheme = localStorage.getItem('theme') || 'system';
    const themeRadio = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
    if (themeRadio) {
      themeRadio.checked = true;
      applyTheme(savedTheme);
    }
    
    // Применяем другие настройки, если они есть
    if (startWithWindowsCheckbox) {
      startWithWindowsCheckbox.checked = settings.startWithWindows || false;
    }
    
    if (minimizeToTrayCheckbox) {
      minimizeToTrayCheckbox.checked = settings.minimizeToTray || false;
    }
    
    if (languageSelect && settings.language) {
      languageSelect.value = settings.language;
    }
    
    // Обновляем все переводы в интерфейсе
    window.i18n.updateAll();
    
    // Устанавливаем начальные статусы (отключено по умолчанию)
    showPrinterStatus('disconnected');
    showSocketStatus('disconnected');
    
    // Загружаем шаблоны
    const templates = await window.api.getTemplates();
    if (templates) {
      currentState.templates = templates;
      renderTemplatesList();
    }
    
    // Настраиваем обработчики изменений для элементов настроек шаблона
    setupTemplateSettingsHandlers();
    
    // Обновляем предпросмотр шаблона если он открыт
    if (templateEditor && templateEditor.style.display !== 'none' && templateContentInput.value) {
      updateTemplatePreview();
    }
    
    // Загружаем логи
    loadLogs();
    
    // Автоматическое подключение к серверу при запуске, если URL задан
    if (settings.socketUrl) {
      console.log("Auto-connecting to socket server...");
      try {
        await window.api.connectSocket(settings.socketUrl);
      } catch (err) {
        console.error("Auto-connect error:", err);
      }
    }
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    showToast(window.i18n.t('toasts.initialization_error'), 'error');
  }
  
  console.log("=== INIT APP COMPLETED ===");
}

// --- Socket Connection Management ---
function initializeSocketManager() {
  // Load saved socket URL
  loadSocketSettings();
  
  // Initialize template bindings
  loadTemplateBindings();
  
  // Setup event listeners
  saveSocketUrlBtn?.addEventListener('click', saveSocketUrl);
  connectSocketNewBtn?.addEventListener('click', connectSocket);
  disconnectSocketBtn?.addEventListener('click', disconnectSocket);
  bindTemplateBtn?.addEventListener('click', bindTemplate);
  clearMessagesBtn?.addEventListener('click', clearMessages);
  autoScrollToggle?.addEventListener('click', toggleAutoScroll);
  messageEventFilter?.addEventListener('change', filterMessages);
}

async function loadSocketSettings() {
  try {
    const settings = await window.api.getSettings();
    if (socketServerUrlInput && settings.socketUrl) {
      socketServerUrlInput.value = settings.socketUrl;
    }
  } catch (error) {
    console.error('Error loading socket settings:', error);
  }
}

async function saveSocketUrl() {
  const url = socketServerUrlInput?.value?.trim();
  if (!url) {
    showToast('Please enter a valid socket server URL', 'error');
    return;
  }
  
  try {
    await window.api.saveSettings({ socketUrl: url });
    showToast('Socket URL saved successfully', 'success');
  } catch (error) {
    console.error('Error saving socket URL:', error);
    showToast('Error saving socket URL', 'error');
  }
}

function connectSocket() {
  const url = socketServerUrlInput?.value?.trim();
  if (!url) {
    showToast('Please enter a socket server URL', 'error');
    return;
  }
  
  try {
    // Disconnect existing connection
    if (socketConnection) {
      socketConnection.disconnect();
    }
    
    // Create new socket connection
    socketConnection = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    // Setup socket event handlers
    setupSocketHandlers();
    
    // Connect
    socketConnection.connect();
    
    updateConnectionStatus('connecting', 'Attempting to connect...');
    connectSocketNewBtn.disabled = true;
    disconnectSocketBtn.disabled = false;
    
  } catch (error) {
    console.error('Error connecting to socket:', error);
    updateConnectionStatus('error', `Connection error: ${error.message}`);
    showToast('Failed to connect to socket server', 'error');
  }
}

function disconnectSocket() {
  if (socketConnection) {
    socketConnection.disconnect();
    socketConnection = null;
  }
  
  updateConnectionStatus('disconnected', 'Manually disconnected');
  connectSocketNewBtn.disabled = false;
  disconnectSocketBtn.disabled = true;
  showToast('Disconnected from socket server', 'info');
}

function setupSocketHandlers() {
  if (!socketConnection) return;
  
  socketConnection.on('connect', () => {
    console.log('Socket connected successfully');
    updateConnectionStatus('connected', 'Connected successfully');
    showToast('Connected to socket server', 'success');
    addMessage('system', 'connect', 'Socket connected successfully', null);
  });
  
  socketConnection.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    updateConnectionStatus('disconnected', `Disconnected: ${reason}`);
    showToast('Socket disconnected', 'warning');
    addMessage('system', 'disconnect', `Socket disconnected: ${reason}`, null);
    
    connectSocketNewBtn.disabled = false;
    disconnectSocketBtn.disabled = true;
  });
  
  socketConnection.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    updateConnectionStatus('error', `Connection error: ${error.message}`);
    showToast('Socket connection error', 'error');
    addMessage('system', 'error', `Connection error: ${error.message}`, null);
    
    connectSocketNewBtn.disabled = false;
    disconnectSocketBtn.disabled = true;
  });
  
  // Listen for all events and log them
  socketConnection.onAny((eventName, ...args) => {
    console.log(`Socket event received: ${eventName}`, args);
    
    // Add to messages display
    addMessage('socket', eventName, JSON.stringify(args, null, 2), args[0]);
    
    // Log to file
    logSocketMessage(eventName, args);
    
    // Process template bindings
    processTemplateBinding(eventName, args[0]);
  });
}

function updateConnectionStatus(status, details) {
  if (!socketConnectionStatus) return;
  
  const statusDot = socketConnectionStatus.querySelector('.status-dot');
  const statusText = socketConnectionStatus.querySelector('span:last-child');
  
  // Remove all status classes
  socketConnectionStatus.classList.remove('status-connected', 'status-connecting', 'status-disconnected', 'status-error');
  statusDot.classList.remove('status-dot-connected', 'status-dot-connecting', 'status-dot-disconnected', 'status-dot-error');
  
  // Add new status classes
  socketConnectionStatus.classList.add(`status-${status}`);
  statusDot.classList.add(`status-dot-${status}`);
  
  // Update text
  if (statusText) {
    statusText.textContent = details || status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function addMessage(source, event, content, data) {
  if (!messagesContainer) return;
  
  messageCount++;
  const timestamp = new Date().toLocaleString();
  
  const messageElement = document.createElement('div');
  messageElement.className = `message-item ${source}-message`;
  messageElement.innerHTML = `
    <div class="message-header">
      <span class="message-time">${timestamp}</span>
      <span class="message-event">${event}</span>
      <span class="message-id">#${messageCount}</span>
    </div>
    <div class="message-content">
      <pre>${content}</pre>
    </div>
  `;
  
  messagesContainer.appendChild(messageElement);
  
  // Auto scroll if enabled
  if (autoScroll) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Update event filter options
  updateEventFilterOptions(event);
  
  // Apply current filter
  applyMessageFilter();
}

function clearMessages() {
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
    messageCount = 0;
  }
}

function toggleAutoScroll() {
  autoScroll = !autoScroll;
  if (autoScrollToggle) {
    const icon = autoScrollToggle.querySelector('.material-icons');
    const text = autoScrollToggle.childNodes[autoScrollToggle.childNodes.length - 1];
    if (icon) icon.textContent = 'vertical_align_bottom';
    if (text) text.textContent = ` Auto Scroll: ${autoScroll ? 'ON' : 'OFF'}`;
  }
}

function updateEventFilterOptions(event) {
  if (!messageEventFilter) return;
  
  // Check if option already exists
  const existingOption = messageEventFilter.querySelector(`option[value="${event}"]`);
  if (existingOption) return;
  
  const option = document.createElement('option');
  option.value = event;
  option.textContent = event;
  messageEventFilter.appendChild(option);
}

function filterMessages() {
  applyMessageFilter();
}

function applyMessageFilter() {
  if (!messagesContainer || !messageEventFilter) return;
  
  const filterValue = messageEventFilter.value;
  const messages = messagesContainer.querySelectorAll('.message-item');
  
  messages.forEach(message => {
    if (!filterValue) {
      message.style.display = 'block';
      return;
    }
    
    const eventSpan = message.querySelector('.message-event');
    if (eventSpan && eventSpan.textContent === filterValue) {
      message.style.display = 'block';
    } else {
      message.style.display = 'none';
    }
  });
}

async function logSocketMessage(eventName, data) {
  try {
    // Use the existing log system to record socket messages
    await window.api.logEvent({
      type: 'socket_message',
      event: eventName,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging socket message:', error);
  }
}

// Template binding functions
async function loadTemplateBindings() {
  try {
    const settings = await window.api.getSettings();
    templateEventBindings = settings.templateBindings || {};
    
    // Populate template select
    const templates = await window.api.getTemplates();
    updateTemplateSelect(templates);
    
    // Display current bindings
    displayTemplateBindings();
    
  } catch (error) {
    console.error('Error loading template bindings:', error);
  }
}

function updateTemplateSelect(templates) {
  if (!templateSelect) return;
  
  templateSelect.innerHTML = '<option value="">Select a template...</option>';
  
  Object.keys(templates).forEach(templateId => {
    const template = templates[templateId];
    const option = document.createElement('option');
    option.value = templateId;
    option.textContent = template.name || templateId;
    templateSelect.appendChild(option);
  });
}

async function bindTemplate() {
  const eventName = eventNameInput?.value?.trim();
  const templateId = templateSelect?.value;
  
  if (!eventName || !templateId) {
    showToast('Please enter an event name and select a template', 'error');
    return;
  }
  
  try {
    templateEventBindings[eventName] = templateId;
    
    // Save to settings
    const settings = await window.api.getSettings();
    settings.templateBindings = templateEventBindings;
    await window.api.saveSettings(settings);
    
    showToast(`Template bound to event "${eventName}"`, 'success');
    
    // Clear inputs
    eventNameInput.value = '';
    templateSelect.value = '';
    
    // Refresh display
    displayTemplateBindings();
    
  } catch (error) {
    console.error('Error binding template:', error);
    showToast('Error binding template to event', 'error');
  }
}

function displayTemplateBindings() {
  if (!bindingsList) return;
  
  bindingsList.innerHTML = '';
  
  if (Object.keys(templateEventBindings).length === 0) {
    bindingsList.innerHTML = '<p class="no-bindings">No template bindings configured</p>';
    return;
  }
  
  Object.entries(templateEventBindings).forEach(([event, templateId]) => {
    const bindingElement = document.createElement('div');
    bindingElement.className = 'binding-item';
    bindingElement.innerHTML = `
      <div class="binding-info">
        <strong>Event:</strong> ${event}<br>
        <strong>Template:</strong> ${templateId}
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeBinding('${event}')">
        <span class="material-icons">delete</span>
      </button>
    `;
    bindingsList.appendChild(bindingElement);
  });
}

async function removeBinding(eventName) {
  try {
    delete templateEventBindings[eventName];
    
    // Save to settings
    const settings = await window.api.getSettings();
    settings.templateBindings = templateEventBindings;
    await window.api.saveSettings(settings);
    
    showToast(`Binding for "${eventName}" removed`, 'info');
    displayTemplateBindings();
    
  } catch (error) {
    console.error('Error removing binding:', error);
    showToast('Error removing binding', 'error');
  }
}

async function processTemplateBinding(eventName, data) {
  const templateId = templateEventBindings[eventName];
  if (!templateId) return;
  
  try {
    // Use existing template processing system
    await window.api.processTemplate(templateId, data);
    addMessage('system', 'template_processed', `Template "${templateId}" processed for event "${eventName}"`, data);
  } catch (error) {
    console.error('Error processing template binding:', error);
    addMessage('system', 'template_error', `Error processing template for event "${eventName}": ${error.message}`, data);
  }
}

// Make removeBinding available globally
window.removeBinding = removeBinding;

// --- Window Controls ---
if (minimizeBtn) {
  minimizeBtn.addEventListener('click', () => {
    console.log('Minimize button clicked');
    window.api.windowControls.minimize();
  });
}

if (maximizeBtn) {
  maximizeBtn.addEventListener('click', () => {
    console.log('Maximize/restore button clicked');
    window.api.windowControls.maximize();
  });

  // Функция для обновления иконки в зависимости от состояния окна
  function updateMaximizeIcon(isMaximized) {
    const iconElement = maximizeBtn.querySelector('.material-icons');
    if (iconElement) {
      iconElement.textContent = isMaximized ? 'filter_none' : 'crop_square';
    }
  }

  // Подписываемся на события изменения состояния окна
  window.api.onWindowMaximizedChange((data) => {
    console.log("Window maximized state changed:", data);
    updateMaximizeIcon(data.isMaximized);
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    console.log('Close button clicked');
    window.api.windowControls.close();
  });
}

document.addEventListener('DOMContentLoaded', initApp);
