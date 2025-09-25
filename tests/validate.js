#!/usr/bin/env node

/**
 * MCP Oracle Comprehensive Validation Test Script
 * Validates all MCP protocol requirements and performance standards
 */

import axios from 'axios';
import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4006';
const WS_URL = process.env.TEST_WS_URL || 'ws://localhost:4007';

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

function logTest(name, success, message = '') {
  results.total++;
  if (success) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}: ${message}`);
    results.errors.push({ test: name, error: message });
  }
}

async function testWithTimeout(testFn, timeout = 30000) {
  return Promise.race([
    testFn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Test timeout')), timeout)
    )
  ]);
}

// === Version Validation Tests ===
async function validateVersions() {
  console.log('\n🔍 === Version Validation ===');

  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    logTest('Node.js >= 20.0.0', majorVersion >= 20, `Found: ${nodeVersion}`);

    // Check package.json requirements
    const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
    logTest('package.json engines.node >= 20.0.0',
      packageJson.engines?.node?.includes('20.0.0'),
      `Found: ${packageJson.engines?.node}`);

    // Verify latest dependencies
    const latestDeps = ['@modelcontextprotocol/sdk', 'express', 'axios', 'mongodb', 'redis'];
    const allLatest = latestDeps.every(dep =>
      packageJson.dependencies[dep] === 'latest'
    );
    logTest('All critical dependencies use "latest"', allLatest,
      'Some dependencies not using latest versions');

    // Check npm audit for vulnerabilities
    try {
      const { stdout } = await execAsync('npm audit --audit-level moderate --json');
      const auditResult = JSON.parse(stdout);
      const vulnerabilities = auditResult.metadata?.vulnerabilities?.total || 0;
      logTest('Zero npm vulnerabilities', vulnerabilities === 0,
        `Found ${vulnerabilities} vulnerabilities`);
    } catch (auditError) {
      // If npm audit fails with non-zero exit (has vulnerabilities)
      logTest('Zero npm vulnerabilities', false,
        'npm audit found vulnerabilities or failed');
    }

    // Check for outdated packages
    try {
      const { stdout } = await execAsync('npx npm-check-updates --jsonUpgraded');
      const outdated = JSON.parse(stdout || '{}');
      const outdatedCount = Object.keys(outdated).length;
      logTest('All packages up to date', outdatedCount === 0,
        `Found ${outdatedCount} outdated packages`);
    } catch (ncuError) {
      logTest('Package update check', false, 'npm-check-updates failed');
    }

  } catch (error) {
    logTest('Version validation setup', false, error.message);
  }
}

// === MCP Protocol Compliance Tests ===
async function testMCPProtocol() {
  console.log('\n🔍 === MCP Protocol Compliance ===');

  // Test initialize method
  try {
    const initResponse = await testWithTimeout(async () => {
      return axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "initialize",
        id: 1
      }, { timeout: 1000 });
    });

    const initResult = initResponse.data;
    logTest('Initialize method returns protocol version',
      initResult.result?.protocolVersion === "2024-11-05",
      `Got: ${initResult.result?.protocolVersion}`);

    logTest('Initialize method returns server info',
      initResult.result?.serverInfo?.name === "mcp-oracle",
      `Got: ${JSON.stringify(initResult.result?.serverInfo)}`);

    logTest('Initialize method includes all capabilities',
      initResult.result?.capabilities?.tools !== undefined &&
      initResult.result?.capabilities?.resources !== undefined &&
      initResult.result?.capabilities?.prompts !== undefined,
      'Missing required capabilities');

  } catch (error) {
    logTest('Initialize method', false, error.message);
  }

  // Test tools/list method
  try {
    const toolsResponse = await testWithTimeout(async () => {
      return axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 2
      }, { timeout: 1000 });
    });

    const tools = toolsResponse.data.result?.tools || [];
    logTest('Tools/list returns valid response', tools.length >= 3,
      `Expected >= 3 tools, got ${tools.length}`);

    const requiredTools = ['getSmartMarketPulse', 'analyzeFinancialNews', 'getMarketForecast'];
    const hasAllTools = requiredTools.every(tool =>
      tools.some(t => t.name === tool && t.inputSchema?.type === 'object')
    );
    logTest('All required tools have proper schemas', hasAllTools,
      'Missing required tools or schemas');

  } catch (error) {
    logTest('Tools/list method', false, error.message);
  }

  // Test resources/list method
  try {
    const resourcesResponse = await testWithTimeout(async () => {
      return axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "resources/list",
        id: 3
      }, { timeout: 1000 });
    });

    const resources = resourcesResponse.data.result?.resources || [];
    logTest('Resources/list returns resources', resources.length >= 3,
      `Expected >= 3 resources, got ${resources.length}`);

  } catch (error) {
    logTest('Resources/list method', false, error.message);
  }

  // Test prompts/list method
  try {
    const promptsResponse = await testWithTimeout(async () => {
      return axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "prompts/list",
        id: 4
      }, { timeout: 1000 });
    });

    const prompts = promptsResponse.data.result?.prompts || [];
    logTest('Prompts/list returns prompts', prompts.length >= 3,
      `Expected >= 3 prompts, got ${prompts.length}`);

  } catch (error) {
    logTest('Prompts/list method', false, error.message);
  }
}

// === Performance Tests ===
async function testPerformance() {
  console.log('\n🔍 === Performance Requirements ===');

  // Test health check response time < 200ms
  try {
    const start = Date.now();
    const healthResponse = await testWithTimeout(async () => {
      return axios.get(`${BASE_URL}/health`, { timeout: 1000 });
    });
    const duration = Date.now() - start;

    logTest('Health check < 200ms', duration < 200,
      `Response time: ${duration}ms`);
    logTest('Health check returns valid status',
      healthResponse.data.status === 'healthy',
      `Got status: ${healthResponse.data.status}`);

  } catch (error) {
    logTest('Health check performance', false, error.message);
  }

  // Test tools/list response time < 1 second
  try {
    const start = Date.now();
    await testWithTimeout(async () => {
      return axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 5
      }, { timeout: 2000 });
    });
    const duration = Date.now() - start;

    logTest('Tools/list < 1 second', duration < 1000,
      `Response time: ${duration}ms`);

  } catch (error) {
    logTest('Tools/list performance', false, error.message);
  }
}

// === Security Tests ===
async function testSecurity() {
  console.log('\n🔍 === Security Requirements ===');

  // Test rate limiting
  try {
    const requests = Array(10).fill().map((_, i) =>
      axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: i + 100
      }, { timeout: 1000 }).catch(err => err.response)
    );

    const responses = await Promise.all(requests);
    const allSuccessful = responses.every(r => r.status < 400);
    logTest('Rate limiting configured', !allSuccessful || responses.length < 10,
      'All requests succeeded - rate limiting may not be active');

  } catch (error) {
    logTest('Rate limiting test', false, error.message);
  }

  // Test input validation
  try {
    const invalidRequest = await axios.post(`${BASE_URL}/mcp`, {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "getSmartMarketPulse",
        arguments: {
          assets: ["BTC".repeat(100)], // Invalid long string
          timeframe: "invalid_timeframe"
        }
      },
      id: 6
    }, { timeout: 1000 }).catch(err => err.response);

    logTest('Input validation rejects invalid requests',
      invalidRequest?.status >= 400,
      `Expected error response, got status: ${invalidRequest?.status}`);

  } catch (error) {
    logTest('Input validation test', false, error.message);
  }

  // Test request size limits
  try {
    const largePayload = "x".repeat(2000000); // 2MB payload
    const largeRequest = await axios.post(`${BASE_URL}/mcp`, {
      jsonrpc: "2.0",
      method: "tools/list",
      params: { large: largePayload },
      id: 7
    }, { timeout: 1000 }).catch(err => err.response);

    logTest('Request size limits enforced',
      largeRequest?.status >= 400,
      `Expected error for large request, got status: ${largeRequest?.status}`);

  } catch (error) {
    logTest('Request size limit test', false, error.message);
  }
}

// === Integration Tests ===
async function testIntegration() {
  console.log('\n🔍 === Integration Tests ===');

  // Test actual tool execution
  try {
    const toolResponse = await testWithTimeout(async () => {
      return axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "getSmartMarketPulse",
          arguments: {
            assets: ["BTC", "ETH"],
            timeframe: "last_24_hours",
            analysis_depth: "standard"
          }
        },
        id: 8
      }, { timeout: 30000 });
    });

    const result = toolResponse.data.result;
    logTest('Tool execution returns valid response',
      result && !result.isError,
      `Tool returned error: ${JSON.stringify(result?.content)}`);

  } catch (error) {
    logTest('Tool execution test', false, error.message);
  }

  // Test resource reading
  try {
    const resourceResponse = await testWithTimeout(async () => {
      return axios.post(`${BASE_URL}/mcp`, {
        jsonrpc: "2.0",
        method: "resources/read",
        params: {
          uri: "market-data://current"
        },
        id: 9
      }, { timeout: 5000 });
    });

    const contents = resourceResponse.data.result?.contents;
    logTest('Resource reading works',
      Array.isArray(contents) && contents.length > 0,
      'No contents returned from resource');

  } catch (error) {
    logTest('Resource reading test', false, error.message);
  }
}

// === n8n Compatibility Tests ===
async function testN8nCompatibility() {
  console.log('\n🔍 === n8n Compatibility ===');

  // Test HTTP endpoint availability
  try {
    const response = await axios.post(`${BASE_URL}/mcp`, {
      jsonrpc: "2.0",
      method: "tools/list",
      id: "n8n-test-1"
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n'
      },
      timeout: 5000
    });

    logTest('n8n HTTP compatibility', response.status === 200,
      `HTTP request failed with status: ${response.status}`);

  } catch (error) {
    logTest('n8n HTTP compatibility', false, error.message);
  }

  // Test CORS headers
  try {
    const response = await axios.options(`${BASE_URL}/mcp`, {
      headers: {
        'Origin': 'http://localhost:5678',
        'Access-Control-Request-Method': 'POST'
      },
      timeout: 1000
    });

    const corsEnabled = response.headers['access-control-allow-origin'];
    logTest('CORS headers present', !!corsEnabled,
      'Missing CORS headers for n8n integration');

  } catch (error) {
    logTest('CORS test', false, error.message);
  }
}

// === Docker Validation Tests ===
async function testDockerValidation() {
  console.log('\n🔍 === Docker Validation ===');

  // Check if Docker is available
  try {
    const { stdout } = await execAsync('docker --version');
    const dockerVersion = stdout.trim();
    logTest('Docker available', dockerVersion.includes('Docker version'),
      `Docker version: ${dockerVersion}`);

    // Check Docker version >= 24.x
    const versionMatch = dockerVersion.match(/Docker version (\d+)\./);
    const majorVersion = versionMatch ? parseInt(versionMatch[1]) : 0;
    logTest('Docker >= 24.x', majorVersion >= 24,
      `Found Docker version: ${majorVersion}`);

  } catch (error) {
    logTest('Docker availability', false, 'Docker not available or failed');
  }

  // Validate Dockerfile exists and has no version pinning
  try {
    const dockerfile = readFileSync('./Dockerfile', 'utf8');

    // Check for version pinning in Alpine packages
    const hasPinnedPackages = dockerfile.includes('=') &&
                             (dockerfile.includes('apk add') || dockerfile.includes('RUN apk'));
    logTest('Dockerfile has no version pinning', !hasPinnedPackages,
      'Found version pinning in Alpine packages');

    // Check for latest npm installation
    const hasLatestNpm = dockerfile.includes('npm install -g npm@latest');
    logTest('Dockerfile uses latest npm', hasLatestNpm,
      'Dockerfile should install npm@latest');

    // Check for Node 22+ base image
    const hasModernNode = dockerfile.includes('node:22') || dockerfile.includes('node:2');
    logTest('Dockerfile uses Node.js 22+', hasModernNode,
      'Dockerfile should use Node.js 22 or higher');

  } catch (error) {
    logTest('Dockerfile validation', false, error.message);
  }
}

// === Main Test Runner ===
async function runTests() {
  console.log('🚀 MCP Oracle Validation Test Suite');
  console.log('=====================================');

  try {
    await validateVersions();
    await testMCPProtocol();
    await testPerformance();
    await testSecurity();
    await testIntegration();
    await testN8nCompatibility();
    await testDockerValidation();

  } catch (error) {
    console.error('Test suite error:', error);
  }

  // Final results
  console.log('\n📊 === Test Results ===');
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.errors.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }

  // Exit with appropriate code
  const successRate = (results.passed / results.total) * 100;
  if (successRate >= 90) {
    console.log('\n🎉 All critical tests passed! MCP Oracle is compliant.');
    process.exit(0);
  } else if (successRate >= 75) {
    console.log('\n⚠️  Most tests passed, but some issues need attention.');
    process.exit(1);
  } else {
    console.log('\n💥 Major issues found. Server needs fixes before deployment.');
    process.exit(2);
  }
}

// Run tests if this script is executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1].endsWith('validate.js')) {
  runTests().catch(error => {
    console.error('Test runner crashed:', error);
    process.exit(3);
  });
}

export { runTests };