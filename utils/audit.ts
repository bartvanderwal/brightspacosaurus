/**
 * `deno task audit`: runs `deno audit` and fails on a high or critical advisory
 * that is not on the list of accepted exceptions below. `deno audit --ignore`
 * does not take these advisories (Deno 2.9), and an exception belongs in the
 * open, with its reason, so it lives here and in the Software Guidebook, 5.3.
 *
 * @module
 */

/** Accepted advisories: id and why. Keep this list and the guidebook (5.3) the same. */
export const ACCEPTED_ADVISORIES: Record<string, string> = {
  "GHSA-w3rx-r6r6-pgpr":
    "image-size 1.2.1 via pptxgenjs 4.0.1, which never loads it; PptxGenJS #1474, #1473, #1529",
  "GHSA-5p2g-fcmc-qvqq":
    "image-size 1.2.1 via pptxgenjs 4.0.1, which never loads it; PptxGenJS #1474, #1473, #1529",
};

/** The advisory ids in the text that `deno audit` prints, in order, without duplicates. */
export function advisoryIds(output: string): string[] {
  const ids = [...output.matchAll(/advisories\/(GHSA-[a-z0-9-]+)/g)].map((
    match,
  ) => match[1]);
  return [...new Set(ids)];
}

/** The advisories in `output` that are not accepted. */
export function unacceptedAdvisories(
  output: string,
  accepted: Record<string, string> = ACCEPTED_ADVISORIES,
): string[] {
  return advisoryIds(output).filter((id) => !(id in accepted));
}

if (import.meta.main) {
  const result = await new Deno.Command("deno", {
    args: ["audit", "--level=high", "--ignore-registry-errors"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(result.stdout) +
    new TextDecoder().decode(result.stderr);
  const ids = advisoryIds(text);
  const found = unacceptedAdvisories(text);
  for (const id of ids) {
    if (id in ACCEPTED_ADVISORIES) {
      console.log(`accepted ${id}: ${ACCEPTED_ADVISORIES[id]}`);
    }
  }
  if (found.length) {
    console.error(text);
    console.error(`Advisories without an accepted reason: ${found.join(", ")}`);
    Deno.exit(1);
  }
  if (result.code !== 0 && !ids.length) {
    // `deno audit` failed for another reason than an advisory.
    console.error(text);
    Deno.exit(result.code);
  }
  console.log(
    ids.length
      ? "No high advisory outside the accepted list."
      : "No high or critical advisories.",
  );
}
