import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = "empty" | "too-long" | "unsaved" | "saved";

export type NoteDraft = {
  status: NoteDraftStatus;
  length: number;
  maxLength: number;
  canSave: boolean;
};

export function describeDraft(
  draft: string,
  savedBody: string | null
): NoteDraft {
  // The action trims before it checks and stores, so judge the trimmed text.
  const body = draft.trim();
  const status = statusOf(body, savedBody);
  return {
    status,
    length: body.length,
    maxLength: MAX_NOTE_LENGTH,
    canSave: status === "unsaved",
  };
}

function statusOf(body: string, savedBody: string | null): NoteDraftStatus {
  if (body.length > MAX_NOTE_LENGTH) return "too-long";
  if (body === (savedBody ?? "")) return "saved";
  // The action rejects a blank note, so a blank draft is never saveable.
  if (body.length === 0) return "empty";
  return "unsaved";
}
