const escpos = require("escpos");
escpos.Network = require("escpos-network");
const settings = require("./settings");
const printerUtils = require("./printerUtils");

function getPrinterDevice() {
  const ip = settings.getSettings().printerIp;
  return new escpos.Network(ip, 9100);
}

/**
 * Печать текстового шаблона чека с применением настроек форматирования
 * @param {string|Object} template - Содержимое текстового шаблона или объект с сегментами
 * @param {Object} data - Данные для подстановки в шаблон
 * @param {Object} templateSettings - Настройки форматирования текста (для обратной совместимости)
 * @returns {Promise<boolean>} - Результат печати
 */
function printReceipt(template, data, templateSettings = {}) {
  return new Promise(async (resolve, reject) => {
    let device = null;

    try {
      console.log("=== Starting Print Receipt ===");
      
      // Validate printer settings first
      const settingsValidation = printerUtils.validatePrinterSettings();
      if (!settingsValidation.success) {
        return reject(settingsValidation.error);
      }

      // Validate template structure
      const templateValidation = printerUtils.validateTemplateStructure(template);
      if (!templateValidation.success) {
        return reject(templateValidation.error);
      }

      // Validate template data
      const dataValidation = printerUtils.validateTemplateData(data);
      if (!dataValidation.success) {
        return reject(dataValidation.error);
      }

      const printerSettings = settings.getSettings();
      const ip = printerSettings.printerIp;
      
      console.log(`Connecting to printer at: ${ip}:9100`);

      // Prepare template data
      console.log("Preparing template data");
      const preparedData = prepareTemplateData(data);

      // Create device with proper error handling
      try {
        device = new escpos.Network(ip, 9100);
        console.log("Network device created");
      } catch (deviceError) {
        throw printerUtils.createError(
          printerUtils.ErrorTypes.DEVICE,
          `Error creating printer device: ${deviceError.message}`,
          'Printer qurilmasini yaratishda xatolik',
          deviceError
        );
      }

      // Open connection with timeout
      const openConnection = () => {
        return new Promise((resolveConn, rejectConn) => {
          device.open(function (err) {
            if (err) {
              const errorType = printerUtils.isRecoverableError(err) 
                ? printerUtils.ErrorTypes.CONNECTION 
                : printerUtils.ErrorTypes.DEVICE;
              
              rejectConn(printerUtils.createError(
                errorType,
                `Error opening printer device: ${err.message}`,
                'Printerga ulanishda xatolik',
                err
              ));
            } else {
              resolveConn();
            }
          });
        });
      };

      // Open connection with timeout
      await printerUtils.withConnectionTimeout(
        openConnection, 
        10000, 
        'Printer ulanishi'
      );

      console.log("Printer device opened successfully, initializing printer...");
      
      const printer = new escpos.Printer(device);
      console.log("Printer initialized, processing template...");

      // Process template with improved error handling
      if (template.segments && Array.isArray(template.segments)) {
        console.log("Processing template with segments:", template.segments.length);
        await printTemplateSegments(printer, template, preparedData);
      } else {
        console.log("Processing legacy template format");
        applyTemplateSettings(printer, templateSettings);
        const text = renderTemplate(template.content || template, preparedData);
        printer.text(text);
      }

      // Add line at the end
      printer.drawLine();

      // Check beep settings
      const globalSettings = template.globalSettings || templateSettings;
      if (globalSettings.beep && globalSettings.beep.enabled) {
        const count = parseInt(globalSettings.beep.count) || 1;
        const time = parseInt(globalSettings.beep.duration || globalSettings.beep.time) || 100;
        printer.beep(count, time);
      }

      // Cut and close
      const cutAndClose = () => {
        return new Promise((resolveCut) => {
          printer.cut().close(function () {
            console.log("Print job completed successfully");
            resolveCut(true);
          });
        });
      };

      const result = await cutAndClose();
      resolve(result);

    } catch (error) {
      console.error("Error in printReceipt:", error);
      
      // Ensure device cleanup
      if (device) {
        await printerUtils.safeDeviceCleanup(device);
      }

      // Convert generic errors to printer utils format
      if (!error.type) {
        error = printerUtils.createError(
          printerUtils.ErrorTypes.DEVICE,
          error.message || 'Unknown printing error',
          'Chop etishda noma\'lum xatolik',
          error
        );
      }

      reject(error);
    }
  });
}

