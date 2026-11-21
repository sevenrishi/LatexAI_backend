import dns from 'node:dns'
import { Agent, setGlobalDispatcher, fetch as undiciFetch } from 'undici'

// 1. Force Node's built-in DNS module to prioritize IPv4
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // Ignore in environments where setting DNS order is unsupported
}

// 2. Configure undici's agent to strictly resolve IPv4 addresses via direct DNS A-record queries (resolve4)
// This completely bypasses glibc getaddrinfo IPv6 dual-stack delays on container hosts (e.g. Render)
export const ipv4Agent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.resolve4(hostname, (err, addresses) => {
        const undiciCallback = callback as (
          lookupErr: NodeJS.ErrnoException | null,
          resOrAddress: unknown,
          family?: number
        ) => void
        if (err || !addresses || addresses.length === 0) {
          return dns.lookup(hostname, { ...options, family: 4 }, undiciCallback as never)
        }
        const isAll =
          typeof options === 'object' &&
          options !== null &&
          'all' in options &&
          Boolean((options as { all?: boolean }).all)
        if (isAll) {
          const result = addresses.map((addr) => ({ address: addr, family: 4 }))
          return undiciCallback(null, result)
        }
        return undiciCallback(null, addresses[0], 4)
      })
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
