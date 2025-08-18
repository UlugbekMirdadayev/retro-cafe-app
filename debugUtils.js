/**
 * Debugging and development utilities for printer template system
 */

const printer = require('./printer.js');
const printerUtils = require('./printerUtils.js');
const fs = require('fs');
const path = require('path');

/**
 * Debug utilities for template development
 */
const DebugUtils = {
  
  /**
   * Creates a detailed template analysis report
   * @param {string} templateId - Template ID to analyze
   * @returns {Object} Analysis report
   */
  analyzeTemplate(templateId = 'new_order') {
    console.log(`\n=== Template Analysis: ${templateId} ===`);
    
    try {
      const templates = require('./templates.json');
      const template = templates[templateId];
      
      if (!template) {
        return {
          success: false,
          error: `Template '${templateId}' not found`,
          availableTemplates: Object.keys(templates)
        };
      }

      const analysis = {
        templateId,
        name: template.name,
        structure: {},
        segments: [],
        validation: {},
        recommendations: []
      };

      // Basic structure analysis
      analysis.structure = {
        hasSegments: !!template.segments,
        segmentCount: template.segments ? template.segments.length : 0,
        hasGlobalSettings: !!template.globalSettings,
        hasName: !!template.name
      };

      // Validate template structure
      const structureValidation = printerUtils.validateTemplateStructure(template);
      analysis.validation.structure = {
        valid: structureValidation.success,
        error: structureValidation.error?.message
      };

      // Analyze segments
      if (template.segments) {
        template.segments.forEach((segment, index) => {
          const segmentAnalysis = {
            index,
            hasContent: !!(segment.content && segment.content.trim()),
            contentLength: segment.content ? segment.content.length : 0,
            hasSettings: !!segment.settings,
            hasConditionals: segment.content ? 
              (segment.content.includes(':if}') && segment.content.includes(':endif}')) : false,
            placeholders: [],
            conditionalBlocks: []
          };

          // Extract placeholders
          if (segment.content) {
            const placeholderMatches = segment.content.match(/{(\w+)}/g);
            if (placeholderMatches) {
              segmentAnalysis.placeholders = placeholderMatches.map(p => p.slice(1, -1));
            }

            // Extract conditional blocks
            const conditionalMatches = segment.content.match(/{(\w+):if}/g);
            if (conditionalMatches) {
              segmentAnalysis.conditionalBlocks = conditionalMatches.map(c => c.slice(1, -4));
            }
          }

          analysis.segments.push(segmentAnalysis);
        });
      }

      // Generate recommendations
      if (analysis.structure.segmentCount === 0) {
        analysis.recommendations.push('Template has no segments - consider adding content segments');
      }

      const emptySegments = analysis.segments.filter(s => !s.hasContent);
      if (emptySegments.length > 0) {
        analysis.recommendations.push(`${emptySegments.length} empty segments detected`);
      }

      const unconditionalSegments = analysis.segments.filter(s => s.hasContent && !s.hasConditionals);
      if (unconditionalSegments.length === 0) {
        analysis.recommendations.push('All segments are conditional - template may be empty if conditions not met');
      }

      console.log('Analysis Results:');
      console.log(`- Structure: ${analysis.validation.structure.valid ? 'Valid' : 'Invalid'}`);
      console.log(`- Segments: ${analysis.structure.segmentCount}`);
      console.log(`- Empty segments: ${emptySegments.length}`);
      console.log(`- Conditional segments: ${analysis.segments.filter(s => s.hasConditionals).length}`);
      
      if (analysis.recommendations.length > 0) {
        console.log('Recommendations:');
        analysis.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }

      return { success: true, analysis };

    } catch (error) {
      console.error('Template analysis error:', error);
      return { 
        success: false, 
        error: error.message,
        templateId 
      };
    }
  },

  /**
   * Tests template with different data scenarios
   * @param {string} templateId - Template ID to test
   * @param {Array} testScenarios - Array of test data scenarios
   * @returns {Object} Test results
   */
  testTemplateScenarios(templateId = 'new_order', testScenarios = null) {
    console.log(`\n=== Template Scenario Testing: ${templateId} ===`);
    
    const defaultScenarios = [
      {
        name: 'Complete data',
        data: printer.getTestTemplateData()
      },
      {
        name: 'No debt scenario',
        data: {
          ...printer.getTestTemplateData(),
          debtAmount: { uzs: 0, usd: 0 },
          hasDebtUzs: false,
          hasDebtUsd: false
        }
      },
      {
        name: 'No notes scenario',
        data: {
          ...printer.getTestTemplateData(),
          notes: null,
          hasNotes: false
        }
      },
      {
        name: 'Minimal data',
        data: {
          id: 'MIN-001',
          index: 'MIN001',
          products: [{
            product: { name: 'Test Item' },
            quantity: 1,
            price: 1000,
            currency: 'UZS'
          }],
          totalAmount: { uzs: 1000, usd: 0 },
          paidAmount: { uzs: 1000, usd: 0 },
          debtAmount: { uzs: 0, usd: 0 }
        }
      }
    ];

    const scenarios = testScenarios || defaultScenarios;
    const results = [];

    for (const scenario of scenarios) {
      console.log(`\n  Testing scenario: ${scenario.name}`);
      
      try {
        const processingResult = printer.testTemplateProcessing();
        
        results.push({
          scenario: scenario.name,
          success: processingResult.success,
          message: processingResult.message,
          userMessage: processingResult.userMessage,
          stats: processingResult.stats,
          error: processingResult.error
        });

        console.log(`    Result: ${processingResult.success ? 'PASSED' : 'FAILED'}`);
        if (processingResult.stats) {
          console.log(`    Segments processed: ${processingResult.stats.processedSegments}`);
        }

      } catch (error) {
        results.push({
          scenario: scenario.name,
          success: false,
          error: error.message,
          exception: true
        });
        console.log(`    Result: FAILED (Exception: ${error.message})`);
      }
    }

    const passedTests = results.filter(r => r.success).length;
    console.log(`\n  Summary: ${passedTests}/${results.length} scenarios passed`);

    return {
      templateId,
      totalScenarios: results.length,
      passedScenarios: passedTests,
      failedScenarios: results.length - passedTests,
      results
    };
  },

  /**
   * Generates a development report with all debug information
   * @param {string} templateId - Template to analyze
   * @returns {Object} Complete debug report
   */
  generateDebugReport(templateId = 'new_order') {
    console.log(`\n=== Complete Debug Report: ${templateId} ===`);
    
    const report = {
      timestamp: new Date().toISOString(),
      templateId,
      analysis: null,
      scenarioTests: null,
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        mockPrinterEnabled: process.env.MOCK_PRINTER === 'true',
        environment: process.env.NODE_ENV || 'unknown'
      },
      recommendations: [],
      summary: {}
    };

    // Run template analysis
    const analysisResult = this.analyzeTemplate(templateId);
    if (analysisResult.success) {
      report.analysis = analysisResult.analysis;
    } else {
      report.analysis = { error: analysisResult.error };
    }

    // Run scenario tests
    report.scenarioTests = this.testTemplateScenarios(templateId);

    // Generate overall recommendations
    if (report.analysis && report.analysis.recommendations) {
      report.recommendations = [...report.analysis.recommendations];
    }

    if (report.scenarioTests.failedScenarios > 0) {
      report.recommendations.push(
        `${report.scenarioTests.failedScenarios} test scenarios failed - review template logic`
      );
    }

    // Summary
    report.summary = {
      templateValid: report.analysis?.validation?.structure?.valid || false,
      allTestsPassed: report.scenarioTests.failedScenarios === 0,
      segmentCount: report.analysis?.structure?.segmentCount || 0,
      recommendationCount: report.recommendations.length
    };

    console.log('\n=== Debug Report Summary ===');
    console.log(`Template Valid: ${report.summary.templateValid ? 'YES' : 'NO'}`);
    console.log(`All Tests Passed: ${report.summary.allTestsPassed ? 'YES' : 'NO'}`);
    console.log(`Segments: ${report.summary.segmentCount}`);
    console.log(`Recommendations: ${report.summary.recommendationCount}`);

    return report;
  },

  /**
   * Saves debug report to file
   * @param {Object} report - Debug report to save
   * @param {string} filename - Output filename
   */
  saveDebugReport(report, filename = 'debug-report.json') {
    try {
      const reportPath = path.join(__dirname, 'logs', filename);
      
      // Ensure logs directory exists
      const logsDir = path.dirname(reportPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\nDebug report saved to: ${reportPath}`);
      
      return { success: true, path: reportPath };
    } catch (error) {
      console.error('Error saving debug report:', error);
      return { success: false, error: error.message };
    }
  }
};

module.exports = DebugUtils;