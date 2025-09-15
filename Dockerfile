# Multi-stage build for optimal image size
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies including devDependencies for TypeScript build
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp-oracle -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Create necessary directories
RUN mkdir -p logs data && \
    chown -R mcp-oracle:nodejs /app

# Switch to non-root user
USER mcp-oracle

# Expose ports for MCP Oracle
EXPOSE 4006 4007

# Health check on correct port
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4006/health || exit 1

# Default command with updated ports
CMD ["node", "build/index.js", "--http", "--ws", "--sse"]