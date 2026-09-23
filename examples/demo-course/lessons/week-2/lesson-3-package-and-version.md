# Lesson 3: Package and Version

**Manual test:** inspect IMSCC contents, the manifest, menu order and version sources.

The BSO version comes from `deno.json` and appears as the `.imscc` filename postfix. The content version comes from `brightspacosaurus.config.json` and appears separately in the generated HTML badge.

Check that both are visible on an HTML page:

```text
BSO v0.9.2 · content v0.2.0
```

Also check that the package contains `imsmanifest.xml`, the course handbook, lessons, quizzes, SVG assets and reader PDFs.
