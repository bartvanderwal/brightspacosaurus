import "../../assets/brightspacosaurus-tabs.js";

// Same tab behaviour as the Brightspace export (#37). Docusaurus invokes this
// after hydration and after client-side page changes.
export function onRouteDidUpdate() {
  globalThis.bsoTabs?.initializeTabs(document);
}
