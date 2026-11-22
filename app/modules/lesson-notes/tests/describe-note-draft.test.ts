import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("treats an untouched draft with no saved note as saved, not saveable", () => {
    expect(describeNoteDraft("", null)).toEqual({
      status: "saved",
      length: 0,
      maxLength: MAX_NOTE_LENGTH,
      canSave: false,
    });
  });

  it("lets a new draft be saved", () => {
    const draft = describeNoteDraft("Generics are like parameters", null);
    expect(draft.status).toBe("unsaved");
    expect(draft.canSave).toBe(true);
    expect(draft.length).toBe(28);
  });

  it("reports a draft that matches the saved note as saved", () => {
    const draft = describeNoteDraft("same", "same");
    expect(draft.status).toBe("saved");
    expect(draft.canSave).toBe(false);
  });

  it("reports an edited draft as unsaved", () => {
    expect(describeNoteDraft("same!", "same").status).toBe("unsaved");
  });

  it("will not save a draft cleared to whitespace", () => {
    const draft = describeNoteDraft("   ", "old note");
    expect(draft.status).toBe("empty");
    expect(draft.canSave).toBe(false);
  });

  it("accepts a draft exactly at the limit", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), null);
    expect(draft.status).toBe("unsaved");
    expect(draft.canSave).toBe(true);
  });

  it("refuses a draft one character over the limit", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null);
    expect(draft.status).toBe("too-long");
    expect(draft.canSave).toBe(false);
    expect(draft.length).toBe(MAX_NOTE_LENGTH + 1);
  });
});
