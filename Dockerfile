# Multi-stage build for optimal image size
# MCP Oracle v1.2.0 - Security hardened with 372+ lines of dead code removed
FROM node:22-alpine AS builder

# Update system, install npm and build dependencies
RUN apk update && apk upgrade && \
    npm install -g npm@latest && \
    apk add --no-cache g++=12.2.1_git20220924-r10 make=4.3-r1 python3=3.11.10-r0

# Set working directory
WORKDIR /app

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
FROM node:22-alpine AS production

# Update system, install npm, create user and runtime dependencies
RUN apk update && apk upgrade && \
    npm install -g npm@latest && \
    addgroup -g 1001 -S nodejs && \
    adduser -S mcp-oracle -u 1001 && \
    apk add --no-cache curl=8.5.0-r0

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Copy health check script
COPY healthcheck.js ./

# Create necessary directories
RUN mkdir -p logs data && \
    chown -R mcp-oracle:nodejs /app

# Switch to non-root user
USER mcp-oracle

# Expose ports for MCP Oracle
EXPOSE 4006 4007

# Health check using Node.js script
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

# Default command with updated ports
CMD ["node", "build/index.js", "--http", "--ws", "--sse"]