#!/usr/bin/env node

import { MCPOracleServer } from './server/mcp-server.js';
import type { ServerConfig } from './types/index.js';
import { config } from 'dotenv';

// Load environment variables
config();

// Default server configuration
const defaultConfig: ServerConfig = {
  protocols: {
    stdio: process.argv.includes('--stdio'),
    http: process.argv.includes('--http'),
    websocket: process.argv.includes('--ws'),
    sse: process.argv.includes('--sse')
  },
  ports: {
    http: parseInt(process.env.PORT || '4006'),
    websocket: parseInt(process.env.WS_PORT || '4007')
  },
  ai: {
    providers: {
      groq: {
        name: 'groq',
        model: 'mixtral-8x7b-32768',
        maxTokens: 1000,
        temperature: 0.3
      },
      anthropic: {
        name: 'anthropic',
        model: 'claude-3-haiku-20240307',
        maxTokens: 2000,
        temperature: 0.5
      },
      openai: {
        name: 'openai',
        model: 'gpt-4o',
        maxTokens: 4000,
        temperature: 0.7
      }
    }
  },
  data_sources: {
    cryptopanic: {
      name: 'CryptoPanic',
      endpoint: 'https://cryptopanic.com/api/v1/posts/',
      rateLimit: '1000/day',
      priority: 1,
      isActive: true
    },
    coingecko: {
      name: 'CoinGecko',
      endpoint: 'https://api.coingecko.com/api/v3/',
      rateLimit: '10-50/minute',
      priority: 1,
      isActive: true
    },
    reddit: {
      name: 'Reddit',
      endpoint: 'https://www.reddit.com/r/cryptocurrency/.json',
      rateLimit: '60/minute',
      priority: 1,
      isActive: true
    }
  },
  cache: {
    ttl: 300, // 5 minutes
    redis_url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  memory: {
    mongodb_url: process.env.MONGODB_URL || 'mongodb://localhost:27017/mcp_oracle',
    database_name: 'mcp_oracle'
  }
};

// Parse command line arguments
function parseArgs(): { config: ServerConfig; help: boolean } {
  const args = process.argv.slice(2);
  const config = { ...defaultConfig };
  let help = false;

  for (const arg of args) {
    switch (arg) {
      case '--stdio':
        config.protocols.stdio = true;
        break;
      case '--http':
        config.protocols.http = true;
        break;
      case '--ws':
      case '--websocket':
        config.protocols.websocket = true;
        break;
      case '--sse':
        config.protocols.sse = true;
        break;
      case '--all':
        config.protocols.stdio = true;
        config.protocols.http = true;
        config.protocols.websocket = true;
        config.protocols.sse = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      case '--port':
        const portIndex = args.indexOf(arg);
        const portValue = args[portIndex + 1];
        if (portValue && !isNaN(parseInt(portValue))) {
          config.ports.http = parseInt(portValue);
        }
        break;
    }
  }

  return { config, help };
}

function showHelp(): void {
  console.log(`
🚀 MCP Oracle - Advanced Financial Market Analysis Server

USAGE:
  mcp-oracle [OPTIONS]

OPTIONS:
  --stdio        Enable STDIO protocol (default for CLI)
  --http         Enable HTTP REST API (port ${defaultConfig.ports.http})
  --ws           Enable WebSocket server
  --sse          Enable Server-Sent Events
  --all          Enable all protocols
  --port <num>   Set HTTP port (default: ${defaultConfig.ports.http})
  --help, -h     Show this help message

EXAMPLES:
  mcp-oracle                    # Auto-detect protocol
  mcp-oracle --stdio            # STDIO only
  mcp-oracle --http --port 8080 # HTTP on port 8080
  mcp-oracle --all              # All protocols
  mcp-oracle --http --ws --sse  # Web protocols only

ENVIRONMENT VARIABLES:
  PORT                HTTP server port (default: 4006)
  WS_PORT             WebSocket server port (default: 4007)
  REDIS_URL           Redis connection URL
  MONGODB_URL         MongoDB connection URL
  GROQ_API_KEY        Groq API key for quick analysis
  ANTHROPIC_API_KEY   Anthropic API key for standard analysis
  OPENAI_API_KEY      OpenAI API key for deep analysis
  LOG_LEVEL           Logging level (debug, info, warn, error)

TOOLS:
  • getSmartMarketPulse     - Comprehensive market analysis with AI
  • analyzeFinancialNews    - News impact analysis
  • getMarketForecast      - AI-powered price predictions

For more information, visit: https://github.com/yourusername/mcp-oracle
`);
}

async function main(): Promise<void> {
  const { config, help } = parseArgs();

  if (help) {
    showHelp();
    return;
  }

  // Auto-detect protocol if none specified
  if (!Object.values(config.protocols).some(enabled => enabled)) {
    if (process.stdin.isTTY && !process.env.CI) {
      config.protocols.stdio = true;
    } else {
      config.protocols.http = true;
    }
  }

  try {
    const server = new MCPOracleServer(config);
    await server.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      process.exit(0);
    });

  } catch (error) {
    // Only log to stderr if not STDIO mode
    if (!config.protocols.stdio) {
      console.error('❌ Fatal error starting MCP Oracle Server:', error);
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});