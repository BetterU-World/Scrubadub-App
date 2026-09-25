import { describe, expect, it } from "vitest";
import { clientPrefillFromProperty } from "./clientFromProperty";

describe("Client prefill from Property", () => {
  it("maps only known contact fields and leaves unknown fields blank", () => {
    expect(clientPrefillFromProperty({ contactName: "Jane Doe", contactEmail: "jane@example.com" })).toEqual({
      displayName: "Jane Doe", primaryContactName: "Jane Doe", email: "jane@example.com", phone: "",
    });
    expect(clientPrefillFromProperty({})).toEqual({ displayName: "", primaryContactName: "", email: "", phone: "" });
  });
});
