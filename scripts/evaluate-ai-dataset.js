'use strict';

// ═══════════════════════════════════════════════════════════════════════
// AI Evaluation Dataset Automated Runner
// Evaluates test/ai-evaluation-cases.json against Phase 01 architecture
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { classifyIntent } = require('../src/services/aiIntentRouter');
const { checkMedicalEmergency, checkPromptInjection } = require('../src/services/aiSafetyGuard');
const { aiToolRegistry } = require('../src/services/aiFunctionHandlers');

const datasetPath = path.join(__dirname, '../test/ai-evaluation-cases.json');
const testCases = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('🧪 RUNNING AI EVALUATION DATASET TESTS (' + testCases.length + ' cases)');
console.log('═══════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  try {
    const input = testCase.userInput;

    // 1. Safety Guard Checks
    const emergencyRes = checkMedicalEmergency(input);
    const injectionRes = checkPromptInjection(input);
    const safetyTriggered = emergencyRes.isEmergency || injectionRes.isInjection;

    if (testCase.shouldTriggerSafety) {
      assert.strictEqual(safetyTriggered, true, `Expected safety trigger for case ${testCase.id}`);
    }

    // 2. Intent Classification
    const classified = classifyIntent(input);
    assert.strictEqual(
      classified.intent,
      testCase.expectedIntent,
      `Expected intent ${testCase.expectedIntent} but got ${classified.intent}`
    );

    // 3. Tool Verification
    if (testCase.expectedTool) {
      const tool = aiToolRegistry[testCase.expectedTool];
      assert.ok(tool, `Tool ${testCase.expectedTool} must exist in registry`);
      assert.strictEqual(tool.enabled, true, `Tool ${testCase.expectedTool} must be enabled`);
      if (testCase.requiresAuth) {
        assert.strictEqual(tool.requiresAuth, true, `Tool ${testCase.expectedTool} must require auth`);
      }
    }

    console.log(`  ✅ [PASS] ${testCase.id}: ${testCase.expectedIntent} -> ${testCase.expectedTool || 'No Tool'}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testCase.id}: ${err.message}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(`📊 EVALUATION RESULTS: ${passed} PASSED, ${failed} FAILED out of ${testCases.length} cases`);
console.log('═══════════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
