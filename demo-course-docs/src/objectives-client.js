import { initializeObjectives } from "../../assets/brightspacosaurus-objectives.js";

// Docusaurus invokes this after hydration and after client-side page changes.
export function onRouteDidUpdate() {
  initializeObjectives(document);
}
