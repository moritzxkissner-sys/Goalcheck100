import { test, expect } from "@playwright/test";
import { demoData } from "../../lib/demo";
import { number } from "../../lib/metrics";
test("add, recalculate, rank, change goal, filter and delete on desktop and mobile", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(page.locator(".sidebar nav .nav-item").nth(0)).toContainText(
    "Übersicht",
  );
  await expect(page.locator(".sidebar nav .nav-item").nth(1)).toContainText(
    "Meine Einträge",
  );
  await expect(page.locator(".sidebar nav .nav-item").nth(2)).toContainText(
    "Team",
  );
  await expect(page.locator(".mobile-nav button").nth(0)).toContainText(
    "Übersicht",
  );
  await expect(page.locator(".mobile-nav button").nth(1)).toContainText(
    "Meine Einträge",
  );
  await expect(page.locator(".mobile-nav button").nth(2)).toContainText("Team");
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
  ).toHaveCount(11);
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
  await modal.getByLabel(/Kundenname/).fill("Kunde Test");
  await modal
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByTestId("total-bws")).toContainText("10.450");
  await page
    .getByRole("button", { name: "Meine Einträge", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByText("Kunde: Kunde Test")).toBeVisible();
  await page
    .getByRole("button", { name: "Übersicht", exact: true })
    .filter({ visible: true })
    .first()
    .click();
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
  await expect(page.getByRole("heading", { name: "Unser Team" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tagesbewertung" }),
  ).toBeVisible();
  await expect(page.getByTestId("daily-earnings")).toBeVisible();
  const ownRow = page
    .getByRole("table", { name: "Team-Rangliste" })
    .getByRole("row")
    .filter({ hasText: "Berin Pretzer" });
  await expect(page.getByTestId("agency-goal")).toContainText("52.230");
  await expect(page.getByTestId("agency-goal")).toContainText("67.000");
  await expect(page.getByTestId("daily-winner")).toContainText("Berin Pretzer");
  const initialDaily = demoData().daily.partners.find(
    (p) => p.user_id === "demo-you",
  )!.total;
  await expect(page.getByTestId("daily-winner")).toContainText(
    number(initialDaily + 2000, 2),
  );
  const dailyTable = page.getByRole("table", {
    name: "Tages-BWS der Vertriebspartner",
  });
  const dailyRows = dailyTable.getByRole("row");
  await expect(dailyRows).toHaveCount(7);
  await expect(dailyRows.nth(1)).toContainText("Berin Pretzer");
  await expect(dailyRows.nth(1)).toContainText("Tagessieger");
  await expect(dailyRows.nth(1)).toContainText("BWS");
  await expect(dailyRows.last()).toContainText("0 BWS");
  await expect(ownRow).not.toContainText("Tagessieg");
  const dailyChart = page.getByTestId("daily-chart").getByRole("listitem", {
    name: /Berin Pretzer/,
  });
  await expect(dailyChart).toContainText(
    `${number(initialDaily + 2000, 2)} BWS`,
  );
  await expect(page.getByTestId("daily-chart")).toContainText(
    "Unsere Performance",
  );
  await expect(page.getByText("Team Abschlüsse im Monat")).toBeVisible();
  const ownChart = page.getByTestId("team-chart").getByRole("listitem", {
    name: /Berin Pretzer/,
  });
  await expect(ownChart).toContainText("10.450");
  await expect(ownChart).toContainText("12.000");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as Window & { sharedTeamText?: string }).sharedTeamText =
            text;
        },
      },
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "Tabelle teilen" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Zwischenablage kopiert",
  );
  expect(
    await page.evaluate(
      () => (window as Window & { sharedTeamText?: string }).sharedTeamText,
    ),
  ).toContain(`Berin Pretzer: ${number(initialDaily + 2000, 2)} BWS`);
  expect(
    await page.evaluate(
      () => (window as Window & { sharedTeamText?: string }).sharedTeamText,
    ),
  ).toContain("goalcheck.vercel.app");
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
  await expect(page.locator(".entry-row")).toContainText("Kunde: Kunde Test");
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
test("daily share opens the native share dialog when supported", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as Window & { sharedTeam?: ShareData }).sharedTeam = data;
      },
      configurable: true,
    });
  });
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Team", exact: false })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Tabelle teilen" }).click();
  const shared = await page.evaluate(
    () => (window as Window & { sharedTeam?: ShareData }).sharedTeam,
  );
  expect(shared?.title).toBe("Goal Track · Tagesrangliste");
  expect(shared?.text).toContain("Beispieldaten");
  expect(shared?.text).toContain("https://goalcheck.vercel.app");
  await expect(page.getByRole("status")).toHaveCount(0);
});
test("manual account login and invalid invitation states", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Willkommen zurück." }),
  ).toBeVisible();
  await expect(
    page.getByText(/Passwort vergessen\? Wende dich an deine Teamleitung/),
  ).toBeVisible();
  await page.goto("/account/password");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/auth/confirm?token_hash=invalid&type=unsupported");
  await expect(page).toHaveURL(/notice=expired/);
  await expect(
    page.getByText("Dieser Link ist ungültig oder abgelaufen.", {
      exact: false,
    }),
  ).toBeVisible();
});
