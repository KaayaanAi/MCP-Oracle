// Third-party packages
import axios, { AxiosInstance } from 'axios';

// Local imports
import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  AssetSymbol,
  Result,
  APIError,
  AppError,
  Timestamp
} from '../types/index.js';
import {
  createSuccess,
  createError,
  createTimestamp,
  createConfidenceScore
} from '../types/index.js';
import { loggers } from '../utils/logger.js';

// Specific data types for different analysis requests
export interface MarketPulseData {
  readonly marketData: readonly unknown[];
  readonly newsData: readonly unknown[];
  readonly technicalData: Record<string, unknown>;
  readonly sentimentData?: readonly unknown[];
}

export interface NewsSentimentData {
  readonly articles: readonly {
    readonly title: string;
    readonly content: string;
    readonly source: string;
    readonly timestamp: Timestamp;
    readonly sentiment_score?: number;
  }[];
}

export interface ForecastData {
  readonly currentPrice: number;
  readonly historicalData: readonly {
    readonly price: number;
    readonly timestamp: Timestamp;
    readonly volume?: number;
  }[];
  readonly technicalData?: Record<string, unknown>;
  readonly fundamentals: {
    readonly symbol: AssetSymbol;
    readonly timeframe: number;
  };
}

export interface TechnicalAnalysisData {
  readonly indicators: Record<string, unknown>;
  readonly patterns: readonly unknown[];
  readonly signals: readonly unknown[];
}

// Unified AI API response interface (both Groq and OpenAI have same structure)
export interface AIAPIResponse {
  readonly id: string;
  readonly object: string;
  readonly created: number;
  readonly model: string;
  readonly choices: readonly {
    readonly index: number;
    readonly message: {
      readonly role: 'system' | 'user' | 'assistant';
      readonly content: string;
    };
    readonly finish_reason: 'stop' | 'length' | 'function_call' | 'content_filter' | null;
  }[];
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

// Internal response wrapper
export interface AIServiceResponse {
  readonly content: string;
  readonly model: string;
  readonly tokensUsed: number;
}

export class AIService {
  private groqClient: AxiosInstance;
  private openaiClient: AxiosInstance;
  private readonly groqApiKey: string;
  private readonly openaiApiKey: string;
  private groqModel: string;
  private openaiModel: string;
  private openaiComprehensiveModel: string;
  private logger = loggers.ai;

