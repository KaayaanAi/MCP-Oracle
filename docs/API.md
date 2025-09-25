# 📡 MCP Oracle API Documentation

**Version**: v1.3.0 - Latest Standards Compliant
**Protocol**: 100% MCP Specification Compliant
**Security**: Zero Vulnerabilities Guarantee

## Overview

MCP Oracle provides multiple access methods for financial market analysis with enterprise-grade standards compliance:

- **MCP Protocol** (STDIO) - Native integration with Claude Code and MCP clients
- **HTTP REST API** - Web services, n8n integration, and external applications
- **WebSocket** - Real-time streaming data with sub-second latency
- **Server-Sent Events** - One-way streaming updates for dashboards

## Authentication

For HTTP/WebSocket access, set the `API_KEY` environment variable. If empty, authentication is disabled.

```bash
# Add to .env file
API_KEY=your_secure_api_key_here
```

Include in requests:
```bash
Authorization: Bearer your_secure_api_key_here
```

## Base URLs

- **HTTP**: `http://localhost:4010`
- **WebSocket**: `ws://localhost:4011/ws`
- **SSE**: `http://localhost:4010/sse`

## Standards Compliance

### MCP Protocol Support
- ✅ **initialize** - Server handshake and capability exchange (< 500ms)
- ✅ **tools/list** - Return available tools with schemas (< 1s)
- ✅ **tools/call** - Execute tools with validation (< 30s)
- ✅ **resources/list** - List data resources (< 2s)
- ✅ **resources/read** - Read specific resources (< 5s)
- ✅ **prompts/list** - List prompt templates (< 1s)
- ✅ **prompts/get** - Retrieve prompts (< 2s)

### Quality Assurance
- ✅ **JSON-RPC 2.0** strict compliance with proper error codes
- ✅ **Input validation** with Zod schemas and sanitization
- ✅ **Rate limiting** (200 requests/15 minutes)
- ✅ **Security headers** (Helmet, CORS, CSP)
- ✅ **Zero vulnerabilities** (automated npm audit)

## HTTP REST API

### 1. Smart Market Pulse

Comprehensive multi-asset market analysis with AI-powered insights.

**Endpoint:** `POST /api/tools/getSmartMarketPulse`

**Parameters:**
```json
{
  "assets": ["BTC", "ETH", "AAPL"],
  "timeframe": "last_24_hours",
  "analysis_depth": "standard"
}
```

**Parameters Details:**
- `assets` (string[]): Asset symbols to analyze
- `timeframe` (string): "last_4_hours", "last_24_hours", "last_week"
- `analysis_depth` (string):
  - "quick" (Groq openai/gpt-oss-120b - sub-second responses)
  - "standard" (OpenAI gpt-5-nano - balanced analysis & cost)
  - "comprehensive" (OpenAI gpt-4o - maximum capability)

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T10:30:00Z",
    "analysis_depth": "standard",
    "assets": [
      {
        "symbol": "BTC",
        "current_price": 42500,
        "price_change_24h": 2.5,
        "volume_24h": 15800000000,
        "market_cap": 832000000000,
        "sentiment": {
          "score": 0.65,
          "label": "Bullish",
          "confidence": 0.82
        },
        "technical_indicators": {
          "rsi": 58.2,
          "macd": 0.15,
          "bollinger_position": "upper"
        }
      }
    ],
    "ai_insights": {
      "model": "gpt-5-nano",
      "analysis": "Market shows consolidation...",
      "confidence": 0.78,
      "key_factors": ["Fed policy", "Institutional adoption"],
      "risk_level": "medium"
    },
    "historical_patterns": [
      {
        "pattern_id": "pattern_123",
        "similarity_score": 0.85,
        "historical_outcome": "high impact: 72h duration",
        "confidence": 0.76
      }
    ]
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/tools/getSmartMarketPulse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "assets": ["BTC", "ETH"],
    "timeframe": "last_24_hours",
    "analysis_depth": "comprehensive"
  }'
