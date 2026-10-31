import { describe, expect, it } from "vitest";
import { parseApiJson, userFacingFetchError } from "@/lib/fetch-error";

describe("userFacingFetchError", () => {
  it("maps Failed to fetch to a retry message without blaming the internet", () => {
    const message = userFacingFetchError(new TypeError("Failed to fetch"), "fallback");
    expect(message).toMatch(/try again/i);
    expect(message).not.toMatch(/internet|connection/i);
  });

  it("maps an aborted request to a timeout message", () => {
    const err = new DOMException("The operation was aborted.", "AbortError");
    expect(userFacingFetchError(err, "fallback")).toMatch(/timed out/i);
  });

  it("keeps a normal Error message", () => {
    expect(userFacingFetchError(new Error("File is empty"), "fallback")).toBe("File is empty");
  });

  it("uses the fallback for unknown values", () => {
    expect(userFacingFetchError(null, "Could not capture this requirement")).toBe(
      "Could not capture this requirement"
    );
  });
});

describe("parseApiJson", () => {
  it("throws a refresh message when the API returns an HTML 404 page", async () => {
    const res = new Response("<html>404</html>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    await expect(parseApiJson(res, "Parse failed")).rejects.toThrow(/refresh the page/i);
  });

  it("returns JSON when the response is application/json", async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(parseApiJson<{ ok: boolean }>(res, "fail")).resolves.toEqual({ ok: true });
  });
});
