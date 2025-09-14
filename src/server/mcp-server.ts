#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import winston from "winston";
import { config } from "dotenv";

import type {
  ServerConfig,
  MarketPulseParams,
  MarketPulseResponse,
  MCPToolResponse
} from "../types/index.js";

// Load environment variables
config();

export class MCPOracleServer {
  private server!: Server;
  private config: ServerConfig;
  private logger!: winston.Logger;
  private expressApp?: express.Application;
  private httpServer?: any;
  private wsServer?: WebSocketServer;

  constructor(config: ServerConfig) {
    this.config = config;
    this.setupLogger();
    this.createMCPServer();
    this.setupTools();
  }

  private setupLogger(): void {
    const transports: winston.transport[] = [
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' })
    ];

    // Only add console logging if not using STDIO (to avoid interfering with MCP protocol)
    if (!this.config.protocols.stdio && process.env.NODE_ENV !== 'production') {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'mcp-oracle' },
      transports
    });

    this.logger.info('🚀 MCP Oracle Server initializing...');
  }

  private createMCPServer(): void {
    this.server = new Server(
      {
        name: "mcp-oracle",
        version: "1.0.0",
        description: "Advanced financial market analysis with AI-powered insights"
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.logger.info('✅ Core MCP server instance created');
  }

  private setupTools(): void {
    // Register available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('📋 Listing available tools');

      return {
        tools: [
          {
            name: "getSmartMarketPulse",
            description: "Get comprehensive market analysis with AI insights for cryptocurrencies and stocks",
            inputSchema: {
              type: "object",
              properties: {
                assets: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of assets to analyze (e.g., ['BTC', 'ETH', 'NVDA'])",
                  default: ["BTC", "ETH"]
                },
                timeframe: {
                  type: "string",
                  enum: ["last_4_hours", "last_24_hours", "last_week"],
                  description: "Analysis timeframe",
                  default: "last_24_hours"
                },
                analysis_depth: {
                  type: "string",
                  enum: ["quick", "standard", "comprehensive"],
                  description: "Analysis depth: quick (Groq), standard (Claude), comprehensive (GPT-4)",
                  default: "standard"
                }
              },
              required: ["assets"]
            }
          },
          {
            name: "analyzeFinancialNews",
            description: "Analyze recent financial news and its market impact",
            inputSchema: {
              type: "object",
              properties: {
                symbols: {
                  type: "array",
                  items: { type: "string" },
                  description: "Symbols to get news for"
                },
                hours: {
                  type: "number",
                  description: "Hours of news to analyze",
                  default: 24
                }
              },
              required: ["symbols"]
            }
          },
          {
            name: "getMarketForecast",
            description: "Generate AI-powered market forecast based on historical patterns",
            inputSchema: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Asset symbol to forecast"
                },
                days: {
                  type: "number",
                  description: "Forecast horizon in days",
                  default: 7
                }
              },
              required: ["symbol"]
            }
          }
        ]
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info(`🔧 Executing tool: ${name}`, { args });

      try {
        let result: MCPToolResponse;

        switch (name) {
          case "getSmartMarketPulse":
            result = await this.handleGetSmartMarketPulse(args);
            break;

          case "analyzeFinancialNews":
            result = await this.handleAnalyzeFinancialNews(args);
            break;

          case "getMarketForecast":
            result = await this.handleGetMarketForecast(args);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: result.content,
          isError: result.isError
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        this.logger.error(`❌ Tool execution failed: ${name}`, { error: errorMessage, args });

        const errorResponse = this.createErrorResponse(errorMessage);
        return {
          content: errorResponse.content,
          isError: errorResponse.isError
        };
      }
    });

    this.logger.info('🛠️ MCP tools registered successfully');
  }

  private async handleGetSmartMarketPulse(args: any): Promise<MCPToolResponse> {
    // Validate input parameters
    const schema = z.object({
      assets: z.array(z.string()).default(['BTC', 'ETH']),
      timeframe: z.enum(['last_4_hours', 'last_24_hours', 'last_week']).default('last_24_hours'),
      analysis_depth: z.enum(['quick', 'standard', 'comprehensive']).default('standard')
    });

    const params = schema.parse(args) as MarketPulseParams;

    this.logger.info('💊 Generating Smart Market Pulse', { params });

    // For now, return a mock response - we'll implement the real logic in Phase 3
    const mockResponse: MarketPulseResponse = {
      timestamp: new Date().toISOString(),
      market_status: '🟢 Bullish',
      dominant_sentiment: 'Optimistic with strong buying pressure',
      confidence_score: 78,

      key_events: [
        {
          source: 'CryptoPanic',
          title: 'Bitcoin ETF inflows reach $500M this week',
          impact: 'high',
          sentiment: 0.8,
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        },
        {
          source: 'Reddit',
          title: 'r/cryptocurrency sentiment turning bullish',
          impact: 'medium',
          sentiment: 0.6,
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
        }
      ],

      technical_analysis: {
        trend: 'Upward momentum with strong volume',
        support_levels: [42000, 41500, 40800],
        resistance_levels: [45000, 46200, 47500],
        indicators: {
          rsi: 65,
          macd: 'Bullish crossover',
          bollinger_position: 'Upper band approach'
        }
      },

      ai_insights: {
        summary: `Market showing strong ${params.analysis_depth} analysis indicates bullish momentum across ${params.assets.join(', ')}. Key drivers include institutional inflows and positive sentiment shifts.`,
        factors: [
          'Institutional ETF inflows accelerating',
          'Technical indicators showing bullish alignment',
          'Social sentiment improving across platforms',
          'Reduced regulatory concerns'
        ],
        risk_assessment: 'Medium - Watch for potential profit-taking near resistance',
        opportunity_score: 82
      },

      action_signals: params.assets.reduce((signals, asset) => {
        signals[asset] = {
          signal: 'ACCUMULATE',
          confidence: 76,
          reasoning: `Strong fundamentals and technical setup for ${asset}`
        };
        return signals;
      }, {} as Record<string, any>)
    };

    const formattedResponse = this.formatMarketPulseResponse(mockResponse);

    return {
      content: [
        {
          type: "text",
          text: formattedResponse
        }
      ]
    };
  }

  private async handleAnalyzeFinancialNews(args: any): Promise<MCPToolResponse> {
    const schema = z.object({
      symbols: z.array(z.string()),
      hours: z.number().default(24)
    });

    const params = schema.parse(args);

    this.logger.info('📰 Analyzing financial news', { params });

    // Mock response for now
    const response = `# 📰 Financial News Analysis

**Symbols:** ${params.symbols.join(', ')}
**Timeframe:** Last ${params.hours} hours
**Analysis Time:** ${new Date().toISOString()}

## Key Headlines
- **High Impact:** Bitcoin ETF approvals drive institutional adoption
- **Medium Impact:** Fed hints at potential rate cuts in 2024
- **Low Impact:** Minor regulatory updates in EU crypto framework

## Sentiment Analysis
- **Overall Sentiment:** 🟢 Positive (+0.65)
- **News Volume:** High (142 articles)
- **Credibility Score:** 8.5/10

## Market Impact Assessment
${params.symbols.map(symbol => `
**${symbol}:**
- Expected Price Impact: +3-5%
- Sentiment: Bullish
- Confidence: 78%
`).join('')}

*Analysis powered by MCP Oracle AI Engine*`;

    return {
      content: [{ type: "text", text: response }]
    };
  }

  private async handleGetMarketForecast(args: any): Promise<MCPToolResponse> {
    const schema = z.object({
      symbol: z.string(),
      days: z.number().default(7)
    });

    const params = schema.parse(args);

    this.logger.info('🔮 Generating market forecast', { params });

    // Mock response for now
    const response = `# 🔮 Market Forecast: ${params.symbol}

**Forecast Horizon:** ${params.days} days
**Generated:** ${new Date().toISOString()}
**Confidence:** 72%

## Price Prediction
- **Current Price:** $43,247
- **7-day Target:** $46,500 (+7.5%)
- **Support Level:** $41,200
- **Resistance Level:** $48,000

## Key Factors
- ✅ Institutional buying momentum
- ✅ Technical breakout pattern
- ⚠️ Potential profit-taking near $47K
- ⚠️ Macro economic uncertainty

## Risk Assessment
**Risk Level:** Medium
**Volatility Expected:** 12-15%
**Recommendation:** HOLD with gradual accumulation

## Historical Pattern Match
Similar conditions in Q4 2023 resulted in +12% move over 7 days.

*Forecast generated by MCP Oracle AI using multi-model analysis*`;

    return {
      content: [{ type: "text", text: response }]
    };
  }

  private formatMarketPulseResponse(response: MarketPulseResponse): string {
    return `# 💊 Smart Market Pulse

**Status:** ${response.market_status}
**Confidence:** ${response.confidence_score}%
**Analysis Time:** ${new Date(response.timestamp).toLocaleString()}

## 🎯 Market Overview
${response.dominant_sentiment}

## 📊 Key Events
${response.key_events.map(event => `
**${event.source}** (${event.impact} impact)
${event.title}
*Sentiment: ${event.sentiment > 0 ? '🟢' : '🔴'} ${(event.sentiment * 100).toFixed(0)}%*
`).join('')}

## 📈 Technical Analysis
**Trend:** ${response.technical_analysis.trend}

**Support Levels:** ${response.technical_analysis.support_levels.map(level => `$${level.toLocaleString()}`).join(', ')}
**Resistance Levels:** ${response.technical_analysis.resistance_levels.map(level => `$${level.toLocaleString()}`).join(', ')}

**Indicators:**
${Object.entries(response.technical_analysis.indicators).map(([key, value]) => `- **${key.toUpperCase()}:** ${value}`).join('\n')}

## 🤖 AI Insights
${response.ai_insights.summary}

**Key Factors:**
${response.ai_insights.factors.map(factor => `- ${factor}`).join('\n')}

**Risk Assessment:** ${response.ai_insights.risk_assessment}
**Opportunity Score:** ${response.ai_insights.opportunity_score}/100

## 📡 Action Signals
${Object.entries(response.action_signals).map(([asset, signal]) => `
**${asset}:** ${signal.signal} (${signal.confidence}% confidence)
*${signal.reasoning}*
`).join('')}

---
*Analysis powered by MCP Oracle Multi-AI Engine*`;
  }

  private createErrorResponse(message: string): MCPToolResponse {
    return {
      content: [
        {
          type: "text",
          text: `❌ **Error**\n${message}`
        }
      ],
      isError: true
    };
  }

  // Protocol-specific startup methods
  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // Don't log to console in STDIO mode to avoid interfering with protocol
  }

  async startHttp(): Promise<void> {
    this.expressApp = express();
    this.httpServer = createServer(this.expressApp);

    // Middleware
    this.expressApp.use(helmet());
    this.expressApp.use(cors());
    this.expressApp.use(express.json({ limit: '10mb' }));

    // Health check
    this.expressApp.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // MCP tools endpoint
    this.expressApp.post('/api/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;

        // Manually execute the tool based on name
        let result: MCPToolResponse;

        switch (toolName) {
          case 'getSmartMarketPulse':
            result = await this.handleGetSmartMarketPulse(args);
            break;
          case 'analyzeFinancialNews':
            result = await this.handleAnalyzeFinancialNews(args);
            break;
          case 'getMarketForecast':
            result = await this.handleGetMarketForecast(args);
            break;
          default:
            res.status(404).json({ success: false, error: `Unknown tool: ${toolName}` });
            return;
        }

        res.json({ success: true, data: result });
      } catch (error) {
        this.logger.error('HTTP API error:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    });

    const port = this.config.ports.http;
    this.httpServer!.listen(port, () => {
      this.logger.info(`🌐 HTTP server running on port ${port}`);
    });
  }

  async startWebSocket(): Promise<void> {
    if (!this.httpServer) {
      await this.startHttp();
    }

    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/ws'
    });

    this.wsServer.on('connection', (ws) => {
      this.logger.info('🔌 New WebSocket connection established');

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          // Handle WebSocket messages
          this.logger.info('📨 WebSocket message received', { message });

          // Echo for now - will implement proper handling later
          ws.send(JSON.stringify({
            type: 'response',
            data: 'Message received',
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          this.logger.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        this.logger.info('🔌 WebSocket connection closed');
      });
    });

    this.logger.info(`🔌 WebSocket server running on port ${this.config.ports.http}/ws`);
  }

  async startSSE(): Promise<void> {
    if (!this.expressApp) {
      await this.startHttp();
    }

    this.expressApp!.get('/sse', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const clientId = Date.now();
      this.logger.info(`📡 SSE client connected: ${clientId}`);

      // Send initial connection message
      res.write(`data: ${JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString()
      })}\n\n`);

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        res.write(`data: ${JSON.stringify({
          type: 'ping',
          timestamp: new Date().toISOString()
        })}\n\n`);
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
        this.logger.info(`📡 SSE client disconnected: ${clientId}`);
      });
    });

    this.logger.info('📡 SSE endpoint available at /sse');
  }

  hasProtocol(): boolean {
    return Object.values(this.config.protocols).some(enabled => enabled);
  }

  enableAutoMode(): void {
    // Auto-detect best protocol based on environment
    if (process.stdin.isTTY) {
      this.config.protocols.stdio = true;
    } else {
      this.config.protocols.http = true;
    }
  }

  async start(): Promise<void> {
    this.logger.info('🚀 Starting MCP Oracle Server...');

    try {
      if (this.config.protocols.stdio) {
        await this.startStdio();
      }

      if (this.config.protocols.http) {
        await this.startHttp();
      }

      if (this.config.protocols.websocket) {
        await this.startWebSocket();
      }

      if (this.config.protocols.sse) {
        await this.startSSE();
      }

      this.logger.info('✅ MCP Oracle Server started successfully');

    } catch (error) {
      this.logger.error('❌ Failed to start MCP Oracle Server:', error);
      process.exit(1);
    }
  }
}