```

### 2. Financial News Analysis

Real-time financial news impact analysis and sentiment scoring.

**Endpoint:** `POST /api/tools/analyzeFinancialNews`

**Parameters:**
```json
{
  "symbols": ["BTC", "ETH", "NVDA"],
  "hours": 12
}
```

**Parameters Details:**
- `symbols` (string[]): Asset symbols for news analysis
- `hours` (number): Hours of news data to analyze (default: 24)

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T10:30:00Z",
    "analysis_period": "12 hours",
    "news_count": 45,
    "assets": [
      {
        "symbol": "BTC",
        "sentiment_score": 0.72,
        "news_impact": "high",
        "article_count": 18,
        "key_headlines": [
          "Bitcoin ETF approval sparks institutional interest",
          "Major bank announces crypto custody services"
        ],
        "price_correlation": 0.68
      }
    ],
    "ai_summary": {
      "model": "gpt-5-nano",
      "overall_sentiment": "Bullish momentum driven by institutional developments",
      "confidence": 0.84,
      "market_impact": "Positive near-term outlook with regulatory clarity"
    }
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/tools/analyzeFinancialNews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "symbols": ["BTC", "ETH"],
    "hours": 24
  }'
```

### 3. Market Forecast

AI-powered price predictions based on historical patterns and current conditions.

**Endpoint:** `POST /api/tools/getMarketForecast`

**Parameters:**
```json
{
  "symbol": "BTC",
  "days": 14
}
```

**Parameters Details:**
- `symbol` (string): Asset symbol to forecast
- `days` (number): Forecast horizon in days (default: 7, max: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "BTC",
    "current_price": 42500,
    "forecast_horizon": 14,
    "timestamp": "2024-01-15T10:30:00Z",
    "predictions": [
      {
        "date": "2024-01-16",
        "predicted_price": 43200,
        "confidence": 0.73,
        "range": {
          "low": 41800,
          "high": 44600
        }
      }
    ],
    "ai_analysis": {
      "model": "gpt-4o",
      "summary": "Technical indicators suggest continued upward momentum...",
      "key_drivers": ["Institutional inflows", "Technical breakout"],
      "risk_factors": ["Regulatory uncertainty", "Market volatility"],
      "confidence": 0.81
    },
    "similar_patterns": [
      {
        "pattern_id": "pattern_456",
        "similarity": 0.89,
        "historical_outcome": "15% gain over 2 weeks",
        "timeframe": "Dec 2023"
      }
    ]
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/tools/getMarketForecast \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "symbol": "BTC",
    "days": 7
  }'
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

// With authentication
const ws = new WebSocket('ws://localhost:3001/ws', {
  headers: {
    'Authorization': 'Bearer your_api_key'
  }
});
```

### Subscription Messages

**Subscribe to Price Updates:**
```json
{
  "type": "subscribe",
  "stream": "price_updates",
  "symbol": "BTC",
  "interval": "1m"
}
```

**Subscribe to News Events:**
```json
{
  "type": "subscribe",
  "stream": "news_events",
  "symbols": ["BTC", "ETH"]
}
```

**Subscribe to Analysis Results:**
```json
{
  "type": "subscribe",
  "stream": "analysis_results",
  "symbols": ["BTC"]
}
```

### Response Messages

**Price Update:**
```json
{
  "type": "price_update",
  "symbol": "BTC",
  "price": 42750,
  "change_24h": 3.2,
  "volume_24h": 16200000000,
  "timestamp": "2024-01-15T10:31:00Z"
}
```

**News Event:**
```json
{
  "type": "news_event",
  "symbol": "BTC",
  "headline": "Major Exchange Lists Bitcoin ETF",
  "sentiment": 0.85,
  "impact": "high",
  "timestamp": "2024-01-15T10:31:00Z"
}
```

### JavaScript Example

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = () => {
  // Subscribe to BTC price updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    stream: 'price_updates',
    symbol: 'BTC',
    interval: '1m'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'price_update') {
    console.log(`${data.symbol}: $${data.price} (${data.change_24h}%)`);
  }
};

ws.onclose = () => {
  console.log('WebSocket connection closed');
};
```

