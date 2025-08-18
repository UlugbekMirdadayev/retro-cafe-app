const settings = require('./settings');

/**
 * Centralized error handling and validation utilities for printer operations
 */

/**
 * Error types for better categorization
 */
const ErrorTypes = {
  CONNECTION: 'connection',
  TEMPLATE: 'template',
  VALIDATION: 'validation',
  TIMEOUT: 'timeout',
  DEVICE: 'device',
  DATA: 'data'
};

/**
 * User-friendly error messages in Uzbek
 */
const ErrorMessages = {
  [ErrorTypes.CONNECTION]: 'Printega ulanishda xatolik yuz berdi',
  [ErrorTypes.TEMPLATE]: 'Shablon bilan ishlashda xatolik',
  [ErrorTypes.VALIDATION]: 'Ma\'lumotlar tekshirishida xatolik',
  [ErrorTypes.TIMEOUT]: 'Kutish vaqti tugadi',
  [ErrorTypes.DEVICE]: 'Printer qurilmasi xatosi',
  [ErrorTypes.DATA]: 'Ma\'lumotlar formati noto\'g\'ri'
};

/**
 * Template cache for better performance
 */
let templateCache = new Map();
let templateCacheTimestamp = 0;
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Creates a standardized error object
 * @param {string} type - Error type from ErrorTypes
 * @param {string} message - Technical error message
 * @param {string} userMessage - User-friendly message (optional)
 * @param {Error} originalError - Original error object (optional)
 * @returns {Object} Standardized error object
 */
function createError(type, message, userMessage = null, originalError = null) {
  return {
    type,
    message,
    userMessage: userMessage || ErrorMessages[type] || message,
    timestamp: new Date().toISOString(),
    originalError: originalError ? {
      message: originalError.message,
      stack: originalError.stack
    } : null
  };
}

/**
 * Validates printer connection settings
 * @returns {Object} Validation result with success flag and error details
 */
function validatePrinterSettings() {
  try {
    const printerSettings = settings.getSettings();
    
    if (!printerSettings.printerIp) {
      return {
        success: false,
        error: createError(
          ErrorTypes.VALIDATION,
          'Printer IP not found in settings',
          'Printer IP manzili sozlamalarda ko\'rsatilmagan'
        )
      };
    }

    // Validate IP format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(printerSettings.printerIp)) {
      return {
        success: false,
        error: createError(
          ErrorTypes.VALIDATION,
          'Invalid IP address format',
          'IP manzil formati noto\'g\'ri'
        )
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: createError(
        ErrorTypes.VALIDATION,
        'Error validating printer settings',
        'Printer sozlamalarini tekshirishda xatolik',
        error
      )
    };
  }
}

/**
 * Comprehensive template structure validation
 * @param {Object} template - Template object to validate
 * @returns {Object} Validation result with success flag and error details
 */
