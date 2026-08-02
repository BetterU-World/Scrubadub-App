import { DemoOwnerPage } from "@/pages/demo/DemoOwnerPage";
import { DemoWorkerPage } from "@/pages/demo/DemoWorkerPage";
import { getDemoPersona, isDemoPresentationMode } from "./demoRoute";

export function DemoApp() {
  const presentation = isDemoPresentationMode(window.location.search);
  return getDemoPersona(window.location.pathname) === "worker"
    ? <DemoWorkerPage presentation={presentation} />
    : <DemoOwnerPage presentation={presentation} />;
}
