import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("server config", () => {
  it("trusts no dev origins unless started in dev mode", () => {
    expect(loadConfig({}, []).devOrigins).toEqual([]);
    expect(loadConfig({}, ["--dev"]).devOrigins).toEqual(["http://localhost:5173"]);
  });

  it("lets NO_FOMO_DEV_ORIGINS override both", () => {
    expect(loadConfig({ NO_FOMO_DEV_ORIGINS: "http://localhost:3000" }, []).devOrigins).toEqual(["http://localhost:3000"]);
    expect(loadConfig({ NO_FOMO_DEV_ORIGINS: "http://localhost:3000" }, ["--dev"]).devOrigins).toEqual(["http://localhost:3000"]);
  });
});
