import { describe, expect, it } from "vitest";
import {
  buildCampaignRecipients,
  dedupeRecipientsByPhone,
} from "@/lib/campaigns/recipients";

describe("campaign recipient builder", () => {
  it("dedupes by normalized phone", () => {
    const out = dedupeRecipientsByPhone([
      { phone: "+91 98765 43210" },
      { phone: "919876543210" },
      { phone: "9000000001" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("builds telemarketing recipients with template vars", () => {
    const rows = buildCampaignRecipients({
      mode: "TELEMARKETING",
      messageTemplate: "Hi {{name}} from {{company}}",
      telemarketingContacts: [
        {
          id: "c1",
          phone: "919111111111",
          name: "Sara",
          company: "Globex",
          email: "",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].messageBody).toBe("Hi Sara from Globex");
    expect(rows[0].contactId).toBe("c1");
  });

  it("builds CSV recipients", () => {
    const rows = buildCampaignRecipients({
      mode: "CSV",
      messageTemplate: "Ping {{phone}}",
      csvRows: [{ phone: "919222222222" }],
    });
    expect(rows[0].messageBody).toBe("Ping 919222222222");
  });
});