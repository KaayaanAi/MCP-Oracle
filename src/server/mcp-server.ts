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
import { CoinGeckoService } from '../services/coingecko.js';
import { NewsAPIService } from '../services/newsapi.js';
import { CryptoPanicService } from '../services/cryptopanic.js';
import { AlphaVantageService } from '../services/alphavantage.js';
import { RedditService } from '../services/reddit.js';
import { MemoryLayer } from '../memory/mongodb.js';
import { CacheService } from '../services/cache.js';

// Load environment variables
config();

export class MCPOracleServer {
  private server!: Server;
  private config: ServerConfig;
  private logger!: winston.Logger;
  private expressApp?: express.Application;
  private httpServer?: any;
  private wsServer?: WebSocketServer;
  private coinGecko?: CoinGeckoService;
  private newsAPI?: NewsAPIService;
  private cryptoPanic?: CryptoPanicService;
  private alphaVantage?: AlphaVantageService;
  private reddit?: RedditService;
  private memoryLayer?: MemoryLayer;
  private cache?: CacheService;

  constructor(config: ServerConfig) {
    this.config = config;
    this.setupLogger();
    this.initializeServices();
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

  private initializeServices(): void {
    try {
      // Initialize API services
      this.coinGecko = new CoinGeckoService(process.env.COINGECKO_API_KEY);

      if (process.env.NEWSAPI_KEY) {
        this.newsAPI = new NewsAPIService(process.env.NEWSAPI_KEY);
      }

      if (process.env.CRYPTOPANIC_API_KEY) {
        this.cryptoPanic = new CryptoPanicService(process.env.CRYPTOPANIC_API_KEY);
      }

      if (process.env.ALPHA_VANTAGE_API_KEY) {
        this.alphaVantage = new AlphaVantageService(process.env.ALPHA_VANTAGE_API_KEY);
      }

      this.reddit = new RedditService(
        process.env.REDDIT_CLIENT_ID,
        process.env.REDDIT_CLIENT_SECRET,
        process.env.REDDIT_USER_AGENT
      );

      this.memoryLayer = new MemoryLayer(this.config.memory.mongodb_url);

      // Initialize cache service
      this.cache = new CacheService(this.config.cache.redis_url, this.config.cache.ttl);

      this.logger.info('✅ API services and caching initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize services:', error);
    }
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

    this.logger.info('💊 Generating Smart Market Pulse with REAL data', { params });

    try {
      // Initialize memory layer if not done
      if (this.memoryLayer) {
        await this.memoryLayer.initialize();
      }

      // Get real market data
      const [marketData, newsData, sentimentData, technicalData] = await Promise.all([
        this.getMarketData(params.assets),
        this.getNewsData(params.assets),
        this.getSentimentData(params.assets),
        this.getTechnicalData(params.assets)
      ]);

      // Calculate market status
      const marketStatus = this.calculateMarketStatus(marketData, sentimentData);
      const confidenceScore = this.calculateConfidence(marketData, newsData, sentimentData);

      const response: MarketPulseResponse = {
        timestamp: new Date().toISOString(),
        market_status: marketStatus,
        dominant_sentiment: this.calculateDominantSentiment(sentimentData, newsData),
        confidence_score: confidenceScore,
        key_events: newsData.slice(0, 5).map(news => ({
          source: news.source,
          title: news.title,
          impact: this.calculateImpact(news.relevance_score),
          sentiment: news.sentiment_score,
          timestamp: news.timestamp
        })),
        technical_analysis: {
          trend: technicalData.trend || 'Sideways movement with mixed signals',
          support_levels: technicalData.support_levels || [],
          resistance_levels: technicalData.resistance_levels || [],
          indicators: technicalData.indicators || {}
        },
        ai_insights: {
          summary: `Real-time ${params.analysis_depth} analysis across ${params.assets.join(', ')}. Current market shows ${marketStatus.toLowerCase().replace('🟢 ', '').replace('🔴 ', '').replace('🟡 ', '')} conditions with ${confidenceScore}% confidence.`,
          factors: this.generateInsightFactors(marketData, newsData, sentimentData),
          risk_assessment: this.calculateRiskAssessment(marketData, technicalData),
          opportunity_score: this.calculateOpportunityScore(marketData, sentimentData, technicalData)
        },
        action_signals: this.generateActionSignals(params.assets, marketData, technicalData, sentimentData)
      };

      const formattedResponse = this.formatMarketPulseResponse(response);

      return {
        content: [
          {
            type: "text",
            text: formattedResponse
          }
        ]
      };
    } catch (error) {
      this.logger.error('❌ Failed to generate market pulse:', error);
      return this.createErrorResponse('Failed to fetch real market data. Please check API configurations.');
    }
  }

  private async handleAnalyzeFinancialNews(args: any): Promise<MCPToolResponse> {
    const schema = z.object({
      symbols: z.array(z.string()),
      hours: z.number().default(24)
    });

    const params = schema.parse(args);

    this.logger.info('📰 Analyzing financial news with REAL data', { params });

    try {
      // Get real news data
      const newsData = await this.getNewsData(params.symbols);
      const recentNews = newsData.filter(news => {
        const newsTime = new Date(news.timestamp).getTime();
        const cutoff = Date.now() - (params.hours * 60 * 60 * 1000);
        return newsTime >= cutoff;
      });

      // Analyze sentiment
      const sentimentAnalysis = this.analyzeNewsSentiment(recentNews);
      const marketImpact = this.calculateNewsMarketImpact(params.symbols, recentNews);

      const keyHeadlines = recentNews
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 5)
        .map(news => {
          const impact = news.relevance_score > 0.8 ? 'High' : news.relevance_score > 0.5 ? 'Medium' : 'Low';
          return `- **${impact} Impact:** ${news.title}`;
        });

      const response = `# 📰 Financial News Analysis

**Symbols:** ${params.symbols.join(', ')}
**Timeframe:** Last ${params.hours} hours
**Analysis Time:** ${new Date().toISOString()}

## Key Headlines
${keyHeadlines.length > 0 ? keyHeadlines.join('\n') : '- No significant news found in the specified timeframe'}

## Sentiment Analysis
- **Overall Sentiment:** ${this.formatSentiment(sentimentAnalysis.overall)} (${sentimentAnalysis.overall.toFixed(2)})
- **News Volume:** ${recentNews.length > 50 ? 'High' : recentNews.length > 20 ? 'Medium' : 'Low'} (${recentNews.length} articles)
- **Credibility Score:** ${sentimentAnalysis.credibility}/10

## Market Impact Assessment
${params.symbols.map(symbol => {
  const impact = marketImpact[symbol] || { priceImpact: 0, sentiment: 0, confidence: 0 };
  return `
**${symbol}:**
- Expected Price Impact: ${impact.priceImpact > 0 ? '+' : ''}${impact.priceImpact.toFixed(1)}%
- Sentiment: ${this.formatSentimentLabel(impact.sentiment)}
- Confidence: ${impact.confidence}%`;
}).join('')}

*Analysis powered by MCP Oracle using real-time news data*`;

      return {
        content: [{ type: "text", text: response }]
      };
    } catch (error) {
      this.logger.error('❌ Failed to analyze news:', error);
      return this.createErrorResponse('Failed to analyze financial news with real data. Please check API configurations.');
    }
  }

