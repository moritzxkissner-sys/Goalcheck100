import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import type { FollowUpTask } from "../../lib/follow-ups";
import type { TeamCalendarEntry } from "../../lib/team-calendar";

const member = "00000000-0000-4000-8000-000000000001";
let script = "";
let css = "";

// Bundle the actual components and their styles. Only their external data
// boundaries are mocked; this fixture adds no application route or dependency.
test.beforeAll(async () => {
  const bundle = await build({
    absWorkingDir: process.cwd(),
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import FollowUpCalendar from "./components/follow-up-calendar";
        import TeamCalendar from "./components/team-calendar";
        function TeamFixture() {
          const [entries, setEntries] = useState([]);
          window.replaceTeamEntries = setEntries;
          return <TeamCalendar entries={entries} entriesMonth="2026-11"
            members={[{id: "${member}", full_name: "Test Mitglied"}]}
            currentUserId="${member}" canManageCalendar={true}
            onCreate={async () => ({})} onDelete={async () => ({})}
            onLoadMonth={month => window.loadTeamMonth(month)} />;
        }
        createRoot(document.getElementById("root")).render(
          location.hash === "#team" ? <TeamFixture /> : <FollowUpCalendar />
        );`,
    },
    bundle: true,
    write: false,
    outfile: "calendar-fixture.js",
    loader: { ".css": "local-css" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  script = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

async function mount(page: Page, team = false) {
  await page.clock.setFixedTime(new Date("2026-11-04T11:00:00Z"));
  await page.route("http://calendar.test/fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto(`http://calendar.test/fixture${team ? "#team" : ""}`);
  await page.addStyleTag({
    content: `*{box-sizing:border-box}body{margin:0;padding:12px;background:#09121e;font-family:Arial,sans-serif}button,input,select,textarea{font:inherit}${css}`,
  });
  await page.addScriptTag({ content: script });
}

function appointment(
  id: string,
  start: string,
  end: string,
  name = id,
): FollowUpTask {
  return {
    id,
    owner_id: member,
    assigned_to: member,
    title: "Follow-up",
    customer_name: name,
    customer_email: null,
    customer_phone: null,
    offer_subject: "Rechtsschutz-Angebot besprechen",
    start_time: start,
    end_time: end,
    status: "pending",
    notes: "",
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
  };
}

const response = (tasks: FollowUpTask[]) => ({
  tasks,
  currentUserId: member,
  canAssign: true,
  members: [{ id: member, full_name: "Test Mitglied" }],
});

test("week cards align to minutes, separate overlaps, show long names and reach the evening", async ({
  page,
}, testInfo) => {
  const longName =
    "Alexandra Katharina Musterkundin mit einem besonders ausführlichen Familiennamen";
  const tasks = [
    appointment(
      "morning",
      "2026-11-04T08:15:00Z",
      "2026-11-04T09:00:00Z",
      longName,
    ),
    appointment("overlap", "2026-11-04T08:20:00Z", "2026-11-04T08:50:00Z"),
    appointment("evening", "2026-11-04T17:45:00Z", "2026-11-04T18:15:00Z"),
    appointment("late", "2026-11-04T20:30:00Z", "2026-11-04T20:55:00Z"),
  ];
  tasks[0].offer_subject =
    "Ausführliche Besprechung des Rechtsschutz-Angebots einschließlich aller offenen Fragen und individuellen Vertragsdetails";
  await page.route("**/api/follow-ups?**", (route) =>
    route.fulfill({ json: response(tasks) }),
  );
  await mount(page);
  const calendar = page.getByRole("region", {
    name: "Follow-up-Kalender",
    exact: true,
  });
  await expect(
    calendar.getByRole("button", { name: /Mi.*04\.11.*4 Termine/ }),
  ).toBeVisible();
  const morning = calendar.getByTitle(/^09:15–10:00/);
  const overlap = calendar.getByTitle(/^09:20–09:50/);
  const nine = await calendar.getByText("09:00", { exact: true }).boundingBox();
  const ten = await calendar.getByText("10:00", { exact: true }).boundingBox();
  const first = await morning.boundingBox();
  const second = await overlap.boundingBox();
  expect(Math.abs(first!.y - (nine!.y + (ten!.y - nine!.y) / 4))).toBeLessThan(
    2,
  );
  expect(first!.x + first!.width).toBeLessThanOrEqual(second!.x);
  await expect(morning.getByText(longName, { exact: true })).toBeVisible();
  expect(
    await morning.evaluate(
      (node) =>
        node.scrollWidth <= node.clientWidth &&
        node.scrollHeight <= node.clientHeight,
    ),
  ).toBe(true);
  await morning.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `artifacts/calendar-${testInfo.project.name}-overlap.png`,
    fullPage: true,
  });
  for (const time of ["18:45", "21:30"]) {
    const card = calendar.getByTitle(new RegExp(`^${time}`));
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport();
  }
  // Keep the time/name at the start of a wide day column visible in the
  // mobile review image, as a person can do with the horizontal scrollbar.
  await calendar.getByTitle(/^21:30/).evaluate((node) => {
    const scroller = node.parentElement!.parentElement!.parentElement!;
    scroller.scrollLeft +=
      node.getBoundingClientRect().left -
      scroller.getBoundingClientRect().left -
      67;
  });
  await page.screenshot({
    path: `artifacts/calendar-${testInfo.project.name}-evening.png`,
    fullPage: true,
  });
  await expect(calendar.getByText("Weitere Uhrzeiten")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a late old month response cannot replace the newly selected month", async ({
  page,
}) => {
  let releaseOld: (() => Promise<void>) | undefined;
  await page.route("**/api/follow-ups?**", async (route) => {
    const from = new URL(route.request().url()).searchParams.get("from");
    if (from === "2026-11-30") {
      releaseOld = () =>
        route.fulfill({
          json: response([
            appointment(
              "old",
              "2026-12-04T10:00:00Z",
              "2026-12-04T10:30:00Z",
              "Alter Dezember",
            ),
          ]),
        });
    } else {
      await route.fulfill({
        json: response(
          from === "2026-12-28"
            ? [
                appointment(
                  "new",
                  "2027-01-04T10:00:00Z",
                  "2027-01-04T10:30:00Z",
                  "Aktueller Januar",
                ),
              ]
            : [],
        ),
      });
    }
  });
  await mount(page);
  await expect(
    page.getByRole("button", { name: "Termin eintragen", exact: true }),
  ).toBeEnabled();
  // Let the mock transport deliver a late response even after AbortController
  // fires, exercising the component's request identity guard as well.
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      fetch(input, { ...init, signal: undefined });
  });
  const calendar = page.getByRole("region", {
    name: "Follow-up-Kalender",
    exact: true,
  });
  await calendar.getByRole("button", { name: "Monat", exact: true }).click();
  await calendar.getByRole("button", { name: "Nächster Zeitraum" }).click();
  await expect.poll(() => !!releaseOld).toBe(true);
  await calendar.getByRole("button", { name: "Nächster Zeitraum" }).click();
  await expect(
    calendar.getByText("Aktueller Januar", { exact: true }),
  ).toBeVisible();
  const oldResponse = page.waitForResponse(
    (reply) => new URL(reply.url()).searchParams.get("from") === "2026-11-30",
  );
  await releaseOld!();
  await (await oldResponse).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(calendar).toContainText("Januar 2027");
  await expect(
    calendar.getByText("Aktueller Januar", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar.getByText("Alter Dezember", { exact: true }),
  ).toHaveCount(0);
});

