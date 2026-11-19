import { describe, expect, it } from "vitest";
import { renderCampaignMessage } from "@/lib/campaigns/template";

describe("renderCampaignMessage", () => {
  it("interpolates known variables", () => {
    const out = renderCampaignMessage("Hi {{name}} at {{company}} ({{phone}})", {
      name: "Kim",
      company: "Initech",
      phone: "919333333333",
    });
    expect(out).toBe("Hi Kim at Initech (919333333333)");
  });

  it("leaves missing vars empty", () => {
    expect(renderCampaignMessage("Hello {{name}}", {})).toBe("Hello ");
  });
});