  constructor(
    groqApiKey: string,
    openaiApiKey: string,
    groqModel: string = 'openai/gpt-oss-120b',
    openaiModel: string = 'gpt-5-nano',
    openaiComprehensiveModel: string = 'gpt-4o'
  ) {
    this.groqApiKey = groqApiKey;
    this.openaiApiKey = openaiApiKey;
    this.groqModel = groqModel;
    this.openaiModel = openaiModel;
    this.openaiComprehensiveModel = openaiComprehensiveModel;

    // GROQ client setup
    this.groqClient = axios.create({
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // OpenAI client setup
    this.openaiClient = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: 90000,
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // GROQ interceptors
    this.groqClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`🚀 GROQ API call: ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.groqClient.interceptors.response.use(
      (response) => {
        const tokens = response.data.usage?.total_tokens || 0;
        this.logger.debug(`✅ GROQ response: ${tokens} tokens used`);
        return response;
      },
      (error) => {
        this.logger.error('❌ GROQ API error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );

    // OpenAI interceptors
    this.openaiClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`🧠 OpenAI API call: ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.openaiClient.interceptors.response.use(
      (response) => {
        const tokens = response.data.usage?.total_tokens || 0;
        this.logger.debug(`✅ OpenAI response: ${tokens} tokens used`);
        return response;
      },
      (error) => {
        this.logger.error('❌ OpenAI API error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Analyze market data with AI
   */
  async analyzeMarketPulse(
    request: AIAnalysisRequest & { data: MarketPulseData }
  ): Promise<Result<AIAnalysisResponse, AppError>> {
    this.logger.info(`🔍 Analyzing market pulse for ${request.symbols.join(', ')} with ${request.depth} depth`);

    const prompt = this.buildMarketPulsePrompt(request);

    try {
      let response: AIServiceResponse;

      if (request.depth === 'quick') {
        response = await this.callGroq(prompt);
      } else if (request.depth === 'comprehensive') {
        response = await this.callOpenAI(prompt, this.openaiComprehensiveModel);
      } else {
        // Standard depth - use GPT-4o-mini, fallback to Groq
        try {
          response = await this.callOpenAI(prompt, this.openaiModel);
        } catch (error) {
          this.logger.warn('OpenAI failed, falling back to Groq:', error);
          response = await this.callGroq(prompt);
        }
      }

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ Market pulse analysis completed using ${response.model}`);

      const result: AIAnalysisResponse = {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: createConfidenceScore(analysis.confidence),
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: createTimestamp(new Date().toISOString())
      };

      return createSuccess(result);
    } catch (error) {
      this.logger.error('❌ Market pulse analysis failed:', error);
      const apiError: APIError = {
        type: 'api_error',
        code: 'AI_ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : 'AI market analysis failed',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'ai-service',
        retryable: true
      };
      return createError(apiError);
    }
  }

  /**
   * Analyze news sentiment with AI
   */
  async analyzeNewsSentiment(
    request: AIAnalysisRequest & { data: NewsSentimentData }
  ): Promise<Result<AIAnalysisResponse, AppError>> {
    this.logger.info(`📰 Analyzing news sentiment for ${request.symbols.join(', ')}`);

    const prompt = this.buildNewsSentimentPrompt(request);

    try {
      let response: AIServiceResponse;

      if (request.depth === 'comprehensive') {
        response = await this.callOpenAI(prompt, this.openaiComprehensiveModel);
      } else {
        // Standard or quick - use GPT-4o-mini, fallback to Groq
        try {
          response = await this.callOpenAI(prompt, this.openaiModel);
        } catch (error) {
          this.logger.warn('OpenAI failed for news analysis, falling back to Groq:', error);
          response = await this.callGroq(prompt);
        }
      }

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ News sentiment analysis completed using ${response.model}`);

      const result: AIAnalysisResponse = {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: createConfidenceScore(analysis.confidence),
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: createTimestamp(new Date().toISOString())
      };

      return createSuccess(result);
    } catch (error) {
      this.logger.error('❌ News sentiment analysis failed:', error);
      const apiError: APIError = {
        type: 'api_error',
        code: 'AI_NEWS_ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : 'AI news analysis failed',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'ai-service',
        retryable: true
      };
      return createError(apiError);
    }
  }

  /**
   * Generate market forecast with AI
   */
  async generateForecast(
    request: AIAnalysisRequest & { data: ForecastData }
  ): Promise<Result<AIAnalysisResponse, AppError>> {
    this.logger.info(`🔮 Generating forecast for ${request.symbols.join(', ')}`);

    const prompt = this.buildForecastPrompt(request);

    try {
      let response: AIServiceResponse;

      // Use most capable model for forecasting based on depth
      if (request.depth === 'comprehensive') {
        response = await this.callOpenAI(prompt, this.openaiComprehensiveModel);
      } else {
        // Standard or quick - use GPT-4o-mini for accuracy
        response = await this.callOpenAI(prompt, this.openaiModel);
      }

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ Forecast generated using ${response.model}`);

      const result: AIAnalysisResponse = {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: createConfidenceScore(analysis.confidence),
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: createTimestamp(new Date().toISOString())
      };

      return createSuccess(result);
    } catch (error) {
      this.logger.error('❌ Forecast generation failed:', error);
      const apiError: APIError = {
        type: 'api_error',
        code: 'AI_FORECAST_FAILED',
        message: error instanceof Error ? error.message : 'AI forecast generation failed',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'ai-service',
        retryable: true
      };
      return createError(apiError);
    }
  }

  /**
   * Analyze technical indicators with AI
   */
  async analyzeTechnical(
    request: AIAnalysisRequest & { data: TechnicalAnalysisData }
  ): Promise<Result<AIAnalysisResponse, AppError>> {
    this.logger.info(`📊 Analyzing technical data for ${request.symbols.join(', ')}`);

    const prompt = this.buildTechnicalPrompt(request);

    try {
      const response: AIServiceResponse = request.depth === 'quick'
        ? await this.callGroq(prompt)
        : await this.callOpenAI(prompt);

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ Technical analysis completed using ${response.model}`);

      const result: AIAnalysisResponse = {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: createConfidenceScore(analysis.confidence),
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: createTimestamp(new Date().toISOString())
      };

      return createSuccess(result);
    } catch (error) {
      this.logger.error('❌ Technical analysis failed:', error);
      const apiError: APIError = {
        type: 'api_error',
        code: 'AI_TECHNICAL_ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : 'AI technical analysis failed',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'ai-service',
        retryable: true
      };
      return createError(apiError);
    }
  }

  private async callGroq(prompt: string): Promise<AIServiceResponse> {
    this.logger.debug('🚀 Calling GROQ for analysis');

    const response = await this.groqClient.post<AIAPIResponse>('/chat/completions', {
      model: this.groqModel,
      messages: [
        {
          role: 'system',
          content: 'You are a professional financial analyst with expertise in cryptocurrency and stock markets. Provide accurate, data-driven analysis.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2048,
      temperature: 0.3,
      top_p: 0.9
    });

    return {
      content: response.data.choices[0]?.message.content || '',
      model: `GROQ ${response.data.model}`,
      tokensUsed: response.data.usage.total_tokens
    };
  }

  private async callOpenAI(prompt: string, model?: string): Promise<AIServiceResponse> {
    const modelToUse = model || this.openaiModel;
    const maxTokens = modelToUse === this.openaiComprehensiveModel ? 8000 :
                     modelToUse === this.openaiModel ? 4000 : 3000;
    const temperature = modelToUse === this.openaiComprehensiveModel ? 0.7 : 0.5;

    this.logger.debug(`🧠 Calling OpenAI ${modelToUse} for analysis`);

    const response = await this.openaiClient.post<AIAPIResponse>('/chat/completions', {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: 'You are a senior financial analyst and quantitative researcher with deep expertise in market analysis, technical indicators, and financial forecasting. Provide comprehensive, actionable insights based on real market data.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_completion_tokens: maxTokens,
      temperature,
      top_p: 0.8
    });

    return {
      content: response.data.choices[0]?.message.content || '',
      model: `OpenAI ${response.data.model}`,
      tokensUsed: response.data.usage.total_tokens
    };
  }

  private buildMarketPulsePrompt(request: AIAnalysisRequest): string {
    const { data, symbols } = request;

    return `Analyze the current market pulse for ${symbols.join(', ')} based on the following REAL market data:

MARKET DATA:
${JSON.stringify((data as any).marketData, null, 2)}

NEWS DATA:
${JSON.stringify(((data as any).newsData as any[])?.slice(0, 10), null, 2)}

TECHNICAL DATA:
${JSON.stringify((data as any).technicalData, null, 2)}

SENTIMENT DATA:
${JSON.stringify((data as any).sentimentData, null, 2)}

Please provide a comprehensive analysis in the following JSON format:
{
  "summary": "Overall market pulse summary (2-3 sentences)",
  "insights": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "confidence": 85,
  "reasoning": ["Reason 1 for analysis", "Reason 2 for analysis"]
}

Focus on:
1. Current price trends and momentum
2. News impact on market sentiment
3. Technical indicator alignment
4. Short-term and medium-term outlook
5. Risk factors and opportunities`;
  }

  private buildNewsSentimentPrompt(request: AIAnalysisRequest): string {
    const { data, symbols } = request;

    return `Analyze the sentiment and market impact of recent news for ${symbols.join(', ')}:

NEWS ARTICLES:
${JSON.stringify((data as any), null, 2)}

Please provide detailed sentiment analysis in the following JSON format:
{
  "summary": "Overall news sentiment and market impact assessment",
  "insights": ["Market-moving insight 1", "Sentiment pattern 2", "Impact analysis 3"],
  "recommendations": ["Trading recommendation 1", "Risk management advice 2"],
  "confidence": 90,
  "reasoning": ["News analysis reasoning 1", "Sentiment interpretation 2"]
}

Focus on:
1. Overall sentiment polarity (bullish/bearish/neutral)
2. News credibility and source reliability
3. Potential market impact magnitude
4. Key themes and narrative shifts
5. Timing implications for market movements`;
  }

  private buildForecastPrompt(request: AIAnalysisRequest): string {
    const { data, symbols } = request;

    return `Generate a market forecast for ${symbols.join(', ')} based on this comprehensive data:

HISTORICAL PRICE DATA:
${JSON.stringify(((data as any).historicalData as any[])?.slice(0, 30), null, 2)}

CURRENT TECHNICAL INDICATORS:
${JSON.stringify((data as any).technicalData, null, 2)}

MARKET FUNDAMENTALS:
${JSON.stringify((data as any).fundamentals, null, 2)}

Please provide a detailed forecast in the following JSON format:
{
  "summary": "Forecast summary with price targets and timeline",
  "insights": ["Technical insight 1", "Fundamental factor 2", "Market dynamic 3"],
  "recommendations": ["Position sizing advice", "Entry/exit strategy", "Risk management"],
  "confidence": 75,
  "reasoning": ["Technical analysis basis", "Fundamental justification", "Risk assessment"]
}

Focus on:
1. Price targets for 7-day, 30-day horizons
2. Support and resistance levels
3. Risk/reward ratios
4. Probability-weighted scenarios
5. Key catalysts and risk factors`;
  }

  private buildTechnicalPrompt(request: AIAnalysisRequest): string {
    const { data, symbols } = request;

    return `Analyze the technical indicators for ${symbols.join(', ')}:

TECHNICAL INDICATORS:
${this.formatTechnicalData(data)}

Please provide comprehensive technical analysis in the following JSON format:
{
  "summary": "Technical analysis summary and signal interpretation",
  "insights": ["RSI/momentum insight", "Moving average trend", "Volume analysis"],
  "recommendations": ["Entry signal", "Stop loss level", "Take profit target"],
  "confidence": 80,
  "reasoning": ["Indicator alignment", "Pattern recognition", "Signal strength"]
}

Focus on:
1. Indicator convergence/divergence
2. Overbought/oversold conditions
3. Trend strength and momentum
4. Support/resistance validation
5. Entry/exit timing signals`;
  }

  private parseAIResponse(content: string): {
    summary: string;
    insights: string[];
    recommendations: string[];
    confidence: number;
    reasoning: string[];
  } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'AI analysis completed',
          insights: parsed.insights || ['Analysis insights generated'],
          recommendations: parsed.recommendations || ['Recommendations provided'],
          confidence: parsed.confidence || 75,
          reasoning: parsed.reasoning || ['AI reasoning provided']
        };
      }
    } catch (error) {
      this.logger.warn('Failed to parse JSON from AI response, using fallback parsing');
    }

    // Fallback parsing if JSON extraction fails
    return {
      summary: content.split('\n')[0] || 'AI analysis completed',
      insights: this.extractBulletPoints(content, ['insight', 'analysis', 'finding']),
      recommendations: this.extractBulletPoints(content, ['recommend', 'suggest', 'advice']),
      confidence: 75,
      reasoning: this.extractBulletPoints(content, ['reason', 'because', 'due to'])
    };
  }

  private extractBulletPoints(text: string, keywords: string[]): string[] {
    const lines = text.split('\n');
    const bulletPoints: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check for bullet point markers or keywords
      if (trimmedLine.match(/^[-*•]\s+/) ||
          trimmedLine.match(/^\d+\.\s+/) ||
          keywords.some(keyword => trimmedLine.toLowerCase().includes(keyword))) {
        const cleanedLine = trimmedLine.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
        if (cleanedLine.length > 10) {
          bulletPoints.push(cleanedLine);
        }
      }
    }

    return bulletPoints.slice(0, 5); // Limit to 5 points
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test GROQ
      await this.groqClient.post('/chat/completions', {
        model: this.groqModel,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });

      // Test OpenAI
      await this.openaiClient.post('/chat/completions', {
        model: this.openaiModel,
        messages: [{ role: 'user', content: 'Hello' }],
        max_completion_tokens: 10
      });

      this.logger.info('✅ AI service health check passed');
      return true;
    } catch (error) {
      this.logger.error('❌ AI service health check failed:', error);
      return false;
    }
  }

