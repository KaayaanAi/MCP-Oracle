#!/usr/bin/env node

/**
 * MCP Oracle Critical Endpoints Test Script
 * Tests all critical endpoints to ensure functionality after fixes
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:4006';
const ENDPOINTS = [
  {
    name: 'Health Check',
    path: '/health',
    method: 'GET'
  },
  {
    name: 'Smart Market Pulse',
    path: '/api/tools/getSmartMarketPulse',
    method: 'POST',
    data: {
      assets: ['BTC', 'ETH'],
      timeframe: 'last_24_hours',
      analysis_depth: 'standard'
    }
  },
  {
    name: 'Analyze Financial News',
    path: '/api/tools/analyzeFinancialNews',
    method: 'POST',
    data: {
      symbols: ['BTC', 'ETH'],
      hours: 24
    }
  },
  {
    name: 'Market Forecast',
    path: '/api/tools/getMarketForecast',
    method: 'POST',
    data: {
      symbol: 'BTC',
      days: 7
    }
  }
];

async function testEndpoint(endpoint) {
  console.log(`\n🧪 Testing: ${endpoint.name}`);
  console.log(`📍 ${endpoint.method} ${endpoint.path}`);

  try {
    const start = Date.now();
    const response = await axios({
      method: endpoint.method,
      url: `${BASE_URL}${endpoint.path}`,
      data: endpoint.data,
      timeout: 30000
    });

    const duration = Date.now() - start;

    if (response.status === 200) {
      console.log(`✅ Success (${duration}ms)`);

      // Check for specific issues in response
      const responseText = JSON.stringify(response.data);

      if (responseText.includes('[object Object]')) {
        console.log('⚠️  Warning: Found [object Object] in response');
      }

      if (responseText.includes('INSUFFICIENT_DATA')) {
        console.log('⚠️  Warning: Found INSUFFICIENT_DATA errors');
      }

      if (responseText.includes('undefined')) {
        console.log('⚠️  Warning: Found undefined values in response');
      }

      if (response.data.success === false) {
        console.log('⚠️  Warning: API returned success: false');
        console.log(`   Error: ${response.data.error}`);
      }

      // Log sample of response for manual verification
      console.log(`📄 Sample response: ${responseText.substring(0, 200)}...`);

    } else {
      console.log(`❌ Failed with status: ${response.status}`);
    }

    return { success: true, duration, status: response.status };

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 MCP Oracle Critical Endpoints Test');
  console.log('=====================================');
  console.log(`Testing server at: ${BASE_URL}`);

  const results = [];

  for (const endpoint of ENDPOINTS) {
    const result = await testEndpoint(endpoint);
    results.push({
      name: endpoint.name,
      ...result
    });

    // Wait a bit between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n📊 Test Summary');
  console.log('================');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${(successful / results.length * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`   - ${result.name}: ${result.error}`);
    });
  }

  console.log('\n🎯 Key Issues to Check:');
  console.log('- No [object Object] in responses');
  console.log('- No INSUFFICIENT_DATA errors');
  console.log('- All endpoints return properly formatted data');
  console.log('- Database connections working (Redis/MongoDB)');
  console.log('- AI analysis functioning with 2-model system');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});