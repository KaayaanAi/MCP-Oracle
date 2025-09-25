#!/usr/bin/env node

// Third-party packages
import { config } from 'dotenv';

// Local imports
import { MCPOracleServer } from './server/mcp-server.js';
import type { ServerConfig } from './types/index.js';

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
    http: parseInt(process.env['PORT'] || '4006'),
    websocket: parseInt(process.env['WS_PORT'] || '4007')
  },
  ai: {
    providers: {
      groq: {
        name: 'groq',
        model: 'openai/gpt-oss-120b',
        maxTokens: 1000,
        temperature: 0.3
      },
      openai: {
        name: 'openai',
        model: 'gpt-4o-mini',
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
      isActive: true,
      timeout: 10000
    },
    coingecko: {
      name: 'CoinGecko',
      endpoint: 'https://api.coingecko.com/api/v3/',
      rateLimit: '10-50/minute',
      priority: 1,
      isActive: true,
      timeout: 10000
    },
    reddit: {
      name: 'Reddit',
      endpoint: 'https://www.reddit.com/r/cryptocurrency/.json',
      rateLimit: '60/minute',
      priority: 1,
      isActive: true,
      timeout: 10000
    }
  },
  cache: {
    ttl: 300, // 5 minutes
    redis_url: process.env['REDIS_URL'] || 'redis://:password@redis:6379'
  },
  memory: {
    mongodb_url: process.env['MONGODB_URL'] || 'mongodb://localhost:27017/mcp_oracle',
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
      case '--port': {
        const portIndex = args.indexOf(arg);
        const portValue = args[portIndex + 1];
        if (portValue && !isNaN(parseInt(portValue))) {
          config.ports.http = parseInt(portValue);
        }
        break;
      }
    }
  }

  return { config, help };
}

function showHelp(): void {
  // Using console.log here is appropriate for CLI help text
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
  OPENAI_API_KEY      OpenAI API key for standard and comprehensive analysis
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
    if (process.stdin.isTTY && !process.env['CI']) {
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
    // Only log to stderr if not STDIO mode to avoid interfering with MCP protocol
    if (!config.protocols.stdio) {
      process.stderr.write(`❌ Fatal error starting MCP Oracle Server: ${error}\n`);
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  process.stderr.write(`💥 Uncaught Exception: ${error}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  process.stderr.write(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}\n`);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  process.stderr.write(`💥 Failed to start server: ${error}\n`);
  process.exit(1);
});