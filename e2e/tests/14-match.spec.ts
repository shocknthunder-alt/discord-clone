import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { api, closeAll, expectNoCrashes, openAs, openServer, openTextChannel, register, screenshotsOnFailure, serverWith } from "./helpers";

screenshotsOnFailure();
mkdirSync("explore", { recursive: true });

type Pos = { r: number; c: number };

/** Drag a gem onto its neighbour (the move comes from the dev-only helper on the page). */
async function playOneMove(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __matchBusy?: () => boolean }).__matchBusy?.())).toBe(false);
  const mv = await page.evaluate(() => (window as unknown as { __matchMove?: () => [Pos, Pos] | null }).__matchMove?.() ?? null);
  expect(mv).not.toBeNull();
  const box = (await page.locator(".mx-board").boundingBox())!;
  const cell = box.width / 8;
  const at = (p: Pos) => ({ x: box.x + (p.c + 0.5) * cell, y: box.y + (p.r + 0.5) * cell });
  const [a, b] = mv!;
  await page.mouse.move(at(a).x, at(a).y);
  await page.mouse.down();
  await page.mouse.move(at(b).x, at(b).y, { steps: 4 });
  await page.mouse.up();
}

test.describe("🍬 Шмиксер + 🎮 раздел Игри", () => {
  test("раздел „Игри“ се сгъва; 30 хода до край → рекорд в класацията; сървърът отказва глупости", async ({ browser }) => {
    const ana = await register("ana");
    const server = await serverWith(ana);
    const { textChannel } = await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шмиксер", type: "match" });
    expect(textChannel.type).toBe("match");

    const a = await openAs(browser, ana);
    await openServer(a.page, server.name);

    // 🎮 Игрите са в отделен раздел, който се сгъва и помни това.
    const toggle = a.page.locator(".games-section-toggle");
    await expect(toggle).toContainText("Игри");
    const gameItem = a.page.locator(".games-section .channel-item", { hasText: "шмиксер" });
    await expect(gameItem).toBeVisible();
    await toggle.click();
    await expect(gameItem).toHaveCount(0);
    await a.page.reload();
    await openServer(a.page, server.name);
    await expect(a.page.locator(".games-section-toggle")).toBeVisible();
    await expect(gameItem).toHaveCount(0);
    await a.page.locator(".games-section-toggle").click();
    await expect(gameItem).toBeVisible();
    // обикновените текстови канали не са в раздела
    await expect(a.page.locator(".games-section .channel-item", { hasText: "general" })).toHaveCount(0);

    await openTextChannel(a.page, "шмиксер");
    const overlay = a.page.locator(".mx-board .blk-overlay");
    await expect(overlay).toContainText("Играй");
    await a.page.locator(".mx-modes button", { hasText: "30 хода" }).click();
    await a.page.getByRole("button", { name: /Играй/ }).click();
    await expect(overlay).toHaveCount(0);
    await expect(a.page.locator(".mx-tile")).toHaveCount(64);
    await expect(a.page.locator(".mx-clock")).toContainText("30");

    // невалиден ход (две еднакви на едно място не правят нищо) → броят ходове не намалява
    for (let i = 0; i < 30; i++) {
      await playOneMove(a.page);
      if (i === 0) {
        await expect(a.page.locator(".mx-clock")).toContainText("29");
        await expect.poll(async () => Number((await a.page.locator(".blk-score").innerText()).replace(/\D/g, ""))).toBeGreaterThan(0);
      }
      if (i === 5) await a.page.locator(".mx-view").screenshot({ path: "explore/match-playing.png" });
    }
    await expect(overlay).toContainText("Нова игра", { timeout: 15_000 });
    await expect(a.page.locator(".mx-tile")).toHaveCount(64); // the board is always full
    const score = Number((await a.page.locator(".blk-result-score").innerText()).replace(/\D/g, ""));
    expect(score).toBeGreaterThan(0);
    await expect(a.page.locator(".blk-record")).toContainText("Нов личен рекорд");
    await a.page.locator(".mx-tabs button", { hasText: "30" }).click();
    await expect(a.page.locator(".blk-top li.me")).toContainText(ana.username);
    await a.page.locator(".mx-view").screenshot({ path: "explore/match-over.png" });

    // сървърът: непознат режим / невъзможни точки → 400; не-игрови канал → 404
    const url = `/text-channels/${textChannel.id}/match/score`;
    await expect(api(ana.token, "POST", url, { mode: "zen", score: 10, combo: 1, moves: 1 })).rejects.toThrow();
    await expect(api(ana.token, "POST", url, { mode: "time", score: 9_000_000, combo: 1, moves: 1 })).rejects.toThrow();
    const { textChannels } = await api(ana.token, "GET", `/servers/${server.id}/channels`);
    const general = textChannels.find((c: { name: string }) => c.name === "general");
    await expect(api(ana.token, "POST", `/text-channels/${general.id}/match/score`, { mode: "time", score: 10, combo: 1, moves: 1 })).rejects.toThrow();
    const lists = await api(ana.token, "GET", `/text-channels/${textChannel.id}/match`);
    expect(lists.moves.mine.best).toBe(score);
    expect(lists.time.mine).toBeNull();

    expectNoCrashes(a.page);
    await closeAll(a.context);
  });

  test("излизане от канала по време на игра → връщаш се на пауза със същите точки", async ({ browser }) => {
    const ana = await register("ana");
    const server = await serverWith(ana);
    await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шмиксер", type: "match" });
    const a = await openAs(browser, ana);
    await openServer(a.page, server.name);
    await openTextChannel(a.page, "шмиксер");
    await a.page.getByRole("button", { name: /Играй/ }).click();
    await playOneMove(a.page);
    await playOneMove(a.page);
    await expect.poll(() => a.page.evaluate(() => (window as unknown as { __matchBusy?: () => boolean }).__matchBusy?.())).toBe(false);
    const score = await a.page.locator(".blk-score").innerText();
    await openTextChannel(a.page, "general");
    await expect(a.page.locator(".mx-view")).toHaveCount(0);
    await openTextChannel(a.page, "шмиксер");
    await expect(a.page.locator(".blk-paused")).toBeVisible();
    await expect(a.page.locator(".blk-score")).toHaveText(score);
    await a.page.getByRole("button", { name: /Продължи/ }).click();
    await playOneMove(a.page);
    expectNoCrashes(a.page);
    await closeAll(a.context);
  });
});