/**
 * Печать шаблона по сегментам с индивидуальными настройками форматирования
 * @param {Object} printer - Объект принтера escpos
 * @param {Object} template - Шаблон с сегментами
 * @param {Object} data - Данные для подстановки
 */
async function printTemplateSegments(printer, template, data) {
  console.log("Starting segment-based printing");
  console.log(`Template has ${template.segments.length} segments`);
  
  if (!template.segments || !Array.isArray(template.segments)) {
    throw printerUtils.createError(
      printerUtils.ErrorTypes.TEMPLATE,
      "Template has no segments or invalid segments format",
      "Shablon segmentlari noto'g'ri formatda"
    );
  }

  let hasContent = false;
  let processedSegments = 0;
  let totalSegments = template.segments.length;
  let skippedConditionalSegments = 0;
  let errorSegments = [];
  
  for (let index = 0; index < template.segments.length; index++) {
    const segment = template.segments[index];
    
    try {
      console.log(`\n--- Processing segment ${index + 1}/${totalSegments} ---`);
      
      // Skip empty segments
      if (!segment.content || segment.content.trim() === '') {
        console.log(`Skipping empty segment ${index}`);
        continue;
      }

      console.log(`Segment content: "${segment.content}"`);

      // Process segment content
      let processedContent = renderTemplateString(segment.content, data);
      
      console.log(`Processed content: "${processedContent}"`);
      
      // Check if content is empty after processing
      if (!processedContent || processedContent.trim() === '') {
        // Check if segment contains only conditional blocks
        const hasConditionals = segment.content.includes(':if}') && segment.content.includes(':endif}');
        if (hasConditionals) {
          console.log(`Segment ${index} contains conditionals that evaluated to empty - this is OK`);
          skippedConditionalSegments++;
        } else {
          console.log(`Segment ${index} - empty after processing (no conditionals)`);
        }
        continue;
      }

      hasContent = true;
      processedSegments++;

      // Apply segment settings
      if (segment.settings) {
        console.log(`Applying settings for segment ${index}:`, segment.settings);
        applyTemplateSettings(printer, segment.settings);
      }

      // Print segment content
      printer.text(processedContent + '\n');
      console.log(`Segment ${index} printed successfully`);
      
    } catch (segmentError) {
      console.error(`Error processing segment ${index}:`, segmentError);
      
      errorSegments.push({
        index,
        error: segmentError.message || 'Unknown segment error'
      });
      
      // Continue with next segments to avoid complete failure
      continue;
    }
  }
  
  console.log(`\nProcessed ${processedSegments} segments, skipped conditional: ${skippedConditionalSegments}, errors: ${errorSegments.length}, hasContent: ${hasContent}`);
  
  // Report errors but don't fail completely if some segments worked
  if (errorSegments.length > 0) {
    console.warn(`Template processing had ${errorSegments.length} segment errors:`, errorSegments);
  }
  
  // Check if we have any printable content
  if (!hasContent) {
    const nonConditionalSegments = totalSegments - skippedConditionalSegments;
    
    if (nonConditionalSegments > 0 && processedSegments === 0) {
      throw printerUtils.createError(
        printerUtils.ErrorTypes.TEMPLATE,
        "Template produced no printable content - all non-conditional segments are empty",
        "Shablon chop qilinadigan mazmun yaratmadi"
      );
    } else if (totalSegments === skippedConditionalSegments) {
      throw printerUtils.createError(
        printerUtils.ErrorTypes.TEMPLATE,
        "All segments are conditional and empty - template needs basic content",
        "Barcha segmentlar shartli va bo'sh"
      );
    }
  }
  
  console.log("Finished processing all segments");
  
  // Return processing statistics
  return {
    processedSegments,
    skippedConditionalSegments,
    totalSegments,
    errorSegments: errorSegments.length,
    hasContent
  };
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
    console.log("=== Starting Template Preview ===");
    
    // Validate inputs
    const templateValidation = printerUtils.validateTemplateStructure(template);
    if (!templateValidation.success) {
      console.error("Template validation failed:", templateValidation.error);
      return `Preview xatosi: ${templateValidation.error.userMessage || templateValidation.error.message}`;
    }

    const dataValidation = printerUtils.validateTemplateData(data);
    if (!dataValidation.success) {
      console.error("Data validation failed:", dataValidation.error);
      return `Ma'lumotlar xatosi: ${dataValidation.error.userMessage || dataValidation.error.message}`;
    }

    // Prepare template data
    const preparedData = prepareTemplateData(data);
    let result = "";
    let processedSegments = 0;

    // Check new or old template format
    if (template.segments && Array.isArray(template.segments)) {
      // New format with segments
      console.log("Previewing template with segments");
      
      template.segments.forEach((segment, index) => {
        try {
          // Skip empty segments
          if (!segment.content || segment.content.trim() === '') {
            console.log(`Preview: Skipping empty segment ${index}`);
            return;
          }

          // Process segment content
          let processedContent = renderTemplateString(segment.content, preparedData);
          
          // Skip if content is empty after processing
          if (!processedContent || processedContent.trim() === '') {
            console.log(`Preview: Segment ${index} empty after processing`);
            return;
          }

          processedSegments++;

          // Apply formatting for preview
          if (segment.settings) {
            processedContent = formatPreviewText(processedContent, segment.settings);
          }

          result += processedContent + '\n';
        } catch (segmentError) {
          console.error(`Preview error in segment ${index}:`, segmentError);
          result += `[Segment ${index} xatosi: ${segmentError.message}]\n`;
        }
      });
    } else {
      // Legacy format for backwards compatibility
      console.log("Previewing legacy template format");
      try {
        let text = renderTemplateString(template.content || template, preparedData);

        // Apply alignment if specified in settings
        if (templateSettings.align === "center") {
          text = centerTextToWidth(text, 48);
        } else if (templateSettings.align === "right") {
          text = rightAlignTextToWidth(text, 48);
        }

        result = text;
        processedSegments = 1;
      } catch (legacyError) {
        console.error("Legacy template preview error:", legacyError);
        result = `Legacy shablon xatosi: ${legacyError.message}`;
      }
    }

    // Remove extra newlines at the end
    result = result.replace(/\n+$/, '');
    
    if (processedSegments === 0) {
      result = "Shablon bo'sh yoki barcha segmentlar shartli va bo'sh\n(Bu normal holat bo'lishi mumkin)";
    }
    
    // Add receipt cut simulation
    result += "\n" + "═".repeat(48) + "\n";
    result += " ".repeat(15) + "✂ Bu yerdan kesish ✂";

    console.log(`Preview completed: ${processedSegments} segments processed`);
    return result;

  } catch (error) {
    console.error("Error in previewTemplate:", error);
    
    // Handle structured errors
    if (error.type) {
      return `Preview xatosi: ${error.userMessage || error.message}`;
    }
    
    return `Preview xatosi: ${error.message || 'Noma\'lum xatolik'}`;
  }
}

