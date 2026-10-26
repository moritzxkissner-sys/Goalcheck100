import test from "node:test";
import assert from "node:assert/strict";
import { learningStatus, parseLearningProgress } from "../lib/learning";

test("learning progress only accepts known tracks and valid counts", () => {
  assert.deepEqual(
    parseLearningProgress({
      track_id: "fachberater-recht",
      completed_units: 2,
      total_units: 5,
    }),
    { track_id: "fachberater-recht", completed_units: 2, total_units: 5 },
  );
  assert.equal(
    parseLearningProgress({
      track_id: "unknown",
      completed_units: 1,
      total_units: 5,
    }),
    null,
  );
  assert.equal(
    parseLearningProgress({
      track_id: "fachberater-recht",
      completed_units: 6,
      total_units: 5,
    }),
    null,
  );
  assert.equal(
    parseLearningProgress({
      track_id: "fachberater-recht",
      completed_units: 1.5,
      total_units: 5,
    }),
    null,
  );
});

test("learning status follows actual completed count", () => {
  assert.equal(learningStatus(0, 5), "Offen");
  assert.equal(learningStatus(2, 5), "In Bearbeitung");
  assert.equal(learningStatus(5, 5), "Abgeschlossen");
});