## Server-Sent Events (SSE)

### Connection

```javascript
const eventSource = new EventSource('http://localhost:3000/sse');

// With authentication
const eventSource = new EventSource('http://localhost:3000/sse', {
  headers: {
    'Authorization': 'Bearer your_api_key'
  }
});
```

### Event Types

- `market_update` - General market movements
- `alert` - Critical market alerts
- `news` - Breaking financial news
- `analysis_complete` - AI analysis results

### JavaScript Example

```javascript
const eventSource = new EventSource('http://localhost:3000/sse');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Market event:', data);
};

eventSource.addEventListener('alert', (event) => {
  const alert = JSON.parse(event.data);
  console.log('🚨 Market Alert:', alert.message);
});

eventSource.addEventListener('analysis_complete', (event) => {
  const result = JSON.parse(event.data);
  console.log('📊 Analysis Ready:', result.symbol);
});
```

## Error Responses

All APIs return consistent error formats:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SYMBOL",
    "message": "Asset symbol 'INVALID' is not supported",
    "details": {
      "supported_symbols": ["BTC", "ETH", "AAPL"]
    }
  }
}
```

### Common Error Codes

- `INVALID_SYMBOL` - Unsupported asset symbol
- `INVALID_TIMEFRAME` - Invalid time period
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INSUFFICIENT_DATA` - Not enough data for analysis
- `AI_MODEL_ERROR` - AI service unavailable
- `AUTHENTICATION_FAILED` - Invalid API key

## Rate Limits

- **HTTP API**: 60 requests/minute per IP
- **WebSocket**: 100 messages/minute per connection
- **SSE**: Unlimited (server-controlled)

Rate limit headers are included in HTTP responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1642248600
```

## Integration Examples

### n8n Workflow

Use the HTTP Request node:

1. **Method**: POST
2. **URL**: `http://localhost:3000/api/tools/getSmartMarketPulse`
3. **Headers**:
   ```json
   {
     "Content-Type": "application/json",
     "Authorization": "Bearer {{ $secrets.MCP_ORACLE_API_KEY }}"
   }
   ```
4. **Body**:
   ```json
   {
     "assets": ["{{ $json.symbol }}"],
     "timeframe": "last_24_hours",
     "analysis_depth": "standard"
   }
   ```

### Claude Code MCP

Add to your MCP settings:

```json
{
  "mcpServers": {
    "mcp-oracle": {
      "command": "/path/to/mcp-oracle/build/index.js",
      "args": ["--stdio"]
    }
  }
}
```

Then use tools directly in Claude Code:

```
Please analyze BTC and ETH market conditions for the last 24 hours using comprehensive analysis depth.
```

### Python Integration

```python
import requests
import json

# HTTP API Example
url = "http://localhost:3000/api/tools/getSmartMarketPulse"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer your_api_key"
}
data = {
    "assets": ["BTC", "ETH"],
    "timeframe": "last_24_hours",
    "analysis_depth": "standard"
}

response = requests.post(url, headers=headers, json=data)
result = response.json()

if result["success"]:
    for asset in result["data"]["assets"]:
        print(f"{asset['symbol']}: ${asset['current_price']}")
else:
    print(f"Error: {result['error']['message']}")
```

### Node.js Integration

```javascript
import WebSocket from 'ws';

// WebSocket streaming example
const ws = new WebSocket('ws://localhost:3001/ws', {
  headers: {
    'Authorization': 'Bearer your_api_key'
  }
});

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    stream: 'price_updates',
    symbol: 'BTC'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Price update:', message);
});
```

## Health Check

Check server status:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.2.0",
  "services": {
    "ai_models": "operational",
    "memory_layer": "operational",
    "data_sources": "operational"
  }
}
```

## Support

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/yourusername/mcp-oracle/issues)
- **Documentation**: [Full project docs](../README.md)
- **API Status**: Check `/health` endpoint for real-time status