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

test("outcome buttons persist, replace and clear only the selected appointment result", async ({
  page,
}, testInfo) => {
  let tasks = [
    appointment(
      "result-one",
      "2026-11-04T08:00:00Z",
      "2026-11-04T08:10:00Z",
      "Ergebnis Kunde",
    ),
    appointment(
      "result-two",
      "2026-11-04T08:10:00Z",
      "2026-11-04T08:20:00Z",
      "Anderer Kunde",
    ),
  ];
  const original = structuredClone(tasks);
  const patches: unknown[] = [];
  let fail = false;
  await page.route("**/api/follow-ups**", async (route) => {
    if (route.request().method() !== "PATCH")
      return route.fulfill({ json: response(tasks) });
    const input = route.request().postDataJSON();
    patches.push(input);
    if (fail)
      return route.fulfill({
        status: 500,
        json: { error: "Ergebnis konnte nicht gespeichert werden." },
      });
    tasks = tasks.map((task) =>
      task.id === "result-one" ? { ...task, ...input } : task,
    );
    return route.fulfill({ json: { task: tasks[0] } });
  });
  await mount(page);
  const card = page.getByRole("group", {
    name: "Termin Ergebnis Kunde",
    exact: true,
  });
  const noShow = "Interessent Termin nicht eingehalten";
  const reschedule = "Interessent möchte Termin verschieben";
  for (const [label, value] of [
    [noShow, "no_show"],
    [reschedule, "reschedule_requested"],
    ["Sale", "sale"],
  ]) {
    await card.getByRole("button", { name: label, exact: true }).click();
    await expect(card).toHaveAttribute("data-outcome", value);
    await expect(card.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await expect(card.getByText("Offen", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await mount(page);
  await expect(card).toHaveAttribute("data-outcome", "sale");
  await expect(
    card.getByRole("button", { name: "Sale", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const view of ["Monat", "Liste", "Woche"]) {
    await page
      .getByRole("region", { name: "Follow-up-Kalender", exact: true })
      .getByRole("button", { name: view, exact: true })
      .click();
    await expect(card).toHaveAttribute("data-outcome", "sale");
    await expect(
      card.getByRole("button", { name: "Sale", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `artifacts/follow-up-outcome-${testInfo.project.name}.png`,
    fullPage: false,
  });
  await card.getByRole("button", { name: "Sale", exact: true }).click();
  await expect(card).toHaveAttribute("data-outcome", "none");
  fail = true;
  await card.getByRole("button", { name: noShow, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Ergebnis konnte nicht gespeichert werden.",
  );
  await expect(card).toHaveAttribute("data-outcome", "none");
  await expect(card.locator('button[aria-pressed="true"]')).toHaveCount(0);
  expect(tasks[0]).toEqual({ ...original[0], outcome_status: null });
  expect(tasks[1]).toEqual(original[1]);
  expect(patches).toEqual([
    { outcome_status: "no_show" },
    { outcome_status: "reschedule_requested" },
    { outcome_status: "sale" },
    { outcome_status: null },
    { outcome_status: "no_show" },
  ]);
  const boxes = await card.getByRole("button").all();
  for (const button of boxes)
    expect(
      await button.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
});

test("weekly type totals stay unfiltered and typed cards remain consistent across views", async ({
  page,
}, testInfo) => {
  const tasks: FollowUpTask[] = [
    {
      ...appointment(
        "follow",
        "2026-11-04T08:00:00Z",
        "2026-11-04T08:30:00Z",
        "Anna Nachfassen",
      ),
      appointment_type: "follow_up",
    },
    {
      ...appointment(
        "phone",
        "2026-11-05T09:00:00Z",
        "2026-11-05T09:30:00Z",
        "Berta Telefon",
      ),
      appointment_type: "phone",
    },
    appointment(
      "legacy",
      "2026-11-06T10:00:00Z",
      "2026-11-06T10:30:00Z",
      "Clara Bestand",
    ),
    {
      ...appointment(
        "outside",
        "2026-11-11T08:00:00Z",
        "2026-11-11T08:30:00Z",
        "Andere Woche",
      ),
      appointment_type: "phone",
    },
  ];
  await page.route("**/api/follow-ups?**", (route) =>
    route.fulfill({ json: response(tasks) }),
  );
  await mount(page);
  const stats = page.getByRole("region", {
    name: "Wochenübersicht",
    exact: true,
  });
  await expect(stats).toContainText("02.11.");
  await expect(stats).toContainText("08.11.");
  await expect(stats.locator('[data-type="follow_up"] strong')).toHaveText("1");
  await expect(stats.locator('[data-type="phone"] strong')).toHaveText("1");
  await expect(
    stats
      .getByText("Termine gesamt", { exact: true })
      .locator("..")
      .locator("strong"),
  ).toHaveText("3");
  const calendar = page.getByRole("region", {
    name: "Follow-up-Kalender",
    exact: true,
  });
  await expect(
    calendar.getByText("Anna Nachfassen", { exact: true }),
  ).toBeVisible();
  const totals = await stats.innerText();
  await page.getByRole("button", { name: "Telefon", exact: true }).click();
  await expect(
    calendar.getByText("Anna Nachfassen", { exact: true }),
  ).toHaveCount(0);
  await expect(
    calendar.getByText("Clara Bestand", { exact: true }),
  ).toHaveCount(0);
  await expect(
    calendar.getByText("Berta Telefon", { exact: true }),
  ).toBeVisible();
  expect(await stats.innerText()).toBe(totals);
  for (const view of ["Monat", "Liste", "Woche"]) {
    await calendar.getByRole("button", { name: view, exact: true }).click();
    const card = calendar
      .getByRole("button")
      .filter({ hasText: "Berta Telefon" });
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-type", "phone");
    await expect(card).toContainText("Telefon");
  }
  await page.getByRole("button", { name: "Alle", exact: true }).click();
  await expect(
    calendar.getByText("Clara Bestand", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar.getByRole("button").filter({ hasText: "Anna Nachfassen" }),
  ).toHaveAttribute("data-type", "follow_up");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/follow-up-types-${testInfo.project.name}.png`,
    fullPage: false,
  });
});

test("global search combines filters and opens a future or past appointment without changing it", async ({
  page,
}, testInfo) => {
  const future = {
    ...appointment(
      "future",
      "2027-04-16T08:00:00Z",
      "2027-04-16T08:30:00Z",
      "Ferne Kundin",
    ),
    appointment_type: "phone" as const,
  };
  const past = {
    ...appointment(
      "past",
      "2025-02-03T08:00:00Z",
      "2025-02-03T08:30:00Z",
      "Früher Kunde",
    ),
    appointment_type: "follow_up" as const,
  };
  const searches: URL[] = [];
  let mutations = 0;
  await page.route("**/api/follow-ups**", async (route) => {
    if (route.request().method() !== "GET") {
      mutations++;
      return route.fulfill({ status: 500 });
    }
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search")) {
      searches.push(url);
      const q = url.searchParams.get("q") ?? "";
      return route.fulfill({
        json: {
          tasks: q.includes("Ferne")
            ? [future]
            : q.includes("Früher")
              ? [past]
              : [],
          hasMore: false,
        },
      });
    }
    return route.fulfill({
      json: response(
        url.searchParams.get("from")?.startsWith("2027") ? [future] : [past],
      ),
    });
  });
  await mount(page);
  const search = page.getByPlaceholder("Termine suchen ...");
  await search.fill("Ferne");
  const result = page.getByRole("button").filter({ hasText: "Ferne Kundin" });
  await expect(result).toBeVisible();
  const initialSearches = searches.length;
  await page
    .getByRole("region", { name: "Kalender durchsuchen" })
    .getByRole("button", { name: "Suchen", exact: true })
    .click();
  await expect.poll(() => searches.length).toBeGreaterThan(initialSearches);
  await page.getByRole("button", { name: "Follow Up", exact: true }).click();
  await result.click();
  await expect(
    page.getByRole("dialog").getByLabel("Kundenname", { exact: true }),
  ).toHaveValue("Ferne Kundin");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abbrechen", exact: true })
    .click();
  const calendar = page.getByRole("region", {
    name: "Follow-up-Kalender",
    exact: true,
  });
  await expect(calendar).toContainText("12.04.");
  await expect(calendar).toContainText("18.04.");
  await expect(
    calendar.getByRole("button", { name: "Alle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    calendar.getByRole("button").filter({ hasText: "Ferne Kundin" }),
  ).toBeVisible();
  await search.fill("Früher");
  await page.getByRole("button").filter({ hasText: "Früher Kunde" }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Kundenname", { exact: true }),
  ).toHaveValue("Früher Kunde");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abbrechen", exact: true })
    .click();
  await search.fill("Kein Treffer");
  await expect(page.getByText(/Keine.*Termine.*gefunden/)).toBeVisible();
  const searchPanel = page.getByRole("region", {
    name: "Kalender durchsuchen",
  });
  await searchPanel
    .getByRole("button", { name: "Filter", exact: true })
    .click();
  await searchPanel
    .getByLabel("Terminart", { exact: true })
    .selectOption("phone");
  await searchPanel.getByLabel("Von", { exact: true }).fill("2027-04-01");
  await searchPanel.getByLabel("Bis", { exact: true }).fill("2027-04-30");
  await expect
    .poll(() =>
      searches.some(
        (url) =>
          url.searchParams.get("q") === "Kein Treffer" &&
          url.searchParams.get("type") === "phone" &&
          url.searchParams.get("from") === "2027-04-01" &&
          url.searchParams.get("to") === "2027-04-30",
      ),
    )
    .toBe(true);
  await searchPanel
    .getByRole("button", { name: "Zurücksetzen", exact: true })
    .click();
  await expect(search).toHaveValue("");
  await expect(
    searchPanel.getByLabel("Terminart", { exact: true }),
  ).toHaveValue("all");
  await expect(searchPanel.getByLabel("Von", { exact: true })).toHaveValue("");
  await expect(searchPanel.getByLabel("Bis", { exact: true })).toHaveValue("");
  expect(searches.some((url) => url.searchParams.get("q") === "Ferne")).toBe(
    true,
  );
  expect(searches.some((url) => url.searchParams.get("q") === "Früher")).toBe(
    true,
  );
  expect(mutations).toBe(0);
  await page.screenshot({
    path: `artifacts/follow-up-search-${testInfo.project.name}.png`,
    fullPage: false,
  });
});

test("create, reclassify, reschedule and delete refresh weekly counts without changing legacy types", async ({
  page,
}) => {
  let tasks: FollowUpTask[] = [
    appointment(
      "legacy",
      "2026-11-04T10:00:00Z",
      "2026-11-04T10:30:00Z",
      "Bestandskundin",
    ),
  ];
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/follow-ups**", async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: response(tasks) });
    if (method === "DELETE") {
      tasks = tasks.filter((task) => task.id !== "created");
      return route.fulfill({ json: { ok: true } });
    }
    const input = route.request().postDataJSON();
    payloads.push(input);
    const task = {
      ...appointment("created", input.start_time, input.end_time),
      ...input,
    };
    tasks = [...tasks.filter((item) => item.id !== task.id), task];
    return route.fulfill({ json: { task } });
  });
  await mount(page);
  const stats = page.getByRole("region", {
    name: "Wochenübersicht",
    exact: true,
  });
  const count = (type: string) => stats.locator(`[data-type="${type}"] strong`);
  await expect(count("phone")).toHaveText("0");
  await page
    .getByRole("button", { name: "Termin eintragen", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kundenname", { exact: true }).fill("Neue Kundin");
  await dialog.getByLabel("Worum geht es? / Angebot").fill("Rechtsschutz");
  await dialog
    .getByRole("combobox", { name: "Terminart", exact: true })
    .selectOption("phone");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(count("phone")).toHaveText("1");
  const calendar = page.getByRole("region", {
    name: "Follow-up-Kalender",
    exact: true,
  });
  await calendar.getByRole("button").filter({ hasText: "Neue Kundin" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Terminart", exact: true })
    .selectOption("follow_up");
  const begin = dialog.getByRole("group", { name: /Beginn/ });
  const end = dialog.getByRole("group", { name: /Ende/ });
  await begin.getByLabel("Datum").fill("2026-11-11");
  await end.getByLabel("Datum").fill("2026-11-11");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(stats).toContainText("09.11.");
  await expect(count("phone")).toHaveText("0");
  await expect(count("follow_up")).toHaveText("1");
  await calendar.getByRole("button").filter({ hasText: "Neue Kundin" }).click();
  page.once("dialog", (prompt) => prompt.accept());
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Löschen", exact: true })
    .click();
  await expect(count("follow_up")).toHaveText("0");
  expect(tasks[0].appointment_type).toBeUndefined();
  expect(payloads.map((payload) => payload.appointment_type)).toEqual([
    "phone",
    "follow_up",
  ]);
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
