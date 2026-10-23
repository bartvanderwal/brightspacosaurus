import { assertEquals } from "@std/assert";
import { parsePids } from "../utils/stop-preview.ts";

Deno.test("parsePids reads the process ids from lsof output, once each", () => {
  assertEquals(parsePids("78272\n78272\n 91\n"), [78272, 91]);
  assertEquals(parsePids(""), []);
  assertEquals(parsePids("COMMAND PID\nnode 12"), [12]);
});