/**
 * Форматирует текст для предварительного просмотра с учетом настроек сегмента
 * @param {string} text - Исходный текст
 * @param {Object} settings - Настройки форматирования
 * @returns {string} - Отформатированный текст
 */
function formatPreviewText(text, settings) {
  const receiptWidth = 48; // Ширина чековой ленты
  let formattedText = text;

  // Применяем выравнивание
  if (settings.align === "center") {
    formattedText = centerTextToWidth(formattedText, receiptWidth);
  } else if (settings.align === "right") {
    formattedText = rightAlignTextToWidth(formattedText, receiptWidth);
  }

  // Размер шрифта влияет на отображение
  if (settings.size && settings.size > 0) {
    if (settings.size === 1) {
      // Средний размер - делаем текст шире
      formattedText = formattedText.split('').join(' ');
    } else if (settings.size === 2) {
      // Большой размер - делаем текст еще шире и выше
      formattedText = formattedText.split('').join('  ');
      formattedText = formattedText + '\n' + ' '.repeat(formattedText.length/3); // Добавляем высоту
    }
  }

  // Жирный шрифт - обводим звездочками
  if (settings.bold) {
    formattedText = `**${formattedText}**`;
  }
  
  // Подчеркивание - добавляем линию снизу
  if (settings.underline) {
    const lineLength = formattedText.replace(/\*\*/g, '').length;
    formattedText = formattedText + '\n' + '‾'.repeat(Math.min(lineLength, receiptWidth));
  }
  
  // Курсив - обводим слешами
  if (settings.italic) {
    formattedText = `/${formattedText}/`;
  }

  return formattedText;
}

