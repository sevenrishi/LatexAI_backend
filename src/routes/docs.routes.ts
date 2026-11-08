import { Router, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const docsRouter = Router()

const openapiPath = path.resolve(__dirname, '../docs/openapi.json')
let openapiSpecCache: unknown = null

function getOpenApiSpec(): unknown {
  if (!openapiSpecCache) {
    if (fs.existsSync(openapiPath)) {
      const content = fs.readFileSync(openapiPath, 'utf8')
      openapiSpecCache = JSON.parse(content)
    } else {
      openapiSpecCache = {
        openapi: '3.1.0',
        info: { title: 'LatexAI API', version: '1.0.0' },
        paths: {},
      }
    }
  }
  return openapiSpecCache
}

/**
 * GET /docs/openapi.json
 * Raw OpenAPI 3.1 specification (BE-7.05).
 */
docsRouter.get('/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json')
  res.status(200).send(getOpenApiSpec())
})

/**
 * GET /docs
 * Clean interactive documentation explorer.
 */
docsRouter.get('/', (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>LatexAI Backend API Documentation (OpenAPI 3.1)</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background-color: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; }
    .topbar { display: none !important; }
    .swagger-ui { filter: invert(88%) hue-rotate(180deg); padding-bottom: 40px; }
    .swagger-ui .info h2 { color: #0284c7; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: window.location.pathname.replace(/\\/?$/, '') + '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`
  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(html)
})
