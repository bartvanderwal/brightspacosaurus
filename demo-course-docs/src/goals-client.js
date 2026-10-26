import { initializeGoals } from "../../assets/brightspacosaurus-goals.js";

// Docusaurus invokes this after hydration and after client-side page changes.
export function onRouteDidUpdate() {
  initializeGoals(document);
}
