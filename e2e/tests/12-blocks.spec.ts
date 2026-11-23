import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { api, closeAll, expectNoCrashes, openAs, openServer, openTextChannel, register, screenshotsOnFailure, serverWith } from "./helpers";

screenshotsOnFailure();
mkdirSync("explore", { recursive: true });

test.describe("🧱 Шметрис", () => {
  test("игра до край с клавиатурата → рекорд в класацията, другият го вижда; сървърът отказва невъзможни точки", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    const { textChannel } = await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шметрис", type: "blocks" });
    expect(textChannel.type).toBe("blocks");

    const a = await openAs(browser, ana);
    await openServer(a.page, server.name);
    await openTextChannel(a.page, "шметрис");
    const overlay = a.page.locator(".blk-overlay");
    await expect(overlay).toContainText("Играй");

    // Размер: влачене на ъгъла → по-голямо, остава след презареждане; двоен клик → пак по екрана.
    const well = a.page.locator(".blk-well-wrap");
    const h0 = (await well.boundingBox())!.height;
    const handle = (await a.page.locator(".blk-resize-handle").boundingBox())!;
    await a.page.mouse.move(handle.x + 10, handle.y + 10);
    await a.page.mouse.down();
    await a.page.mouse.move(handle.x + 10, handle.y - 150, { steps: 5 });
    await a.page.mouse.up();
    const h1 = (await well.boundingBox())!.height;
    expect(h1).toBeLessThan(h0 - 100);
    await a.page.reload();
    await openServer(a.page, server.name);
    await openTextChannel(a.page, "шметрис");
    await expect(a.page.locator(".blk-overlay")).toContainText("Играй");
    expect(Math.abs((await well.boundingBox())!.height - h1)).toBeLessThan(2);
    await a.page.locator(".blk-resize-handle").dblclick();
    expect(Math.abs((await well.boundingBox())!.height - h0)).toBeLessThan(2);
    await expect(a.page.locator(".blk-top")).toContainText("Още никой не е играл");
    await a.page.locator(".blk-view").screenshot({ path: "explore/blocks-start.png" });

    // 🎵 Музика: включена по подразбиране, с плъзгач; изключване → без плъзгач (остава след презареждане).
    const musicBtn = a.page.locator(".blk-music button");
    await expect(musicBtn).toContainText("🎵");
    await expect(a.page.locator(".blk-music input[type=range]")).toBeVisible();
    await musicBtn.click();
    await expect(a.page.locator(".blk-music input[type=range]")).toHaveCount(0);
    expect(await a.page.evaluate(() => localStorage.getItem("blocksMusic"))).toBe("off");
    await musicBtn.click();
    await expect(a.page.locator(".blk-music input[type=range]")).toBeVisible();

    await expect(a.page.locator(".blk-shmirko .bs-wrap.bs-idle")).toBeVisible();
    await a.page.getByRole("button", { name: /Играй/ }).click();
    await expect(overlay).toHaveCount(0);
    // Запазване на блок (C) → кутийката „Запазен“ вече рисува нещо; стрелки и въртене не чупят нищо.
    await a.page.keyboard.press("KeyC");
    await a.page.keyboard.press("ArrowLeft");
    await a.page.keyboard.press("ArrowUp");
    await a.page.keyboard.press("KeyZ");
    // Пауза и продължаване.
    await a.page.keyboard.press("KeyP");
    await expect(a.page.locator(".blk-paused")).toBeVisible();
    await a.page.getByRole("button", { name: /Продължи/ }).click();
    await expect(a.page.locator(".blk-paused")).toHaveCount(0);

    // Мигновено пускане отново и отново, без местене → кулата стига върха → край на играта.
    for (let i = 0; i < 80 && (await overlay.count()) === 0; i++) {
      await a.page.keyboard.press("Space");
      await a.page.waitForTimeout(40);
      if (i === 3) await a.page.locator(".blk-view").screenshot({ path: "explore/blocks-playing.png" });
    }
    await expect(overlay).toContainText("Нова игра", { timeout: 10_000 });
    const score = Number((await a.page.locator(".blk-result-score").innerText()).replace(/\D/g, ""));
    expect(score).toBeGreaterThan(0); // 2 т. на ред при мигновено пускане
    await expect(a.page.locator(".blk-record")).toContainText("Нов личен рекорд");
    // 👴 Бай Шмирко е тъжен след края на играта (с реплика).
    await expect(a.page.locator(".blk-shmirko .bs-wrap.bs-sad")).toBeVisible();
    await expect(a.page.locator(".blk-shmirko .bs-bubble")).toBeVisible();
    await expect(a.page.locator(".blk-top li")).toHaveCount(1);
    await expect(a.page.locator(".blk-top li.me")).toContainText(ana.username);
    await a.page.locator(".blk-view").screenshot({ path: "explore/blocks-over.png" });

    // Bob вижда Ana в класацията.
    const b = await openAs(browser, bob);
    await openServer(b.page, server.name);
    await openTextChannel(b.page, "шметрис");
    await expect(b.page.locator(".blk-top li").first()).toContainText(ana.username);

    // Сървърът: невъзможен резултат → 400, обикновен канал → 404, по-слаб резултат не сваля рекорда.
    const url = `/text-channels/${textChannel.id}/blocks/score`;
    await expect(api(bob.token, "POST", url, { score: 9_000_000, lines: 0, level: 1, durationMs: 1000 })).rejects.toThrow();
    const { textChannels } = await api(ana.token, "GET", `/servers/${server.id}/channels`);
    const general = textChannels.find((c: { name: string }) => c.name === "general");
    await expect(api(ana.token, "POST", `/text-channels/${general.id}/blocks/score`, { score: 10, lines: 0, level: 1, durationMs: 1000 })).rejects.toThrow();
    const weaker = await api(ana.token, "POST", url, { score: 1, lines: 0, level: 1, durationMs: 1000 });
    expect(weaker.record).toBe(false);
    expect(weaker.mine.best).toBe(score);
    expect(weaker.mine.games).toBe(2);

    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("🎵 всеки музикален стил (нива 1, 3, 5, 7, 9, 11) свири без грешки", async ({ browser }) => {
    const ana = await register("ana");
    const server = await serverWith(ana);
    await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шметрис", type: "blocks" });
    const a = await openAs(browser, ana);
    await openServer(a.page, server.name);
    await openTextChannel(a.page, "шметрис");
    for (const level of [1, 3, 5, 7, 9, 11]) {
      await a.page.locator(".blk-level-pick select").selectOption(String(level));
      await a.page.getByRole("button", { name: /Играй|Нова игра/ }).click();
      await expect(a.page.locator(".blk-stats")).toContainText(String(level));
      await a.page.waitForTimeout(1500); // a few bars of that style
      await a.page.keyboard.press("KeyP");
      await a.page.getByRole("button", { name: /Край на играта/ }).click();
      await expect(a.page.locator(".blk-overlay")).toContainText("Нова игра");
    }
    expectNoCrashes(a.page);
    await closeAll(a.context);
  });
});
