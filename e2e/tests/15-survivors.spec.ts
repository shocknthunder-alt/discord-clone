import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { API, api, closeAll, expectNoCrashes, openAs, openServer, openTextChannel, register, screenshotsOnFailure, serverWith } from "./helpers";

screenshotsOnFailure();
mkdirSync("explore", { recursive: true });

type SurvState = {
  mode: string | null;
  t: number;
  enemies: number;
  level: number;
  choosing: boolean;
  players: { uid: string; x: number; y: number; dead: boolean }[];
};
const state = (page: Page) => page.evaluate(() => (window as unknown as { __surv: () => SurvState }).__surv());
const giveXp = (page: Page, n: number) => page.evaluate((x) => (window as unknown as { __survXp: (n: number) => void }).__survXp(x), n);
const quiet = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem("survMusic", "0");
    localStorage.setItem("survSfx", "0");
    // the old tests play the endless mode (missions have their own test)
    if (!localStorage.getItem("survMission")) localStorage.setItem("survMission", "false");
  });

test.describe("🧟 Шмиркленд", () => {
  test("сам: игра тече, ново ниво → карти, пауза, край → злато и класация; сървърът отказва глупости", async ({ browser }) => {
    const ana = await register("ana");
    const server = await serverWith(ana);
    const { textChannel } = await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шмиркленд", type: "survivors" });
    expect(textChannel.type).toBe("survivors");

    const a = await openAs(browser, ana);
    await quiet(a.page);
    await a.page.reload();
    await openServer(a.page, server.name);
    await openTextChannel(a.page, "шмиркленд");
    await expect(a.page.locator(".sv-menu")).toContainText("Шмиркленд");
    await expect(a.page.locator(".sv-hero")).toHaveCount(9);
    await expect(a.page.locator(".sv-hero.locked")).toHaveCount(6);
    await a.page.locator(".sv-menu").screenshot({ path: "explore/surv-menu.png" });

    // a curse → the gold multiplier goes up
    await a.page.locator(".sv-curse", { hasText: "Орда" }).click();
    await expect(a.page.locator(".sv-col h3", { hasText: "Проклятия" })).toContainText("×1.30");

    await a.page.getByRole("button", { name: /Играй сам/ }).click();
    await expect(a.page.locator(".sv-canvas")).toBeVisible();
    await expect(a.page.locator(".sv-clock")).toBeVisible();
    await expect.poll(async () => (await state(a.page)).t, { timeout: 15_000 }).toBeGreaterThan(3);
    await expect.poll(async () => (await state(a.page)).enemies).toBeGreaterThan(5);

    // moving with the keyboard
    const before = (await state(a.page)).players[0]!;
    await a.page.keyboard.down("KeyD");
    await a.page.waitForTimeout(600);
    await a.page.keyboard.up("KeyD");
    expect((await state(a.page)).players[0]!.x).toBeGreaterThan(before.x + 40);

    // a level-up deals cards; "1" picks the first
    await giveXp(a.page, 10);
    await expect(a.page.locator(".sv-card")).toHaveCount(3);
    await a.page.locator(".sv-game").screenshot({ path: "explore/surv-levelup.png" });
    await a.page.keyboard.press("Digit1");
    await expect(a.page.locator(".sv-card")).toHaveCount(0);
    await expect.poll(async () => (await state(a.page)).level).toBe(2);
    await expect(a.page.locator(".sv-xp")).toContainText("Ниво 2");

    // the ✨ slider for our own attacks can be dragged
    const fxa = a.page.locator(".sv-fxa input");
    const box = (await fxa.boundingBox())!;
    await a.page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
    await a.page.mouse.down();
    await a.page.mouse.move(box.x + 3, box.y + box.height / 2, { steps: 5 });
    await a.page.mouse.up();
    expect(Number(await fxa.inputValue())).toBeLessThan(0.2);
    await fxa.fill("1");

    // pause
    await a.page.keyboard.press("KeyP");
    await expect(a.page.locator(".sv-pause")).toBeVisible();
    const tPaused = (await state(a.page)).t;
    await a.page.waitForTimeout(500);
    expect((await state(a.page)).t).toBeCloseTo(tPaused, 1);
    await a.page.getByRole("button", { name: /Продължи/ }).click();
    await a.page.waitForTimeout(2500);
    await a.page.locator(".sv-game").screenshot({ path: "explore/surv-playing.png" });

    // ✖ ends the game → saved
    await a.page.locator(".sv-buttons button[title='Край на играта']").click();
    await expect(a.page.locator(".sv-over")).toContainText("Край на играта");
    await expect(a.page.locator(".sv-over")).toContainText("🪙 +", { timeout: 10_000 });
    await expect(a.page.locator(".sv-record")).toBeVisible();
    await a.page.getByRole("button", { name: /Към менюто/ }).click();
    await a.page.locator(".sv-tabs button", { hasText: "Класация" }).click();
    await expect(a.page.locator(".sv-top li.me")).toContainText(ana.username);

    // the shop: gold is spent
    const lists = await api(ana.token, "GET", `/text-channels/${textChannel.id}/survivors`);
    expect(lists.solo.mine.games).toBe(1);

    // server sanity: impossible runs, unknown hero, a non-game channel
    const url = `/text-channels/${textChannel.id}/survivors/run`;
    const ok = { seconds: 60, kills: 100, level: 5, gold: 10, bosses: 0, coop: false, hero: "peyo", curses: [] };
    await expect(api(ana.token, "POST", url, { ...ok, kills: 999_999 })).rejects.toThrow();
    await expect(api(ana.token, "POST", url, { ...ok, gold: 99_999 })).rejects.toThrow();
    await expect(api(ana.token, "POST", url, { ...ok, hero: "batman" })).rejects.toThrow();
    await expect(api(ana.token, "POST", `/text-channels/${textChannel.id}/survivors/buy`, { key: "revival" })).rejects.toThrow(); // 1500 gold
    await expect(api(ana.token, "POST", `/text-channels/${textChannel.id}/survivors/hero`, { hero: "peyo" })).rejects.toThrow(); // not for sale
    const { textChannels } = await api(ana.token, "GET", `/servers/${server.id}/channels`);
    const general = textChannels.find((c: { name: string }) => c.name === "general");
    await expect(api(ana.token, "POST", `/text-channels/${general.id}/survivors/run`, ok)).rejects.toThrow();
    // buying the cheapest upgrade works and takes the gold
    const goldBefore = lists.profile.gold as number;
    await api(ana.token, "POST", url, { ...ok, seconds: 600, kills: 1000, gold: 1000, bosses: 3 }); // enough for a purchase
    const after = await api(ana.token, "POST", `/text-channels/${textChannel.id}/survivors/buy`, { key: "health" });
    expect(after.profile.upgrades.health).toBe(1);
    expect(after.profile.heroes).toContain("strahil"); // killed a boss → unlocked
    expect(after.profile.heroes).toContain("gitsa"); // survived 5 min
    expect(after.profile.gold).toBeGreaterThan(goldBefore);
    const refunded = await api(ana.token, "POST", `/text-channels/${textChannel.id}/survivors/refund`, {});
    expect(refunded.profile.upgrades.health).toBeUndefined();
    expect(refunded.profile.gold).toBe(after.profile.gold + 150);
    // achievements came with that run, skins: bought with gold / only from an achievement
    expect(refunded.profile.achievements).toEqual(expect.arrayContaining(["first", "boss1", "kills1000"]));
    const skinUrl = `/text-channels/${textChannel.id}/survivors/skin`;
    const withSkin = await api(ana.token, "POST", skinUrl, { hero: "peyo", skin: "night" });
    expect(withSkin.profile.skins).toContain("peyo:night");
    expect(withSkin.profile.gold).toBe(refunded.profile.gold - 400);
    await expect(api(ana.token, "POST", skinUrl, { hero: "peyo", skin: "gold" })).rejects.toThrow();
    await expect(api(ana.token, "POST", skinUrl, { hero: "batman", skin: "night" })).rejects.toThrow();

    expectNoCrashes(a.page);
    await closeAll(a.context);
  });

  test("кооп: дружина от двама, гостът вижда света на домакина и се движи, общо ниво → и двамата избират, 👁 зрител, домакинът спира", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const carl = await register("carl");
    const server = await serverWith(ana, bob, carl);
    await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шмиркленд", type: "survivors" });

    const a = await openAs(browser, ana, { viewport: { width: 1100, height: 760 } });
    const b = await openAs(browser, bob, { viewport: { width: 1100, height: 760 } });
    for (const x of [a, b]) {
      await quiet(x.page);
      await x.page.reload();
      await openServer(x.page, server.name);
      await openTextChannel(x.page, "шмиркленд");
    }

    await a.page.getByRole("button", { name: /Създай кооп игра/ }).click();
    await expect(a.page.locator(".sv-party.mine")).toContainText("Твоята дружина");
    await expect(b.page.locator(".sv-party")).toContainText(ana.username);
    await b.page.locator(".sv-party button", { hasText: "Влез" }).click();
    await expect(a.page.locator(".sv-party.mine .sv-party-member")).toHaveCount(2);
    await expect(b.page.locator(".sv-party.mine")).toContainText("Чакаме домакина");
    // bob changes hero in the lobby → ana sees it
    await b.page.locator(".sv-hero", { hasText: "Киро" }).click();
    await expect(a.page.locator(".sv-party.mine .sv-party-member", { hasText: bob.username })).toContainText("Киро Брейка");

    await a.page.getByRole("button", { name: /Започни \(2\)/ }).click();
    await expect(a.page.locator(".sv-canvas")).toBeVisible();
    await expect(b.page.locator(".sv-canvas")).toBeVisible();
    await expect.poll(async () => (await state(a.page)).mode).toBe("host");
    await expect.poll(async () => (await state(b.page)).mode).toBe("guest");
    // the guest gets snapshots: enemies and both players
    await expect.poll(async () => (await state(b.page)).enemies, { timeout: 15_000 }).toBeGreaterThan(3);
    await expect.poll(async () => (await state(b.page)).players.length).toBe(2);
    await expect(b.page.locator(".sv-mate")).toHaveCount(2);

    // the guest moves itself; the host's world follows
    const bobOnHost = async () => (await state(a.page)).players.find((p) => p.uid === bob.id)!;
    const start = await bobOnHost();
    await b.page.keyboard.down("KeyS");
    await b.page.waitForTimeout(800);
    await b.page.keyboard.up("KeyS");
    await expect.poll(async () => (await bobOnHost()).y).toBeGreaterThan(start.y + 60);

    // shared XP: one level-up → both get cards, the game waits for both
    await giveXp(a.page, 8); // level 1 → 2 needs 7 with two players
    await expect(a.page.locator(".sv-card").first()).toBeVisible();
    await expect(b.page.locator(".sv-card").first()).toBeVisible();
    await b.page.locator(".sv-game").screenshot({ path: "explore/surv-coop-guest-cards.png" });
    await a.page.locator(".sv-card").first().click();
    await expect(a.page.locator(".sv-wait")).toContainText(bob.username);
    const tWait = (await state(a.page)).t;
    // co-op doesn't stop while bob picks (he's shielded meanwhile)
    await expect.poll(async () => (await state(a.page)).t).toBeGreaterThan(tWait + 0.5);
    await b.page.locator(".sv-card").nth(1).click();
    await expect(b.page.locator(".sv-card")).toHaveCount(0);
    await expect.poll(async () => (await state(a.page)).choosing).toBe(false);
    await expect.poll(async () => (await state(b.page)).level).toBe(2);

    // 👁 carl watches from the lobby list
    const c = await openAs(browser, carl, { viewport: { width: 1000, height: 700 } });
    await quiet(c.page);
    await c.page.reload();
    await openServer(c.page, server.name);
    await openTextChannel(c.page, "шмиркленд");
    await c.page.locator(".sv-party button", { hasText: "Гледай" }).click();
    await expect.poll(async () => (await state(c.page)).mode).toBe("spec");
    await expect.poll(async () => (await state(c.page)).enemies, { timeout: 15_000 }).toBeGreaterThan(3);
    await expect(c.page.locator(".sv-spec")).toBeVisible();
    await a.page.waitForTimeout(1500);
    await a.page.locator(".sv-game").screenshot({ path: "explore/surv-coop-host.png" });
    await b.page.locator(".sv-game").screenshot({ path: "explore/surv-coop-guest.png" });

    // the host stops → everyone gets the end screen; both runs are saved as co-op
    await a.page.locator(".sv-buttons button[title='Край на играта']").click();
    await expect(a.page.locator(".sv-over")).toBeVisible();
    await expect(b.page.locator(".sv-over")).toBeVisible({ timeout: 10_000 });
    await expect(c.page.locator(".sv-over")).toBeVisible({ timeout: 10_000 });
    await expect(b.page.locator(".sv-over")).toContainText("🪙 +", { timeout: 10_000 });
    const lists = await api(bob.token, "GET", `/text-channels/${(await api(ana.token, "GET", `/servers/${server.id}/channels`)).textChannels.find((x: { type: string }) => x.type === "survivors").id}/survivors`);
    expect(lists.coop.top.map((r: { userId: string }) => r.userId).sort()).toEqual([ana.id, bob.id].sort());

    for (const x of [a, b, c]) expectNoCrashes(x.page);
    await closeAll(a.context, b.context, c.context);
  });

  test("🎯 мисия: 5 капища → дарове от боговете → портал → великан → победа, нова карта, ᚱ руна", async ({ browser }) => {
    test.setTimeout(180_000);
    type W = {
      mission: boolean;
      altarsLeft: number;
      missionPhase: number;
      won: boolean;
      finalBoss: unknown;
      t: number;
      enemies: { type: string; dead: boolean }[];
      marks: { kind: number; x: number; y: number }[];
      players: { x: number; y: number; invulnT: number; runes: Record<string, number>; gifts: Record<string, number> }[];
      hurt: (e: unknown, d: number, p: unknown) => void;
    };
    const w = <T,>(page: Page, fn: (w: W) => T) => page.evaluate(`(${fn.toString()})(window.__survWorld())`) as Promise<T>;
    const clearCards = async (page: Page) => {
      for (let n = 0; n < 10 && (await page.locator(".sv-card").count()) > 0; n++) {
        await page.keyboard.press("Digit1");
        await page.waitForTimeout(250);
      }
    };
    const ana = await register("misia");
    const server = await serverWith(ana);
    const { textChannel } = await api(ana.token, "POST", `/servers/${server.id}/text-channels`, { name: "шмиркленд", type: "survivors" });
    const a = await openAs(browser, ana);
    await quiet(a.page);
    await a.page.addInitScript(() => localStorage.setItem("survGfx", "2d"));
    await a.page.reload();
    await openServer(a.page, server.name);
    await openTextChannel(a.page, "шмиркленд");
    // only the first map is open
    await expect(a.page.locator(".sv-map")).toHaveCount(4);
    await expect(a.page.locator(".sv-map.locked")).toHaveCount(3);
    await a.page.locator(".sv-modes button", { hasText: "Мисия" }).click();
    await a.page.getByRole("button", { name: /Играй сам/ }).click();
    await expect(a.page.locator(".sv-mission")).toContainText("Капища 0/5");
    expect(await w(a.page, (x) => x.enemies.filter((e) => e.type === "altar").length)).toBe(5);

    // a sanctuary falls → the gods' cards
    await w(a.page, (x) => {
      x.players[0]!.invulnT = 999;
      x.hurt(x.enemies.find((e) => e.type === "altar"), 1e7, x.players[0]);
    });
    await expect(a.page.locator(".sv-card.gift").first()).toBeVisible();
    await expect(a.page.locator(".sv-card.gift").first()).toContainText("Дар от");
    await clearCards(a.page);
    expect(Object.keys(await w(a.page, (x) => x.players[0]!.gifts)).length).toBeGreaterThan(0);
    for (let k = 0; k < 4; k++) {
      await w(a.page, (x) => {
        const al = x.enemies.find((e) => e.type === "altar" && !e.dead);
        if (al) x.hurt(al, 1e7, x.players[0]);
      });
      await expect(a.page.locator(".sv-card").first()).toBeVisible();
      await clearCards(a.page);
    }
    // the portal → the giant
    await expect.poll(() => w(a.page, (x) => x.missionPhase)).toBe(1);
    await expect(a.page.locator(".sv-mission")).toContainText("портала");
    await w(a.page, (x) => {
      const m = x.marks.find((k) => k.kind === 7)!;
      x.players[0]!.x = m.x;
      x.players[0]!.y = m.y;
    });
    await expect
      .poll(async () => {
        await clearCards(a.page);
        return w(a.page, (x) => !!x.finalBoss);
      }, { timeout: 20_000 })
      .toBe(true);
    await expect(a.page.locator(".sv-boss")).toContainText("Великанът Балкан");
    await w(a.page, (x) => {
      x.t = Math.max(x.t, 200); // the server wants 3+ minutes for a mission
      x.hurt(x.finalBoss, 1e9, x.players[0]);
    });
    await expect
      .poll(async () => {
        await clearCards(a.page);
        return a.page.locator(".sv-over").count();
      }, { timeout: 20_000 })
      .toBe(1);
    await expect(a.page.locator(".sv-over h2")).toContainText("Мисията е изпълнена");
    await expect(a.page.locator(".sv-unlock.ach", { hasText: "Великаноубиец" })).toBeVisible();
    const lists = await api(ana.token, "GET", `/text-channels/${textChannel.id}/survivors`);
    expect(lists.profile.missions).toEqual({ polyana: 1 });
    // the server doesn't believe a 10-second win
    const bad = await fetch(`${API}/api/text-channels/${textChannel.id}/survivors/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ana.token}` },
      body: JSON.stringify({ seconds: 10, kills: 5, level: 2, gold: 1, bosses: 0, coop: false, hero: "peyo", curses: [], map: "gora", mission: true, won: true }),
    });
    expect(bad.ok).toBe(true);
    expect((await api(ana.token, "GET", `/text-channels/${textChannel.id}/survivors`)).profile.missions).toEqual({ polyana: 1 });

    await a.page.getByRole("button", { name: "Към менюто" }).click();
    await expect(a.page.locator(".sv-map.locked")).toHaveCount(2);

    // ᚱ a rune: bought → worn → the next game starts with a gift of Перун
    await a.page.locator(".sv-tabs button", { hasText: "Руни" }).click();
    await a.page.locator(".sv-rune", { hasText: "Перунова руна" }).getByRole("button", { name: /Купи/ }).click();
    await expect(a.page.locator(".sv-rune.on", { hasText: "Перунова руна" })).toBeVisible();
    await a.page.locator(".sv-tabs button", { hasText: "Игра" }).click();
    await a.page.locator(".sv-modes button", { hasText: "Безкрайно" }).click();
    await a.page.getByRole("button", { name: /Играй сам/ }).click();
    await expect.poll(() => w(a.page, (x) => x.players[0]!.runes.perun ?? 0)).toBe(1);
    expect(await w(a.page, (x) => x.mission)).toBe(false);
    expect(Object.keys(await w(a.page, (x) => x.players[0]!.gifts))).toHaveLength(1);
    expectNoCrashes(a.page);
    await closeAll(a.context);
  });
});
