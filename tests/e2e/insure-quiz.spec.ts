import { expect, test } from "@playwright/test";

test("quiz validates answers and resumes from session storage", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "InsureQuiz", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Quiz starten oder fortsetzen" })
    .click();
  await expect(page.getByText("Frage 1 von 6")).toBeVisible();
  const prompt = await page.locator("#insurequiz-question-title").textContent();

  await page.getByRole("button", { name: "Antwort prüfen" }).click();
  await expect(page.getByText("Bitte wähle eine Antwort aus.")).toHaveText(
    "Bitte wähle eine Antwort aus.",
  );
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Antwort prüfen" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Richtig|Noch nicht ganz/ }),
  ).toBeVisible();

  await page.reload();
  await page
    .getByRole("button", { name: "InsureQuiz", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Quiz starten oder fortsetzen" })
    .click();
  await expect(page.locator("#insurequiz-question-title")).toHaveText(
    prompt ?? "",
  );
  await expect(
    page.getByRole("button", { name: "Nächste Frage" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nächste Frage" }).click();
  await expect(page.getByText("Frage 2 von 6")).toBeVisible();
});
