import test from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.js";

test("add(2, 3) should return 5", () => assert.equal(add(2, 3), 5));
test("add(0, 5) should return 5", () => assert.equal(add(0, 5), 5));
test("add(-1, -2) should return -3", () => assert.equal(add(-1, -2), -3));
