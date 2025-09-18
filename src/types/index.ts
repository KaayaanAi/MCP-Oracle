// Core domain types with strict constraints
export type TimeFrame = 'last_4_hours' | 'last_24_hours' | 'last_week';
export type AnalysisDepth = 'quick' | 'standard' | 'comprehensive';
export type MarketSignal = 'BUY' | 'SELL' | 'HOLD' | 'ACCUMULATE' | 'WAIT';
export type MarketStatus = '🟢 Bullish' | '🔴 Bearish' | '🟡 Neutral' | '⚠️ Critical';
export type ImpactLevel = 'high' | 'medium' | 'low';
export type RiskLevel = 'High' | 'Medium' | 'Low';

export interface MarketPulseParams {
  readonly assets: readonly string[];
  readonly timeframe: TimeFrame;
  readonly analysis_depth: AnalysisDepth;
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

  technical_analysis: TechnicalAnalysis;

  ai_insights: {
    summary: string;
    factors: string[];
    risk_assessment: string;
    opportunity_score: number;
  };

  action_signals: Record<string, ActionSignal>;

  historical_patterns?: Array<{
    pattern: string;
    last_occurrence: string;
    outcome: string;
    relevance: number;
  }>;
}

// AI Provider types with stricter constraints
export type AIProviderName = 'groq' | 'openai';
export type GroqModel = 'openai/gpt-oss-120b' | 'llama-3.1-8b-instant' | 'mixtral-8x7b-32768';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
export type AIModel = GroqModel | OpenAIModel;

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: AIModel;
  readonly maxTokens: number;
  readonly temperature: number;
}

// AI Analysis types
export interface AIAnalysisRequest {
  readonly type: 'market_pulse' | 'news_analysis' | 'forecast' | 'sentiment' | 'technical';
  readonly data: unknown; // Will be refined based on type
  readonly symbols: readonly AssetSymbol[];
  readonly context?: string;
  readonly depth: AnalysisDepth;
}

export interface AIAnalysisResponse {
  readonly analysis: string;
  readonly insights: readonly string[];
  readonly recommendations: readonly string[];
  readonly confidence: ConfidenceScore;
  readonly reasoning: readonly string[];
  readonly model_used: string;
  readonly timestamp: Timestamp;
}

// Data Source types with validation
export interface DataSource {
  readonly name: string;
  readonly endpoint: string;
  readonly rateLimit: string;
  readonly priority: number;
  readonly isActive: boolean;
  readonly apiKey?: string;
  readonly timeout: number;
}

// Service health status
export interface ServiceHealth {
  readonly service: string;
  readonly status: 'healthy' | 'degraded' | 'down';
  readonly lastCheck: Timestamp;
  readonly responseTime?: number;
  readonly errorRate?: number;
}

// Branded types for better domain modeling
export type AssetSymbol = string & { readonly __brand: 'AssetSymbol' };
export type Price = number & { readonly __brand: 'Price' };
export type Volume = number & { readonly __brand: 'Volume' };
export type MarketCap = number & { readonly __brand: 'MarketCap' };
export type PercentageChange = number & { readonly __brand: 'PercentageChange' };
export type ConfidenceScore = number & { readonly __brand: 'ConfidenceScore' };
export type Timestamp = string & { readonly __brand: 'Timestamp' };

// Factory functions for branded types
export const createAssetSymbol = (symbol: string): AssetSymbol => symbol as AssetSymbol;
export const createPrice = (price: number): Price => price as Price;
export const createVolume = (volume: number): Volume => volume as Volume;
export const createMarketCap = (cap: number): MarketCap => cap as MarketCap;
export const createPercentageChange = (change: number): PercentageChange => change as PercentageChange;
export const createConfidenceScore = (score: number): ConfidenceScore => {
  if (score < 0 || score > 100) throw new Error('Confidence score must be between 0 and 100');
  return score as ConfidenceScore;
};
export const createTimestamp = (timestamp: string): Timestamp => timestamp as Timestamp;

export interface MarketData {
  readonly symbol: AssetSymbol;
  readonly price: Price;
  readonly change_24h: PercentageChange;
  readonly volume: Volume;
  readonly market_cap?: MarketCap;
  readonly timestamp: Timestamp;
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

// Improved API Response type with Result pattern
export interface APIResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: Timestamp;
}

// Better typed API response using Result
export type TypedAPIResponse<T> = Result<T> & {
  readonly timestamp: Timestamp;
  readonly requestId?: string;
};

