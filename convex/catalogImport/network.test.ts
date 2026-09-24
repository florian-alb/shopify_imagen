// @vitest-environment node
import { EventEmitter } from "node:events"
import type { LookupFunction } from "node:net"
import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }))
vi.mock("node:https", () => ({ request: mocks.request }))
import { fetchPublic } from "./network"

beforeEach(() => {
  mocks.lookup.mockReset()
  mocks.request.mockReset()
})

test.each([
  [true, "/collections/rabbit", "text/html"],
  [false, "/collections/rabbit?page=2", "text/html"],
  [true, "/products/rabbit.json", "application/json"],
  [false, "/sitemap.xml", "application/xml"],
] as const)(
  "pinned DNS all=%s negotiates the correct format for %s",
  async (all, path, accept) => {
    const address = { address: "23.227.38.65", family: 4 }
    mocks.lookup.mockResolvedValue([address])
    mocks.request.mockImplementation(
      (
        _url,
        options: { lookup: LookupFunction; headers: { Accept: string } },
        receive,
      ) => {
        expect(options.headers.Accept.split(",")[0]).toBe(accept)
        const req = new EventEmitter() as EventEmitter & {
          end: () => void
          destroy: () => void
        }
        req.destroy = () => {
          req.emit("close")
        }
        req.end = () => {
          options.lookup("source.example", { all }, (error, result, family) => {
            expect(error).toBeNull()
            if (all) {
              expect(result).toEqual([address])
              expect(family).toBeUndefined()
            } else {
              expect(result).toBe(address.address)
              expect(family).toBe(address.family)
            }
            const response = Object.assign(new EventEmitter(), {
              statusCode: 200,
              headers: {},
            })
            receive(response)
            response.emit("data", Buffer.from("<html>catalogue</html>"))
            response.emit("end")
            req.emit("close")
          })
        }
        return req
      },
    )
    await expect(fetchPublic(`https://source.example${path}`)).resolves.toBe(
      "<html>catalogue</html>",
    )
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  },
)

test("private DNS answers remain rejected before opening a connection", async () => {
  mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }])
  await expect(fetchPublic("https://source.example")).rejects.toThrow(
    "Adresse privée",
  )
  expect(mocks.request).not.toHaveBeenCalled()
})