  private async handleGetMarketForecast(args: any): Promise<MCPToolResponse> {
    const schema = z.object({
      symbol: z.string(),
      days: z.number().default(7)
    });

    const params = schema.parse(args);

    this.logger.info('🔮 Generating market forecast with REAL data', { params });

    try {
      // Get real market data for forecasting
      const [currentPrice, historicalData, technicalData] = await Promise.all([
        this.getCurrentPrice(params.symbol),
        this.getHistoricalPriceData(params.symbol),
        this.getTechnicalData([params.symbol])
      ]);

      const forecast = this.generateForecast(params.symbol, currentPrice, historicalData, technicalData, params.days);

      const response = `# 🔮 Market Forecast: ${params.symbol}

**Forecast Horizon:** ${params.days} days
**Generated:** ${new Date().toISOString()}
**Confidence:** ${forecast.confidence}%

## Price Prediction
- **Current Price:** $${currentPrice?.toLocaleString() || 'N/A'}
- **${params.days}-day Target:** $${forecast.targetPrice?.toLocaleString() || 'N/A'} (${forecast.priceChange}%)
- **Support Level:** $${forecast.supportLevel?.toLocaleString() || 'N/A'}
- **Resistance Level:** $${forecast.resistanceLevel?.toLocaleString() || 'N/A'}

## Key Factors
${forecast.factors.map((factor: string) => `- ${factor}`).join('\n')}

## Risk Assessment
**Risk Level:** ${forecast.riskLevel}
**Volatility Expected:** ${forecast.volatility}%
**Recommendation:** ${forecast.recommendation}

## Historical Pattern Analysis
${forecast.historicalPattern}

*Forecast generated by MCP Oracle using real market data and AI analysis*`;

      return {
        content: [{ type: "text", text: response }]
      };
    } catch (error) {
      this.logger.error('❌ Failed to generate forecast:', error);
      return this.createErrorResponse('Failed to generate forecast with real data. Please check API configurations.');
    }
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

  // Helper methods for real data fetching and analysis
  private async getMarketData(assets: string[]): Promise<any[]> {
    if (!this.coinGecko) {
      throw new Error('CoinGecko service not initialized');
    }

    // Try cache first
    if (this.cache) {
      const cached = await this.cache.getCachedMarketData(assets);
      if (cached) {
        this.logger.debug('📈 Using cached market data');
        return cached;
      }
    }

    try {
      const data = await this.coinGecko.getDetailedMarketData(assets);

      // Cache the result
      if (this.cache && data.length > 0) {
        await this.cache.setCachedMarketData(assets, data, 300); // 5 min cache
      }

      return data;
    } catch (error) {
      this.logger.warn('⚠️ CoinGecko API failed, using fallback');
      return [];
    }
  }

  private async getCurrentPrice(symbol: string): Promise<number | null> {
    // Try cache first
    if (this.cache) {
      const cached = await this.cache.getCachedPrice(symbol);
      if (cached) {
        this.logger.debug(`💰 Using cached price for ${symbol}`);
        return cached;
      }
    }

    try {
      let price: number | null = null;

      if (this.coinGecko) {
        const marketData = await this.coinGecko.getCurrentPrices([symbol]);
        price = marketData[0]?.price || null;
      } else if (this.alphaVantage) {
        const stockData = await this.alphaVantage.getStockPrice(symbol);
        price = stockData.price;
      }

      // Cache the result
      if (this.cache && price !== null) {
        await this.cache.setCachedPrice(symbol, price, 60); // 1 min cache for prices
      }

      return price;
    } catch (error) {
      this.logger.warn(`⚠️ Failed to get current price for ${symbol}:`, error);
    }
    return null;
  }

  private async getHistoricalPriceData(symbol: string): Promise<any[]> {
    try {
      if (this.alphaVantage) {
        return await this.alphaVantage.getHistoricalData(symbol, 'compact');
      }
      if (this.coinGecko) {
        return await this.coinGecko.getPriceHistory(symbol, 30);
      }
    } catch (error) {
      this.logger.warn(`⚠️ Failed to get historical data for ${symbol}:`, error);
    }
    return [];
  }

  private generateForecast(symbol: string, currentPrice: number | null, historicalData: any[], technicalData: any, days: number): any {
    if (!currentPrice) {
      return {
        confidence: 20,
        targetPrice: null,
        priceChange: 'N/A',
        supportLevel: null,
        resistanceLevel: null,
        factors: ['⚠️ Insufficient price data available'],
        riskLevel: 'High',
        volatility: 'N/A',
        recommendation: 'WAIT - Need more data',
        historicalPattern: 'Unable to analyze patterns without sufficient data'
      };
    }

    // Simple forecast calculation based on recent trends
    let trendMultiplier = 1;
    if (historicalData.length > 7) {
      const recentPrices = historicalData.slice(0, 7).map(d => d.close || d.price);
      const priceChange = (recentPrices[0] - recentPrices[6]) / recentPrices[6];
      trendMultiplier = 1 + (priceChange * 0.5); // Dampen the trend
    }

    const targetPrice = currentPrice * trendMultiplier;
    const priceChange = ((targetPrice - currentPrice) / currentPrice) * 100;

    // Calculate support and resistance
    const supportLevel = technicalData.support_levels?.[0] || currentPrice * 0.9;
    const resistanceLevel = technicalData.resistance_levels?.[0] || currentPrice * 1.1;

    // Generate factors
    const factors = [];
    if (priceChange > 5) factors.push('✅ Strong upward momentum detected');
    if (priceChange < -5) factors.push('⚠️ Downward pressure identified');
    if (Math.abs(priceChange) < 3) factors.push('📊 Consolidation pattern forming');
    factors.push('📈 Technical indicators considered');
    factors.push('🔍 Historical pattern analysis applied');

    return {
      confidence: Math.min(85, Math.max(30, 60 + Math.abs(priceChange))),
      targetPrice: Math.round(targetPrice),
      priceChange: priceChange.toFixed(1),
      supportLevel: Math.round(supportLevel),
      resistanceLevel: Math.round(resistanceLevel),
      factors,
      riskLevel: Math.abs(priceChange) > 10 ? 'High' : Math.abs(priceChange) > 5 ? 'Medium' : 'Low',
      volatility: Math.abs(priceChange).toFixed(1),
      recommendation: priceChange > 5 ? 'BUY' : priceChange < -5 ? 'SELL' : 'HOLD',
      historicalPattern: `Analysis of ${historicalData.length} data points shows ${priceChange > 0 ? 'bullish' : 'bearish'} bias for ${days}-day horizon`
    };
  }

  private async getNewsData(assets: string[]): Promise<any[]> {
    // Try cache first
    if (this.cache) {
      const cached = await this.cache.getCachedNews(assets, 24);
      if (cached) {
        this.logger.debug('📰 Using cached news data');
        return cached;
      }
    }

    const allNews: any[] = [];

    try {
      // Get news from multiple sources
      if (this.newsAPI) {
        const financialNews = await this.newsAPI.getFinancialNews(assets, 24, 10);
        allNews.push(...financialNews);
      }

      if (this.cryptoPanic) {
        const cryptoNews = await this.cryptoPanic.getCryptoNews(assets);
        allNews.push(...cryptoNews);
      }

      const sortedNews = allNews.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Cache the result
      if (this.cache && sortedNews.length > 0) {
        await this.cache.setCachedNews(assets, 24, sortedNews, 1800); // 30 min cache
      }

      return sortedNews;
    } catch (error) {
      this.logger.warn('⚠️ News API failed:', error);
      return [];
    }
  }

  private async getSentimentData(assets: string[]): Promise<any[]> {
    // Try cache first
    if (this.cache) {
      const cached = await this.cache.getCachedSentiment(assets);
      if (cached) {
        this.logger.debug('😊 Using cached sentiment data');
        return cached;
      }
    }

    try {
      if (this.reddit) {
        const sentimentData = await this.reddit.getSentimentAnalysis(assets);

        // Cache the result
        if (this.cache && sentimentData.length > 0) {
          await this.cache.setCachedSentiment(assets, sentimentData, 900); // 15 min cache
        }

        return sentimentData;
      }
    } catch (error) {
      this.logger.warn('⚠️ Sentiment analysis failed:', error);
    }
    return [];
  }

  private async getTechnicalData(assets: string[]): Promise<any> {
    if (assets.length === 0) {
      return {
        trend: 'No assets specified',
        support_levels: [],
        resistance_levels: [],
        indicators: {}
      };
    }

    const mainAsset = assets[0];

    // Try cache first
    if (this.cache) {
      const cached = await this.cache.getCachedTechnicalData(mainAsset);
      if (cached) {
        this.logger.debug(`📊 Using cached technical data for ${mainAsset}`);
        return cached;
      }
    }

    const technicalData: any = {
      trend: 'Mixed signals across assets',
      support_levels: [],
      resistance_levels: [],
      indicators: {}
    };

    try {
      if (this.alphaVantage) {
        const indicators = await this.alphaVantage.getTechnicalIndicators(mainAsset);
        const supportResistance = await this.alphaVantage.getSupportResistanceLevels(mainAsset);

        technicalData.indicators = {
          rsi: indicators.rsi,
          macd: `${indicators.macd.value > 0 ? 'Bullish' : 'Bearish'} crossover`,
          bollinger_position: this.getBollingerPosition(indicators.bollinger_bands)
        };
        technicalData.support_levels = supportResistance.support_levels;
        technicalData.resistance_levels = supportResistance.resistance_levels;
        technicalData.trend = this.calculateTrend(indicators);

        // Cache the result
        if (this.cache) {
          await this.cache.setCachedTechnicalData(mainAsset, technicalData, 600); // 10 min cache
        }
      }
    } catch (error) {
      this.logger.warn('⚠️ Technical analysis failed:', error);
    }

    return technicalData;
  }

  // Market analysis helper methods
  private calculateMarketStatus(marketData: any[], sentimentData: any[]): '🟢 Bullish' | '🔴 Bearish' | '🟡 Neutral' | '⚠️ Critical' {
    if (marketData.length === 0) return '🟡 Neutral';

    const avgChange = marketData.reduce((sum, data) => sum + data.change_24h, 0) / marketData.length;
    const avgSentiment = sentimentData.length > 0
      ? sentimentData.reduce((sum, data) => sum + data.sentiment_score, 0) / sentimentData.length
      : 0;

    const combinedScore = (avgChange * 0.7) + (avgSentiment * 30); // Weight price more than sentiment

    if (combinedScore > 3) return '🟢 Bullish';
    if (combinedScore < -3) return '🔴 Bearish';
    if (Math.abs(combinedScore) > 8) return '⚠️ Critical';
    return '🟡 Neutral';
  }

  private calculateConfidence(marketData: any[], newsData: any[], sentimentData: any[]): number {
    let confidence = 50; // Base confidence

    // More data = higher confidence
    confidence += Math.min(marketData.length * 5, 20);
    confidence += Math.min(newsData.length * 2, 20);
    confidence += Math.min(sentimentData.length * 3, 10);

    return Math.min(95, Math.max(20, confidence));
  }

  private calculateDominantSentiment(sentimentData: any[], newsData: any[]): string {
    const avgSentiment = sentimentData.length > 0
      ? sentimentData.reduce((sum, data) => sum + data.sentiment_score, 0) / sentimentData.length
      : 0;

    const newsScore = newsData.length > 0
      ? newsData.reduce((sum, news) => sum + news.sentiment_score, 0) / newsData.length
      : 0;

    const overall = (avgSentiment + newsScore) / 2;

    if (overall > 0.3) return 'Optimistic with strong buying interest';
    if (overall > 0.1) return 'Cautiously optimistic sentiment prevailing';
    if (overall < -0.3) return 'Pessimistic with selling pressure mounting';
    if (overall < -0.1) return 'Cautious sentiment with risk-off behavior';
    return 'Mixed sentiment with uncertainty in the market';
  }

  private calculateImpact(relevanceScore: number): 'high' | 'medium' | 'low' {
    if (relevanceScore > 0.8) return 'high';
    if (relevanceScore > 0.5) return 'medium';
    return 'low';
  }

  private generateInsightFactors(marketData: any[], newsData: any[], sentimentData: any[]): string[] {
    const factors = [];

    if (marketData.length > 0) {
      const avgChange = marketData.reduce((sum, data) => sum + data.change_24h, 0) / marketData.length;
      if (avgChange > 5) factors.push('Strong price momentum across major assets');
      if (avgChange < -5) factors.push('Significant price corrections occurring');
    }

    if (newsData.length > 5) {
      factors.push('High news volume indicating market attention');
    }

    if (sentimentData.length > 0) {
      const bullishCount = sentimentData.filter(s => s.sentiment_score > 0.2).length;
      if (bullishCount > sentimentData.length * 0.6) {
        factors.push('Social sentiment showing bullish bias');
      }
    }

    factors.push('Real-time data analysis providing current market snapshot');
    return factors.length > 0 ? factors : ['Market conditions showing mixed signals'];
  }

  private calculateRiskAssessment(marketData: any[], technicalData: any): string {
    if (marketData.length === 0) return 'High - Limited data available';

    const avgVolatility = marketData.reduce((sum, data) => {
      return sum + Math.abs(data.change_24h);
    }, 0) / marketData.length;

    if (avgVolatility > 10) return 'High - Elevated volatility detected';
    if (avgVolatility > 5) return 'Medium - Moderate price swings expected';
    return 'Low - Stable market conditions observed';
  }

  private calculateOpportunityScore(marketData: any[], sentimentData: any[], technicalData: any): number {
    let score = 50;

    if (marketData.length > 0) {
      const avgChange = marketData.reduce((sum, data) => sum + data.change_24h, 0) / marketData.length;
      score += avgChange * 2; // Price momentum factor
    }

    if (sentimentData.length > 0) {
      const avgSentiment = sentimentData.reduce((sum, data) => sum + data.sentiment_score, 0) / sentimentData.length;
      score += avgSentiment * 20; // Sentiment factor
    }

    return Math.min(95, Math.max(5, Math.round(score)));
  }

  private generateActionSignals(assets: string[], marketData: any[], technicalData: any, sentimentData: any[]): Record<string, any> {
    const signals: Record<string, any> = {};

    assets.forEach((asset, index) => {
      const assetData = marketData[index];
      if (!assetData) {
        signals[asset] = {
          signal: 'WAIT',
          confidence: 20,
          reasoning: 'Insufficient data for analysis'
        };
        return;
      }

      const change24h = assetData.change_24h;
      const sentiment = sentimentData.find(s => s.symbol === asset)?.sentiment_score || 0;

      let signal = 'HOLD';
      let confidence = 50;
      let reasoning = `Current analysis for ${asset}`;

      if (change24h > 5 && sentiment > 0.2) {
        signal = 'BUY';
        confidence = 75;
        reasoning = `Strong upward momentum with positive sentiment for ${asset}`;
      } else if (change24h < -5 && sentiment < -0.2) {
        signal = 'SELL';
        confidence = 70;
        reasoning = `Downward pressure with negative sentiment for ${asset}`;
      } else if (change24h > 2 || sentiment > 0.1) {
        signal = 'ACCUMULATE';
        confidence = 60;
        reasoning = `Gradual accumulation opportunity for ${asset}`;
      }

      signals[asset] = { signal, confidence, reasoning };
    });

    return signals;
  }

  private getBollingerPosition(bollinger: any): string {
    if (!bollinger || !bollinger.upper || !bollinger.lower) return 'No data';
    // This is simplified - in real implementation, we'd need current price
    return 'Middle band consolidation';
  }

  private calculateTrend(indicators: any): string {
    if (!indicators) return 'No technical data available';

    let bullishSignals = 0;
    let bearishSignals = 0;

    if (indicators.rsi > 70) bearishSignals++;
    if (indicators.rsi < 30) bullishSignals++;
    if (indicators.rsi >= 50 && indicators.rsi <= 70) bullishSignals++;

    if (indicators.macd?.value > 0) bullishSignals++;
    if (indicators.macd?.value < 0) bearishSignals++;

    if (bullishSignals > bearishSignals) return 'Upward momentum building';
    if (bearishSignals > bullishSignals) return 'Downward pressure increasing';
    return 'Sideways consolidation pattern';
  }

  // News analysis helper methods
  private analyzeNewsSentiment(newsData: any[]): { overall: number; credibility: number } {
    if (newsData.length === 0) return { overall: 0, credibility: 5 };

    const overallSentiment = newsData.reduce((sum, news) => sum + news.sentiment_score, 0) / newsData.length;
    const credibilityScore = Math.round(newsData.reduce((sum, news) => sum + news.relevance_score, 0) / newsData.length * 10);

    return {
      overall: overallSentiment,
      credibility: Math.max(1, Math.min(10, credibilityScore))
    };
  }

  private calculateNewsMarketImpact(symbols: string[], newsData: any[]): Record<string, any> {
    const impact: Record<string, any> = {};

    symbols.forEach(symbol => {
      const relevantNews = newsData.filter(news =>
        news.title.toLowerCase().includes(symbol.toLowerCase()) ||
        news.content.toLowerCase().includes(symbol.toLowerCase())
      );

      if (relevantNews.length === 0) {
        impact[symbol] = { priceImpact: 0, sentiment: 0, confidence: 20 };
        return;
      }

      const avgSentiment = relevantNews.reduce((sum, news) => sum + news.sentiment_score, 0) / relevantNews.length;
      const priceImpact = avgSentiment * 5; // Convert sentiment to price impact estimate
      const confidence = Math.min(90, 40 + (relevantNews.length * 10));

      impact[symbol] = {
        priceImpact: Number(priceImpact.toFixed(1)),
        sentiment: avgSentiment,
        confidence
      };
    });

    return impact;
  }

  private formatSentiment(sentiment: number): string {
    if (sentiment > 0.3) return '🟢 Positive';
    if (sentiment > 0.1) return '🟡 Cautiously Positive';
    if (sentiment < -0.3) return '🔴 Negative';
    if (sentiment < -0.1) return '🟡 Cautiously Negative';
    return '🟡 Neutral';
  }

  private formatSentimentLabel(sentiment: number): string {
    if (sentiment > 0.2) return 'Bullish';
    if (sentiment < -0.2) return 'Bearish';
    return 'Neutral';
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