/**
 * Центрирует текст с учетом ширины чека
 */
function centerTextToWidth(text, width) {
  const lines = text.split('\n');
  return lines.map(line => {
    if (!line.trim()) return line;
    const cleanLine = line.replace(/\*\*/g, '').replace(/[_\/]/g, '');
    const padding = Math.max(0, Math.floor((width - cleanLine.length) / 2));
    return ' '.repeat(padding) + line;
  }).join('\n');
}

/**
 * Выравнивает текст по правому краю с учетом ширины чека
 */
function rightAlignTextToWidth(text, width) {
  const lines = text.split('\n');
  return lines.map(line => {
    if (!line.trim()) return line;
    const cleanLine = line.replace(/\*\*/g, '').replace(/[_\/]/g, '');
    const padding = Math.max(0, width - cleanLine.length);
    return ' '.repeat(padding) + line;
  }).join('\n');
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
  
  try {
    // Try to get cached template first
    let orderTemplate = printerUtils.getCachedTemplate('new_order');
    
    if (!orderTemplate) {
      console.log("Loading template from file...");
      const templates = require("./templates.json");
      orderTemplate = templates.new_order;
      
      if (!orderTemplate) {
        throw printerUtils.createError(
          printerUtils.ErrorTypes.TEMPLATE,
          "Order template not found",
          "Buyurtma shabloni topilmadi"
        );
      }
      
      // Cache the template
      printerUtils.cacheTemplate('new_order', orderTemplate);
    } else {
      console.log("Using cached template");
    }
    
    // Validate template structure
    const templateValidation = printerUtils.validateTemplateStructure(orderTemplate);
    if (!templateValidation.success) {
      throw templateValidation.error;
    }
    
    console.log("Template loaded:", orderTemplate.name);
    
    // Create comprehensive test data
    const testData = getTestTemplateData();
    
    // Validate test data
    const dataValidation = printerUtils.validateTemplateData(testData, ['id', 'products']);
    if (!dataValidation.success) {
      throw dataValidation.error;
    }
    
    // Prepare data
    const preparedData = prepareTemplateData(testData);
    
    // Process segments with improved validation
    if (orderTemplate.segments && Array.isArray(orderTemplate.segments)) {
      console.log("\n=== Processing Template Segments ===");
      let hasContent = false;
      let processedSegments = 0;
      let skippedConditionalSegments = 0;
      let errorSegments = 0;
      
      orderTemplate.segments.forEach((segment, index) => {
        try {
          if (!segment.content || segment.content.trim() === '') {
            console.log(`Segment ${index}: EMPTY - skipping`);
            return;
          }
          
          const processedContent = renderTemplateString(segment.content, preparedData);
          
          if (processedContent && processedContent.trim() !== '') {
            console.log(`Segment ${index}: OK - "${processedContent.substring(0, 50)}..."`);
            hasContent = true;
            processedSegments++;
          } else {
            // Check for conditional blocks
            const hasConditionals = segment.content.includes(':if}') && segment.content.includes(':endif}');
            if (hasConditionals) {
              console.log(`Segment ${index}: CONDITIONAL EMPTY (OK) - "${segment.content.substring(0, 50)}..."`);
              skippedConditionalSegments++;
            } else {
              console.log(`Segment ${index}: EMPTY AFTER PROCESSING - "${segment.content.substring(0, 50)}..."`);
            }
          }
        } catch (segmentError) {
          console.error(`Segment ${index} processing error:`, segmentError);
          errorSegments++;
        }
      });
      
      console.log(`\nSummary: ${processedSegments} with content, ${skippedConditionalSegments} conditional empty, ${errorSegments} errors`);
      
      if (errorSegments > 0) {
        return {
          success: false,
          message: `Template processing failed: ${errorSegments} segments had errors`,
          userMessage: `Shablon ishlov berishda ${errorSegments} ta segment xatosi`
        };
      }
      
      if (hasContent) {
        console.log("\n✅ Template processing successful - content found");
        return { 
          success: true, 
          message: "Template processed successfully",
          userMessage: "Shablon muvaffaqiyatli ishlandi",
          stats: {
            processedSegments,
            skippedConditionalSegments,
            totalSegments: orderTemplate.segments.length
          }
        };
      } else {
        const totalSegments = orderTemplate.segments.length;
        const nonConditionalSegments = totalSegments - skippedConditionalSegments;
        
        if (nonConditionalSegments > 0) {
          console.log("\n❌ Template processing failed - no content in non-conditional segments");
          return { 
            success: false, 
            message: "No printable content in non-conditional segments",
            userMessage: "Shartli bo'lmagan segmentlarda chop qilinadigan mazmun yo'q"
          };
        } else if (totalSegments === skippedConditionalSegments) {
          console.log("\n⚠️ All segments are conditional and empty - this may be normal");
          return { 
            success: false, 
            message: "All segments are conditional and empty",
            userMessage: "Barcha segmentlar shartli va bo'sh"
          };
        } else {
          console.log("\n❌ Template processing failed - no content");
          return { 
            success: false, 
            message: "No printable content after processing",
            userMessage: "Ishlov berish natijasida chop qilinadigan mazmun yo'q"
          };
        }
      }
    } else {
      console.log("❌ Template has no segments");
      return { 
        success: false, 
        message: "Template has no segments",
        userMessage: "Shablonda segmentlar yo'q"
      };
    }
    
  } catch (error) {
    console.error("❌ Template processing error:", error);
    
    // Convert to standard format if needed
    if (!error.type) {
      error = printerUtils.createError(
        printerUtils.ErrorTypes.TEMPLATE,
        error.message || 'Unknown template processing error',
        'Shablon ishlov berishda noma\'lum xatolik',
        error
      );
    }
    
    return { 
      success: false, 
      message: error.message,
      userMessage: error.userMessage,
      error
    };
  }
}

