import { expect, test, type WebSocketRoute } from "@playwright/test";
import { closeAll, expectNoCrashes, messageRow, openAs, openServer, openTextChannel, register, screenshotsOnFailure, sendMessage, serverWith } from "./helpers";

screenshotsOnFailure();

// The main server's socket.io connection (not the media server's).
const MAIN_WS = /:4610\/socket\.io\//;

test.describe("Прекъсната връзка", () => {
  test.setTimeout(90_000);

  test("след прекъсване и връщане на връзката (Wi-Fi, рестарт на сървъра, заспал компютър) съобщенията и гласовите канали пак идват на живо", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);

    // Ana's connection goes through Playwright, so the test can cut it like a network drop.
    const sockets: WebSocketRoute[] = [];
    const a = await openAs(browser, ana, {
      setup: (ctx) =>
        ctx.routeWebSocket(MAIN_WS, (ws) => {
          ws.connectToServer();
          sockets.push(ws);
        }),
    });
    const b = await openAs(browser, bob);
    for (const p of [a.page, b.page]) await openServer(p, server.name);
    await openTextChannel(a.page, "general");
    await expect.poll(() => sockets.length).toBeGreaterThan(0);

    // Bob in the voice channel → Ana sees him; then the line drops and comes back.
    const joinGeneralVoice = async () => {
      await b.page.locator(".channel-item", { has: b.page.locator(".channel-item-name", { hasText: /(^|\s)General$/ }) }).first().click();
      await expect(b.page.getByTitle("Излез от канала")).toBeVisible({ timeout: 20_000 });
    };
    await joinGeneralVoice();
    await expect(a.page.locator(".participant-row", { hasText: bob.username })).toHaveCount(1);

    const before = sockets.length;
    for (const ws of sockets.splice(0)) await ws.close({ code: 4000, reason: "test: network drop" }).catch(() => {});
    await expect.poll(() => sockets.length, { timeout: 20_000, message: "клиентът се свързва отново" }).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
    await a.page.waitForTimeout(1500);

    // 1) Bob leaves voice while Ana's new connection is up → he must disappear from her list
    //    (before the fix the list stayed frozen: he kept showing there).
    await b.page.getByTitle("Излез от канала").click();
    await expect(a.page.locator(".participant-row", { hasText: bob.username })).toHaveCount(0, { timeout: 10_000 });

    // 2) A new message in #general arrives live (the channel room is joined again).
    await b.page.locator(".channel-item", { has: b.page.locator(".channel-item-name", { hasText: /^\S+ general/ }) }).first().click();
    const text = `след прекъсването ${Date.now()}`;
    await sendMessage(b.page, text);
    await expect(messageRow(a.page, text)).toBeVisible({ timeout: 10_000 });

    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });
});