test("editing split date and time inputs sends the selected Berlin appointment", async ({
  page,
}) => {
  let task = appointment(
    "edit",
    "2026-11-04T17:45:00Z",
    "2026-11-04T18:15:00Z",
    "Termin bearbeiten",
  );
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/follow-ups**", async (route) => {
    if (route.request().method() === "PATCH") {
      saved = route.request().postDataJSON();
      task = { ...task, ...saved };
      await route.fulfill({ json: { task } });
    } else await route.fulfill({ json: response([task]) });
  });
  await mount(page);
  await page.getByTitle(/^18:45–19:15/).click();
  const dialog = page.getByRole("dialog");
  const start = dialog.getByRole("group", { name: /Beginn/ });
  const end = dialog.getByRole("group", { name: /Ende/ });
  await expect(start.getByLabel("Datum")).toHaveValue("2026-11-04");
  await expect(start.getByLabel("Uhrzeit")).toHaveValue("18:45");
  await start.getByLabel("Datum").fill("2026-11-05");
  await start.getByLabel("Uhrzeit").fill("19:15");
  await end.getByLabel("Datum").fill("2026-11-05");
  await end.getByLabel("Uhrzeit").fill("19:45");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toMatchObject({
    start_time: "2026-11-05T18:15:00.000Z",
    end_time: "2026-11-05T18:45:00.000Z",
  });
  await expect(page.getByTitle(/^19:15–19:45/)).toBeVisible();
});

