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

  test("✨ квадрат 2×2 → светулка; светулка + ракета лети и стреля; 🔥 множител", async ({ browser }) => {
    const ana = await register("ana");
    const server = await serverWith(ana);
    await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шмиксер", type: "match" });
    const a = await openAs(browser, ana);
    await a.page.addInitScript(() => localStorage.setItem("matchMusic", "off"));
    await openServer(a.page, server.name);
    await openTextChannel(a.page, "шмиксер");
    await a.page.locator(".mx-modes button", { hasText: "30 хода" }).click();
    await a.page.getByRole("button", { name: /Играй/ }).click();
    type B = { grid: { color: number; special: string | null }[][]; streak: number };
    const setup = (code: string) =>
      a.page.evaluate((src) => {
        const w = window as unknown as { __matchBoard: () => B; __matchSync: () => void };
        new Function("b", src)(w.__matchBoard());
        w.__matchSync();
      }, code);
    const drag = async (p: Pos, q: Pos) => {
      await expect.poll(() => a.page.evaluate(() => (window as unknown as { __matchBusy?: () => boolean }).__matchBusy?.())).toBe(false);
      const box = (await a.page.locator(".mx-board").boundingBox())!;
      const cell = box.width / 8;
      await a.page.mouse.move(box.x + (p.c + 0.5) * cell, box.y + (p.r + 0.5) * cell);
      await a.page.mouse.down();
      await a.page.mouse.move(box.x + (q.c + 0.5) * cell, box.y + (q.r + 0.5) * cell, { steps: 4 });
      await a.page.mouse.up();
      await expect.poll(() => a.page.evaluate(() => (window as unknown as { __matchBusy?: () => boolean }).__matchBusy?.())).toBe(false);
    };
    // A board without matches ((2r + c) mod 6), then three zeros in an L and a zero to swap in → a 2×2 square.
    await setup(`
      b.grid.forEach((row, r) => row.forEach((t, c) => { t.color = (2 * r + c) % 6; t.special = null; }));
      b.grid[0][0].color = 0; b.grid[0][1].color = 0; b.grid[1][0].color = 0;
      b.grid[1][1].color = 1; b.grid[1][2].color = 0;`);
    await drag({ r: 1, c: 2 }, { r: 1, c: 1 });
    // (new gems falling in may make another one, so: at least one)
    await expect.poll(() => a.page.locator(".mx-firefly").count()).toBeGreaterThan(0);
    // the firefly + a rocket next to it → it flies off with the rocket
    const before = await a.page.locator(".mx-firefly").count();
    const ff = await a.page.evaluate(() => {
      const b = (window as unknown as { __matchBoard: () => B }).__matchBoard();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b.grid[r]![c]!.special === "firefly") return { r, c };
      return null;
    });
    expect(ff).not.toBeNull();
    const nb = ff!.c < 7 ? { r: ff!.r, c: ff!.c + 1 } : { r: ff!.r, c: ff!.c - 1 };
    await setup(`b.grid[${nb.r}][${nb.c}].special = "rowRocket";`);
    await drag(ff!, nb);
    // the firefly went off with the rocket (its cell is not a firefly any more)
    expect(await a.page.evaluate(([r, c]) => (window as unknown as { __matchBoard: () => B }).__matchBoard().grid[r]![c]!.special, [ff!.r, ff!.c] as const)).not.toBe("firefly");
    expect(await a.page.locator(".mx-firefly").count()).toBeLessThanOrEqual(before + 2);
    // 🔥 a long streak of strong moves → the fever badge
    await setup("b.streak = 4;");
    await setup(`b.grid[0][0].special = "bomb"; b.grid[0][1].special = "bomb";`);
    await drag({ r: 0, c: 0 }, { r: 0, c: 1 });
    await expect(a.page.locator(".mx-fever")).toContainText("×2");
    await expect(a.page.locator(".mx-board.fever")).toBeVisible();
    await a.page.locator(".mx-view").screenshot({ path: "explore/match-fever.png" });
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
