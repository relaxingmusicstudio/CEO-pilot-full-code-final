import { describe, expect, it } from "vitest";
import { parseIntent } from "../../../apps/search-pilot/src/core/intent";

describe("parseIntent", () => {
  it("extracts service and location primitives", () => {
    const intent = parseIntent("Best HVAC response in Austin");

    const hasService = intent.primitives.some(
      (primitive) => primitive.type === "service" && primitive.value === "hvac"
    );
    const hasLocation = intent.primitives.some(
      (primitive) => primitive.type === "location" && primitive.value === "austin_tx"
    );

    expect(hasService).toBe(true);
    expect(hasLocation).toBe(true);
    expect(intent.ambiguity.level).toBe("low");
  });

  it("flags ambiguous intent when no service or location is present", () => {
    const intent = parseIntent("help");
    expect(intent.ambiguity.level).toBe("high");
    expect(intent.ambiguity.reasons.length).toBeGreaterThan(1);
  });
});
