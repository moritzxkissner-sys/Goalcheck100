import { expect, test, type Page } from "@playwright/test";

async function openAcademy(page: Page) {
  await page.goto("/demo", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "InsureQuiz", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  return page.getByRole("region", { name: "InsureQuiz Lernbereich" });
}

test("academy navigates source-pending areas and finishes a lesson without inventing progress", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const academy = await openAcademy(page);
  await expect(
    academy.getByRole("heading", { name: "Willkommen in deinem Lernbereich" }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/${info.project.name}-academy-home.png`,
    fullPage: true,
  });
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "Fachberaterzertifizierungen",
        exact: true,
      }),
    })
    .click();
  await expect(
    academy.getByRole("heading", { name: "Gesundheit", exact: true }),
  ).toBeVisible();
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Gesundheit", exact: true }),
    })
    .click();
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Grundlagen", exact: true }),
    })
    .click();
  await expect(
    academy.getByText("Aktuell ist kein Quiz verfügbar."),
  ).toBeVisible();
  await academy
    .getByRole("button", { name: "Lernbereich", exact: true })
    .click();
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "SalesPower Ausbildung",
        exact: true,
      }),
    })
    .click();
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "Hausratversicherung",
        exact: true,
      }),
    })
    .click();
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "Hausratversicherung · Grundlagen",
        exact: true,
      }),
    })
    .click();
  await academy
    .getByRole("button", { name: "Quiz starten", exact: true })
    .click();
  await expect(
    academy.getByRole("button", { name: "Antwort prüfen", exact: true }),
  ).toBeDisabled();
  for (const index of [0, 0, 1]) {
    await academy.getByRole("radio").nth(index).check();
    await academy
      .getByRole("button", { name: "Antwort prüfen", exact: true })
      .click();
    await expect(academy.getByText(/Quelle: /)).toBeVisible();
    await academy
      .getByRole("button", { name: /Nächste Frage|Ergebnis anzeigen/ })
      .click();
  }
  await expect(
    academy.getByRole("heading", { name: "Lernmodul abgeschlossen" }),
  ).toBeVisible();
  await expect(
    academy.getByText("Diese Fragen kannst du noch festigen"),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/${info.project.name}-academy-result.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("academy supports explicit multiple selection", async ({ page }) => {
  const academy = await openAcademy(page);
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "SalesPower Ausbildung",
        exact: true,
      }),
    })
    .click();
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "Haftpflichtversicherung",
        exact: true,
      }),
    })
    .click();
  await academy
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "Haftpflichtversicherung · Grundlagen",
        exact: true,
      }),
    })
    .click();
  await academy
    .getByRole("button", { name: "Quiz starten", exact: true })
    .click();
  await academy.getByRole("radio").nth(1).check();
  await academy
    .getByRole("button", { name: "Antwort prüfen", exact: true })
    .click();
  await academy
    .getByRole("button", { name: "Nächste Frage", exact: true })
    .click();
  await expect(academy.getByText(/Mehrfachauswahl/)).toBeVisible();
  await academy.getByRole("checkbox").nth(0).check();
  await academy.getByRole("checkbox").nth(1).check();
  await academy
    .getByRole("button", { name: "Antwort prüfen", exact: true })
    .click();
  await academy
    .getByRole("button", { name: "Ergebnis anzeigen", exact: true })
    .click();
  await expect(
    academy.getByRole("heading", { name: "Lernmodul abgeschlossen" }),
  ).toBeVisible();
});

test("weekly grid includes evening hours and a visible 22:00 boundary", async ({
  page,
}) => {
  await page.goto("/demo", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Angebotsmanager", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const calendar = page
    .getByRole("region", { name: "Follow-up-Kalender", exact: true })
    .last();
  for (const hour of ["18:00", "19:00", "20:00", "21:00", "22:00"]) {
    const label = calendar.getByText(hour, { exact: true });
    await label.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

