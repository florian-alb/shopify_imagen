"use node"

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { request } from "node:https"
import puppeteer from "puppeteer-core"

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
export async function fetchPublic(
  value: string,
  redirects = 0,
): Promise<string> {
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
    return fetchPublic(new URL(result.location, url).href, redirects + 1)
  if (result.status < 200 || result.status >= 300) {
    const retry = result.retry
      ? Number.isFinite(Number(result.retry))
        ? Number(result.retry) * 1000
        : Date.parse(result.retry) - Date.now()
      : 0
    throw new CollectionHttpError(
      `Le site répond HTTP ${result.status}.`,
      result.status,
      Math.max(0, retry),
    )
  }
  if (/cf-chl-|verify you are human|captcha challenge/i.test(result.body))
    throw new CollectionHttpError(
      "Le site demande une vérification humaine. Collecte interrompue.",
      403,
    )
  return result.body
}

export async function renderedHtml(url: string) {
  await validateRemoteUrl(url)
  const endpoint = process.env.CATALOG_BROWSERLESS_URL
  const token = process.env.CATALOG_BROWSERLESS_TOKEN
  if (!endpoint || !token)
    throw new Error("Configurez Browserless pour lire ce thème dynamique.")
  const connection = new URL(endpoint)
  if (
    connection.protocol !== "wss:" ||
    !connection.hostname.endsWith(".browserless.io")
  )
    throw new Error(
      "Le navigateur distant doit utiliser un endpoint wss://…browserless.io.",
    )
  connection.searchParams.set("token", token)
  const browser = await puppeteer.connect({
    browserWSEndpoint: connection.href,
  })
  try {
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      if (["image", "font", "media"].includes(req.resourceType())) {
        void req.abort()
        return
      }
      // Proxy textual subresources through the same DNS-pinned transport as the collector.
      // This prevents the remote browser from doing an unvalidated second DNS lookup.
      if (req.method() !== "GET") {
        void req.abort()
        return
      }
      const contentType =
        (
          {
            script: "application/javascript",
            stylesheet: "text/css",
            document: "text/html",
            xhr: "application/json",
            fetch: "application/json",
          } as Record<string, string>
        )[req.resourceType()] ?? "text/plain"
      void fetchPublic(req.url())
        .then((body) =>
          req.respond({
            status: 200,
            contentType,
            headers: { "Access-Control-Allow-Origin": "*" },
            body,
          }),
        )
        .catch(() => req.abort().catch(() => {}))
    })
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 })
    const html = await page.content()
    if (Buffer.byteLength(html) > MAX_BYTES)
      throw new Error("Page rendue trop volumineuse.")
    if (/cf-chl-|verify you are human/i.test(html))
      throw new Error("Vérification humaine requise par le site.")
    return html
  } finally {
    await browser.close()
  }
}
