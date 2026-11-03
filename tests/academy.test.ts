import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  academyTracks,
  academyQuestions,
  academyCatalogVersion,
  parseAcademyProgress,
  scoreAcademyAnswers,
  summarizeAcademyProgress,
  type AcademyProgress,
} from "../lib/academy";
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const attempt = "00000000-0000-4000-8000-000000000003";
const moduleId = "salespower-haftpflicht-grundlagen";
const complete = {
  module_id: moduleId,
  attempt_id: attempt,
  answers: [[1], [0, 1]],
  position: 2,
  completed: true,
};

test("catalog preserves all eight existing questions and all required topics", () => {
  assert.equal(academyTracks.filter((t) => t.group === "specialist").length, 4);
  assert.equal(academyTracks.filter((t) => t.group === "salespower").length, 7);
  for (const id of [
    "hausrat",
    "gebaeude",
    "haftpflicht",
    "selbstbeteiligung",
    "rechtsschutz",
    "bedingungen",
    "elementar",
    "versicherungssumme",
  ])
    assert.ok(academyQuestions.some((q) => q.id === id));
  for (const track of academyTracks)
    for (const lesson of track.modules) {
      assert.ok(
        lesson.requiresDocuments
          ? lesson.questionIds.length === 0
          : lesson.questionIds.length > 0,
      );
      for (const id of lesson.questionIds)
        assert.ok(academyQuestions.some((q) => q.id === id));
    }
});
test("single and multi-select score exact sets only", () => {
  assert.deepEqual(scoreAcademyAnswers(moduleId, [[1], [1, 0]]), {
    correct: 2,
    total: 2,
    answered: 2,
    percentage: 100,
  });
  assert.equal(scoreAcademyAnswers(moduleId, [[1], [0]]).correct, 1);
  assert.equal(scoreAcademyAnswers(moduleId, [[1], [0, 1, 2]]).correct, 1);
  assert.equal(scoreAcademyAnswers(moduleId, [[1], [0, 0]]).correct, 1);
  assert.equal(scoreAcademyAnswers(moduleId, [null, null]).answered, 0);
});
test("progress rejects malformed, unavailable and incomplete completions", () => {
  assert.ok(parseAcademyProgress(complete));
  assert.ok(
    parseAcademyProgress({
      ...complete,
      answers: [null, null],
      position: 0,
      completed: false,
    }),
  );
  for (const override of [
    { attempt_id: "invalid" },
    { module_id: "salespower-gkv-grundlagen" },
    { answers: [[1], null] },
    { answers: [[1], [0, 0]] },
    {
      answers: [
        [1, 2],
        [0, 1],
      ],
    },
    { answers: [[3], [0, 1]] },
    { position: 1 },
    { completed: false },
    { answers: [[1]] },
  ])
    assert.equal(parseAcademyProgress({ ...complete, ...override }), null);
});
test("overall denominator includes every lesson and material still pending", () => {
  const row: AcademyProgress = {
    ...complete,
    catalog_version: academyCatalogVersion,
    updated_at: new Date().toISOString(),
    score: scoreAcademyAnswers(moduleId, complete.answers),
  };
  assert.deepEqual(summarizeAcademyProgress([]), {
    completed: 0,
    total: 11,
    percentage: 0,
    started: 0,
  });
  assert.deepEqual(summarizeAcademyProgress([row]), {
    completed: 1,
    total: 11,
    percentage: 9,
    started: 1,
  });
  assert.equal(
    summarizeAcademyProgress([{ ...row, catalog_version: "old" }]).completed,
    0,
  );
});
test("database keeps learning private and completion atomic and idempotent", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table public.profiles(id uuid primary key, active boolean default true);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.is_team_member() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id = auth.uid() and active) $$;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid(), public.is_team_member() to authenticated, anon;`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202611030001_academy.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into public.profiles(id) values ($1),($2)", [A, B]);
    async function asUser<T>(id: string, action: () => Promise<T>) {
      await db.exec("begin; set local role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id,
      ]);
      try {
        const result = await action();
        await db.exec("commit");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }
    const save = (
      id = attempt,
      answers = [[1], [0, 1]],
      completed = true,
      position = 2,
    ) =>
      db.query(
        "select * from public.save_academy_progress($1,$2,$3::jsonb,$4,$5,$6)",
        [
          moduleId,
          id,
          JSON.stringify(answers),
          position,
          completed,
          academyCatalogVersion,
        ],
      );
    await asUser(A, () => save());
    await asUser(A, () => save());
    assert.equal(
      (await asUser(A, () => db.query("select * from public.academy_attempts")))
        .rows.length,
      1,
    );
    assert.equal(
      (await asUser(B, () => db.query("select * from public.academy_attempts")))
        .rows.length,
      0,
    );
    assert.equal(
      (await asUser(B, () => db.query("select * from public.academy_progress")))
        .rows.length,
      0,
    );
    await assert.rejects(
      asUser(A, () => save(attempt, [[0], [0, 1]])),
      /immutable/,
    );
    await assert.rejects(
      asUser(A, () => save(attempt, [[1], [0, 1]], false, 1)),
      /immutable/,
    );
    await assert.rejects(
      asUser(A, () => save(B, [[1], [0, 0]])),
      /selection values/,
    );
    await assert.rejects(
      asUser(B, () =>
        db.query(
          "insert into public.academy_attempts(user_id,attempt_id,module_id,answers,catalog_version) values ($1,$2,$3,'[]','bad')",
          [A, B, moduleId],
        ),
      ),
      /permission denied/,
    );
    await asUser(A, () => save(B));
    await asUser(A, () => save());
    const current = await asUser(A, () =>
      db.query<{ attempt_id: string }>(
        "select attempt_id from public.academy_progress",
      ),
    );
    assert.equal(
      current.rows[0].attempt_id,
      B,
      "a delayed retry must not overwrite the newer attempt",
    );
    assert.equal(
      (await asUser(A, () => db.query("select * from public.academy_attempts")))
        .rows.length,
      2,
    );
    await db.query("update public.profiles set active=false where id=$1", [A]);
    assert.equal(
      (await asUser(A, () => db.query("select * from public.academy_progress")))
        .rows.length,
      0,
    );
    await assert.rejects(
      asUser(A, () => save()),
      /Active membership/,
    );
  } finally {
    await db.close();
  }
});