  /**
   * Format technical data to prevent [object Object] serialization issues
   */
  private formatTechnicalData(data: any): string {
    if (!data) return 'No technical data available';

    try {
      // Handle different data structures that might come in
      if (Array.isArray(data)) {
        return data.map((item, index) => this.formatTechnicalItem(item, index)).join('\n\n');
      } else if (typeof data === 'object') {
        return this.formatTechnicalItem(data);
      } else {
        return String(data);
      }
    } catch (error) {
      this.logger.warn('Error formatting technical data:', error);
      return 'Technical data formatting error';
    }
  }

  /**
   * Format individual technical data item
   */
  private formatTechnicalItem(item: any, index?: number): string {
    if (!item || typeof item !== 'object') {
      return `Item ${index ?? ''}: ${String(item)}`;
    }

    const lines: string[] = [];

    if (index !== undefined) {
      lines.push(`=== Technical Analysis ${index + 1} ===`);
    }

    // Handle technical indicators specifically
    if (item.indicators) {
      lines.push('INDICATORS:');
      const indicators = item.indicators;

      if (typeof indicators.rsi === 'number') {
        lines.push(`  RSI (14): ${indicators.rsi.toFixed(2)}`);
      }

      if (indicators.macd && typeof indicators.macd === 'object') {
        lines.push(`  MACD: ${indicators.macd.trend || 'neutral'} (${indicators.macd.value?.toFixed(4) || 'N/A'})`);
      }

      if (indicators.bollinger_bands && typeof indicators.bollinger_bands === 'object') {
        const bb = indicators.bollinger_bands;
        lines.push(`  Bollinger Bands: ${bb.position || 'unknown'} (Upper: ${bb.upper?.toFixed(2) || 'N/A'}, Lower: ${bb.lower?.toFixed(2) || 'N/A'})`);
      }

      if (typeof indicators.sma_20 === 'number') {
        lines.push(`  SMA 20: ${indicators.sma_20.toFixed(2)}`);
      }

      if (typeof indicators.sma_50 === 'number') {
        lines.push(`  SMA 50: ${indicators.sma_50.toFixed(2)}`);
      }

      if (typeof indicators.sma_200 === 'number') {
        lines.push(`  SMA 200: ${indicators.sma_200.toFixed(2)}`);
      }

      if (typeof indicators.volume === 'number') {
        lines.push(`  Avg Volume: ${indicators.volume.toLocaleString()}`);
      }

      if (typeof indicators.volatility === 'number') {
        lines.push(`  Volatility: ${indicators.volatility.toFixed(2)}%`);
      }
    }

    // Handle support/resistance
    if (item.support_resistance) {
      lines.push('SUPPORT/RESISTANCE:');
      const sr = item.support_resistance;
      if (Array.isArray(sr.support_levels)) {
        lines.push(`  Support: ${sr.support_levels.map((s: number) => s.toFixed(2)).join(', ')}`);
      }
      if (Array.isArray(sr.resistance_levels)) {
        lines.push(`  Resistance: ${sr.resistance_levels.map((r: number) => r.toFixed(2)).join(', ')}`);
      }
    }

    // Handle trend analysis
    if (item.trend_analysis) {
      lines.push('TREND ANALYSIS:');
      const trend = item.trend_analysis;
      lines.push(`  Overall: ${trend.overall || 'neutral'} (Strength: ${trend.strength || 0}%)`);
      lines.push(`  Short-term: ${trend.short_term || 'neutral'}`);
      lines.push(`  Long-term: ${trend.long_term || 'neutral'}`);
    }

    // Handle signals
    if (item.signals) {
      lines.push('SIGNALS:');
      const signals = item.signals;
      lines.push(`  Action: ${signals.action || 'HOLD'} (Confidence: ${signals.confidence || 0}%)`);
      if (Array.isArray(signals.reasons)) {
        signals.reasons.forEach((reason: string) => {
          lines.push(`  - ${reason}`);
        });
      }
    }

    // Handle any other object properties
    Object.keys(item).forEach(key => {
      if (!['indicators', 'support_resistance', 'trend_analysis', 'signals'].includes(key)) {
        const value = item[key];
        if (value !== null && value !== undefined) {
          if (typeof value === 'object') {
            lines.push(`${key.toUpperCase()}: ${JSON.stringify(value, null, 2)}`);
          } else {
            lines.push(`${key.toUpperCase()}: ${value}`);
          }
        }
      }
    });

    return lines.join('\n');
  }
}