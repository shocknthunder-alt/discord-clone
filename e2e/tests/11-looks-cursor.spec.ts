import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { api, closeAll, expectNoCrashes, openAs, openServer, openTextChannel, register, screenshotsOnFailure, serverWith } from "./helpers";

screenshotsOnFailure();
mkdirSync("explore", { recursive: true });

const SERVER_BG = "https://example.invalid/server-bg.png";
const MY_BG = "https://example.invalid/my-bg.png";

async function bgOf(page: import("@playwright/test").Page) {
  return page.locator(".message-list").evaluate((el) => getComputedStyle(el).backgroundImage);
}

test.describe("🖼️ моите картинки и 🖱️ курсори", () => {
  test("фонът на сървъра го виждат всички; моят фон / скриване — само аз", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    const { textChannels } = await api(ana.token, "GET", `/servers/${server.id}/channels`);
    const general = textChannels.find((c: { name: string }) => c.name === "general");
    await api(ana.token, "PATCH", `/text-channels/${general.id}`, { backgroundUrl: SERVER_BG });

    const a = await openAs(browser, ana);
    const b = await openAs(browser, bob);
    for (const p of [a.page, b.page]) {
      await openServer(p, server.name);
      await openTextChannel(p, "general");
    }
    expect(await bgOf(a.page)).toContain("server-bg.png");
    expect(await bgOf(b.page)).toContain("server-bg.png");

    // Bob слага свой фон (през API-то, което ползва и картата) → само той го вижда, и след презареждане.
    const { user } = await api(bob.token, "PATCH", "/auth/me", { personalLooks: { channels: { [general.id]: MY_BG }, servers: { [server.id]: { icon: "javascript:alert(1)" } } } });
    expect(user.personalLooks).toEqual({ channels: { [general.id]: MY_BG } }); // лошият URL е изчистен
    await b.page.reload();
    await openServer(b.page, server.name);
    await openTextChannel(b.page, "general");
    await expect.poll(() => bgOf(b.page)).toContain("my-bg.png");
    expect(await bgOf(a.page)).toContain("server-bg.png");

    // Картата в настройките: показва „моя“, после „Скрий“ → без фон, „Като на сървъра“ → пак сървърния.
    await b.page.locator(".user-bar-settings-button").click();
    await b.page.locator(".set-nav-item", { hasText: "Външен вид" }).click();
    const row = b.page.locator(".my-looks-row", { hasText: "# general" });
    await expect(row).toContainText("моя");
    await b.page.locator(".my-looks-card").screenshot({ path: "explore/my-looks-card.png" });
    await row.getByRole("button", { name: "Скрий" }).click();
    await expect(row).toContainText("скрита");
    await row.getByRole("button", { name: /Като на сървъра/ }).click();
    await expect(row).toContainText("като на сървъра");
    await b.page.locator(".set-close").click();
    await expect.poll(() => bgOf(b.page)).toContain("server-bg.png");

    // Скрита при Bob → Ana пак вижда своя (сървърния) фон.
    await api(bob.token, "PATCH", "/auth/me", { personalLooks: { channels: { [general.id]: "" } } });
    await b.page.reload();
    await openServer(b.page, server.name);
    await openTextChannel(b.page, "general");
    await expect.poll(() => bgOf(b.page)).toBe("none");
    expect(await bgOf(a.page)).toContain("server-bg.png");
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("курсор: модел, цвят, размер — прилага се на страницата и остава след презареждане", async ({ browser }) => {
    const ana = await register("ana");
    const a = await openAs(browser, ana);
    await a.page.locator(".user-bar-settings-button").click();
    await a.page.locator(".set-nav-item", { hasText: "Външен вид" }).click();
    // Версията над „Изход“: в браузъра пише „Браузър“ + версията на сайта.
    await expect(a.page.locator(".set-version")).toContainText("Браузър");
    await expect(a.page.locator(".set-version")).toContainText(/Сайт \S+ · \d/);
    await a.page.locator(".set-nav").screenshot({ path: "explore/settings-version.png" });
    const card = a.page.locator(".cursor-card");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "explore/cursor-card.png" });

    await card.locator('.cursor-skin[data-skin="sword"]').click();
    await expect(a.page.locator("html")).toHaveClass(/custom-cursor/);
    const cursorOf = (sel: string) => a.page.locator(sel).first().evaluate((el) => getComputedStyle(el).cursor);
    expect(await cursorOf("body")).toContain("url(");
    expect(await cursorOf(".set-close")).toContain("url("); // бутоните → ръчичката на скина
    expect(await cursorOf(".set-close")).not.toBe(await cursorOf("body"));

    const before = await cursorOf("body");
    await card.locator(".cursor-swatch").nth(3).click(); // #6cbf3a (мечът ползва нюанси на цвета)
    expect(await cursorOf("body")).not.toBe(before);
    await card.getByRole("button", { name: "48px" }).click();
    expect(decodeURIComponent(await cursorOf("body"))).toContain('width="48"');
    await card.screenshot({ path: "explore/cursor-card-sword.png" });

    // Всички модели един след друг — никой не чупи страницата.
    for (const id of ["classic", "neon", "pixel", "crystal", "royal", "wand", "rocket", "flame", "demon", "pickle"]) {
      await card.locator(`.cursor-skin[data-skin="${id}"]`).click();
      expect(await cursorOf("body")).toContain("url(");
    }
    await a.page.reload();
    await expect(a.page.locator("html")).toHaveClass(/custom-cursor/);
    expect(decodeURIComponent(await cursorOf("body"))).toContain('width="48"');

    // Обратно на обикновения.
    await a.page.locator(".user-bar-settings-button").click();
    await a.page.locator(".set-nav-item", { hasText: "Външен вид" }).click();
    await a.page.locator(".cursor-card .cursor-skin", { hasText: "Обикновен" }).click();
    await expect(a.page.locator("html")).not.toHaveClass(/custom-cursor/);
    expect(await cursorOf("body")).not.toContain("url(");
    expectNoCrashes(a.page);
    await closeAll(a.context);
  });
});