function validateTemplateStructure(template) {
  try {
    if (!template) {
      return {
        success: false,
        error: createError(
          ErrorTypes.TEMPLATE,
          'Template is null or undefined',
          'Shablon topilmadi'
        )
      };
    }

    if (typeof template !== 'object') {
      return {
        success: false,
        error: createError(
          ErrorTypes.TEMPLATE,
          'Template must be an object',
          'Shablon formati noto\'g\'ri'
        )
      };
    }

    // Check for segments (new format) or content (old format)
    if (template.segments) {
      if (!Array.isArray(template.segments)) {
        return {
          success: false,
          error: createError(
            ErrorTypes.TEMPLATE,
            'Template segments must be an array',
            'Shablon segmentlari noto\'g\'ri formatda'
          )
        };
      }

      if (template.segments.length === 0) {
        return {
          success: false,
          error: createError(
            ErrorTypes.TEMPLATE,
            'Template segments array is empty',
            'Shablon bo\'sh, hech qanday segment yo\'q'
          )
        };
      }

      // Validate individual segments
      for (let i = 0; i < template.segments.length; i++) {
        const segment = template.segments[i];
        const segmentValidation = validateSegment(segment, i);
        if (!segmentValidation.success) {
          return segmentValidation;
        }
      }
    } else if (!template.content) {
      return {
        success: false,
        error: createError(
          ErrorTypes.TEMPLATE,
          'Template has no segments or content',
          'Shablon mazmuni yo\'q'
        )
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: createError(
        ErrorTypes.TEMPLATE,
        'Error validating template structure',
        'Shablon tuzilishini tekshirishda xatolik',
        error
      )
    };
  }
}

/**
 * Validates individual template segment
 * @param {Object} segment - Segment to validate
 * @param {number} index - Segment index for error reporting
 * @returns {Object} Validation result
 */
function validateSegment(segment, index) {
  if (!segment || typeof segment !== 'object') {
    return {
      success: false,
      error: createError(
        ErrorTypes.TEMPLATE,
        `Segment ${index} is invalid`,
        `Segment ${index + 1} noto'g'ri formatda`
      )
    };
  }

  // Allow empty content for conditional segments
  if (segment.content !== undefined && typeof segment.content !== 'string') {
    return {
      success: false,
      error: createError(
        ErrorTypes.TEMPLATE,
        `Segment ${index} content must be a string`,
        `Segment ${index + 1} mazmuni matn bo'lishi kerak`
      )
    };
  }

  // Validate settings if present
  if (segment.settings && typeof segment.settings !== 'object') {
    return {
      success: false,
      error: createError(
        ErrorTypes.TEMPLATE,
        `Segment ${index} settings must be an object`,
        `Segment ${index + 1} sozlamalari noto'g'ri`
      )
    };
  }

  return { success: true };
}

/**
 * Validates template data completeness
 * @param {Object} data - Data object to validate
 * @param {Array} requiredFields - Array of required field names
 * @returns {Object} Validation result
 */
function validateTemplateData(data, requiredFields = []) {
  try {
    if (!data || typeof data !== 'object') {
      return {
        success: false,
        error: createError(
          ErrorTypes.DATA,
          'Template data is null or not an object',
          'Shablon uchun ma\'lumotlar yo\'q'
        )
      };
    }

    const missingFields = [];
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return {
        success: false,
        error: createError(
          ErrorTypes.DATA,
          `Missing required fields: ${missingFields.join(', ')}`,
          `Majburiy ma'lumotlar etishmayapti: ${missingFields.join(', ')}`
        )
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: createError(
        ErrorTypes.DATA,
        'Error validating template data',
        'Ma\'lumotlarni tekshirishda xatolik',
        error
      )
    };
  }
}

/**
 * Template caching utilities
 */
function getCachedTemplate(templateId) {
  const now = Date.now();
  if (now - templateCacheTimestamp > CACHE_EXPIRY_MS) {
    templateCache.clear();
    templateCacheTimestamp = now;
    return null;
  }
  
  return templateCache.get(templateId) || null;
}

function cacheTemplate(templateId, template) {
  templateCache.set(templateId, template);
}

function clearTemplateCache() {
  templateCache.clear();
  templateCacheTimestamp = 0;
}

/**
 * Connection recovery utilities
 */
function createTimeoutPromise(ms, operation = 'operation') {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(createError(
        ErrorTypes.TIMEOUT,
        `${operation} timed out after ${ms}ms`,
        `${operation} ${ms}ms ichida bajarilmadi`
      ));
    }, ms);
  });
}

/**
 * Wraps a connection operation with timeout and error handling
 * @param {Function} operation - Async operation to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name for error reporting
 * @returns {Promise} Promise that resolves/rejects with proper error handling
 */
function withConnectionTimeout(operation, timeoutMs = 10000, operationName = 'Connection') {
  return Promise.race([
    operation(),
    createTimeoutPromise(timeoutMs, operationName)
  ]);
}

/**
 * Safe device cleanup utility
 * @param {Object} device - Device object to clean up
 * @returns {Promise} Promise that always resolves
 */
function safeDeviceCleanup(device) {
  return new Promise((resolve) => {
    if (!device) {
      resolve();
      return;
    }

    try {
      const cleanup = () => {
        try {
          device.close();
        } catch (closeError) {
          console.warn('Error during device cleanup:', closeError.message);
        } finally {
          resolve();
        }
      };

      // Give device some time to finish current operation
      setTimeout(cleanup, 100);
    } catch (error) {
      console.warn('Error initiating device cleanup:', error.message);
      resolve();
    }
  });
}

/**
 * Checks if error is recoverable (connection can be retried)
 * @param {Object} error - Error object to check
 * @returns {boolean} True if error is recoverable
 */
function isRecoverableError(error) {
  if (!error) return false;
  
  const recoverableMessages = [
    'ECONNREFUSED',
    'ENETUNREACH', 
    'ETIMEDOUT',
    'ENOTFOUND'
  ];

  const errorMessage = error.message || error.toString();
  return recoverableMessages.some(msg => errorMessage.includes(msg));
}

module.exports = {
  ErrorTypes,
  ErrorMessages,
  createError,
  validatePrinterSettings,
  validateTemplateStructure,
  validateTemplateData,
  getCachedTemplate,
  cacheTemplate,
  clearTemplateCache,
  withConnectionTimeout,
  safeDeviceCleanup,
  isRecoverableError
};