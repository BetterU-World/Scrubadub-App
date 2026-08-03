import { describe, expect, it } from "vitest";
import fs from "node:fs"; import path from "node:path";
const root = process.cwd(); const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
describe("request scheduling confirmation UI", () => {
  it("uses the atomic mutation, labeled responsive inputs, confirmation, and duplicate-submit guard", () => { const source = read("packages/frontend/src/components/owner/RequestScheduleConfirmation.tsx"); expect(source).toContain("confirmClientRequestSchedule"); expect(source).toContain("ConfirmDialog"); expect(source).toContain('type="date"'); expect(source).toContain('type="time"'); expect(source).toContain("sm:grid-cols-2"); expect(source).toContain("disabled={!date || !time || submitting}"); expect(source).toContain("clientSchedulingNote"); expect(source).toContain("canManageSchedule"); });
  it("keeps English and Spanish scheduling structures aligned and exposes confirmed schedule copy", () => { const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json")); const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json")); expect(Object.keys(en.requests.scheduling)).toEqual(Object.keys(es.requests.scheduling)); expect(en.clientRequests.confirmedDateValue).toContain("Confirmed"); expect(es.clientRequests.confirmedDateValue).toContain("Confirmado"); });
});
