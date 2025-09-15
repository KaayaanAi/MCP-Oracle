import winston from 'winston';

// Shared logger configuration for all services
export const createLogger = (serviceName: string): winston.Logger => {
  const transports: winston.transport[] = [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ];

  // Add console logging in development or when not using STDIO
  if (process.env.NODE_ENV !== 'production' || !process.env.MCP_STDIO_MODE) {
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
      })
    ),
    defaultMeta: { service: serviceName },
    transports
  });
};

// Pre-configured loggers for each service
export const loggers = {
  coingecko: createLogger('coingecko'),
  cache: createLogger('cache'),
  mongodb: createLogger('mongodb'),
  reddit: createLogger('reddit'),
  alphavantage: createLogger('alphavantage'),
  newsapi: createLogger('newsapi'),
  cryptopanic: createLogger('cryptopanic'),
  ai: createLogger('ai'),
  news: createLogger('news'),
  technical: createLogger('technical'),
};