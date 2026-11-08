import type { Request, Response, NextFunction } from 'express'
import { getQueueStatus } from '../services/generationQueue.js'
import { logger } from './logger.js'

export interface AlertNotification {
  id: string
  severity: 'warning' | 'critical'
  metric: string
  message: string
  value: number
  threshold: number
  timestamp: string
}

class MetricsRegistry {
  private totalRequests = 0
  private status2xx = 0
  private status4xx = 0
  private status5xx = 0
  private latencies: number[] = []
  private maxLatenciesRecorded = 500

  recordRequest(statusCode: number, latencyMs: number): void {
    this.totalRequests++
    if (statusCode >= 200 && statusCode < 300) this.status2xx++
    else if (statusCode >= 400 && statusCode < 500) this.status4xx++
    else if (statusCode >= 500) this.status5xx++

    this.latencies.push(latencyMs)
    if (this.latencies.length > this.maxLatenciesRecorded) {
      this.latencies.shift()
    }
  }

  getSnapshot(): {
    totalRequests: number
    status2xx: number
    status4xx: number
    status5xx: number
    errorRatePercent: number
    averageLatencyMs: number
    p95LatencyMs: number
    queue: ReturnType<typeof getQueueStatus>
  } {
    const queue = getQueueStatus()
    const errorRatePercent =
      this.totalRequests > 0
        ? Math.round((this.status5xx / this.totalRequests) * 10000) / 100
        : 0

    let averageLatencyMs = 0
    let p95LatencyMs = 0

    if (this.latencies.length > 0) {
      const sum = this.latencies.reduce((acc, l) => acc + l, 0)
      averageLatencyMs = Math.round(sum / this.latencies.length)

      const sorted = [...this.latencies].sort((a, b) => a - b)
      const p95Idx = Math.floor(sorted.length * 0.95)
      p95LatencyMs = sorted[p95Idx] ?? sorted[sorted.length - 1] ?? 0
    }

    return {
      totalRequests: this.totalRequests,
      status2xx: this.status2xx,
      status4xx: this.status4xx,
      status5xx: this.status5xx,
      errorRatePercent,
      averageLatencyMs,
      p95LatencyMs,
      queue,
    }
  }

  evaluateAlerts(): AlertNotification[] {
    const snapshot = this.getSnapshot()
    const alerts: AlertNotification[] = []
    const now = new Date().toISOString()

    // 1. Error Rate Alert: > 5% 5xx errors if at least 20 requests
    if (snapshot.totalRequests >= 20 && snapshot.errorRatePercent > 5) {
      const alert: AlertNotification = {
        id: 'alert_error_rate_high',
        severity: snapshot.errorRatePercent > 15 ? 'critical' : 'warning',
        metric: 'errorRatePercent',
        message: `High 5xx error rate detected: ${snapshot.errorRatePercent}% (threshold: 5%)`,
        value: snapshot.errorRatePercent,
        threshold: 5,
        timestamp: now,
      }
      alerts.push(alert)
      logger.warn({ alert }, 'Monitoring Alert: High error rate detected')
    }

    // 2. Generation Queue Backlog Alert: queue size + pending > 20
    const queueDepth = snapshot.queue.size + snapshot.queue.pending
    if (queueDepth > 20) {
      const alert: AlertNotification = {
        id: 'alert_queue_depth_high',
        severity: queueDepth > 50 ? 'critical' : 'warning',
        metric: 'queueDepth',
        message: `Generation queue depth is high: ${queueDepth} jobs waiting (threshold: 20)`,
        value: queueDepth,
        threshold: 20,
        timestamp: now,
      }
      alerts.push(alert)
      logger.warn({ alert }, 'Monitoring Alert: Generation queue depth high')
    }

    return alerts
  }

  reset(): void {
    this.totalRequests = 0
    this.status2xx = 0
    this.status4xx = 0
    this.status5xx = 0
    this.latencies = []
  }
}

export const metricsRegistry = new MetricsRegistry()

/**
 * Express middleware to record request metrics and response times.
 */
export function metricsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()

  res.on('finish', () => {
    const latency = Date.now() - start
    metricsRegistry.recordRequest(res.statusCode, latency)
  })

  next()
}
