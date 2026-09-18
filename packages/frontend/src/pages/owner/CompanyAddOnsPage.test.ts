import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompanyAddOnEditorFields } from "./CompanyAddOnEditorFields";
import { toFriendlyMessage } from "../../lib/friendlyError";
import {
  blankCompanyAddOnForm,
  createSubmissionLock,
  formForEditor,
  parsePriceCents,
  prepareCompanyAddOnValues,
  submitCompanyAddOn,
  withActiveState,
} from "./companyAddOnEditor";

const auth = { userId: "user-1" as any, sessionToken: "session-token" };

describe("company add-on editor workflow", () => {
  it("initializes create mode with valid defaults and hydrates only real records", () => {
    expect(formForEditor({ kind: "create" })).toEqual({
      name: "",
      description: "",
      pricingMethod: "flat",
      price: "",
      unitLabel: "",
      estimatedDurationMinutes: "",
      internalNotes: "",
      isActive: true,
      isPublic: false,
    });

    const record = {
      _id: "add-on-1",
      name: "Interior windows",
      description: "Inside only",
      pricingMethod: "per_unit",
      priceCents: 799,
      unitLabel: "window",
      estimatedDurationMinutes: 45,
      internalNotes: "Bring ladder",
      isActive: true,
      isPublic: true,
    } as any;
    expect(formForEditor({ kind: "edit", record })).toMatchObject({
      name: "Interior windows",
      pricingMethod: "per_unit",
      price: "7.99",
      unitLabel: "window",
      estimatedDurationMinutes: "45",
      isActive: true,
      isPublic: true,
    });
  });

  it("converts supported decimal prices exactly and rejects unsupported precision", () => {
    expect(parsePriceCents("19.99")).toBe(1999);
    expect(parsePriceCents("0.07")).toBe(7);
    expect(parsePriceCents("12.3")).toBe(1230);
    expect(parsePriceCents("12.345")).toBeNull();
    expect(parsePriceCents("0")).toBeNull();
    expect(parsePriceCents("")).toBeNull();
  });

  it("prepares and submits the actual create payload", async () => {
    const form = {
      ...blankCompanyAddOnForm(),
      name: "Oven",
      description: "Inside",
      price: "19.99",
      isPublic: true,
    };
    const values = prepareCompanyAddOnValues(form);
    expect(values).toEqual({
      name: "Oven",
      description: "Inside",
      pricingMethod: "flat",
      priceCents: 1999,
      unitLabel: undefined,
      estimatedDurationMinutes: undefined,
      internalNotes: undefined,
      isActive: true,
      isPublic: true,
    });

    const create = vi.fn().mockResolvedValue("add-on-1");
    const update = vi.fn();
    await submitCompanyAddOn({ kind: "create" }, auth, values!, { create, update });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({ ...auth, ...values });
    expect(update).not.toHaveBeenCalled();
  });

  it("routes existing records through update with their persisted id", async () => {
    const record = { _id: "add-on-2" } as any;
    const values = prepareCompanyAddOnValues({
      ...blankCompanyAddOnForm(),
      name: "Laundry",
      price: "0.07",
    })!;
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue("add-on-2");
    await submitCompanyAddOn({ kind: "edit", record }, auth, values, { create, update });
    expect(update).toHaveBeenCalledWith({ addOnId: "add-on-2", ...auth, ...values });
    expect(create).not.toHaveBeenCalled();
  });

  it("preserves the active/public rule and blocks simultaneous submissions", () => {
    const publicForm = { ...blankCompanyAddOnForm(), isPublic: true };
    const inactive = withActiveState(publicForm, false);
    expect(inactive).toMatchObject({ isActive: false, isPublic: false });
    expect(withActiveState(inactive, true)).toMatchObject({ isActive: true, isPublic: false });

    const lock = createSubmissionLock();
    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
    expect(lock.isLocked()).toBe(true);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });

  it("renders sanitized mutation feedback inside the real editor as an alert", () => {
    const sanitized = toFriendlyMessage(
      new Error("[CONVEX M(mutations/companyAddOns:create)] Server Error Called by client"),
      "We couldn't save this add-on. Please try again.",
    );
    const html = renderToStaticMarkup(React.createElement(CompanyAddOnEditorFields, {
      form: blankCompanyAddOnForm(),
      setForm: vi.fn(),
      save: vi.fn(),
      busy: false,
      error: sanitized,
      t: (key: string) => key,
      hideActions: true,
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("We couldn&#x27;t save this add-on. Please try again.");
    expect(html).not.toContain("CONVEX");
  });
});
