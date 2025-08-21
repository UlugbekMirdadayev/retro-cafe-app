const escpos = require("escpos");
escpos.Network = require("escpos-network");
const settings = require("./settings");
/**
 * Печать текстового шаблона чека с применением настроек форматирования
 * @param {string|Object} template - Содержимое текстового шаблона или объект с сегментами
 * @param {Object} data - Данные для подстановки в шаблон
 * @param {Object} templateSettings - Настройки форматирования текста (для обратной совместимости)
 * @returns {Promise<boolean>} - Результат печати
 */
function printReceipt(template, data, templateSettings = {}) {
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
        return reject(
          new Error(`Ошибка создания подключения: ${deviceError.message}`)
        );
      }

      // Подготавливаем данные перед отправкой в шаблон
      console.log("Preparing template data");
      const preparedData = prepareTemplateData(data);

      // Открываем соединение с принтером
      device.open(function (err) {
        clearTimeout(connectionTimeout);

        if (err) {
          console.error("Error opening printer device:", err);
          return reject(
            new Error(`Ошибка подключения к принтеру: ${err.message}`)
          );
        }

        try {
          console.log(
            "Printer device opened successfully, initializing printer..."
          );
          const printer = new escpos.Printer(device);

          console.log("Printer initialized, processing template...");

          // Проверяем новый или старый формат шаблона
          if (template.segments && Array.isArray(template.segments)) {
            // Новый формат с сегментами
            console.log(
              "Processing template with segments:",
              template.segments.length
            );
            printTemplateSegments(printer, template, preparedData);
          } else {
            // Старый формат для обратной совместимости
            console.log("Processing legacy template format");
            // Применяем настройки шаблона
            applyTemplateSettings(printer, templateSettings);

            // Обрабатываем шаблон
            const text = renderTemplate(
              template.content || template,
              preparedData
            );
            printer.text(text);
          }

          // Добавляем линию в конце
          printer.drawLine();

          // Проверяем настройки звукового сигнала
          const globalSettings = template.globalSettings || templateSettings;
          if (globalSettings.beep && globalSettings.beep.enabled) {
            const count = parseInt(globalSettings.beep.count) || 1;
            const time =
              parseInt(
                globalSettings.beep.duration || globalSettings.beep.time
              ) || 100;
            printer.beep(count, time);
          } else {
            // Без звукового сигнала
            console.log("Beep disabled in template settings");
          }

          // Отрезаем чек и закрываем соединение
          printer.cut().close(function () {
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

/**
 * Печать шаблона по сегментам с индивидуальными настройками форматирования
 * @param {Object} printer - Объект принтера escpos
 * @param {Object} template - Шаблон с сегментами
 * @param {Object} data - Данные для подстановки
 */
function printTemplateSegments(printer, template, data) {
  console.log("Starting segment-based printing");
  console.log(`Template has ${template.segments.length} segments`);

  if (!template.segments || !Array.isArray(template.segments)) {
    console.error("Template has no segments or invalid segments format");
    throw new Error("Шаблон не содержит сегментов для печати");
  }

  let hasContent = false;
  let processedSegments = 0;
  let totalSegments = template.segments.length;
  let skippedConditionalSegments = 0;

  template.segments.forEach((segment, index) => {
    try {
      console.log(`\n--- Processing segment ${index + 1}/${totalSegments} ---`);

      // Пропускаем пустые сегменты
      if (!segment.content || segment.content.trim() === "") {
        console.log(`Skipping empty segment ${index}`);
        return;
      }

      console.log(`Segment content: "${segment.content}"`);

      // Обрабатываем содержимое сегмента
      let processedContent = renderTemplateString(segment.content, data);

      console.log(`Processed content: "${processedContent}"`);

      // Если после обработки содержимое пустое, проверяем, есть ли условные блоки
      if (!processedContent || processedContent.trim() === "") {
        // Проверяем, содержит ли сегмент только условные блоки
        const hasConditionals =
          segment.content.includes(":if}") &&
          segment.content.includes(":endif}");
        if (hasConditionals) {
          console.log(
            `Segment ${index} contains conditionals that evaluated to empty - this is OK`
          );
          skippedConditionalSegments++;
        } else {
          console.log(
            `Segment ${index} - empty after processing (no conditionals)`
          );
        }
        return;
      }

      hasContent = true;
      processedSegments++;

      // Применяем настройки сегмента
      if (segment.settings) {
        console.log(
          `Applying settings for segment ${index}:`,
          segment.settings
        );
        applyTemplateSettings(printer, segment.settings);
      }

      // Печатаем содержимое сегмента
      printer.text(processedContent + "\n");
      console.log(`Segment ${index} printed successfully`);
    } catch (segmentError) {
      console.error(`Error processing segment ${index}:`, segmentError);
      // Продолжаем печать следующих сегментов при ошибке
    }
  });

  console.log(
    `\nProcessed ${processedSegments} segments, skipped conditional: ${skippedConditionalSegments}, hasContent: ${hasContent}`
  );

  // Если у нас есть хотя бы один сегмент с содержимым, считаем это успехом
  // Даже если другие сегменты пустые из-за условий
  if (!hasContent) {
    // Дополнительная проверка: если большинство сегментов были условными и пустыми,
    // но у нас есть основные сегменты (заголовок, линии и т.д.), это нормально
    const nonConditionalSegments = totalSegments - skippedConditionalSegments;
    if (nonConditionalSegments > 0 && processedSegments === 0) {
      console.error(
        "Template produced no printable content - all non-conditional segments are empty"
      );
      throw new Error("Шаблон не содержит текста после обработки");
    } else if (totalSegments === skippedConditionalSegments) {
      console.warn(
        "All segments are conditional and empty - template needs basic content"
      );
      throw new Error("Все сегменты шаблона условные и пусты");
    }
  }

  console.log("Finished processing all segments");
}

/**
 * Применяет настройки шаблона к принтеру
 * @param {Object} printer - Объект принтера escpos
 * @param {Object} settings - Настройки шаблона
 */
function applyTemplateSettings(printer, templateSettings) {
  // Выравнивание текста
  if (templateSettings.align) {
    switch (templateSettings.align) {
      case "center":
        printer.align("ct");
        break;
      case "right":
        printer.align("rt");
        break;
      default:
        printer.align("lt");
        break;
    }
  } else {
    printer.align("lt");
  }

  // Шрифт
  if (templateSettings.font) {
    printer.font(templateSettings.font);
  } else {
    printer.font("a"); // Шрифт по умолчанию
  }

  // Размер текста (0-7 где 0 нормальный)
  if (templateSettings.size !== undefined) {
    const size = parseInt(templateSettings.size) || 0;
    printer.size(size, size);
  } else {
    printer.size(0, 0);
  }

  // Стиль шрифта (жирный, подчеркнутый и т.д.)
  let style = "";
  if (templateSettings.bold) style += "b";
  if (templateSettings.underline) style += "u";
  if (templateSettings.italic) style += "i";

  if (style) {
    printer.style(style);
  } else {
    printer.style("normal");
  }
}

/**
 * Функция для подготовки предварительного просмотра шаблона
 * @param {string|Object} template - Содержимое текстового шаблона или объект с сегментами
 * @param {Object} data - Данные для подстановки в шаблон
 * @param {Object} templateSettings - Настройки форматирования текста (для обратной совместимости)
 * @returns {string} - Отформатированный текст для предпросмотра
 */
function previewTemplate(template, data, templateSettings = {}) {
  try {
    // Подготавливаем данные перед отправкой в шаблон
    const preparedData = prepareTemplateData(data);
    let result = "";

    // Проверяем новый или старый формат шаблона
    if (template.segments && Array.isArray(template.segments)) {
      // Новый формат с сегментами
      console.log("Previewing template with segments");

      template.segments.forEach((segment, index) => {
        // Пропускаем пустые сегменты
        if (!segment.content || segment.content.trim() === "") {
          return;
        }

        // Обрабатываем содержимое сегмента
        let processedContent = renderTemplateString(
          segment.content,
          preparedData
        );

        // Если после обработки содержимое пустое, пропускаем сегмент
        if (!processedContent || processedContent.trim() === "") {
          return;
        }

        // Применяем форматирование для превью
        if (segment.settings) {
          processedContent = formatPreviewText(
            processedContent,
            segment.settings
          );
        }

        result += processedContent + "\n";
      });
    } else {
      // Старый формат для обратной совместимости
      console.log("Previewing legacy template format");
      let text = renderTemplateString(
        template.content || template,
        preparedData
      );

      // Если в настройках указано выравнивание, применяем его
      if (templateSettings.align === "center") {
        text = centerTextToWidth(text, 48);
      } else if (templateSettings.align === "right") {
        text = rightAlignTextToWidth(text, 48);
      }

      result = text;
    }

    // Убираем лишние переносы строк в конце
    result = result.replace(/\n+$/, "");

    // Добавляем эмуляцию отреза чека
    return result;
  } catch (error) {
    console.error("Error in previewTemplate:", error);
    return `Ошибка предпросмотра: ${error.message}`;
  }
}

/**
 * Форматирует текст для предварительного просмотра с учетом настроек сегмента
 * @param {string} text - Исходный текст
 * @param {Object} settings - Настройки форматирования
 * @returns {string} - Отформатированный текст
 */
function formatPreviewText(text, settings) {
  console.log("=== Formatting Preview Text ===");
  console.log("Input text:", text);
  console.log("Settings:", settings);

  const receiptWidth = 96; // Ширина чековой ленты
  let formattedText = text;
  let actualWidth = receiptWidth; // Реальная ширина с учетом настроек

  // Сначала применяем стили текста (размер и шрифт)

  // Размер шрифта влияет на отображение и ширину
  if (settings.size && settings.size > 0) {
    console.log("Applying size:", settings.size);
    if (settings.size === 1) {
      // Средний размер - делаем текст шире, уменьшаем эффективную ширину
      formattedText = formattedText.split("").join(" ");
      actualWidth = Math.floor(receiptWidth / 1.5); // Уменьшаем ширину для центровки
      console.log("Size 1 applied, actualWidth:", actualWidth);
    } else if (settings.size === 2) {
      // Большой размер - делаем текст еще шире
      formattedText = formattedText.split("").join("  ");
      actualWidth = Math.floor(receiptWidth / 2); // Значительно уменьшаем ширину
      console.log("Size 2 applied, actualWidth:", actualWidth);

      // Добавляем эффект высоты для больших букв
      const lines = formattedText.split("\n");
      formattedText = lines
        .map((line) => {
          if (line.trim()) {
            const padding = " ".repeat(
              Math.min(Math.floor(line.length / 3), actualWidth)
            );
            return line + "\n" + padding; // Добавляем высоту снизу
          }
          return line;
        })
        .join("\n");
    }
  }

  // Шрифт влияет на стиль отображения
  if (settings.font === "b") {
    console.log("Applying font B");
    // Шрифт B - более компактный, показываем это через точки между символами
    if (!settings.size || settings.size === 0) {
      formattedText = formattedText.split("").join("·");
      actualWidth = Math.floor(receiptWidth / 1.2);
    }
    // Добавляем индикатор шрифта B
    formattedText = formattedText;
  } else if (settings.font === "a") {
    console.log("Applying font A");
    // Добавляем индикатор шрифта A для ясности
    formattedText = formattedText;
  }

  // Жирный шрифт - обводим звездочками
  if (settings.bold) {
    console.log("Applying bold");
    formattedText = `**${formattedText}**`;
  }

  // Курсив - обводим слешами (применяем до выравнивания)
  if (settings.italic) {
    console.log("Applying italic");
    formattedText = `/${formattedText}/`;
  }

  // Применяем выравнивание с учетом реальной ширины
  if (settings.align === "center") {
    console.log("Applying center alignment");
    formattedText = centerTextToWidth(formattedText, actualWidth);
  } else if (settings.align === "right") {
    console.log("Applying right alignment");
    formattedText = rightAlignTextToWidth(formattedText, actualWidth);
  }

  // Подчеркивание - добавляем линию снизу (после выравнивания)
  if (settings.underline) {
    console.log("Applying underline");
    const lines = formattedText.split("\n");
    formattedText = lines
      .map((line) => {
        if (line.trim()) {
          // Вычисляем длину без форматирующих символов
          const cleanLine = line
            .replace(/[\*\/\[\]]/g, "")
            .replace(/[AB]/g, "")
            .trim();
          const underlineLength = Math.min(cleanLine.length, actualWidth);
          const lineIndent = line.length - line.trimLeft().length; // Сохраняем отступ
          return (
            line +
            "\n" +
            " ".repeat(lineIndent) +
            "‾".repeat(Math.max(1, underlineLength))
          );
        }
        return line;
      })
      .join("\n");
  }

  console.log("Final formatted text:", formattedText);
  console.log("=== End Formatting ===");
  return formattedText;
}

/**
 * Центрирует текст с учетом ширины чека
 */
function centerTextToWidth(text, width) {
  const lines = text.split("\n");
  return lines
    .map((line) => {
      if (!line.trim()) return line;
      // Удаляем все форматирующие символы для подсчета реальной длины
      const cleanLine = line
        .replace(/[\*\/\[\]]/g, "") // звездочки, слеши, скобки
        .replace(/[AB]/g, "") // индикаторы шрифтов
        .replace(/[·‾]/g, "") // точки и подчеркивания
        .replace(/\s+/g, " "); // нормализуем пробелы

      const actualLength = cleanLine.length;
      const padding = Math.max(0, Math.floor((width - actualLength) / 2));
      return " ".repeat(padding) + line;
    })
    .join("\n");
}

/**
 * Выравнивает текст по правому краю с учетом ширины чека
 */
function rightAlignTextToWidth(text, width) {
  const lines = text.split("\n");
  return lines
    .map((line) => {
      if (!line.trim()) return line;
      // Удаляем все форматирующие символы для подсчета реальной длины
      const cleanLine = line
        .replace(/[\*\/\[\]]/g, "") // звездочки, слеши, скобки
        .replace(/[AB]/g, "") // индикаторы шрифтов
        .replace(/[·‾]/g, "") // точки и подчеркивания
        .replace(/\s+/g, " "); // нормализуем пробелы

      const actualLength = cleanLine.length;
      const padding = Math.max(0, width - actualLength);
      return " ".repeat(padding) + line;
    })
    .join("\n");
}

/**
 * Выравнивает текст по центру для предпросмотра
 * @param {string} text - Исходный текст
 * @returns {string} - Отцентрированный текст
 */
function centerText(text) {
  const lines = text.split("\n");
  const width = 48; // Стандартная ширина чековой ленты

  return lines
    .map((line) => {
      if (!line.trim()) return line;
      const padding = Math.max(0, (width - line.length) / 2);
      return " ".repeat(Math.floor(padding)) + line;
    })
    .join("\n");
}

/**
 * Выравнивает текст по правому краю для предпросмотра
 * @param {string} text - Исходный текст
 * @returns {string} - Выровненный по правому краю текст
 */
function rightAlignText(text) {
  const lines = text.split("\n");
  const width = 48; // Стандартная ширина чековой ленты

  return lines
    .map((line) => {
      if (!line.trim()) return line;
      const padding = Math.max(0, width - line.length);
      return " ".repeat(padding) + line;
    })
    .join("\n");
}

/**
 * Тестирование шаблона без печати (только проверка обработки данных)
 */
function testTemplateProcessing() {
  console.log("=== Testing Template Processing (No Print) ===");

  // Создаем тестовые данные
  const testData = {
    id: "TEST-123",
    index: "A001234",
    createdAt: new Date().toISOString(),
    products: [
      {
        product: {
          name: "Test Product 1",
        },
        quantity: 2,
        price: 25000,
        currency: "UZS",
      },
      {
        product: {
          name: "Test Product 2",
        },
        quantity: 1,
        price: 12000,
        currency: "UZS",
      },
    ],
    branch: {
      name: "UMA-OIL LOLA",
    },
    client: {
      fullName: "Test Customer",
      phone: "+998 90 123 45 67",
    },
    totalAmount: {
      uzs: 62000,
      usd: 5.0,
    },
    paidAmount: {
      uzs: 40000, // Меньше чем общая сумма, чтобы создать долг
      usd: 3.0, // Меньше чем общая сумма в USD
    },
    debtAmount: {
      uzs: 22000, // Есть долг в сумах
      usd: 2.0, // Есть долг в долларах
    },
    notes: "Test template processing with debt and notes", // Есть заметки
    date_returned: new Date(Date.now() + 86400000).toISOString(), // Есть дата возврата
    paymentType: "cash",
    status: "completed",
  };

  try {
    // Загружаем шаблоны
    const templates = require("./templates.json");
    const orderTemplate = templates.new_order;

    if (!orderTemplate) {
      throw new Error("Order template not found");
    }

    console.log("Template loaded:", orderTemplate.name);

    // Подготавливаем данные
    const preparedData = prepareTemplateData(testData);

    // Симулируем обработку сегментов
    if (orderTemplate.segments && Array.isArray(orderTemplate.segments)) {
      console.log("\n=== Processing Template Segments ===");
      let hasContent = false;
      let processedSegments = 0;
      let skippedConditionalSegments = 0;

      orderTemplate.segments.forEach((segment, index) => {
        if (!segment.content || segment.content.trim() === "") {
          console.log(`Segment ${index}: EMPTY - skipping`);
          return;
        }

        const processedContent = renderTemplateString(
          segment.content,
          preparedData
        );

        if (processedContent && processedContent.trim() !== "") {
          console.log(
            `Segment ${index}: OK - "${processedContent.substring(0, 50)}..."`
          );
          hasContent = true;
          processedSegments++;
        } else {
          // Проверяем, содержит ли сегмент только условные блоки
          const hasConditionals =
            segment.content.includes(":if}") &&
            segment.content.includes(":endif}");
          if (hasConditionals) {
            console.log(
              `Segment ${index}: CONDITIONAL EMPTY (OK) - "${segment.content.substring(0, 50)}..."`
            );
            skippedConditionalSegments++;
          } else {
            console.log(
              `Segment ${index}: EMPTY AFTER PROCESSING - "${segment.content.substring(0, 50)}..."`
            );
          }
        }
      });

      console.log(
        `\nSummary: ${processedSegments} with content, ${skippedConditionalSegments} conditional empty`
      );

      if (hasContent) {
        console.log("\n✅ Template processing successful - content found");
        return { success: true, message: "Template processed successfully" };
      } else {
        const totalSegments = orderTemplate.segments.length;
        const nonConditionalSegments =
          totalSegments - skippedConditionalSegments;

        if (nonConditionalSegments > 0) {
          console.log(
            "\n❌ Template processing failed - no content in non-conditional segments"
          );
          return {
            success: false,
            message: "No printable content in non-conditional segments",
          };
        } else if (totalSegments === skippedConditionalSegments) {
          console.log(
            "\n⚠️ All segments are conditional and empty - this may be normal"
          );
          return {
            success: false,
            message: "All segments are conditional and empty",
          };
        } else {
          console.log("\n❌ Template processing failed - no content");
          return {
            success: false,
            message: "No printable content after processing",
          };
        }
      }
    } else {
      console.log("❌ Template has no segments");
      return { success: false, message: "Template has no segments" };
    }
  } catch (error) {
    console.error("❌ Template processing error:", error);
    return { success: false, message: error.message };
  }
}

/**
 * Тестовая печать стандартного шаблона
 */
function testPrint() {
  console.log("=== Starting Test Print ===");

  // Создаем тестовые данные, совместимые с шаблоном
  const testData = {
    id: "TEST-123",
    index: "A001234",
    createdAt: new Date().toISOString(),
    products: [
      {
        product: {
          name: "Lavash mini",
        },
        quantity: 2,
        price: 25000,
        currency: "UZS",
      },
      {
        product: {
          name: "Cola 0.5L",
        },
        quantity: 1,
        price: 12000,
        currency: "UZS",
      },
      {
        product: {
          name: "Kartoshka fri",
        },
        quantity: 1,
        price: 15000,
        currency: "UZS",
      },
    ],
    branch: {
      name: "UMA-OIL LOLA",
    },
    client: {
      fullName: "Test Customer",
      phone: "+998 90 123 45 67",
    },
    totalAmount: {
      uzs: 52000,
      usd: 4.2,
    },
    paidAmount: {
      uzs: 30000, // Создаем долг для тестирования условных блоков
      usd: 4.2,
    },
    debtAmount: {
      uzs: 22000, // Есть долг в сумах
      usd: 0,
    },
    notes: "Тестовая печать системы - проверка условных блоков",
    date_returned: new Date(Date.now() + 86400000).toISOString(),
    paymentType: "cash",
    status: "completed",
  };

  console.log("Test data prepared:", JSON.stringify(testData, null, 2));

  // Используем шаблон с новым форматом сегментов
  let templates;
  try {
    templates = require("./templates.json");
    console.log("Templates loaded successfully");
    console.log("Available templates:", Object.keys(templates));
  } catch (templateError) {
    console.error("Error loading templates:", templateError);
    throw new Error("Не удалось загрузить шаблоны");
  }

  const orderTemplate = templates.new_order;
  if (!orderTemplate) {
    console.error("Order template not found in templates.json");
    console.error("Available templates:", Object.keys(templates));
    throw new Error("Шаблон 'new_order' не найден");
  }

  console.log("Order template structure:", {
    hasName: !!orderTemplate.name,
    hasSegments: !!orderTemplate.segments,
    segmentsCount: orderTemplate.segments ? orderTemplate.segments.length : 0,
    hasGlobalSettings: !!orderTemplate.globalSettings,
  });

  if (!orderTemplate.segments || !Array.isArray(orderTemplate.segments)) {
    console.error("Order template has no segments:", orderTemplate);
    throw new Error("Шаблон не содержит сегментов для печати");
  }

  if (orderTemplate.segments.length === 0) {
    console.error("Order template has empty segments array");
    throw new Error("Шаблон содержит пустой массив сегментов");
  }

  console.log(`Using template: ${orderTemplate.name || "new_order"}`);
  console.log(`Template has ${orderTemplate.segments.length} segments`);

  // Печать с новым форматом
  return printReceipt(orderTemplate, testData);
}

function prepareTemplateData(data) {
  console.log("=== Preparing Template Data ===");
  console.log("Input data:", JSON.stringify(data, null, 2));

  const result = { ...data };

  // Форматируем дату
  if (data.createdAt) {
    const date = new Date(data.createdAt);
    result.date = date.toLocaleString("uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } else {
    result.date = new Date().toLocaleString("uz-UZ");
  }

  // Форматируем список товаров
  if (data.products && Array.isArray(data.products)) {
    let productsText = "";
    data.products.forEach((item, index) => {
      // Получаем имя товара (может быть в разных полях в зависимости от API)
      let productName = "Mahsulot";

      // Поддержка разных форматов product (строка, объект с name/title или ID)
      if (typeof item.product === "object" && item.product !== null) {
        productName =
          item.product.name || item.product.title || `Mahsulot #${index + 1}`;
      } else if (typeof item.product === "string") {
        productName = item.product; // Если это строка, используем её как имя продукта
      } else if (item.name) {
        // Если product не определен, но есть name напрямую в item
        productName = item.name;
      }

      const currency = item.currency || "UZS";
      const price = formatNumber(item.price || 0);
      const quantity = item.quantity || 1;
      const totalPrice = formatNumber(quantity * (item.price || 0));

      productsText += `${index + 1}. ${productName}\n`;
      productsText += `   ${quantity} x ${price} = ${totalPrice} ${currency}\n`;
    });
    result.products = productsText;

    // Посчитаем количество товаров
    result.productCount = data.products.length;
  }

  // Информация о филиале
  if (data.branch && data.branch.name) {
    result.branchName = data.branch.name;
  } else {
    result.branchName = "UMA-OIL LOLA";
  }

  // Информация о клиенте
  if (data.client) {
    result.clientName = data.client.fullName || "---";
    result.clientPhone = data.client.phone || "---";
    result.clientInfo = `${result.clientName} (${result.clientPhone})`;
  } else {
    result.clientInfo = "---";
  }

  // Номер чека
  result.orderIndex = data.index || "000000";

  // Форматируем суммы UZS
  if (data.totalAmount && data.totalAmount.uzs !== undefined) {
    result.totalAmountUzs = formatNumber(data.totalAmount.uzs);
  } else {
    result.totalAmountUzs = "0";
  }

  // Форматируем суммы USD
  if (data.totalAmount && data.totalAmount.usd !== undefined) {
    result.totalAmountUsd = formatNumber(data.totalAmount.usd);
  } else {
    result.totalAmountUsd = "0";
  }

  // Форматируем суммы оплаты UZS
  if (data.paidAmount && data.paidAmount.uzs !== undefined) {
    result.paidAmountUzs = formatNumber(data.paidAmount.uzs);
  } else {
    result.paidAmountUzs = "0";
  }

  // Форматируем суммы оплаты USD
  if (data.paidAmount && data.paidAmount.usd !== undefined) {
    result.paidAmountUsd = formatNumber(data.paidAmount.usd);
  } else {
    result.paidAmountUsd = "0";
  }

  // Форматируем долг UZS
  if (data.debtAmount && data.debtAmount.uzs !== undefined) {
    result.debtAmountUzs = formatNumber(data.debtAmount.uzs);
    result.hasDebtUzs = parseInt(data.debtAmount.uzs) > 0 ? true : false;
  } else {
    result.debtAmountUzs = "0";
    result.hasDebtUzs = false;
  }

  // Форматируем долг USD
  if (data.debtAmount && data.debtAmount.usd !== undefined) {
    result.debtAmountUsd = formatNumber(data.debtAmount.usd);
    result.hasDebtUsd = parseInt(data.debtAmount.usd) > 0 ? true : false;
  } else {
    result.debtAmountUsd = "0";
    result.hasDebtUsd = false;
  }

  // Комментарии и возврат долга
  if (data.notes) {
    result.notes = data.notes;
    result.hasNotes = true;
  } else {
    result.hasNotes = false;
  }

  if (data.date_returned) {
    // Форматируем дату возврата долга
    const returnDate = new Date(data.date_returned);
    result.returnDate = returnDate.toLocaleDateString("uz-UZ");
    result.hasReturnDate = true;
  } else {
    result.hasReturnDate = false;
  }

  // Преобразуем статус и тип оплаты
  if (data.status) {
    const statusMap = {
      completed: "Bajarilgan",
      pending: "Kutilmoqda",
      cancelled: "Bekor qilingan",
    };
    result.status = statusMap[data.status] || data.status;
  }

  if (data.paymentType) {
    const paymentMap = {
      cash: "Naqd pul",
      card: "Karta",
      transfer: "O'tkazma",
    };
    result.paymentType = paymentMap[data.paymentType] || data.paymentType;
  }

  // Добавляем год для копирайта
  result.currentYear = new Date().getFullYear();

  console.log("=== Prepared Template Data ===");
  console.log("Final result:", JSON.stringify(result, null, 2));
  console.log("=== End Prepared Data ===");

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

      device.open(function (err) {
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
  // Agar content ob'ekt bo'lsa (yangi format), uni string ga o'giramiz
  if (typeof content === "object" && content !== null) {
    if (content.segments && Array.isArray(content.segments)) {
      // Yangi format - segmentlarni birlashtiriramiz
      return content.segments
        .map((segment) => {
          if (segment.content) {
            return renderTemplateString(segment.content, data);
          }
          return "";
        })
        .filter((text) => text.trim() !== "")
        .join("\n");
    } else if (content.content) {
      // Eski format ob'ekt ko'rinishida
      return renderTemplateString(content.content, data);
    } else {
      console.warn("Unknown template format:", content);
      return "";
    }
  }

  // Agar string bo'lsa, to'g'ridan-to'g'ri ishlov beramiz
  if (typeof content === "string") {
    return renderTemplateString(content, data);
  }

  console.warn("Invalid template content type:", typeof content);
  return "";
}

function renderTemplateString(content, data) {
  console.log(`=== Rendering Template String ===`);
  console.log(`Input content: "${content}"`);
  console.log(`Available data keys:`, Object.keys(data));

  let result = content;

  // Обработка условных конструкций {key:if}...{key:endif}
  const conditionalRegex = /{(\w+):if}([\s\S]*?){(\1):endif}/g;
  result = result.replace(
    conditionalRegex,
    (match, key, conditionalContent) => {
      console.log(`Processing conditional: ${key}, value:`, data[key]);
      // Если ключ существует и его значение истинно, возвращаем содержимое внутри условия
      if (data[key]) {
        console.log(`Conditional ${key} is true, including content`);
        return conditionalContent;
      } else {
        console.log(`Conditional ${key} is false, excluding content`);
        // Иначе возвращаем пустую строку
        return "";
      }
    }
  );

  // Обработка обычных переменных {key}
  for (const key in data) {
    const replacePattern = new RegExp(`{${key}}`, "g");
    if (data[key] !== undefined && data[key] !== null) {
      console.log(`Replacing {${key}} with: "${data[key]}"`);
      result = result.replace(replacePattern, data[key]);
    }
  }

  // Удаляем оставшиеся незамененные плейсхолдеры
  const removedPlaceholders = result.match(/{(\w+)}/g);
  if (removedPlaceholders) {
    console.log(`Removing unused placeholders:`, removedPlaceholders);
  }
  result = result.replace(/{(\w+)}/g, "");

  console.log(`Final rendered result: "${result}"`);
  console.log(`=== End Rendering ===`);

  return result;
}

/**
 * Создает тестовые данные для демонстрации шаблона чека
 * @returns {Object} - Тестовые данные для шаблона
 */
function getTestTemplateData() {
  return {
    id: "TEST-123",
    index: "A001234",
    products: [
      {
        product: {
          name: "Renvol Atef 4L VI",
        },
        quantity: 12,
        price: 21,
        currency: "USD",
      },
      {
        product: {
          name: "Sintol 0.5L",
        },
        quantity: 1,
        price: 15000,
        currency: "UZS",
      },
    ],
    branch: {
      name: "UMA-OIL LOLA",
    },
    client: {
      fullName: "Ulug'bek Mirdadayev",
      phone: "+998 99 657 2600",
    },
    totalAmount: {
      uzs: 77000,
      usd: 6.5,
    },
    paidAmount: {
      uzs: 50000,
      usd: 6.5,
    },
    debtAmount: {
      uzs: 27000,
      usd: 0,
    },
    notes: "Mijoz kechqurun 19:00 da qarzni to'laydi",
    date_returned: new Date(Date.now() + 86400000).toISOString(),
    paymentType: "cash",
    status: "completed",
    createdAt: new Date().toISOString(),
  };
}

// Экспортируем все функции, необходимые для работы с принтером
module.exports = {
  printReceipt,
  testPrint,
  testTemplateProcessing,
  testConnection,
  previewTemplate,
  getTestTemplateData,
  renderTemplate,
  renderTemplateString,
};
