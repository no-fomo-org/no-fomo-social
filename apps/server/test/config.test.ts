import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("server config", () => {
  it("trusts no dev origins unless started in dev mode", () => {
    expect(loadConfig({}, []).devOrigins).toEqual([]);
    expect(loadConfig({}, ["--dev"]).devOrigins).toEqual(["http://localhost:5173"]);
  });

  it("lets NO_FOMO_SOCIAL_DEV_ORIGINS override both", () => {
    expect(loadConfig({ NO_FOMO_SOCIAL_DEV_ORIGINS: "http://localhost:3000" }, []).devOrigins).toEqual(["http://localhost:3000"]);
    expect(loadConfig({ NO_FOMO_SOCIAL_DEV_ORIGINS: "http://localhost:3000" }, ["--dev"]).devOrigins).toEqual(["http://localhost:3000"]);
  });

  it("keeps data in ~/.no-fomo-social unless NO_FOMO_SOCIAL_HOME says otherwise", () => {
    expect(loadConfig({}, []).dataDir.endsWith("/.no-fomo-social")).toBe(true);
    expect(loadConfig({ NO_FOMO_SOCIAL_HOME: "/tmp/x" }, []).dataDir).toBe("/tmp/x");
    expect(loadConfig({ NO_FOMO_SOCIAL_PORT: "5000" }, []).port).toBe(5000);
  });
});
