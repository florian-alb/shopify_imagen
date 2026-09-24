// @vitest-environment node
import { beforeEach, afterEach, expect, test, vi } from "vitest"
const mock = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>()
  return {
    ...actual,
    S3Client: class {
      send = mock.send
    },
  }
})
import { putJson, withCatalogWrites } from "./storage"
beforeEach(() => {
  mock.send.mockReset()
  for (const [key, value] of Object.entries({
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    CATALOG_R2_BUCKET: "private",
    R2_BUCKET: "public",
  }))
    vi.stubEnv(key, value)
})
afterEach(() => vi.unstubAllEnvs())
test("an old generation cannot replace a newer materialized object", async () => {
  mock.send.mockResolvedValue({ Metadata: { generation: "8" }, ETag: "new" })
  await expect(
    withCatalogWrites("root", 7, () =>
      putJson("root/products/a.json", { title: "stale" }),
    ),
  ).rejects.toThrow("plus récente")
  expect(mock.send).toHaveBeenCalledTimes(1)
})
test("CAS protects updates and includes the generation in both metadata and ETag content", async () => {
  mock.send
    .mockResolvedValueOnce({ Metadata: { generation: "7" }, ETag: "old" })
    .mockResolvedValueOnce({})
  await withCatalogWrites("root", 8, () =>
    putJson("root/products/a.json", { title: "new" }),
  )
  const command = mock.send.mock.calls[1][0]
  expect(command.input).toMatchObject({
    IfMatch: "old",
    Metadata: { generation: "8" },
  })
  expect(JSON.parse(command.input.Body)).toEqual({ title: "new" })
  expect(command.input.Body).not.toBe(JSON.stringify({ title: "new" }))
})
test("initial writes require absence, and worker paths cannot escape their operation", async () => {
  mock.send
    .mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "NotFound" }),
    )
    .mockResolvedValueOnce({})
  await withCatalogWrites("root", 1, () => putJson("root/new.json", {}))
  expect(mock.send.mock.calls[1][0].input.IfNoneMatch).toBe("*")
  await expect(
    withCatalogWrites("root", 1, () => putJson("other/new.json", {})),
  ).rejects.toThrow("hors")
})
