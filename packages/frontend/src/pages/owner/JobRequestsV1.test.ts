import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Job Requests V1 UI contracts", () => {
  it("registers focused owner and permission-gated manager routes", () => {
    const app = read("packages/frontend/src/App.tsx");
    expect(app).toContain('path="/jobs/requests" component={JobRequestListPage}');
    expect(app).toContain('path="/jobs/requests/:requestId" component={JobRequestDetailPage}');
    expect(app).toContain("user?.canManageSchedule && <Route");
  });

  it("keeps operational decisions focused and advanced CRM tools secondary", () => {
    const detail = read("packages/frontend/src/pages/owner/JobRequestDetailPage.tsx");
    expect(detail).toContain("RequestScheduleConfirmation");
    expect(detail).toContain("declineJobRequest");
    expect(detail).toContain("ConfirmDialog");
    expect(detail).toContain("advancedTools");
    expect(detail).not.toContain("WalkthroughCard");
    expect(detail).not.toContain("ServiceAgreementCard");
  });

  it("provides equivalent English and Spanish Job Request keys", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json"));
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json"));
    expect(Object.keys(en.jobRequests).sort()).toEqual(Object.keys(es.jobRequests).sort());
    expect(en.nav.jobRequests).toBe("Job Requests");
    expect(es.nav.jobRequests).toBe("Solicitudes de trabajo");
  });
});