/**
 * Тестовая печать стандартного шаблона
 */
function testPrint() {
  console.log("=== Starting Test Print ===");
  
  try {
    // Check if mock printer should be used
    if (mockPrinter.isEnabled) {
      console.log("Using mock printer for test print");
      return testPrintWithMock();
    }

    // Validate printer settings first
    const settingsValidation = printerUtils.validatePrinterSettings();
    if (!settingsValidation.success) {
      console.error("Printer settings validation failed:", settingsValidation.error);
      throw settingsValidation.error;
    }

    // Get test template data
    const testData = getTestTemplateData();
    
    console.log("Test data prepared:", JSON.stringify(testData, null, 2));

    // Load template with caching
    let orderTemplate = printerUtils.getCachedTemplate('new_order');
    
    if (!orderTemplate) {
      console.log("Loading template from file...");
      try {
        const templates = require("./templates.json");
        orderTemplate = templates.new_order;
        
        if (!orderTemplate) {
          throw printerUtils.createError(
            printerUtils.ErrorTypes.TEMPLATE,
            "Order template not found in templates.json",
            "Buyurtma shabloni topilmadi"
          );
        }
        
        // Cache the loaded template
        printerUtils.cacheTemplate('new_order', orderTemplate);
        console.log("Template cached successfully");
        
      } catch (templateError) {
        throw printerUtils.createError(
          printerUtils.ErrorTypes.TEMPLATE,
          `Error loading templates: ${templateError.message}`,
          'Shablonlarni yuklashda xatolik',
          templateError
        );
      }
    } else {
      console.log("Using cached template");
    }

    // Validate template structure
    const templateValidation = printerUtils.validateTemplateStructure(orderTemplate);
    if (!templateValidation.success) {
      throw templateValidation.error;
    }

    console.log("Template structure validation passed");
    console.log(`Using template: ${orderTemplate.name || 'new_order'}`);
    console.log(`Template has ${orderTemplate.segments.length} segments`);

    // Print with improved error handling
    return printReceipt(orderTemplate, testData);

  } catch (error) {
    console.error("Test print failed:", error);
    
    // Convert generic errors to printer utils format
    if (!error.type) {
      error = printerUtils.createError(
        printerUtils.ErrorTypes.DEVICE,
        error.message || 'Unknown test print error',
        'Test chop etishda noma\'lum xatolik',
        error
      );
    }
    
    throw error;
  }
}

