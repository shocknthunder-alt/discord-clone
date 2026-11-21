import { expect, test, type Page } from "@playwright/test";
import { closeAll, expectNoCrashes, messageInput, messageRow, openAs, openServer, openTextChannel, register, screenshotsOnFailure, sendMessage, serverWith } from "./helpers";
import { mkdirSync } from "node:fs";

screenshotsOnFailure();

async function pair(browser: import("@playwright/test").Browser) {
  const ana = await register("ana");
  const bob = await register("bob");
  const server = await serverWith(ana, bob);
  const a = await openAs(browser, ana);
  const b = await openAs(browser, bob);
  for (const p of [a.page, b.page]) {
    await openServer(p, server.name);
    await openTextChannel(p, "general");
  }
  return { ana, bob, a, b };
}

/** Select `word` inside the message box (as if dragged with the mouse). */
async function selectInBox(page: Page, word: string) {
  await messageInput(page).evaluate((el: HTMLTextAreaElement, w) => {
    const i = el.value.indexOf(w);
    el.focus();
    el.setSelectionRange(i, i + w.length);
  }, word);
}

test.describe("👑 собственик и ✍️ стил на текста", () => {
  test("собственикът има собствен вид (златно + 👑) в чата и в списъка; членът — не", async ({ browser }) => {
    const { ana, bob, a, b } = await pair(browser);
    await sendMessage(a.page, "аз съм шефът");
    await sendMessage(b.page, "аз съм член");
    const anaInChat = messageRow(b.page, "аз съм шефът").locator(".author");
    await expect(anaInChat).toHaveClass(/owner-name/);
    await expect(anaInChat).toContainText("👑");
    await expect(messageRow(b.page, "аз съм член").locator(".author")).not.toHaveClass(/owner-name/);
    await expect(b.page.locator(".member-row", { hasText: ana.username }).locator(".member-name")).toHaveClass(/owner-name/);
    await expect(b.page.locator(".member-row", { hasText: bob.username }).locator(".member-name")).not.toHaveClass(/owner-name/);
    mkdirSync("explore", { recursive: true });
    await b.page.screenshot({ path: "explore/owner-name.png" });
    await closeAll(a.context, b.context);
  });

  test("Моят текст: цвят + удебелен + шрифт → другият вижда съобщенията ми така", async ({ browser }) => {
    const { a, b } = await pair(browser);
    await a.page.locator(".user-bar-settings-button").click();
    await a.page.locator(".set-nav-item", { hasText: "Чат" }).click();
    const card = a.page.locator(".my-text-card");
    await card.locator(".my-text-colors .my-text-swatch").nth(1).click(); // first colour (#ff5c5c)
    await expect(card.locator(".my-text-state")).toContainText("Запазено");
    await card.getByRole("button", { name: "Удебелен" }).click();
    await card.getByRole("button", { name: "Машинопис" }).click();
    await expect(card.locator(".my-text-state")).toContainText("Запазено");
    await card.screenshot({ path: "explore/my-text-card.png" });
    await a.page.keyboard.press("Escape");

    await sendMessage(a.page, "червено и удебелено");
    const text = messageRow(b.page, "червено и удебелено").locator(".styled-text");
    await expect(text).toBeVisible();
    const look = await text.locator("*").first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, weight: cs.fontWeight, family: cs.fontFamily };
    });
    expect(look.color).toBe("rgb(255, 92, 92)");
    expect(Number(look.weight)).toBeGreaterThanOrEqual(600);
    expect(look.family.toLowerCase()).toMatch(/mono|consolas|courier|cascadia/);

    // Махам стила → новите съобщения пак са обикновени.
    await a.page.locator(".user-bar-settings-button").click();
    await a.page.locator(".set-nav-item", { hasText: "Чат" }).click();
    await a.page.locator(".my-text-card .my-text-swatch.none").click();
    await a.page.locator(".my-text-card").getByRole("button", { name: "Удебелен" }).click();
    await a.page.locator(".my-text-card").getByRole("button", { name: "Обикновен" }).click();
    await expect(a.page.locator(".my-text-card .my-text-state")).toContainText("Запазено");
    await a.page.keyboard.press("Escape");
    await sendMessage(a.page, "пак нормално");
    const plain = await messageRow(b.page, "пак нормално").locator(".styled-text *").first().evaluate((el) => getComputedStyle(el).color);
    expect(plain).not.toBe("rgb(255, 92, 92)");
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("Aa лентата: B / курсив / 🎨 цвят на избрана дума, Ctrl+B — другият вижда форматирането", async ({ browser }) => {
    const { a, b } = await pair(browser);
    const box = messageInput(a.page);
    await box.fill("здрасти свят и море");

    await a.page.locator(".format-toggle").click();
    await expect(a.page.locator(".format-bar")).toBeVisible();
    await selectInBox(a.page, "свят");
    await a.page.locator(".format-bar").getByTitle(/Удебелен/).click();
    await expect(box).toHaveValue("здрасти **свят** и море");
    // Пак B на същото → маха го.
    await a.page.locator(".format-bar").getByTitle(/Удебелен/).click();
    await expect(box).toHaveValue("здрасти свят и море");
    await a.page.locator(".format-bar").getByTitle(/Удебелен/).click();

    await selectInBox(a.page, "море");
    await a.page.locator(".format-bar").getByTitle(/Цвят/).click();
    await a.page.locator(".format-colors .format-swatch").nth(6).click(); // #4cc9f0
    await expect(box).toHaveValue("здрасти **свят** и {#4cc9f0}море{/}");

    await selectInBox(a.page, "здрасти");
    await box.press("Control+i");
    await expect(box).toHaveValue("*здрасти* **свят** и {#4cc9f0}море{/}");
    await a.page.screenshot({ path: "explore/format-bar.png", clip: { x: 340, y: 600, width: 860, height: 300 } });
    await box.press("Enter");

    const row = messageRow(b.page, "свят");
    await expect(row.locator("strong", { hasText: "свят" })).toBeVisible();
    await expect(row.locator("em", { hasText: "здрасти" })).toBeVisible();
    const sea = row.locator(".md-color", { hasText: "море" });
    await expect(sea).toHaveCSS("color", "rgb(76, 201, 240)");
    await expect(row).not.toContainText("{#");

    // Ctrl+B без лентата.
    await a.page.locator(".format-toggle").click();
    await box.fill("само това");
    await selectInBox(a.page, "това");
    await box.press("Control+b");
    await expect(box).toHaveValue("само **това**");
    await b.page.screenshot({ path: "explore/formatted-message.png" });
    await closeAll(a.context, b.context);
  });
});
