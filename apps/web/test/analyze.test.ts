import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../app/lib/api";

const analyze = vi.fn();
const refresh = vi.fn();
vi.mock("../app/lib/api", async (orig) => ({ ...(await orig<typeof import("../app/lib/api")>()), api: { analyze: (...a: unknown[]) => analyze(...a) } }));
vi.mock("../app/lib/extension", async (orig) => ({
  ...(await orig<typeof import("../app/lib/extension")>()),
  refreshExtensionMedia: (...a: unknown[]) => refresh(...a),
}));
const { startAnalysis } = await import("../app/lib/analyze");

const CHOICE = { reportModel: "m", transcribeModel: "t", language: "English" };
const media = { id: "1", kind: "image", parts: [], expiresAt: null };

beforeEach(() => {
  analyze.mockReset();
  refresh.mockReset();
});

describe("startAnalysis", () => {
  it("starts right away for a stored post with fresh links", async () => {
    analyze.mockResolvedValueOnce({});
    expect(await startAnalysis("1", "ext", CHOICE)).toEqual({ ok: true });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stores a post seen on an account page first, then starts", async () => {
    analyze.mockRejectedValueOnce(new ApiError(404, "Post 1 is not in your library")).mockResolvedValueOnce({});
    refresh.mockResolvedValueOnce({ ok: true, media });
    expect(await startAnalysis("1", "ext", CHOICE)).toEqual({ ok: true, media });
    expect(refresh).toHaveBeenCalledWith("ext", "1", true);
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("renews old links of a stored post and starts", async () => {
    analyze.mockRejectedValueOnce(new ApiError(409, "links_expired")).mockResolvedValueOnce({});
    refresh.mockResolvedValueOnce({ ok: true, media });
    expect(await startAnalysis("1", "ext", CHOICE)).toEqual({ ok: true, media });
    expect(refresh).toHaveBeenCalledWith("ext", "1", true);
  });

  it("passes other errors through", async () => {
    analyze.mockRejectedValueOnce(new ApiError(409, "no_key"));
    expect(await startAnalysis("1", "ext", CHOICE)).toEqual({ ok: false, error: "no_key" });
  });
});
