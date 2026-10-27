import { assert, assertEquals, assertNotEquals } from "@std/assert";

// Spec *Learning objectives*, rules LO7-LO11: the script keeps the state in the browser only.

await import("../assets/brightspacosaurus-objectives.js");
const { initializeObjectives, objectiveKey } = (globalThis as unknown as {
  bsoObjectives: {
    initializeObjectives: (root: unknown, env?: unknown) => void;
    objectiveKey: (pathname: string, text: string) => string;
  };
}).bsoObjectives;

/** The few things of the DOM that the script uses. */
class El {
  className = "";
  dataset: Record<string, string> = {};
  children: El[] = [];
  attributes: Record<string, string> = {};
  checked = false;
  textContent = "";
  handlers: Record<string, () => void> = {};
  classes = new Set<string>();
  classList = {
    toggle: (name: string, on: boolean) =>
      on ? this.classes.add(name) : this.classes.delete(name),
  };
  constructor(classes = "") {
    for (const name of classes.split(" ").filter(Boolean)) {
      this.classes.add(name);
    }
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  addEventListener(type: string, handler: () => void) {
    this.handlers[type] = handler;
  }
  insertBefore(node: El) {
    this.children.unshift(node);
  }
  matches(selector: string) {
    return this.classes.has(selector.slice(1)) ||
      (selector === "." + this.className && this.className !== "");
  }
  all(selector: string): El[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.all(selector),
    ]);
  }
  querySelectorAll(selector: string) {
    return this.all(selector);
  }
  querySelector(selector: string) {
    return this.all(selector)[0] ?? null;
  }
}

(globalThis as unknown as { document: unknown }).document = {
  createElement: () => new El(),
};

function section(objectives: string[]) {
  const root = new El();
  const list = new El("bso-objectives");
  list.dataset.bsoProgressLabel = "{done} of {total} checked";
  const items = objectives.map((text) => {
    const objective = new El("bso-objective");
    const box = new El("bso-objective-check");
    const label = new El("bso-objective-text");
    label.textContent = text;
    objective.children.push(box, label);
    list.children.push(objective);
    return { objective, box };
  });
  root.children.push(list);
  return { root, list, items };
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const page = "/content/enforced/45978-SB/content/week-1/lesson.html";

Deno.test("LO7: ticking a objective saves it, and the next visit shows it ticked", () => {
  const storage = new MemoryStorage();
  const first = section(["Objective one", "Objective two"]);
  initializeObjectives(first.root, { storage, pathname: page });
  assertEquals(first.list.children[0].textContent, "0 of 2 checked");
  first.items[1].box.checked = true;
  first.items[1].box.handlers.change();
  assertEquals(storage.data.size, 1);
  assertEquals(first.list.children[0].textContent, "1 of 2 checked");
  assert(first.items[1].objective.classes.has("is-done"));

  const second = section(["Objective one", "Objective two"]);
  initializeObjectives(second.root, { storage, pathname: page });
  assertEquals(second.items.map((item) => item.box.checked), [false, true]);
  assertEquals(second.list.children[0].textContent, "1 of 2 checked");

  // Unticking removes the entry.
  second.items[1].box.checked = false;
  second.items[1].box.handlers.change();
  assertEquals(storage.data.size, 0);
});

Deno.test("LO8: the key is the page and the text of the objective, with a version; a rewritten objective starts empty, another page does not share", () => {
  const key = objectiveKey(page, "Objective  one");
  assert(key.startsWith(`bso:objectives:v1:${page}:`));
  assertEquals(key, objectiveKey(page, "  Objective one "));
  assertNotEquals(key, objectiveKey(page, "Objective one, rewritten"));
  assertNotEquals(key, objectiveKey("/other/lesson.html", "Objective one"));
  // The same page with a trailing slash or index.html has the same key.
  assertEquals(
    objectiveKey("/a/b/", "x"),
    objectiveKey("/a/b/index.html", "x"),
  );
  assertEquals(objectiveKey("/a/b", "x"), objectiveKey("/a/b/", "x"));
});

Deno.test("LO9: the order of the objectives does not matter, the text does", () => {
  const storage = new MemoryStorage();
  const first = section(["Objective one", "Objective two"]);
  initializeObjectives(first.root, { storage, pathname: page });
  first.items[0].box.checked = true;
  first.items[0].box.handlers.change();
  const reordered = section(["Objective two", "Objective one"]);
  initializeObjectives(reordered.root, { storage, pathname: page });
  assertEquals(reordered.items.map((item) => item.box.checked), [false, true]);
});

Deno.test("LO10: without storage, or with storage that fails, the boxes still work and nothing is shown as an error", () => {
  const none = section(["Objective one"]);
  initializeObjectives(none.root, { storage: null, pathname: page });
  none.items[0].box.checked = true;
  none.items[0].box.handlers.change();
  assertEquals(none.list.children[0].textContent, "1 of 1 checked");

  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const failing = section(["Objective one"]);
  initializeObjectives(failing.root, { storage: broken, pathname: page });
  assertEquals(failing.items[0].box.checked, false);
  failing.items[0].box.checked = true;
  failing.items[0].box.handlers.change();
  assertEquals(failing.list.children[0].textContent, "1 of 1 checked");
});

Deno.test("LO11: a section is set up once, also when the script runs again after a page change", () => {
  const storage = new MemoryStorage();
  const once = section(["Objective one"]);
  initializeObjectives(once.root, { storage, pathname: page });
  initializeObjectives(once.root, { storage, pathname: page });
  assertEquals(once.list.children.length, 2);
  assertEquals(once.list.dataset.bsoObjectivesReady, "true");
});
