import { describe, it, expect } from "vitest";
import { applyTheme, THEME_STORAGE_KEY } from "./use-dark-mode";

function fakeRoot() {
  const classes = new Set<string>();
  return {
    classes,
    classList: {
      toggle(token: string, force: boolean) {
        if (force) classes.add(token);
        else classes.delete(token);
      },
    },
  };
}

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    setItem: (key: string, value: string) => items.set(key, value),
  };
}

describe("applyTheme", () => {
  it("adds the dark class and remembers dark", () => {
    const root = fakeRoot();
    const storage = fakeStorage();

    applyTheme(root, storage, true);

    expect([...root.classes]).toEqual(["dark"]);
    expect(storage.items.get("cadence-theme")).toBe("dark");
  });

  it("removes the dark class and remembers light", () => {
    const root = fakeRoot();
    root.classes.add("dark");
    const storage = fakeStorage();

    applyTheme(root, storage, false);

    expect([...root.classes]).toEqual([]);
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe("light");
  });

  it("still switches the page when storage throws", () => {
    const root = fakeRoot();
    const storage = {
      setItem() {
        throw new Error("private mode");
      },
    };

    expect(() => applyTheme(root, storage, true)).not.toThrow();
    expect([...root.classes]).toEqual(["dark"]);
  });
});
