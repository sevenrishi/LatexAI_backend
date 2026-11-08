/**
 * Official TypeScript Client SDK Bindings for LatexAI Backend API.
 * Complies with task BE-7.05.
 */

export interface LatexAiClientConfig {
  baseUrl: string
  token?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export class LatexAiClient {
  private baseUrl: string
  private token?: string

  constructor(config: LatexAiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.token = config.token
  }

  setToken(token: string | undefined): void {
    this.token = token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }

    if (this.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, { ...options, headers })
    return (await response.json()) as ApiResponse<T>
  }

  // Auth Group
  readonly auth = {
    signup: (body: { email: string; password: string; fullName?: string }) =>
      this.request('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

    login: (body: { email: string; password: string }) =>
      this.request<{ token: string; user: unknown }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getMe: () => this.request('/api/v1/auth/me', { method: 'GET' }),

    exportData: () => this.request('/api/v1/auth/export', { method: 'GET' }),

    deleteAccount: () => this.request('/api/v1/auth/account', { method: 'DELETE' }),
  }

  // Profile Group
  readonly profile = {
    get: () => this.request('/api/v1/profile', { method: 'GET' }),

    updateRoot: (body: Record<string, unknown>) =>
      this.request('/api/v1/profile', { method: 'PATCH', body: JSON.stringify(body) }),

    createSectionItem: (section: string, item: unknown) =>
      this.request(`/api/v1/profile/${section}`, {
        method: 'POST',
        body: JSON.stringify(item),
      }),

    deleteSectionItem: (section: string, id: string) =>
      this.request(`/api/v1/profile/${section}/${id}`, { method: 'DELETE' }),
  }

  // Jobs Group
  readonly jobs = {
    fetch: (url: string) =>
      this.request('/api/v1/jobs/fetch', { method: 'POST', body: JSON.stringify({ url }) }),

    extract: (body: { rawText: string; jobTitle?: string; company?: string }) =>
      this.request('/api/v1/jobs/extract', { method: 'POST', body: JSON.stringify(body) }),
  }

  // Generation Group
  readonly generate = {
    create: (body: {
      jobDescription?: string
      jobText?: string
      jobTitle?: string
      companyName?: string
      jobUrl?: string
      templateId?: string
      targetPageCount?: number
      sourceGenerationId?: string
    }) => this.request('/api/v1/generate', { method: 'POST', body: JSON.stringify(body) }),

    getStatus: (id: string) =>
      this.request(`/api/v1/generate/${id}/status`, { method: 'GET' }),

    getDetail: (id: string) => this.request(`/api/v1/generate/${id}`, { method: 'GET' }),

    getAtsScore: (id: string) =>
      this.request(`/api/v1/generate/${id}/ats-score`, { method: 'GET' }),

    cancel: (id: string) =>
      this.request(`/api/v1/generate/${id}/cancel`, { method: 'POST' }),

    retry: (id: string) =>
      this.request(`/api/v1/generate/${id}/retry`, { method: 'POST' }),

    rerender: (id: string, body?: { templateId?: string }) =>
      this.request(`/api/v1/generate/${id}/rerender`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),
  }

  // Resumes Group (Phase J)
  readonly resumes = {
    list: (params?: {
      cursor?: string
      limit?: number
      search?: string
      status?: string
      templateId?: string
    }) => {
      const query = new URLSearchParams()
      if (params?.cursor) query.set('cursor', params.cursor)
      if (params?.limit) query.set('limit', String(params.limit))
      if (params?.search) query.set('search', params.search)
      if (params?.status) query.set('status', params.status)
      if (params?.templateId) query.set('templateId', params.templateId)
      const qs = query.toString() ? `?${query.toString()}` : ''
      return this.request(`/api/v1/resumes${qs}`, { method: 'GET' })
    },

    get: (id: string) => this.request(`/api/v1/resumes/${id}`, { method: 'GET' }),

    delete: (id: string) => this.request(`/api/v1/resumes/${id}`, { method: 'DELETE' }),

    getDownloadUrl: (id: string, options?: { format?: 'pdf' | 'tex'; expiresIn?: number }) => {
      const query = new URLSearchParams()
      if (options?.format) query.set('format', options.format)
      if (options?.expiresIn) query.set('expiresIn', String(options.expiresIn))
      const qs = query.toString() ? `?${query.toString()}` : ''
      return this.request(`/api/v1/resumes/${id}/download${qs}`, { method: 'GET' })
    },

    reuse: (
      id: string,
      options?: {
        templateId?: string
        targetPageCount?: number
        jobDescription?: string
      }
    ) =>
      this.request(`/api/v1/resumes/${id}/reuse`, {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }),
  }

  // Dashboard Group (Phase J)
  readonly dashboard = {
    getSummary: () => this.request('/api/v1/dashboard/summary', { method: 'GET' }),
  }

  // PDF Audit Group
  readonly pdf = {
    inspectBase64: (pdfBase64: string, jobDescription?: string) =>
      this.request('/api/v1/pdf/inspect', {
        method: 'POST',
        body: JSON.stringify({ pdfBase64, jobDescription }),
      }),
  }

  // Health and Telemetry Group
  readonly health = {
    checkLiveness: () => this.request('/health', { method: 'GET' }),
    checkReadiness: () => this.request('/health/ready', { method: 'GET' }),
    getMetrics: () => this.request('/metrics', { method: 'GET' }),
  }
}
