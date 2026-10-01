import React from "react";
import { Redirect } from "@docusaurus/router";
import useBaseUrl from "@docusaurus/useBaseUrl";

// useBaseUrl adds the site's baseUrl, e.g. /brightspacosaurus/ on GitHub Pages.
export default function Home() {
  return React.createElement(Redirect, { to: useBaseUrl("/lessons/") });
}
