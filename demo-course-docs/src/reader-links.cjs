const fs = require("node:fs");
const path = require("node:path");

function remarkReaderPdfLinks({
  readersDir,
  previewStaticDir,
  baseUrl = "/",
  existsSync = fs.existsSync,
}) {
  return () => (tree, file) => {
    if (!readersDir || !previewStaticDir || !file.path) return;

    const basePath = `/${baseUrl.split("/").filter(Boolean).join("/")}`;
    const visit = (node) => {
      if (node.type === "link" && typeof node.url === "string") {
        const match = node.url.match(/^([^?#]+)(.*)$/);
        const target = match?.[1];
        if (
          target && !/^[a-z][a-z\d+.-]*:/i.test(target) &&
          !target.startsWith("/")
        ) {
          let sourcePath;
          try {
            sourcePath = path.resolve(
              path.dirname(file.path),
              decodeURIComponent(target),
            );
          } catch {
            sourcePath = null;
          }
          if (sourcePath && path.extname(sourcePath) === ".md") {
            const relativePath = path.relative(
              path.resolve(readersDir),
              sourcePath,
            );
            const outsideReaders = relativePath === ".." ||
              relativePath.startsWith(`..${path.sep}`) ||
              path.isAbsolute(relativePath);
            const name = path.basename(sourcePath, ".md");
            if (
              !outsideReaders &&
              (name.startsWith("reader-") || name === "plantuml-essentials")
            ) {
              const pdfPath = path.join(
                previewStaticDir,
                "readers",
                `${name}.pdf`,
              );
              if (existsSync(pdfPath)) {
                const prefix = basePath === "/" ? "" : basePath;
                node.url = `pathname://${prefix}/readers/${
                  encodeURIComponent(name)
                }.pdf${match[2]}`;
              }
            }
          }
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

module.exports = { remarkReaderPdfLinks };
