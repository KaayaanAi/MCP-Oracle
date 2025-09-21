# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-09-21

### 🔒 Security
- **BREAKING**: Removed snoowrap dependency due to 5 critical security vulnerabilities
- Enhanced input validation and request sanitization
- Improved error handling to prevent information leakage
- Added comprehensive type guards throughout codebase

### 🧹 Performance & Cleanup
- **Major cleanup**: Removed 372+ lines of dead code and 8 unused methods from mcp-server.ts
- Removed 4 unused dependencies (rate-limiter, node-cron, etc.)
- Optimized imports and code organization
- Enhanced TypeScript strict mode compliance
- Improved memory usage and response times

### 🤖 AI Model Updates
- Updated AI model configurations to match latest specifications:
  - Groq: `openai/gpt-oss-120b` for quick analysis
  - OpenAI: `gpt-5-nano` for standard analysis
  - OpenAI: `gpt-4o` for comprehensive analysis
- Removed deprecated Anthropic API references
- Cleaned up 2-model system documentation

### 🛡️ Code Quality
- Added comprehensive type guards in `src/utils/type-guards.ts`
- Enhanced error handling throughout the application
- Improved TypeScript strict mode compliance
- Better code organization and import structure

### 📦 Dependencies
- Updated to latest stable versions of core dependencies
- Removed unused packages to reduce attack surface
- Enhanced package.json metadata and descriptions

### 📚 Documentation
- Updated README.md with latest security and performance improvements
- Enhanced API documentation with corrected model names
- Added security hardening badges and information
- Updated TypeScript version badges to 5.9.2

## [1.1.0] - 2025-09-15

### Added
- Complete MCP Protocol compliance (initialize, resources, prompts methods)
- Enhanced security with rate limiting and input validation
- Docker optimization with Node 22-alpine and health checks
- Comprehensive test suite for protocol, performance, and security validation
- JSON-RPC 2.0 strict compliance with proper error codes

### Changed
- Upgraded to Node.js 20+ with latest dependencies
- Enhanced MongoDB memory layer integration
- Improved Redis caching with Docker networking
- Better error handling and data validation

### Fixed
- [object Object] serialization issues
- INSUFFICIENT_DATA errors in market analysis
- Performance bottlenecks in data processing

## [1.0.0] - 2025-09-01

### Added
- Initial release of MCP Oracle
- Multi-protocol architecture (STDIO, HTTP, WebSocket, SSE)
- AI-powered analysis engine with multiple model support
- Financial intelligence tools (Market Pulse, News Analysis, Forecasting)
- MongoDB and Redis integration for memory and caching
- Docker containerization with docker-compose setup
- n8n and Claude Code integration support

### Features
- Real-time market data integration
- Advanced pattern recognition and historical analysis
- Comprehensive API documentation
- Production-ready architecture with security hardening

---

## Legend

- 🔒 **Security** - Security-related changes
- 🧹 **Performance** - Performance improvements and optimizations
- 🤖 **AI/Models** - AI model and intelligence updates
- 🛡️ **Code Quality** - Code quality and maintainability improvements
- 📦 **Dependencies** - Dependency updates and management
- 📚 **Documentation** - Documentation updates and improvements
- ⚡ **Features** - New features and functionality
- 🐛 **Bug Fixes** - Bug fixes and issue resolutions
- 💥 **Breaking Changes** - Breaking changes that affect compatibility