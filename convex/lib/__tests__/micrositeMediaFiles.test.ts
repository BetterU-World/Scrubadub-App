import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeMedia } from "../../micrositeMediaFiles";

describe("microsite image normalization", () => {
  it("re-encodes a still photo and strips EXIF and other source metadata", async () => {
    const input = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#6490b0" } })
      .jpeg().withExif({ IFD0: { Copyright: "private fixture" } }).toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const output = await normalizeMedia(input, "gallery", "image/jpeg");
    expect(output).toMatchObject({ width: 320, height: 240, mime: "image/jpeg" });
    const metadata = await sharp(output.data).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it("rejects malformed bytes, misleading types, over-cap bytes or dimensions, and animated WebP containers", async () => {
    const png = await sharp({ create: { width: 641, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await expect(normalizeMedia(png, "portrait", "image/png")).rejects.toThrow("dimensions");
    await expect(normalizeMedia(png, "gallery", "image/jpeg")).rejects.toThrow();
    await expect(normalizeMedia(Buffer.concat([png, Buffer.from("<svg>")]), "gallery", "image/png")).rejects.toThrow();
    await expect(normalizeMedia(Buffer.alloc(600_001), "gallery", "image/jpeg")).rejects.toThrow("size limit");

    const animated = Buffer.alloc(26);
    animated.write("RIFF", 0);
    animated.writeUInt32LE(18, 4);
    animated.write("WEBPANIM", 8);
    animated.writeUInt32LE(6, 16);
    await expect(normalizeMedia(animated, "gallery", "image/webp")).rejects.toThrow("still");
  });
});
