const escpos = require("escpos");
escpos.Network = require("escpos-network");
const settings = require("./settings");

function getPrinterDevice() {
  const ip = settings.getSettings().printerIp;
  return new escpos.Network(ip, 9100);
}

function printReceipt(template, data) {
  return new Promise((resolve, reject) => {
    try {
      // Получаем IP-адрес принтера из настроек
      const printerSettings = settings.getSettings();
      console.log("Current settings:", printerSettings);
      
      const ip = printerSettings.printerIp;
      if (!ip) {
        console.error("Printer IP not found in settings");
        return reject(new Error("IP-адрес принтера не указан в настройках"));
      }
      
      console.log(`Connecting to printer at: ${ip}:9100`);
      
      // Таймаут для операции подключения
      const connectionTimeout = setTimeout(() => {
        console.error("Printer connection timeout");
        reject(new Error("Таймаут подключения к принтеру"));
      }, 10000);
      
      // Создаем устройство
      let device = null;
      try {
        device = new escpos.Network(ip, 9100);
        console.log("Network device created");
      } catch (deviceError) {
        clearTimeout(connectionTimeout);
        console.error("Error creating printer device:", deviceError);
        return reject(new Error(`Ошибка создания подключения: ${deviceError.message}`));
      }
      
      // Подготавливаем данные перед отправкой в шаблон
      console.log("Preparing template data");
      const preparedData = prepareTemplateData(data);
      const text = renderTemplate(template.content, preparedData);
      
      console.log("Prepared text for printing:", text);

      // Открываем соединение с принтером
      device.open(function(err) {
        clearTimeout(connectionTimeout);
        
        if (err) {
          console.error("Error opening printer device:", err);
          return reject(new Error(`Ошибка подключения к принтеру: ${err.message}`));
        }
        
        try {
          console.log("Printer device opened successfully, initializing printer...");
          const printer = new escpos.Printer(device);
          
          console.log("Printer initialized, sending text...");
          printer
            .text(text)
            .beep(3, 200)
            .cut()
            .close(function() {
              console.log("Print job completed successfully");
              resolve(true);
            });
        } catch (printError) {
          console.error("Error during print operation:", printError);
          try {
            device.close();
          } catch (closeError) {
            console.warn("Error closing device:", closeError);
          }
          reject(new Error(`Ошибка печати: ${printError.message}`));
        }
      });
    } catch (error) {
      console.error("General error in printReceipt:", error);
      reject(new Error(`Общая ошибка печати: ${error.message}`));
    }
  });
}

function testPrint() {
  const testData = {
    id: "TEST-123",
    products: [
      {
        product: "Тестовый товар",
        quantity: 1,
        price: 10000
      }
    ],
    totalAmount: { uzs: 10000 },
    paidAmount: { uzs: 10000 },
    debtAmount: { uzs: 0 },
    paymentType: "cash",
    status: "completed",
    createdAt: new Date().toISOString()
  };

  return printReceipt({ 
    name: "Тестовый чек", 
    content: "ТЕСТОВЫЙ ЧЕК\n--------------------\nЗаказ #{id}\nДата: {date}\n\nТовары:\n{products}\n\nИтого: {totalAmount} UZS\n\nСпасибо за покупку!\n--------------------" 
  }, testData);
}

function prepareTemplateData(data) {
  const result = { ...data };
  
  // Форматируем дату
  if (data.createdAt) {
    const date = new Date(data.createdAt);
    result.date = date.toLocaleString('ru-RU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Форматируем список товаров
  if (data.products && Array.isArray(data.products)) {
    let productsText = '';
    data.products.forEach((item, index) => {
      // Получаем имя товара (может быть в разных полях в зависимости от API)
      let productName = "Товар";
      
      // Поддержка разных форматов product (строка, объект с name/title или ID)
      if (typeof item.product === 'object' && item.product !== null) {
        productName = item.product.name || item.product.title || `Товар #${index+1}`;
      } else if (typeof item.product === 'string') {
        productName = item.product; // Если это строка, используем её как имя продукта
      } else if (item.name) {
        // Если product не определен, но есть name напрямую в item
        productName = item.name;
      }
      
      productsText += `${index + 1}. ${productName}\n`;
      productsText += `   ${item.quantity} x ${formatNumber(item.price)} = ${formatNumber(item.quantity * item.price)} UZS\n`;
    });
    result.products = productsText;
  }
  
  // Форматируем суммы
  if (data.totalAmount) {
    result.totalAmount = formatNumber(data.totalAmount.uzs);
  }
  
  if (data.paidAmount) {
    result.paidAmount = formatNumber(data.paidAmount.uzs);
  }
  
  if (data.debtAmount) {
    result.debtAmount = formatNumber(data.debtAmount.uzs);
  }
  
  // Преобразуем статус и тип оплаты на русский
  if (data.status) {
    const statusMap = {
      'completed': 'Выполнен',
      'pending': 'В ожидании',
      'cancelled': 'Отменен'
    };
    result.status = statusMap[data.status] || data.status;
  }
  
  if (data.paymentType) {
    const paymentMap = {
      'cash': 'Наличные',
      'card': 'Карта',
      'transfer': 'Перевод'
    };
    result.paymentType = paymentMap[data.paymentType] || data.paymentType;
  }
  
  return result;
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function testConnection(ip) {
  return new Promise((resolve, reject) => {
    try {
      const testIp = ip || settings.getSettings().printerIp;
      if (!testIp) {
        return reject(new Error("IP-адрес принтера не указан"));
      }
      
      const device = new escpos.Network(testIp, 9100);
      
      // Устанавливаем таймаут для подключения
      const timeout = setTimeout(() => {
        reject(new Error("Превышено время ожидания подключения к принтеру"));
      }, 5000);
      
      device.open(function(err) {
        clearTimeout(timeout);
        
        if (err) {
          reject(new Error(`Ошибка подключения к принтеру: ${err.message}`));
        } else {
          // Закрываем соединение после проверки
          device.close();
          resolve(true);
        }
      });
    } catch (error) {
      reject(new Error(`Ошибка при проверке принтера: ${error.message}`));
    }
  });
}

function renderTemplate(content, data) {
  let result = content;
  for (const key in data) {
    const replacePattern = new RegExp(`{${key}}`, 'g');
    if (data[key] !== undefined && data[key] !== null) {
      result = result.replace(replacePattern, data[key]);
    }
  }
  return result;
}

module.exports = { printReceipt, testPrint, testConnection };
