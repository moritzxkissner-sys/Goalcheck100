import { test, expect } from "@playwright/test";
import { currentMonth } from "../../lib/metrics";

test("team calendar filters members, navigates months and renders a new absence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Team", exact: false })
    .filter({ visible: true })
    .first()
    .click();

  const calendar = page.getByTestId("team-calendar");
  await expect(
    calendar.getByRole("heading", { name: "Teamkalender" }),
  ).toBeVisible();
  for (const name of [
    "Berin Pretzer",
    "Steven Prell",
    "Vanessa Holzinger",
    "Yuliia Solianyk",
    "Alina Dalga",
    "Sameena Schlegelmilch",
    "Johannes Bubb",
    "Lilli Fischer",
    "Moritz Kissner",
  ]) {
    await expect(
      calendar.getByText(name, { exact: true }).first(),
    ).toBeVisible();
  }

  await calendar.getByRole("button", { name: "Nächster Monat" }).click();
  await expect(calendar).toContainText("Keine Termine in diesem Monat.");
  await calendar.getByRole("button", { name: "Heute" }).click();
  await expect(calendar.getByTitle(/Berin Pretzer: Urlaub/)).toBeVisible();

  await page.getByRole("button", { name: "Abwesenheit eintragen" }).click();
  const form = page.locator("#team-calendar-form");
  await expect(form.getByLabel("Datum von")).toBeFocused();
  const date = `${currentMonth()}-20`;
  await form.getByLabel("Datum von").fill(date);
  await form.getByLabel("Datum bis").fill(date);
  await form.getByLabel("Abwesenheitsgrund").selectOption("Homeoffice");
  await form.getByLabel(/Kommentar/).fill("Kundentermine von zu Hause");
  await form.getByRole("button", { name: "Eintragen" }).click();
  await expect(form.getByRole("status")).toContainText("eingetragen");
  await expect(calendar.getByTitle(/Berin Pretzer: Homeoffice/)).toBeVisible();
  await expect(
    calendar.getByRole("button", { name: /Krankheit.*löschen/ }),
  ).toHaveCount(0);
  await calendar
    .getByRole("button", {
      name: `Homeoffice vom 20.${currentMonth().slice(5)}.${currentMonth().slice(0, 4)} löschen`,
    })
    .click();
  await calendar.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(form.getByRole("status")).toContainText("gelöscht");
  await expect(calendar.getByTitle(/Berin Pretzer: Homeoffice/)).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
