import { expect, test } from "@playwright/test";

test("home page shows the product heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product" })).toBeVisible();
});
