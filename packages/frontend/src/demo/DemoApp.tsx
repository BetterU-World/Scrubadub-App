import { DemoOwnerPage } from "@/pages/demo/DemoOwnerPage";
import { isDemoPresentationMode } from "./demoRoute";

export function DemoApp() {
  return <DemoOwnerPage presentation={isDemoPresentationMode(window.location.search)} />;
}
