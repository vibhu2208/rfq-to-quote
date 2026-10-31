import { describe, expect, it } from "vitest";
import { stabilizeIntakeFile } from "@/lib/intake-file";

describe("stabilizeIntakeFile", () => {
  it("copies clipboard bytes into a file the form can upload later", async () => {
    const original = new File([new Uint8Array([1, 2, 3, 4])], "", { type: "image/png" });
    const stable = await stabilizeIntakeFile(original);
    expect(stable.name).toBe("pasted-screenshot.png");
    expect(stable.type).toBe("image/png");
    expect(await stable.arrayBuffer()).toHaveProperty("byteLength", 4);
  });

  it("keeps a real filename from disk", async () => {
    const original = new File(["a,b\n"], "list.csv", { type: "text/csv" });
    const stable = await stabilizeIntakeFile(original);
    expect(stable.name).toBe("list.csv");
  });
});
