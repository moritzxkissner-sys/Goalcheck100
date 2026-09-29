import { test, expect } from "@playwright/test";
import { demoData } from "../../lib/demo";
import { number } from "../../lib/metrics";
test("add, recalculate, rank, change goal, filter and delete on desktop and mobile", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Auf Kurs, Berin." }),
  ).toBeVisible();
  await expect(page.getByTestId("total-bws")).toContainText("8.450");
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-dashboard.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(
    modal
      .getByRole("combobox", { name: "Versicherung", exact: true })
      .locator("option"),
  ).toHaveCount(7);
  await expect(
    modal.locator('select[name="category"] option[value="Kfz"]'),
  ).toHaveCount(0);
  await modal
    .getByRole("combobox", { name: "Vertragsart", exact: true })
    .selectOption("Vertragsumstellung");
  await modal
    .getByRole("combobox", { name: "Versicherung", exact: true })
    .selectOption("Haftpflicht");
  await modal.getByLabel("BWS", { exact: true }).fill("2000");
  await modal.getByLabel(/Notiz/).fill("Testabschluss");
  await modal
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByTestId("total-bws")).toContainText("10.450");
  await expect(page.locator(".ring-content")).toContainText("104,5");
  await expect(page.locator(".team-footer")).toContainText("Platz 2");
  await page.getByRole("button", { name: "Monatsziel anpassen" }).click();
  await modal.getByLabel("Monatsziel in BWS").fill("12000");
  await modal.getByRole("button", { name: "Monatsziel speichern" }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator(".ring-content")).toContainText("87,1");
  await page
    .getByRole("button", { name: "Team", exact: false })
    .filter({ visible: true })
    .first()
    .click();
  const ownRow = page.getByRole("row").filter({ hasText: "Berin Pretzer" });
  await expect(page.getByTestId("agency-goal")).toContainText("52.230");
  await expect(page.getByTestId("agency-goal")).toContainText("67.000");
  await expect(page.getByTestId("daily-winner")).toContainText("Berin Pretzer");
  const initialDaily = demoData().daily.partners.find(
    (p) => p.user_id === "demo-you",
  )!.total;
  await expect(page.getByTestId("daily-winner")).toContainText(
    number(initialDaily + 2000, 2),
  );
  await expect(ownRow).toContainText("Tagessieg");
  const dismissToast = page.getByRole("button", { name: "Meldung schließen" });
  if (await dismissToast.isVisible()) await dismissToast.click();
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-team.png`,
    fullPage: true,
  });
  await expect(ownRow).toContainText("10.450");
  await expect(ownRow).toContainText("87,1");
  await page.setViewportSize({ width: 320, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize(testInfo.project.use.viewport!);
  await page
    .getByRole("button", { name: "Meine Einträge", exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByLabel("Nach Versicherung filtern")
    .selectOption("Haftpflicht");
  await expect(page.locator(".entry-row")).toHaveCount(1);
  await expect(page.locator(".entry-row")).toContainText("Testabschluss");
  await expect(page.locator(".entry-row")).toContainText("Vertragsumstellung");
  await page
    .getByRole("button", { name: /Haftpflicht vom .* löschen/ })
    .click();
  await modal
    .getByRole("button", { name: "Eintrag löschen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Noch keine Einträge" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Übersicht", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByTestId("total-bws")).toContainText("8.450");
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Mein Konto", exact: true }).click();
  await expect(
    modal.getByRole("heading", { name: "Berin Pretzer" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("login, reset and invalid invitation states", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Willkommen zurück." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Passwort vergessen?" }).click();
  await expect(
    page.getByRole("button", { name: "Link anfordern" }),
  ).toBeVisible();
  await page.goto("/auth/confirm?token_hash=invalid&type=unsupported");
  await expect(page).toHaveURL(/notice=expired/);
  await expect(
    page.getByText("Dieser Link ist ungültig oder abgelaufen.", {
      exact: false,
    }),
  ).toBeVisible();
});
