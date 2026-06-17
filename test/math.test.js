import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { add } from "../src/math.js";

describe("add", () => {
  it("adds two positive integers", () => {
    assert.strictEqual(add(2, 3), 5);
  });
  it("handles zero", () => {
    assert.strictEqual(add(0, 5), 5);
  });
  it("adds negative numbers", () => {
    assert.strictEqual(add(-1, -2), -3);
  });
});