test("team prop refresh updates entries while retaining the browsed month, form and scroll", async ({
  page,
}) => {
  const entry = (
    month: string,
    reason: TeamCalendarEntry["reason"],
  ): TeamCalendarEntry => ({
    id: month + reason,
    user_id: member,
    starts_on: `${month}-06`,
    ends_on: `${month}-06`,
    reason,
    comment: "Aktualisiert",
  });
  let loads = 0;
  let december = [entry("2026-12", "Homeoffice")];
  await page.exposeFunction("loadTeamMonth", async () => {
    loads++;
    return december;
  });
  await mount(page, true);
  const calendar = page.getByTestId("team-calendar");
  const form = calendar.locator("form");
  await form.getByLabel(/Kommentar/).fill("Ungespeicherter Entwurf");
  await form.getByLabel("Abwesenheitsgrund").selectOption("Weiterbildung");
  await form.getByLabel("Datum von").fill("2026-12-10");
  const replace = (entries: TeamCalendarEntry[]) =>
    page.evaluate((rows) => {
      (
        window as unknown as Window & {
          replaceTeamEntries: (entries: TeamCalendarEntry[]) => void;
        }
      ).replaceTeamEntries(rows);
    }, entries);
  await replace([entry("2026-11", "Urlaub")]);
  await expect(calendar.getByTitle(/Test Mitglied: Urlaub/)).toBeVisible();
  expect(loads).toBe(0);
  await calendar.getByRole("button", { name: "Nächster Monat" }).click();
  await expect(calendar.getByTitle(/Test Mitglied: Homeoffice/)).toBeVisible();
  const scroller = calendar.locator('[aria-busy="false"]');
  const scroll = await scroller.evaluate((node) => {
    node.scrollLeft = 150;
    return node.scrollLeft;
  });
  december = [entry("2026-12", "Urlaub")];
  await replace([]);
  await expect(calendar.getByTitle(/Test Mitglied: Urlaub/)).toBeVisible();
  await expect(calendar).toContainText("Dezember 2026");
  await expect(calendar.getByTitle(/Test Mitglied: Homeoffice/)).toHaveCount(0);
  await expect(form.getByLabel(/Kommentar/)).toHaveValue(
    "Ungespeicherter Entwurf",
  );
  await expect(form.getByLabel("Abwesenheitsgrund")).toHaveValue(
    "Weiterbildung",
  );
  await expect(form.getByLabel("Datum von")).toHaveValue("2026-12-10");
  expect(await scroller.evaluate((node) => node.scrollLeft)).toBe(scroll);
  expect(loads).toBe(2);
});
