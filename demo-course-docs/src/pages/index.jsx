import React from "react";
import { Redirect } from "@docusaurus/router";

export default function Home() {
  return React.createElement(Redirect, { to: "/lessons/" });
}