// Generic types with proper constraints
export interface Cacheable {
  readonly timestamp: Timestamp;
}

export interface CacheEntry<T extends Cacheable = Cacheable> {
  readonly data: T;
  readonly timestamp: number;
  readonly ttl: number;
  readonly key?: string;
}

// Cache key builder for type safety
export type CacheKeyBuilder<T extends readonly unknown[]> = (...args: T) => string;

// Discriminated unions for WebSocket messages
export type WSMessageType = 'market_pulse' | 'alert' | 'news' | 'technical_update';

export interface BaseWSMessage {
  readonly type: WSMessageType;
  readonly timestamp: Timestamp;
}

export interface MarketPulseWSMessage extends BaseWSMessage {
  readonly type: 'market_pulse';
  readonly data: MarketPulseResponse;
}

export interface AlertWSMessage extends BaseWSMessage {
  readonly type: 'alert';
  readonly data: {
    readonly message: string;
    readonly severity: ImpactLevel;
    readonly symbols: readonly AssetSymbol[];
  };
}

export interface NewsWSMessage extends BaseWSMessage {
  readonly type: 'news';
  readonly data: {
    readonly title: string;
    readonly source: string;
    readonly impact: ImpactLevel;
    readonly sentiment: number;
  };
}

export interface TechnicalUpdateWSMessage extends BaseWSMessage {
  readonly type: 'technical_update';
  readonly data: TechnicalAnalysis;
}

export type WebSocketMessage =
  | MarketPulseWSMessage
  | AlertWSMessage
  | NewsWSMessage
  | TechnicalUpdateWSMessage;

// Technical Analysis types
export interface TechnicalIndicators {
  readonly rsi: number;
  readonly macd: {
    readonly value: number;
    readonly signal: number;
    readonly histogram: number;
    readonly trend: 'bullish' | 'bearish' | 'neutral';
  };
  readonly sma_20: number;
  readonly sma_50: number;
  readonly sma_200: number;
  readonly bollinger_bands: {
    readonly upper: number;
    readonly middle: number;
    readonly lower: number;
    readonly position: 'upper' | 'middle' | 'lower' | 'outside';
  };
  readonly volume: Volume;
  readonly volatility: number;
}

export interface SupportResistance {
  readonly support_levels: readonly number[];
  readonly resistance_levels: readonly number[];
}

export interface TrendAnalysis {
  readonly overall: 'bullish' | 'bearish' | 'neutral';
  readonly strength: number;
  readonly short_term: 'bullish' | 'bearish' | 'neutral';
  readonly long_term: 'bullish' | 'bearish' | 'neutral';
}

export interface TechnicalSignals {
  readonly action: MarketSignal;
  readonly confidence: ConfidenceScore;
  readonly reasons: readonly string[];
}

export interface TechnicalAnalysis {
  readonly trend: string;
  readonly support_levels: readonly number[];
  readonly resistance_levels: readonly number[];
  readonly indicators: TechnicalIndicators;
  readonly trend_analysis: TrendAnalysis;
  readonly signals: TechnicalSignals;
  readonly support_resistance: SupportResistance;
}

// Action Signal type
export interface ActionSignal {
  readonly signal: MarketSignal;
  readonly confidence: ConfidenceScore;
  readonly reasoning: string;
}

// Error handling types
export interface ErrorBase {
  readonly code: string;
  readonly message: string;
  readonly timestamp: Timestamp;
}

export interface APIError extends ErrorBase {
  readonly type: 'api_error';
  readonly service: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
}

export interface ValidationError extends ErrorBase {
  readonly type: 'validation_error';
  readonly field: string;
  readonly expectedType: string;
  readonly receivedValue: unknown;
}

export interface NetworkError extends ErrorBase {
  readonly type: 'network_error';
  readonly timeout: boolean;
  readonly retryCount: number;
}

export interface ConfigurationError extends ErrorBase {
  readonly type: 'configuration_error';
  readonly missingKeys: readonly string[];
}

export type AppError = APIError | ValidationError | NetworkError | ConfigurationError;

// Result type for better error handling
export type Result<T, E = AppError> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

// Helper functions for Result type
export const createSuccess = <T>(data: T): Result<T> => ({ success: true, data });
export const createError = <E = AppError>(error: E): Result<never, E> => ({ success: false, error });

export interface SSEEvent {
  readonly id: string;
  readonly event: string;
  readonly data: string;
  readonly retry?: number;
}