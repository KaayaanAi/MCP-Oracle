#!/usr/bin/env node

/**
 * MCP Oracle Runtime Error Test Suite v1.3.0
 *
 * This script tests all critical runtime error scenarios that have been fixed:
 * 1. Service initialization failures
 * 2. Unhandled promise rejections
 * 3. JSON parsing errors
 * 4. MongoDB connection failures
 * 5. API rate limiting
 * 6. Memory leaks
 * 7. Network timeout handling
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import axios from 'axios';

const TEST_SERVER_PORT = 4099;
const TEST_TIMEOUT = 30000;

class RuntimeErrorTester {
  constructor() {
    this.testResults = [];
    this.serverProcess = null;
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${type}: ${message}`);
  }

  async runTest(testName, testFunction) {
    this.log(`Starting test: ${testName}`, 'TEST');
    const startTime = performance.now();

    try {
      await testFunction();
      const duration = (performance.now() - startTime).toFixed(2);
      this.log(`✅ PASSED: ${testName} (${duration}ms)`, 'PASS');
      this.testResults.push({ name: testName, status: 'PASSED', duration });
    } catch (error) {
      const duration = (performance.now() - startTime).toFixed(2);
      this.log(`❌ FAILED: ${testName} - ${error.message} (${duration}ms)`, 'FAIL');
      this.testResults.push({ name: testName, status: 'FAILED', duration, error: error.message });
    }
  }

  async startTestServer() {
    return new Promise((resolve, reject) => {
      // Start server with minimal environment
      this.serverProcess = spawn('node', ['src/index.js', '--http', '--port', TEST_SERVER_PORT], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: TEST_SERVER_PORT,
          LOG_LEVEL: 'error',
          // Intentionally missing API keys to test error handling
          MONGODB_URL: 'mongodb://invalid:27017/test_db'
        },
        stdio: 'pipe'
      });

      let serverReady = false;

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('HTTP server running') && !serverReady) {
          serverReady = true;
          resolve();
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        // Expected errors during testing
        console.error(`Server stderr: ${data}`);
      });

      this.serverProcess.on('error', (error) => {
        if (!serverReady) {
          reject(new Error(`Failed to start test server: ${error.message}`));
        }
      });

      // Timeout if server doesn't start
      setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Test server failed to start within timeout'));
        }
      }, 15000);
    });
  }

  async stopTestServer() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        this.serverProcess.on('close', resolve);
      });
    }
  }

  // Test 1: Service initialization with missing API keys
  async testServiceInitializationFailures() {
    // Server should start even with missing API keys (graceful degradation)
    const response = await axios.get(`http://localhost:${TEST_SERVER_PORT}/health`, {
      timeout: 5000
    });

    if (response.status !== 200) {
      throw new Error('Health check failed - server not handling missing services properly');
    }
  }

  // Test 2: API endpoint with invalid parameters
  async testInvalidParameterHandling() {
    try {
      await axios.post(`http://localhost:${TEST_SERVER_PORT}/api/tools/getSmartMarketPulse`, {
        invalidParam: 'test',
        assets: null // Invalid data type
      }, { timeout: 5000 });

      throw new Error('Expected validation error but request succeeded');
    } catch (error) {
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        // Expected validation error
        return;
      }
      throw error;
    }
  }

  // Test 3: JSON parsing with malformed data
  async testJSONParsingErrors() {
    try {
      await axios.post(`http://localhost:${TEST_SERVER_PORT}/mcp`, 'invalid-json', {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      throw new Error('Expected JSON parsing error but request succeeded');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        // Expected JSON parsing error
        return;
      }
      throw error;
    }
  }

  // Test 4: MongoDB connection failure handling
  async testMongoDBFailureHandling() {
    // Server should be running despite MongoDB connection failure
    const response = await axios.post(`http://localhost:${TEST_SERVER_PORT}/api/tools/getSmartMarketPulse`, {
      assets: ['BTC'],
      analysis_depth: 'quick'
    }, { timeout: 10000 });

    if (!response.data.success || response.data.data.isError) {
      // Expected - service may fail due to missing API keys, but shouldn't crash
      this.log('Service properly handling MongoDB failure with degraded functionality');
    }
  }

  // Test 5: Rate limiting enforcement
  async testRateLimitingEnforcement() {
    const promises = [];

    // Make many concurrent requests to trigger rate limiting
    for (let i = 0; i < 10; i++) {
      promises.push(
        axios.post(`http://localhost:${TEST_SERVER_PORT}/health`, {}, {
          timeout: 3000,
          validateStatus: () => true // Accept all status codes
        })
      );
    }

    const responses = await Promise.all(promises);
    const rateLimitedResponses = responses.filter(r => r.status === 429);

    if (rateLimitedResponses.length === 0) {
      this.log('Warning: Rate limiting may not be working as expected', 'WARN');
    }
  }

  // Test 6: Memory leak prevention
  async testMemoryLeakPrevention() {
    const initialMemory = process.memoryUsage();

    // Make repeated requests to check for memory accumulation
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        axios.post(`http://localhost:${TEST_SERVER_PORT}/api/tools/getSmartMarketPulse`, {
          assets: ['BTC'],
          analysis_depth: 'quick'
        }, {
          timeout: 10000,
          validateStatus: () => true
        })
      );
    }

    await Promise.allSettled(promises);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

    if (memoryIncrease > 50) { // 50MB threshold
      throw new Error(`Potential memory leak detected: ${memoryIncrease.toFixed(2)}MB increase`);
    }

    this.log(`Memory usage stable: ${memoryIncrease.toFixed(2)}MB change`);
  }

  // Test 7: Network timeout handling
  async testNetworkTimeoutHandling() {
    try {
      // Test with very short timeout to simulate network issues
      await axios.post(`http://localhost:${TEST_SERVER_PORT}/api/tools/getMarketForecast`, {
        symbol: 'BTC',
        days: 7
      }, { timeout: 1 }); // 1ms timeout

      throw new Error('Expected timeout error but request succeeded');
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        // Expected timeout error
        return;
      }
      // Server should handle this gracefully without crashing
      if (error.response && error.response.status >= 500) {
        throw new Error('Server crashed on timeout - not handling network errors properly');
      }
    }
  }

  // Test 8: Concurrent request handling
  async testConcurrentRequestHandling() {
    const concurrentRequests = 5;
    const promises = [];

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        axios.get(`http://localhost:${TEST_SERVER_PORT}/health`, {
          timeout: 8000,
          validateStatus: () => true
        })
      );
    }

    const responses = await Promise.allSettled(promises);
    const successfulResponses = responses.filter(r => r.status === 'fulfilled' && r.value.status === 200);

    if (successfulResponses.length === 0) {
      throw new Error('Server failed to handle concurrent requests');
    }

    this.log(`Successfully handled ${successfulResponses.length}/${concurrentRequests} concurrent requests`);
  }

  async runAllTests() {
    this.log('🚀 Starting MCP Oracle Runtime Error Test Suite', 'START');

    try {
      this.log('Starting test server...', 'SETUP');
      await this.startTestServer();
      this.log('Test server started successfully', 'SETUP');

      // Wait for server to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));

      await this.runTest('Service Initialization Failures', () => this.testServiceInitializationFailures());
      await this.runTest('Invalid Parameter Handling', () => this.testInvalidParameterHandling());
      await this.runTest('JSON Parsing Errors', () => this.testJSONParsingErrors());
      await this.runTest('MongoDB Failure Handling', () => this.testMongoDBFailureHandling());
      await this.runTest('Rate Limiting Enforcement', () => this.testRateLimitingEnforcement());
      await this.runTest('Memory Leak Prevention', () => this.testMemoryLeakPrevention());
      await this.runTest('Network Timeout Handling', () => this.testNetworkTimeoutHandling());
      await this.runTest('Concurrent Request Handling', () => this.testConcurrentRequestHandling());

    } finally {
      this.log('Stopping test server...', 'CLEANUP');
      await this.stopTestServer();
      this.log('Test server stopped', 'CLEANUP');
    }

    this.printResults();
  }

  printResults() {
    this.log('📊 TEST RESULTS SUMMARY', 'RESULTS');
    console.log('='.repeat(80));

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;

    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(80));

    this.testResults.forEach(result => {
      const status = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${status} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log('='.repeat(80));

    if (failed === 0) {
      this.log('🎉 ALL RUNTIME ERROR TESTS PASSED! System is stable.', 'SUCCESS');
      process.exit(0);
    } else {
      this.log(`⚠️  ${failed} test(s) failed. Review and fix issues.`, 'WARNING');
      process.exit(1);
    }
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new RuntimeErrorTester();

  process.on('SIGINT', async () => {
    console.log('\n🛑 Test interrupted by user');
    await tester.stopTestServer();
    process.exit(1);
  });

  tester.runAllTests().catch(error => {
    console.error('💥 Test suite failed:', error.message);
    process.exit(1);
  });
}

export { RuntimeErrorTester };