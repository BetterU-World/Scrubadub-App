import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnvironmentBanner, getEnvironmentLabel } from "./EnvironmentBanner";

describe("development environment marker", () => {
  it("shows only the sanitized Convex hostname in development", () => {
    const url = "https://majestic-turtle-198.convex.cloud/private?token=secret";
    const html = renderToStaticMarkup(<EnvironmentBanner dev convexUrl={url} />);
    expect(html).toContain("DEV · majestic-turtle-198.convex.cloud");
    expect(html).not.toContain("token=secret");
    expect(html).not.toContain("/private");
  });

  it("does not render in production", () => {
    expect(renderToStaticMarkup(<EnvironmentBanner dev={false} convexUrl="https://example.test" />))
      .toBe("");
  });

  it("labels missing and invalid configuration safely", () => {
    expect(getEnvironmentLabel()).toBe("DEV · backend not configured");
    expect(getEnvironmentLabel("not-a-url")).toBe("DEV · invalid backend URL");
  });
});
