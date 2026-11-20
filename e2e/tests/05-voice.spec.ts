import { expect, test, type Page } from "@playwright/test";
import { api, closeAll, expectNoCrashes, openAs, openServer, register, screenshotsOnFailure, serverWith } from "./helpers";

screenshotsOnFailure();

// Keeps every RTCPeerConnection the page makes, so the test can read real WebRTC stats
// (bytes actually arriving through the SFU), not just what the UI shows.
const TRACK_PCS = () => {
  const Orig = window.RTCPeerConnection;
  const list: RTCPeerConnection[] = [];
  (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = list;
  window.RTCPeerConnection = class extends Orig {
    constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
      super(...args);
      list.push(this);
    }
  } as typeof RTCPeerConnection;
};

async function received(page: Page, kind: "audio" | "video") {
  return page.evaluate(async (k) => {
    let bytes = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs ?? []) {
      if (pc.connectionState === "closed") continue;
      const stats = await pc.getStats();
      stats.forEach((s: RTCStats & { kind?: string; bytesReceived?: number }) => {
        if (s.type === "inbound-rtp" && s.kind === k) bytes += s.bytesReceived ?? 0;
      });
    }
    return bytes;
  }, kind);
}

async function joinVoice(page: Page, channel: string) {
  await page.locator(".channel-item", { has: page.locator(".channel-item-name", { hasText: new RegExp(`(^|\\s)${channel}$`) }) }).first().click();
  await expect(page.getByTitle("Излез от канала")).toBeVisible({ timeout: 20_000 });
}

async function voiceTrio(browser: import("@playwright/test").Browser) {
  const ana = await register("ana");
  const bob = await register("bob");
  const cleo = await register("cleo");
  const server = await serverWith(ana, bob, cleo);
  await api(ana.token, "POST", `/servers/${server.id}/voice-channels`, { name: "Втора стая" });
  const a = await openAs(browser, ana);
  const b = await openAs(browser, bob);
  const c = await openAs(browser, cleo);
  for (const p of [a.page, b.page]) await p.addInitScript(TRACK_PCS);
  // addInitScript applies to the next navigation.
  for (const p of [a.page, b.page]) await p.reload();
  for (const p of [a.page, b.page, c.page]) await openServer(p, server.name);
  return { ana, bob, cleo, server, a, b, c };
}

test.describe("Глас (SFU, фалшив микрофон и камера)", () => {
  test.setTimeout(120_000);

  test("двама в канала: виждат се, звукът реално тече в двете посоки, третият вижда брояч 2", async ({ browser }) => {
    const { ana, bob, a, b, c } = await voiceTrio(browser);
    await joinVoice(a.page, "General");
    await joinVoice(b.page, "General");

    await expect(a.page.locator(".voice-participant-list")).toContainText(bob.username);
    await expect(b.page.locator(".voice-participant-list")).toContainText(ana.username);
    const general = c.page.locator(".channel-item", { has: c.page.locator(".channel-item-name", { hasText: /(^|\s)General$/ }) });
    await expect(general.locator(".voice-count")).toHaveText("2");

    await expect.poll(() => received(a.page, "audio"), { timeout: 20_000, message: "Ана получава звук от Боб" }).toBeGreaterThan(2000);
    await expect.poll(() => received(b.page, "audio"), { timeout: 20_000, message: "Боб получава звук от Ана" }).toBeGreaterThan(2000);

    // Боб излиза → изчезва от списъка при Ана, броячът при Клео пада на 1.
    await b.page.getByTitle("Излез от канала").click();
    await expect(a.page.locator(".voice-participant-list")).not.toContainText(bob.username);
    await expect(general.locator(".voice-count")).toHaveText("1");
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context, c.context);
  });

  test("камера: Боб вижда видеото на Ана (байтове видео идват)", async ({ browser }) => {
    const { a, b, c } = await voiceTrio(browser);
    await joinVoice(a.page, "General");
    await joinVoice(b.page, "General");
    await a.page.getByTitle("Включи камерата").click();
    await expect(a.page.getByTitle("Изключи камерата")).toBeVisible();
    await expect.poll(() => received(b.page, "video"), { timeout: 25_000 }).toBeGreaterThan(20_000);
    await a.page.getByTitle("Изключи камерата").click();
    await closeAll(a.context, b.context, c.context);
  });

  test("заглушаване на микрофона спира звука към другия", async ({ browser }) => {
    const { a, b, c } = await voiceTrio(browser);
    await joinVoice(a.page, "General");
    await joinVoice(b.page, "General");
    await expect.poll(() => received(b.page, "audio"), { timeout: 20_000 }).toBeGreaterThan(2000);
    await a.page.getByTitle("Заглуши микрофона").click();
    await expect(a.page.getByTitle("Включи микрофона")).toBeVisible();
    await b.page.waitForTimeout(1500);
    const before = await received(b.page, "audio");
    await b.page.waitForTimeout(3000);
    const after = await received(b.page, "audio");
    // Заглушен = (почти) нищо ново. Opus/RTCP може да пусне по някой байт.
    expect(after - before, "байтове звук за 3 s след заглушаване").toBeLessThan(3000);
    await closeAll(a.context, b.context, c.context);
  });

  test("собственикът мести член в друг гласов канал", async ({ browser }) => {
    const { bob, a, b, c } = await voiceTrio(browser);
    await joinVoice(a.page, "General");
    await joinVoice(b.page, "General");
    await a.page.locator(".member-row", { hasText: bob.username }).click();
    const move = a.page.locator(".profile-card .member-menu-row", { hasText: "Премести" }).locator("select");
    const value = await move.locator("option", { hasText: "Втора стая" }).getAttribute("value", { timeout: 5000 });
    await move.selectOption(value!);
    const second = b.page.locator(".channel-item.active", { has: b.page.locator(".channel-item-name", { hasText: "Втора стая" }) });
    await expect(second).toBeVisible({ timeout: 20_000 });
    await expect(a.page.locator("div:has(> .channel-item.active) > .voice-participant-list")).not.toContainText(bob.username);
    await closeAll(a.context, b.context, c.context);
  });

  test("стрийм на екрана: Боб получава видео", async ({ browser }) => {
    const { a, b, c } = await voiceTrio(browser);
    await joinVoice(a.page, "General");
    await joinVoice(b.page, "General");
    await a.page.getByTitle("Започни стрийм (Go Live)").click();
    // Може да има избор на качество / източник — приемаме първото предложено.
    const go = a.page.getByRole("button", { name: /Започни|Go Live|Стриймвай|Сподели/ });
    if (await go.first().isVisible({ timeout: 3000 }).catch(() => false)) await go.first().click();
    await expect(a.page.getByTitle("Спри стрийма")).toBeVisible({ timeout: 15_000 });
    // Боб вижда, че Ана стриймва, и гледа.
    await expect(b.page.locator(".participant-name.streaming")).toBeVisible({ timeout: 15_000 });
    await b.page.locator(".participant-watch").first().click();
    await expect.poll(() => received(b.page, "video"), { timeout: 25_000 }).toBeGreaterThan(20_000);
    await closeAll(a.context, b.context, c.context);
  });
});
