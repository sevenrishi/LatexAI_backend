import dns from 'node:dns'
import { Agent, setGlobalDispatcher, fetch as undiciFetch } from 'undici'

// 1. Force Node's built-in DNS module to prioritize IPv4
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Ignore in environments where setting DNS order is unsupported
}

// 2. Configure undici's agent to strictly resolve IPv4 addresses
// This eliminates the ~7000ms IPv6 connect timeout on cloud container platforms (e.g. Render)
export const ipv4Agent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback)
    },
  },
})

try {
  setGlobalDispatcher(ipv4Agent)
} catch {
  // Ignore in environments where custom dispatcher is unsupported
}

// 3. Dedicated IPv4 fetch wrapper for clients that accept custom fetch
export const ipv4Fetch = (
  input: string | URL | Request,
  init?: Record<string, unknown>
): Promise<Response> => {
  const fetchFn = undiciFetch as unknown as (url: unknown, options?: unknown) => Promise<Response>
  return fetchFn(input, {
    ...init,
    dispatcher: ipv4Agent,
  })
}
