import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'authorization',
      'password',
      'newPassword',
      'currentPassword',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      'body.password',
      'body.newPassword',
      'body.currentPassword',
      'token',
      'jwt',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
})