/**
 * Test print using mock printer for development
 */
async function testPrintWithMock() {
  try {
    const testData = getTestTemplateData();
    const templates = require("./templates.json");
    const orderTemplate = templates.new_order;
    
    if (!orderTemplate) {
      throw printerUtils.createError(
        printerUtils.ErrorTypes.TEMPLATE,
        "Order template not found",
        "Buyurtma shabloni topilmadi"
      );
    }

    return await mockPrinter.mockPrintReceipt(orderTemplate, testData);
  } catch (error) {
    console.error("Mock test print failed:", error);
    throw error;
  }
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
  return new Promise(async (resolve, reject) => {
    let device = null;
    
    try {
      // Check if mock printer should be used
      if (mockPrinter.isEnabled) {
        console.log("Using mock printer for connection test");
        return resolve(await mockPrinter.mockTestConnection(ip));
      }

      // Validate settings
      const settingsValidation = printerUtils.validatePrinterSettings();
      if (!settingsValidation.success && !ip) {
        return reject(settingsValidation.error);
      }

      const testIp = ip || settings.getSettings().printerIp;
      console.log(`Testing connection to printer at: ${testIp}:9100`);

      // Create device with proper error handling
      try {
        device = new escpos.Network(testIp, 9100);
      } catch (deviceError) {
        throw printerUtils.createError(
          printerUtils.ErrorTypes.DEVICE,
          `Error creating test device: ${deviceError.message}`,
          'Test qurilmasini yaratishda xatolik',
          deviceError
        );
      }

      // Test connection with timeout
      const testConnectionOperation = () => {
        return new Promise((resolveConn, rejectConn) => {
          device.open(function (err) {
            if (err) {
              const errorType = printerUtils.isRecoverableError(err) 
                ? printerUtils.ErrorTypes.CONNECTION 
                : printerUtils.ErrorTypes.DEVICE;
              
              rejectConn(printerUtils.createError(
                errorType,
                `Connection test failed: ${err.message}`,
                'Ulanish testi muvaffaqiyatsiz',
                err
              ));
            } else {
              // Close immediately after successful test
              try {
                device.close();
              } catch (closeError) {
                console.warn('Error closing test connection:', closeError);
              }
              resolveConn(true);
            }
          });
        });
      };

      const result = await printerUtils.withConnectionTimeout(
        testConnectionOperation,
        5000,
        'Ulanish testi'
      );

      console.log("Connection test successful");
      resolve(result);

    } catch (error) {
      console.error("Connection test failed:", error);
      
      // Ensure cleanup
      if (device) {
        await printerUtils.safeDeviceCleanup(device);
      }

      // Convert generic errors to printer utils format
      if (!error.type) {
        error = printerUtils.createError(
          printerUtils.ErrorTypes.CONNECTION,
          error.message || 'Unknown connection test error',
          'Ulanish testida noma\'lum xatolik',
          error
        );
      }

      reject(error);
    }
  });
}

