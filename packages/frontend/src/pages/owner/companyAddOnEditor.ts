import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

export type PricingMethod = "flat" | "starting_at" | "per_unit";
export type CompanyAddOn = Doc<"companyAddOns">;

export type EditorMode =
  | { kind: "create" }
  | { kind: "edit"; record: CompanyAddOn };

export type CompanyAddOnForm = {
  name: string;
  description: string;
  pricingMethod: PricingMethod;
  price: string;
  unitLabel: string;
  estimatedDurationMinutes: string;
  internalNotes: string;
  isActive: boolean;
  isPublic: boolean;
};

export type CompanyAddOnValues = {
  name: string;
  description?: string;
  pricingMethod: PricingMethod;
  priceCents: number;
  unitLabel?: string;
  estimatedDurationMinutes?: number;
  internalNotes?: string;
  isActive: boolean;
  isPublic: boolean;
};

export const blankCompanyAddOnForm = (): CompanyAddOnForm => ({
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

export function formForEditor(mode: EditorMode): CompanyAddOnForm {
  if (mode.kind === "create") return blankCompanyAddOnForm();
  const record = mode.record;
  return {
    name: record.name,
    description: record.description ?? "",
    pricingMethod: record.pricingMethod,
    price: (record.priceCents / 100).toFixed(2),
    unitLabel: record.unitLabel ?? "",
    estimatedDurationMinutes: record.estimatedDurationMinutes
      ? String(record.estimatedDurationMinutes)
      : "",
    internalNotes: record.internalNotes ?? "",
    isActive: record.isActive,
    isPublic: record.isPublic,
  };
}

export function parsePriceCents(value: string): number | null {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const wholeCents = Number(match[1]) * 100;
  const fractionalCents = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = wholeCents + fractionalCents;
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function prepareCompanyAddOnValues(form: CompanyAddOnForm): CompanyAddOnValues | null {
  const priceCents = parsePriceCents(form.price);
  if (priceCents === null) return null;
  return {
    name: form.name,
    description: form.description || undefined,
    pricingMethod: form.pricingMethod,
    priceCents,
    unitLabel: form.pricingMethod === "per_unit" ? form.unitLabel : undefined,
    estimatedDurationMinutes: form.estimatedDurationMinutes
      ? Number(form.estimatedDurationMinutes)
      : undefined,
    internalNotes: form.internalNotes || undefined,
    isActive: form.isActive,
    isPublic: form.isPublic,
  };
}

export function withActiveState(form: CompanyAddOnForm, isActive: boolean): CompanyAddOnForm {
  return {
    ...form,
    isActive,
    isPublic: isActive ? form.isPublic : false,
  };
}

export function createSubmissionLock() {
  let locked = false;
  return {
    acquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
}

type Auth = { userId?: Id<"users">; sessionToken: string };

export async function submitCompanyAddOn(
  mode: EditorMode,
  auth: Auth,
  values: CompanyAddOnValues,
  mutations: {
    create: (args: Auth & CompanyAddOnValues) => Promise<unknown>;
    update: (
      args: Auth & CompanyAddOnValues & { addOnId: Id<"companyAddOns"> },
    ) => Promise<unknown>;
  },
) {
  if (mode.kind === "create") return await mutations.create({ ...auth, ...values });
  return await mutations.update({ addOnId: mode.record._id, ...auth, ...values });
}
