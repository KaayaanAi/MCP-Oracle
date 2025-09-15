export interface MarketPulseParams {
  assets: string[];
  timeframe: 'last_4_hours' | 'last_24_hours' | 'last_week';
  analysis_depth: 'quick' | 'standard' | 'comprehensive';
}

export interface MarketPulseResponse {
  timestamp: string;
  market_status: '🟢 Bullish' | '🔴 Bearish' | '🟡 Neutral' | '⚠️ Critical';
  dominant_sentiment: string;
  confidence_score: number;

  key_events: Array<{
    source: string;
    title: string;
    impact: 'high' | 'medium' | 'low';
    sentiment: number;
    timestamp: string;
  }>;

  technical_analysis: {
    trend: string;
    support_levels: number[];
    resistance_levels: number[];
    indicators: Record<string, any>;
  };

  ai_insights: {
    summary: string;
    factors: string[];
    risk_assessment: string;
    opportunity_score: number;
  };

  action_signals: Record<string, {
    signal: 'BUY' | 'SELL' | 'HOLD' | 'ACCUMULATE' | 'WAIT';
    confidence: number;
    reasoning: string;
  }>;

  historical_patterns?: Array<{
    pattern: string;
    last_occurrence: string;
    outcome: string;
    relevance: number;
  }>;
}

export interface AIProvider {
  name: 'groq' | 'anthropic' | 'openai';
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface DataSource {
  name: string;
  endpoint: string;
  rateLimit: string;
  priority: number;
  isActive: boolean;
}

export interface MarketData {
  symbol: string;
  price: number;
  change_24h: number;
  volume: number;
  market_cap?: number;
  timestamp: string;
}

export interface NewsItem {
  title: string;
  content: string;
  source: string;
  url: string;
  timestamp: string;
  sentiment_score: number;
  relevance_score: number;
}

export interface SentimentData {
  source: 'reddit' | 'twitter' | 'news' | 'telegram';
  symbol: string;
  sentiment_score: number;
  volume: number;
  timestamp: string;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  bollinger_bands: { upper: number; middle: number; lower: number };
  sma_20: number;
  sma_50: number;
  sma_200: number;
  volume_sma: number;
}

export interface PatternMatch {
  pattern_id: string;
  similarity_score: number;
  historical_outcome: string;
  confidence: number;
  timeframe: string;
}

export interface ServerConfig {
  protocols: {
    stdio: boolean;
    http: boolean;
    websocket: boolean;
    sse: boolean;
  };
  ports: {
    http: number;
    websocket: number;
  };
  ai: {
    providers: Record<string, AIProvider>;
  };
  data_sources: Record<string, DataSource>;
  cache: {
    ttl: number;
    redis_url: string;
  };
  memory: {
    mongodb_url: string;
    database_name: string;
  };
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface WebSocketMessage {
  type: 'market_pulse' | 'alert' | 'news' | 'technical_update';
  data: any;
  timestamp: string;
}

export interface SSEEvent {
  id: string;
  event: string;
  data: string;
  retry?: number;
}