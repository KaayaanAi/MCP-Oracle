// Local imports
import type {
  AssetSymbol,
  Price,
  Volume,
  MarketCap,
  PercentageChange,
  ConfidenceScore,
  Timestamp,
  MarketStatus,
  MarketSignal,
  ImpactLevel,
  RiskLevel,
  AIProviderName
} from '../types/index.js';

// Type guard functions for runtime validation
export const isAssetSymbol = (value: unknown): value is AssetSymbol => {
  return typeof value === 'string' && value.length > 0 && value.length <= 10 && /^[A-Z0-9]+$/.test(value);
};

export const isPrice = (value: unknown): value is Price => {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
};

export const isVolume = (value: unknown): value is Volume => {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
};

export const isMarketCap = (value: unknown): value is MarketCap => {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
};

export const isPercentageChange = (value: unknown): value is PercentageChange => {
  return typeof value === 'number' && Number.isFinite(value);
};

export const isConfidenceScore = (value: unknown): value is ConfidenceScore => {
  return typeof value === 'number' && value >= 0 && value <= 100 && Number.isFinite(value);
};

export const isTimestamp = (value: unknown): value is Timestamp => {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
};

export const isMarketStatus = (value: unknown): value is MarketStatus => {
  const validStatuses: MarketStatus[] = ['🟢 Bullish', '🔴 Bearish', '🟡 Neutral', '⚠️ Critical'];
  return validStatuses.includes(value as MarketStatus);
};

export const isMarketSignal = (value: unknown): value is MarketSignal => {
  const validSignals: MarketSignal[] = ['BUY', 'SELL', 'HOLD', 'ACCUMULATE', 'WAIT'];
  return validSignals.includes(value as MarketSignal);
};

export const isImpactLevel = (value: unknown): value is ImpactLevel => {
  const validLevels: ImpactLevel[] = ['high', 'medium', 'low'];
  return validLevels.includes(value as ImpactLevel);
};

export const isRiskLevel = (value: unknown): value is RiskLevel => {
  const validLevels: RiskLevel[] = ['High', 'Medium', 'Low'];
  return validLevels.includes(value as RiskLevel);
};

export const isAIProviderName = (value: unknown): value is AIProviderName => {
  const validProviders: AIProviderName[] = ['groq', 'openai'];
  return validProviders.includes(value as AIProviderName);
};

export const isGroqModel = (value: unknown): value is string => {
  const groqModels = ['openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
  return typeof value === 'string' && groqModels.includes(value);
};

export const isOpenAIModel = (value: unknown): value is string => {
  const openaiModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
  return typeof value === 'string' && openaiModels.includes(value);
};

// Validation functions that throw descriptive errors
export const validateAssetSymbol = (value: unknown, fieldName = 'asset symbol'): AssetSymbol => {
  if (!isAssetSymbol(value)) {
    throw new Error(`Invalid ${fieldName}: must be a string with 1-10 uppercase alphanumeric characters, got: ${value}`);
  }
  return value;
};

export const validatePrice = (value: unknown, fieldName = 'price'): Price => {
  if (!isPrice(value)) {
    throw new Error(`Invalid ${fieldName}: must be a non-negative finite number, got: ${value}`);
  }
  return value;
};

export const validateConfidenceScore = (value: unknown, fieldName = 'confidence score'): ConfidenceScore => {
  if (!isConfidenceScore(value)) {
    throw new Error(`Invalid ${fieldName}: must be a number between 0 and 100, got: ${value}`);
  }
  return value;
};

export const validateTimestamp = (value: unknown, fieldName = 'timestamp'): Timestamp => {
  if (!isTimestamp(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid ISO date string, got: ${value}`);
  }
  return value;
};

// Array validation helpers
export const validateAssetSymbolArray = (value: unknown, fieldName = 'asset symbols'): readonly AssetSymbol[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}: must be an array, got: ${typeof value}`);
  }
  return value.map((item, index) => validateAssetSymbol(item, `${fieldName}[${index}]`));
};

// Object validation helpers
export const hasRequiredKeys = <T extends Record<string, unknown>>(
  obj: unknown,
  keys: readonly (keyof T)[],
  objectName = 'object'
): obj is T => {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`Invalid ${objectName}: must be an object, got: ${typeof obj}`);
  }

  const objRecord = obj as Record<string, unknown>;
  const missingKeys = keys.filter(key => !(String(key) in objRecord));

  if (missingKeys.length > 0) {
    throw new Error(`Invalid ${objectName}: missing required keys: ${missingKeys.join(', ')}`);
  }

  return true;
};

// Utility function to safely parse JSON with type validation
export const parseJSONWithValidation = <T>(
  jsonString: string,
  validator: (value: unknown) => value is T,
  errorMessage = 'Invalid JSON structure'
): T => {
  try {
    const parsed = JSON.parse(jsonString);
    if (!validator(parsed)) {
      throw new Error(errorMessage);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
};

// Environment variable validation
export const getRequiredEnvVar = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const getOptionalEnvVar = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

export const getNumericEnvVar = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
  }
  return numeric;
};

// API response validation helpers
export const isSuccessResponse = <T>(response: { success: boolean; data?: T }): response is { success: true; data: T } => {
  return response.success === true && response.data !== undefined;
};

export const isErrorResponse = (response: { success: boolean; error?: string }): response is { success: false; error: string } => {
  return response.success === false && typeof response.error === 'string';
};