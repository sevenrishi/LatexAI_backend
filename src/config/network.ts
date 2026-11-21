import dns from 'node:dns'
import { Agent, setGlobalDispatcher } from 'undici'

// 1. Force Node's built-in DNS module to prioritize IPv4
try {
  dns.setDefaultResultOrder('ipv4first')
} catch {}

// 2. Configure undici's global dispatcher to strictly resolve IPv4 addresses
// This eliminates the ~7000ms IPv6 connect timeout on cloud container platforms (e.g. Render)
try {
  const agent = new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4 }, callback)
      },
    },
  })
  setGlobalDispatcher(agent)
} catch {}
