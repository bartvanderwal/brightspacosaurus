/**
 * The path of the one package of a given kind in an output directory. The name of a
 * package has a hash of the content in it (Software Guidebook, *Content version*), so a
 * test looks for the file and does not build the name itself.
 */
export async function packagePath(
  outputDir: string,
  extension = ".imscc",
): Promise<string> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(outputDir)) {
    if (entry.isFile && entry.name.endsWith(extension)) names.push(entry.name);
  }
  if (names.length !== 1) {
    throw new Error(
      `Expected one ${extension} package in ${outputDir}, found: ${
        names.join(", ") || "none"
      }`,
    );
  }
  return `${outputDir}/${names[0]}`;
}
