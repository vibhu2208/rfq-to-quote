import { describe, expect, it } from "vitest";
import { buildStatusChangeBody, buildTagsUpdateBody } from "@/lib/telemarketing/contact-update";

describe("telemarketing timeline copy", () => {
  it("describes status changes for STATUS_CHANGED events", () => {
    expect(buildStatusChangeBody("NO_ACTION", "CONNECTED")).toContain("No action");
    expect(buildStatusChangeBody("NO_ACTION", "CONNECTED")).toContain("Connected");
  });

  it("describes tag updates for CONTACT_UPDATED events", () => {
    expect(buildTagsUpdateBody([], ["district", "board"])).toBe(
      "Tags updated: — → district, board"
    );
  });
});