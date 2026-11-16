import { test, expect } from "@playwright/test";
test("shared sale, edit, unique celebration and all close controls", async ({
  page,
}, info) => {
  await page.goto("/demo");
  const before = 8450;
  await page
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  let form = page.getByRole("dialog", { name: "BWS hinzufügen" });
  await form.getByLabel("BWS", { exact: true }).fill("0");
  await form
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Prima gemacht, Berin!" }),
  ).toHaveCount(0);
  await form.getByLabel("BWS", { exact: true }).fill("200");
  await form.getByLabel("BWS mit einem Vertriebspartner teilen").check();
  await form.getByLabel("Vertriebspartner suchen").fill("Steven");
  await form
    .getByLabel("Vertriebspartner auswählen")
    .selectOption({ label: "Steven Prell" });
  await expect(
    form.getByText("100 BWS", { exact: false }).first(),
  ).toBeVisible();
  await form.getByLabel("Eigener Anteil (%)", { exact: true }).fill("70");
  await expect(form.getByText("140 BWS", { exact: false })).toBeVisible();
  await form.getByLabel(/Kundenname/).fill("Gemeinsam Kunde");
  await form
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  const success = page.getByRole("dialog", { name: "Prima gemacht, Berin!" });
  await expect(success).toBeVisible();
  await expect(page.getByTestId("total-bws")).toContainText(
    (before + 140).toLocaleString("de-DE"),
  );
  await expect(success).toHaveCSS("opacity", "1");
  const box = await success.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x - (viewport.width - box!.width) / 2)).toBeLessThan(3);
  expect(Math.abs(box!.y - (viewport.height - box!.height) / 2)).toBeLessThan(
    3,
  );
  await page.screenshot({
    path: `artifacts/sale-success-${info.project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(success).not.toBeVisible();
  await page
    .getByRole("button", { name: "Meine Einträge", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const row = page.locator(".entry-row").filter({ hasText: "Gemeinsam Kunde" });
  await expect(row).toContainText("Gemeinsamer Abschluss");
  await expect(row).toContainText("Steven Prell");
  await expect(row).toContainText("60 BWS");
  await row.getByRole("button", { name: "Bearbeiten" }).click();
  form = page.getByRole("dialog", { name: "Abschluss bearbeiten" });
  await form.getByLabel("Eigener Anteil (%)", { exact: true }).fill("50");
  await form
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  await expect(form).not.toBeVisible();
  await expect(success).not.toBeVisible();
  await expect(row).toContainText("100 BWS");
  await page
    .getByRole("button", { name: "Übersicht", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByTestId("total-bws")).toContainText("8.550");
  for (const close of ["Schließen", "Weiter →"]) {
    await page
      .getByRole("button", { name: "BWS hinzufügen", exact: true })
      .click();
    form = page.getByRole("dialog", { name: "BWS hinzufügen" });
    await form.getByLabel("BWS", { exact: true }).fill("10");
    await form
      .getByRole("button", { name: "BWS hinzufügen", exact: true })
      .click();
    await expect(success).toBeVisible();
    await success.getByRole("button", { name: close, exact: true }).click();
    await expect(success).not.toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  form = page.getByRole("dialog", { name: "BWS hinzufügen" });
  await form.getByLabel("BWS", { exact: true }).fill("10");
  await form
    .getByRole("button", { name: "BWS hinzufügen", exact: true })
    .click();
  await expect(success).toBeVisible();
  expect(
    await success
      .locator('span[class*="check"]')
      .evaluate((n) => getComputedStyle(n).animationName),
  ).toBe("none");
  await page.keyboard.press("Escape");
});
test("underwriting creation, filtering, details, status and history on small screens", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Underwriting", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Underwriting", exact: true }),
  ).toBeVisible();
  const section = page.getByRole("region", {
    name: "Underwriting",
    exact: true,
  });
  await expect(
    section.getByText("Keine passenden Anfragen vorhanden."),
  ).toBeVisible();
  await section
    .getByLabel("Fachabteilung", { exact: true })
    .selectOption("SHU");
  await section
    .getByLabel("Kunde / Interessent", { exact: true })
    .fill("Max Muster");
  await section
    .getByLabel("Betreff", { exact: true })
    .fill("Haftpflicht-Risiko");
  await section
    .getByLabel("Nachricht / Anfrage", { exact: true })
    .fill("Bitte Einschätzung zum Risiko.");
  await page.screenshot({
    path: `artifacts/underwriting-form-${info.project.name}.png`,
    fullPage: true,
  });
  await section
    .getByRole("button", { name: "Anfrage senden", exact: true })
    .click();
  await expect(section.getByRole("status")).toContainText(
    "Demo-Anfrage gespeichert",
  );
  await expect(section.getByRole("table")).toContainText("Max Muster");
  await section
    .getByRole("button", { name: "Rechtsschutz", exact: true })
    .click();
  await expect(section.getByRole("table")).not.toContainText("Max Muster");
  await section.getByRole("button", { name: "SHU", exact: true }).click();
  await section.getByRole("button", { name: "Öffnen", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "Underwriting-Anfrage",
    exact: true,
  });
  await expect(modal.getByLabel("Nachricht", { exact: true })).toHaveValue(
    "Bitte Einschätzung zum Risiko.",
  );
  await modal.getByLabel("Kommentar / Rückmeldung").fill("Rückfrage ergänzt");
  await modal.getByRole("button", { name: "Rückmeldung speichern" }).click();
  await expect(
    modal.getByText("Rückfrage ergänzt", { exact: true }),
  ).toBeVisible();
  await modal.getByLabel("Status", { exact: true }).selectOption("completed");
  await modal.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.keyboard.press("Escape");
  await section.getByLabel("Status filtern").selectOption("completed");
  await expect(section.getByRole("table")).toContainText("Erledigt");
  await section.getByLabel("Anfragen durchsuchen").fill("unbekannt");
  await expect(section.getByRole("table")).not.toContainText("Max Muster");
  await section.getByLabel("Anfragen durchsuchen").fill("");
  await page.screenshot({
    path: `artifacts/underwriting-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
