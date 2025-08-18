#!/usr/bin/env node

/**
 * Template validation and debugging CLI tool
 * Usage: node validate-templates.js [templateId]
 */

const debugUtils = require('./debugUtils');
const args = process.argv.slice(2);
const templateId = args[0] || 'new_order';

console.log('=== Retro Cafe Template Validator ===');
console.log(`Target: ${templateId}\n`);

async function main() {
  try {
    // Generate comprehensive debug report
    const report = debugUtils.generateDebugReport(templateId);
    
    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `template-validation-${templateId}-${timestamp}.json`;
    const saveResult = debugUtils.saveDebugReport(report, filename);
    
    console.log('\n=== Validation Complete ===');
    
    if (report.summary.templateValid && report.summary.allTestsPassed) {
      console.log('✅ Template is valid and all tests passed!');
      process.exit(0);
    } else {
      console.log('⚠️  Issues detected:');
      
      if (!report.summary.templateValid) {
        console.log('  - Template structure validation failed');
      }
      
      if (!report.summary.allTestsPassed) {
        console.log('  - Some test scenarios failed');
      }
      
      if (report.recommendations.length > 0) {
        console.log('\n🔧 Recommendations:');
        report.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

main();