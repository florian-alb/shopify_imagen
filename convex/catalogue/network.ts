"use node"

import { AsyncLocalStorage } from "node:async_hooks"
const collectionConcurrency = () => 4
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { request } from "node:https"

const MAX_BYTES = 12 * 1024 * 1024
export class CollectionHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs = 0,
  ) {
    super(message)
  }
}
export function publicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number)
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  // Accept global-unicast IPv6 only; reject mapped IPv4 and local/special ranges.
  return (
    isIP(ip) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(ip) &&
    !/^2001:(?:db8|0|10|20):/i.test(ip)
  )
}
export async function validateRemoteUrl(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Adresse distante non autorisée.")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true })
  if (!addresses.length || addresses.some((a) => !publicIp(a.address)))
    throw new Error("Adresse privée ou réservée refusée.")
  return { url, address: addresses[0] }
}
async function fetchPublicImpl(value: string, redirects = 0): Promise<string> {
  if (redirects > 5) throw new Error("Trop de redirections.")
  const { url, address } = await validateRemoteUrl(value)
  const result = await new Promise<{
    status: number
    location?: string
    retry?: string
    body: string
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "ImagenCatalog/1.0",
          Accept: /\.json$/i.test(url.pathname)
            ? "application/json"
            : /\.xml$/i.test(url.pathname)
              ? "application/xml,text/xml;q=0.9"
              : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "identity",
        },
        // Pin the validated address; a second DNS lookup must not permit rebinding.
        lookup: (_host, options, cb) => {
          // Node's automatic family selection requests the all-addresses overload.
          if (options.all) cb(null, [address])
          else cb(null, address.address, address.family)
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let bytes = 0
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > MAX_BYTES) {
            req.destroy(new Error("Réponse supérieure à 12 Mo."))
            return
          }
          chunks.push(chunk)
        })
        res.on("error", reject)
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 500,
            location: res.headers.location,
            retry: res.headers["retry-after"] as string | undefined,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        )
      },
    )
    const timeout = setTimeout(
      () => req.destroy(new Error("Délai réseau dépassé (30 s).")),
      30_000,
    )
    req.on("close", () => clearTimeout(timeout))
    req.on("error", reject)
    req.end()
  })
  if ([301, 302, 303, 307, 308].includes(result.status) && result.location)
    return fetchPublicImpl(new URL(result.location, url).href, redirects + 1)
  if (result.status < 200 || result.status >= 300) {
    const retry = result.retry
      ? Number.isFinite(Number(result.retry))
        ? Number(result.retry) * 1000
        : Date.parse(result.retry) - Date.now()
      : 0
    throw new CollectionHttpError(
      `Le site répond HTTP ${result.status}.`,
      result.status,
      Number.isFinite(retry) ? Math.max(0, retry) : 0,
    )
  }
  if (/cf-chl-|verify you are human|captcha challenge/i.test(result.body))
    throw new CollectionHttpError(
      "Le site demande une vérification humaine. Collecte interrompue.",
      403,
    )
  return result.body
}

type DomainBudget = {
  active: number
  nextAt: number
  stopped?: unknown
  queue: Array<() => void>
}
type SourceBudget = {
  domains: Map<string, DomainBudget>
  limit: number
  delayMs: number
  failure?: CollectionHttpError
}
const sourceBudgets = new AsyncLocalStorage<SourceBudget>()
export function withSourceBudget<T>(
  run: () => Promise<T>,
  limit = collectionConcurrency(),
  delayMs = 450,
) {
  const context: SourceBudget = { domains: new Map(), limit, delayMs }
  return sourceBudgets.run(context, async () => {
    try {
      const result = await run()
      if (context.failure) throw context.failure
      return result
    } catch (error) {
      // Concurrent requests are drained by the caller. A later storage/network
      // error must not hide an earlier 403 or a longer Retry-After.
      throw context.failure ?? error
    }
  })
}
export async function fetchPublic(
  value: string,
  redirects = 0,
): Promise<string> {
  const context = sourceBudgets.getStore()
  if (!context) return fetchPublicImpl(value, redirects)
  const domain = new URL(value).hostname.replace(/^www\./, "")
  const map = context.domains
  let budget = map.get(domain)
  if (!budget) {
    budget = { active: 0, nextAt: 0, queue: [] }
    map.set(domain, budget)
  }
  const limit = context.limit
  if (budget.active >= limit)
    await new Promise<void>((resolve) => budget!.queue.push(resolve))
  else budget.active++
  try {
    if (budget.stopped) throw budget.stopped
    const now = Date.now()
    const delay = Math.max(0, budget.nextAt - now)
    budget.nextAt = Math.max(now, budget.nextAt) + context.delayMs
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    if (budget.stopped) throw budget.stopped
    return await fetchPublicImpl(value, redirects)
  } catch (error) {
    if (
      error instanceof CollectionHttpError &&
      [403, 429, 503].includes(error.status)
    ) {
      const previous = context.failure
      if (
        !previous ||
        (error.status === 403 && previous.status !== 403) ||
        (previous.status !== 403 && error.retryAfterMs > previous.retryAfterMs)
      )
        context.failure = error
      budget.stopped = context.failure
    }
    throw error
  } finally {
    const next = budget.queue.shift()
    if (next) next()
    else budget.active--
  }
}
