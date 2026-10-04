import test from "node:test";
import assert from "node:assert/strict";
import { resolveGoalId } from "../web/lib/goals.mjs";

test("goal IDs continue from the highest existing number", () => {
  const goals = [{ id: "Q0" }, { id: "Q2" }, { id: "Q9" }];
  assert.equal(resolveGoalId(goals, "Q"), "Q10");
});

test("goal ID prefix is configurable", () => {
  const goals = [{ id: "G1" }, { id: "G4" }];
  assert.equal(resolveGoalId(goals, "G"), "G5");
});

test("a complete goal ID is used exactly as entered", () => {
  assert.equal(resolveGoalId([{ id: "Q1" }], "Q6"), "Q6");
  assert.throws(
    () => resolveGoalId([{ id: "Q6" }], "Q6"),
    /已存在/
  );
});
