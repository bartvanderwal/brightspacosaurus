// The BSO script is a side-effect module: it sets `globalThis.bsoObjectives` and has no named export
// (a package with "type": "module" would not give one), so the page is initialised through the global.
import "../../assets/brightspacosaurus-objectives.js";

// Docusaurus invokes this after hydration and after client-side page changes.
export function onRouteDidUpdate() {
  globalThis.bsoObjectives?.initializeObjectives(document);
}
