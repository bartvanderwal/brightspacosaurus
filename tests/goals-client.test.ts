import { assert, assertEquals, assertNotEquals } from "@std/assert";

// Spec *Learning goals*, rules LG7-LG11 (#167): the script keeps the state in the browser only.

await import("../assets/brightspacosaurus-goals.js");
const { initializeGoals, goalKey } = (globalThis as unknown as {
  bsoGoals: {
    initializeGoals: (root: unknown, env?: unknown) => void;
    goalKey: (pathname: string, text: string) => string;
  };
}).bsoGoals;

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

function section(goals: string[]) {
  const root = new El();
  const list = new El("bso-goals");
  list.dataset.bsoProgressLabel = "{done} of {total} checked";
  const items = goals.map((text) => {
    const goal = new El("bso-goal");
    const box = new El("bso-goal-check");
    const label = new El("bso-goal-text");
    label.textContent = text;
    goal.children.push(box, label);
    list.children.push(goal);
    return { goal, box };
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

Deno.test("LG7: ticking a goal saves it, and the next visit shows it ticked", () => {
  const storage = new MemoryStorage();
  const first = section(["Goal one", "Goal two"]);
  initializeGoals(first.root, { storage, pathname: page });
  assertEquals(first.list.children[0].textContent, "0 of 2 checked");
  first.items[1].box.checked = true;
  first.items[1].box.handlers.change();
  assertEquals(storage.data.size, 1);
  assertEquals(first.list.children[0].textContent, "1 of 2 checked");
  assert(first.items[1].goal.classes.has("is-done"));

  const second = section(["Goal one", "Goal two"]);
  initializeGoals(second.root, { storage, pathname: page });
  assertEquals(second.items.map((item) => item.box.checked), [false, true]);
  assertEquals(second.list.children[0].textContent, "1 of 2 checked");

  // Unticking removes the entry.
  second.items[1].box.checked = false;
  second.items[1].box.handlers.change();
  assertEquals(storage.data.size, 0);
});

Deno.test("LG8: the key is the page and the text of the goal, with a version; a rewritten goal starts empty, another page does not share", () => {
  const key = goalKey(page, "Goal  one");
  assert(key.startsWith(`bso:goals:v1:${page}:`));
  assertEquals(key, goalKey(page, "  Goal one "));
  assertNotEquals(key, goalKey(page, "Goal one, rewritten"));
  assertNotEquals(key, goalKey("/other/lesson.html", "Goal one"));
  // The same page with a trailing slash or index.html has the same key.
  assertEquals(goalKey("/a/b/", "x"), goalKey("/a/b/index.html", "x"));
  assertEquals(goalKey("/a/b", "x"), goalKey("/a/b/", "x"));
});

Deno.test("LG9: the order of the goals does not matter, the text does", () => {
  const storage = new MemoryStorage();
  const first = section(["Goal one", "Goal two"]);
  initializeGoals(first.root, { storage, pathname: page });
  first.items[0].box.checked = true;
  first.items[0].box.handlers.change();
  const reordered = section(["Goal two", "Goal one"]);
  initializeGoals(reordered.root, { storage, pathname: page });
  assertEquals(reordered.items.map((item) => item.box.checked), [false, true]);
});

Deno.test("LG10: without storage, or with storage that fails, the boxes still work and nothing is shown as an error", () => {
  const none = section(["Goal one"]);
  initializeGoals(none.root, { storage: null, pathname: page });
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
  const failing = section(["Goal one"]);
  initializeGoals(failing.root, { storage: broken, pathname: page });
  assertEquals(failing.items[0].box.checked, false);
  failing.items[0].box.checked = true;
  failing.items[0].box.handlers.change();
  assertEquals(failing.list.children[0].textContent, "1 of 1 checked");
});

Deno.test("LG11: a section is set up once, also when the script runs again after a page change", () => {
  const storage = new MemoryStorage();
  const once = section(["Goal one"]);
  initializeGoals(once.root, { storage, pathname: page });
  initializeGoals(once.root, { storage, pathname: page });
  assertEquals(once.list.children.length, 2);
  assertEquals(once.list.dataset.bsoGoalsReady, "true");
});
