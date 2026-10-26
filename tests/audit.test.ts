import { assertEquals } from "@std/assert";
import { advisoryIds, unacceptedAdvisories } from "../utils/audit.ts";

const output = `
╭ image-size: ICNS parser allows denial of service through an infinite loop
│ Severity:   high
╰ Info:       https://github.com/advisories/GHSA-w3rx-r6r6-pgpr

╭ image-size: JXL and HEIF parsers allow denial of service
╰ Info:       https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
╰ Info:       https://github.com/advisories/GHSA-5p2g-fcmc-qvqq

╭ something new
╰ Info:       https://github.com/advisories/GHSA-aaaa-bbbb-cccc
`;

Deno.test("audit: the advisory ids are read from the output of deno audit, each once", () => {
  assertEquals(advisoryIds(output), [
    "GHSA-w3rx-r6r6-pgpr",
    "GHSA-5p2g-fcmc-qvqq",
    "GHSA-aaaa-bbbb-cccc",
  ]);
  assertEquals(advisoryIds("No vulnerabilities"), []);
});

Deno.test("audit: only an advisory without an accepted reason fails the audit", () => {
  assertEquals(unacceptedAdvisories(output), ["GHSA-aaaa-bbbb-cccc"]);
  assertEquals(
    unacceptedAdvisories(output, { "GHSA-aaaa-bbbb-cccc": "test" }),
    ["GHSA-w3rx-r6r6-pgpr", "GHSA-5p2g-fcmc-qvqq"],
  );
});