function renderTemplate(content, data) {
  // Agar content ob'ekt bo'lsa (yangi format), uni string ga o'giramiz
  if (typeof content === 'object' && content !== null) {
    if (content.segments && Array.isArray(content.segments)) {
      // Yangi format - segmentlarni birlashtiriramiz
      return content.segments.map(segment => {
        if (segment.content) {
          return renderTemplateString(segment.content, data);
        }
        return '';
      }).filter(text => text.trim() !== '').join('\n');
    } else if (content.content) {
      // Eski format ob'ekt ko'rinishida
      return renderTemplateString(content.content, data);
    } else {
      console.warn('Unknown template format:', content);
      return '';
    }
  }
  
  // Agar string bo'lsa, to'g'ridan-to'g'ri ishlov beramiz
  if (typeof content === 'string') {
    return renderTemplateString(content, data);
  }
  
  console.warn('Invalid template content type:', typeof content);
  return '';
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
 * Mock printer for development and testing purposes
 * Simulates printer operations without actual hardware
 */
function createMockPrinter() {
  return {
    isEnabled: process.env.NODE_ENV === 'development' || process.env.MOCK_PRINTER === 'true',
    
    async mockPrintReceipt(template, data) {
      console.log("=== MOCK PRINTER: Starting Print Receipt ===");
      
      try {
        // Validate inputs like real printer
        const templateValidation = printerUtils.validateTemplateStructure(template);
        if (!templateValidation.success) {
          throw templateValidation.error;
        }

        const dataValidation = printerUtils.validateTemplateData(data);
        if (!dataValidation.success) {
          throw dataValidation.error;
        }

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

        // Process template like real printer
        const preparedData = prepareTemplateData(data);
        let mockOutput = "=== MOCK PRINT OUTPUT ===\n";

        if (template.segments && Array.isArray(template.segments)) {
          let processedSegments = 0;
          
          for (const segment of template.segments) {
            if (!segment.content || segment.content.trim() === '') continue;
            
            const processedContent = renderTemplateString(segment.content, preparedData);
            if (processedContent && processedContent.trim() !== '') {
              mockOutput += processedContent + '\n';
              processedSegments++;
            }
          }
          
          if (processedSegments === 0) {
            throw printerUtils.createError(
              printerUtils.ErrorTypes.TEMPLATE,
              'Mock printer: No content to print',
              'Mock printer: Chop qilinadigan mazmun yo\'q'
            );
          }
        } else {
          const text = renderTemplate(template.content || template, preparedData);
          mockOutput += text + '\n';
        }

        mockOutput += "=== END MOCK PRINT ===\n";
        console.log("Mock printer output:\n" + mockOutput);

        return {
          success: true,
          mockOutput,
          message: 'Mock print completed successfully'
        };

      } catch (error) {
        console.error("Mock printer error:", error);
        throw error;
      }
    },

    async mockTestConnection(ip) {
      console.log(`=== MOCK PRINTER: Testing connection to ${ip} ===`);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      // Simulate occasional connection failures for testing
      if (Math.random() < 0.1) {
        throw printerUtils.createError(
          printerUtils.ErrorTypes.CONNECTION,
          'Mock connection failed (random test)',
          'Mock ulanish testi muvaffaqiyatsiz'
        );
      }
      
      console.log("Mock printer connection test successful");
      return true;
    }
  };
}

const mockPrinter = createMockPrinter();

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
  testPrintWithMock,
  testTemplateProcessing,
  testConnection,
  previewTemplate,
  getTestTemplateData,
  renderTemplate,
  renderTemplateString,
  createMockPrinter
};
