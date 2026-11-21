import { expect, test, type Page } from "@playwright/test";
import { closeAll, expectNoCrashes, openAs, openServer, register, screenshotsOnFailure, serverWith } from "./helpers";

screenshotsOnFailure();

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

async function videoIn(page: Page) {
  return page.evaluate(async () => {
    let bytes = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs ?? []) {
      if (pc.connectionState === "closed") continue;
      (await pc.getStats()).forEach((s: RTCStats & { kind?: string; bytesReceived?: number }) => {
        if (s.type === "inbound-rtp" && s.kind === "video") bytes += s.bytesReceived ?? 0;
      });
    }
    return bytes;
  });
}

/** Bytes of video that arrive during `ms`. */
async function videoRate(page: Page, ms = 2500) {
  const a = await videoIn(page);
  await page.waitForTimeout(ms);
  return (await videoIn(page)) - a;
}

async function joinVoice(page: Page) {
  await page.locator(".channel-item", { has: page.locator(".channel-item-name", { hasText: /(^|\s)General$/ }) }).click();
  await expect(page.getByTitle("Излез от канала")).toBeVisible({ timeout: 20_000 });
}

async function live(browser: import("@playwright/test").Browser) {
  const ana = await register("ana");
  const bob = await register("bob");
  const server = await serverWith(ana, bob);
  const a = await openAs(browser, ana);
  const b = await openAs(browser, bob);
  for (const p of [a.page, b.page]) {
    await p.addInitScript(TRACK_PCS);
    await p.reload();
    await openServer(p, server.name);
    await joinVoice(p);
  }
  return { ana, bob, a, b };
}

/** In voice the user bar is replaced — settings open from the ⚙️ in the voice buttons. */
async function openSettings(page: Page) {
  await page.locator("[title='Настройки']").last().click();
  await expect(page.locator(".set-nav")).toBeVisible();
}

async function goLive(page: Page) {
  await page.getByTitle("Започни стрийм (Go Live)").click();
  await expect(page.getByTitle("Спри стрийма")).toBeVisible({ timeout: 15_000 });
}

test.describe("📺 Стрийм на екрана", () => {
  test.setTimeout(120_000);

  test("не се тегли, докато не цъкнеш „Гледай“; гледане; спри да гледаш; стриймърът спира", async ({ browser }) => {
    const { a, b } = await live(browser);
    await goLive(a.page);
    // Стриймърът вижда, че е на живо.
    await expect(a.page.locator(".live-banner, .live-edge").first()).toBeVisible();

    const watch = b.page.locator(".participant-watch");
    await expect(watch).toBeVisible({ timeout: 15_000 });
    await b.page.waitForTimeout(3000);
    expect(await videoRate(b.page), "видео преди „Гледай“ (трябва да е 0 — пести трафик)").toBeLessThan(5_000);

    await watch.click();
    await expect.poll(() => videoRate(b.page), { timeout: 25_000 }).toBeGreaterThan(20_000);
    await expect(b.page.locator("video.screen-share-video")).toBeVisible();

    // Спри да гледаш → видеото спира да идва.
    await b.page.getByTitle("Спри да гледаш този стрийм").or(b.page.getByTitle("Спри да гледаш")).first().click();
    await expect.poll(() => videoRate(b.page), { timeout: 15_000 }).toBeLessThan(5_000);

    // Пак гледа, после Ана спира стрийма → бутонът „Гледай“ изчезва.
    await b.page.locator(".participant-watch").click();
    await expect.poll(() => videoRate(b.page), { timeout: 25_000 }).toBeGreaterThan(20_000);
    await a.page.getByTitle("Спри стрийма").click();
    await expect(a.page.getByTitle("Започни стрийм (Go Live)")).toBeVisible();
    await expect(b.page.locator(".participant-watch")).toHaveCount(0, { timeout: 15_000 });
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("📊 диагностика при стриймъра и 🔄 нов енкодер — зрителят продължава да гледа", async ({ browser }) => {
    const { a, b } = await live(browser);
    await goLive(a.page);
    await b.page.locator(".participant-watch").click();
    await expect.poll(() => videoRate(b.page), { timeout: 25_000 }).toBeGreaterThan(20_000);

    const show = a.page.getByTitle("Диагностика на стрийма — покажи");
    if (await show.isVisible().catch(() => false)) await show.click();
    const stats = a.page.locator(".stream-stats");
    await expect(stats).toBeVisible();
    await expect(stats).toContainText(/fps|kbps|Mbps|кадъра/i, { timeout: 15_000 });

    const refresh = a.page.locator(".stream-stats-refresh");
    if (!(await refresh.isVisible().catch(() => false))) await a.page.locator(".stream-stats-pill").click();
    await refresh.click();
    // След смяната на енкодера: картината пак идва (до 4 s „гратисен“ период, после нов producer).
    await a.page.waitForTimeout(5000);
    await expect.poll(() => videoRate(b.page), { timeout: 20_000 }).toBeGreaterThan(20_000);
    await expect(a.page.getByTitle("Спри стрийма")).toBeVisible();
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("🎬 рамките на стрийма се сменят една след друга без грешки", async ({ browser }) => {
    const { a, b } = await live(browser);
    // Рамка по подразбиране е без рамка → включваме първата от настройките на зрителя.
    await openSettings(b.page);
    await b.page.locator(".set-nav-item", { hasText: "Стрийм" }).click();
    const frameChoice = b.page.locator(".set-choices", { has: b.page.getByText(/ретро|Retro|TV/i) }).locator("label, button").nth(1);
    if (await frameChoice.isVisible().catch(() => false)) await frameChoice.click();
    await b.page.keyboard.press("Escape");

    await goLive(a.page);
    await b.page.locator(".participant-watch").click();
    await expect.poll(() => videoRate(b.page), { timeout: 25_000 }).toBeGreaterThan(20_000);

    const change = b.page.getByTitle("Смени рамката");
    if (!(await change.isVisible().catch(() => false))) test.skip(true, "няма рамка за зрителя по подразбиране");
    const seen = new Set<string>();
    for (let i = 0; i < 14; i++) {
      seen.add((await change.innerText()).trim());
      await change.click();
    }
    console.log(`  рамки: ${[...seen].join(" · ")}`);
    expect(seen.size).toBeGreaterThan(5);
    await expect(b.page.locator("video.screen-share-video")).toBeVisible();
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("качество от настройките (Леко 720p / Остро) — стриймът тръгва и в двата режима", async ({ browser }) => {
    const { a, b } = await live(browser);
    for (const mode of ["Леко · 720p", "Остро · 60 fps"]) {
      await openSettings(a.page);
      await a.page.locator(".set-nav-item", { hasText: "Стрийм" }).click();
      await a.page.getByText(mode, { exact: true }).first().click();
      const save = a.page.getByRole("button", { name: "Запази промените" });
      if (await save.isEnabled()) await save.click();
      await expect(save).toBeDisabled();
      await a.page.keyboard.press("Escape");
      await expect(a.page.locator(".set-nav")).toHaveCount(0);
      await goLive(a.page);
      await b.page.locator(".participant-watch").click();
      await expect.poll(() => videoRate(b.page), { timeout: 25_000, message: mode }).toBeGreaterThan(10_000);
      await a.page.getByTitle("Спри стрийма").click();
      await expect(b.page.locator(".participant-watch")).toHaveCount(0, { timeout: 15_000 });
    }
    await closeAll(a.context, b.context);
  });
});
