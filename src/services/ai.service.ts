import axios, { AxiosInstance } from 'axios';
import { loggers } from '../utils/logger.js';

export interface AIAnalysisRequest {
  type: 'market_pulse' | 'news_analysis' | 'forecast' | 'sentiment' | 'technical';
  data: any;
  symbols: string[];
  context?: string;
  depth: 'quick' | 'standard' | 'comprehensive';
}

export interface AIAnalysisResponse {
  analysis: string;
  insights: string[];
  recommendations: string[];
  confidence: number;
  reasoning: string[];
  model_used: string;
  timestamp: string;
}

export interface GroqResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class AIService {
  private groqClient: AxiosInstance;
  private openaiClient: AxiosInstance;
  private groqApiKey: string;
  private openaiApiKey: string;
  private groqModel: string;
  private openaiModel: string;
  private logger = loggers.ai;

  constructor(groqApiKey: string, openaiApiKey: string, groqModel: string = 'mixtral-8x7b-32768', openaiModel: string = 'gpt-4-turbo') {
    this.groqApiKey = groqApiKey;
    this.openaiApiKey = openaiApiKey;
    this.groqModel = groqModel;
    this.openaiModel = openaiModel;

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
  async analyzeMarketPulse(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    this.logger.info(`🔍 Analyzing market pulse for ${request.symbols.join(', ')} with ${request.depth} depth`);

    const prompt = this.buildMarketPulsePrompt(request);

    try {
      const response = request.depth === 'quick'
        ? await this.callGroq(prompt)
        : await this.callOpenAI(prompt);

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ Market pulse analysis completed using ${response.model}`);

      return {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('❌ Market pulse analysis failed:', error);
      throw new Error('AI market analysis failed');
    }
  }

  /**
   * Analyze news sentiment with AI
   */
  async analyzeNewsSentiment(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    this.logger.info(`📰 Analyzing news sentiment for ${request.symbols.join(', ')}`);

    const prompt = this.buildNewsSentimentPrompt(request);

    try {
      const response = request.depth === 'comprehensive'
        ? await this.callOpenAI(prompt)
        : await this.callGroq(prompt);

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ News sentiment analysis completed using ${response.model}`);

      return {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('❌ News sentiment analysis failed:', error);
      throw new Error('AI news analysis failed');
    }
  }

  /**
   * Generate market forecast with AI
   */
  async generateForecast(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    this.logger.info(`🔮 Generating forecast for ${request.symbols.join(', ')}`);

    const prompt = this.buildForecastPrompt(request);

    try {
      const response = await this.callOpenAI(prompt); // Always use OpenAI for forecasting

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ Forecast generated using ${response.model}`);

      return {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('❌ Forecast generation failed:', error);
      throw new Error('AI forecast generation failed');
    }
  }

  /**
   * Analyze technical indicators with AI
   */
  async analyzeTechnical(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    this.logger.info(`📊 Analyzing technical data for ${request.symbols.join(', ')}`);

    const prompt = this.buildTechnicalPrompt(request);

    try {
      const response = request.depth === 'quick'
        ? await this.callGroq(prompt)
        : await this.callOpenAI(prompt);

      const analysis = this.parseAIResponse(response.content);

      this.logger.info(`✅ Technical analysis completed using ${response.model}`);

      return {
        analysis: analysis.summary,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        model_used: response.model,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('❌ Technical analysis failed:', error);
      throw new Error('AI technical analysis failed');
    }
  }

  private async callGroq(prompt: string): Promise<{ content: string; model: string }> {
    this.logger.debug('🚀 Calling GROQ for analysis');

    const response = await this.groqClient.post<GroqResponse>('/chat/completions', {
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
      content: response.data.choices[0].message.content,
      model: `GROQ ${response.data.model}`
    };
  }

  private async callOpenAI(prompt: string): Promise<{ content: string; model: string }> {
    this.logger.debug('🧠 Calling OpenAI for analysis');

    const response = await this.openaiClient.post<OpenAIResponse>('/chat/completions', {
      model: this.openaiModel,
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
      max_tokens: 3000,
      temperature: 0.2,
      top_p: 0.8
    });

    return {
      content: response.data.choices[0].message.content,
      model: `OpenAI ${response.data.model}`
    };
  }

  private buildMarketPulsePrompt(request: AIAnalysisRequest): string {
    const { data, symbols } = request;

    return `Analyze the current market pulse for ${symbols.join(', ')} based on the following REAL market data:

MARKET DATA:
${JSON.stringify(data.marketData, null, 2)}

NEWS DATA:
${JSON.stringify(data.newsData.slice(0, 10), null, 2)}

TECHNICAL DATA:
${JSON.stringify(data.technicalData, null, 2)}

SENTIMENT DATA:
${JSON.stringify(data.sentimentData, null, 2)}

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
${JSON.stringify(data, null, 2)}

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
${JSON.stringify(data.historicalData?.slice(0, 30), null, 2)}

CURRENT TECHNICAL INDICATORS:
${JSON.stringify(data.technicalData, null, 2)}

MARKET FUNDAMENTALS:
${JSON.stringify(data.fundamentals, null, 2)}

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
${JSON.stringify(data, null, 2)}

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
        max_tokens: 10
      });

      this.logger.info('✅ AI service health check passed');
      return true;
    } catch (error) {
      this.logger.error('❌ AI service health check failed:', error);
      return false;
    }
  }
}