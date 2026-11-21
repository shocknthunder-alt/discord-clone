import { expect, test, type Page } from "@playwright/test";
import { closeAll, expectNoCrashes, openAs, openServer, register, screenshotsOnFailure, serverWith } from "./helpers";

screenshotsOnFailure();

// Two short public YouTube videos (the server reads their titles with YouTube's keyless oEmbed —
// these tests need internet).
const SONG_A = { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", title: /zoo/i };
const SONG_B = { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: /Never Gonna Give You Up/i };
const SONG_C = { url: "https://www.youtube.com/watch?v=9bZkp7q19f0", title: /GANGNAM/i };

async function joinVoice(page: Page) {
  await page.locator(".channel-item", { has: page.locator(".channel-item-name", { hasText: /(^|\s)General$/ }) }).click();
  await expect(page.getByTitle("Излез от канала")).toBeVisible({ timeout: 20_000 });
}

async function expandPlayer(page: Page) {
  const mini = page.locator(".music-mini");
  await expect(mini.locator(".music-controls")).toBeVisible({ timeout: 15_000 });
  if (!(await mini.locator(".music-mini-expanded").isVisible())) await mini.locator(".music-mini-collapse").click();
  await expect(mini.locator(".music-add-form")).toBeVisible();
}

async function addSong(page: Page, url: string) {
  const input = page.locator(".music-add-form input");
  await input.fill(url);
  await input.press("Enter");
}

const now = (p: Page) => p.locator(".music-mini .music-now-text");
const queue = (p: Page) => p.locator(".music-mini .music-queue-item");
const playBtn = (p: Page) => p.locator(".music-mini .music-mini-play");
/** The shared position in seconds, read from the "m:ss" next to the slider. */
async function position(p: Page) {
  const t = (await p.locator(".music-progress-time").first().innerText()).trim();
  return t.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

async function setup(browser: import("@playwright/test").Browser) {
  const ana = await register("ana");
  const bob = await register("bob");
  const cleo = await register("cleo");
  const server = await serverWith(ana, bob, cleo);
  const a = await openAs(browser, ana);
  const b = await openAs(browser, bob);
  for (const p of [a.page, b.page]) {
    await openServer(p, server.name);
    await joinVoice(p);
    await expandPlayer(p);
  }
  return { ana, bob, cleo, server, a, b };
}

test.describe("🎵 Музика в гласовия канал (синхронизирана)", () => {
  test.setTimeout(120_000);

  test("извън гласов канал плейърът казва да влезеш", async ({ browser }) => {
    const ana = await register("ana");
    const server = await serverWith(ana);
    const a = await openAs(browser, ana);
    await openServer(a.page, server.name);
    await expect(a.page.locator(".music-mini")).toContainText("Влез в гласов канал");
    await closeAll(a.context);
  });

  test("опашка: добавяне, свири при двамата, пауза/пусни, следваща, пусни сега, махни", async ({ browser }) => {
    const { bob, a, b } = await setup(browser);

    await expect(now(a.page)).toContainText("Не свири музика");
    await expect(playBtn(a.page)).toBeDisabled();

    await addSong(a.page, SONG_A.url);
    for (const p of [a.page, b.page]) await expect(now(p)).toContainText(SONG_A.title, { timeout: 20_000 });
    for (const p of [a.page, b.page]) await expect(playBtn(p)).toHaveAttribute("title", "Пауза");

    // Боб добавя още две → опашката е 3 и при двамата; „от <име>“.
    await addSong(b.page, SONG_B.url);
    await addSong(b.page, SONG_C.url);
    for (const p of [a.page, b.page]) await expect(queue(p)).toHaveCount(3, { timeout: 20_000 });
    await expect(queue(a.page).nth(1)).toContainText(`от ${bob.username}`);
    await expect(queue(a.page).nth(0)).toHaveClass(/active/);
    // 3 песни → виждат се 2, третата е под скрола (плеърът не расте нагоре).
    const box = a.page.locator(".music-mini .music-queue");
    await expect(box).toHaveClass(/scrolls/);
    const fit = await box.evaluate((el) => {
      const items = [...el.children] as HTMLElement[];
      return { client: el.clientHeight, scroll: el.scrollHeight, two: items[1]!.offsetTop + items[1]!.offsetHeight };
    });
    expect(fit.scroll).toBeGreaterThan(fit.client);
    expect(Math.abs(fit.client - fit.two)).toBeLessThanOrEqual(4);
    await a.page.locator(".music-mini").screenshot({ path: "explore/music-queue-scroll.png" });

    // Пауза от Боб → спряно и при Ана; после Ана пуска.
    await playBtn(b.page).click();
    await expect(playBtn(a.page)).toHaveAttribute("title", "Пусни");
    await playBtn(a.page).click();
    await expect(playBtn(b.page)).toHaveAttribute("title", "Пауза");

    // Следваща → втората песен и при двамата; изсвирената изчезва от списъка.
    await a.page.locator(".music-mini").getByTitle("Следваща").click();
    for (const p of [a.page, b.page]) await expect(now(p)).toContainText(SONG_B.title);
    for (const p of [a.page, b.page]) await expect(queue(p)).toHaveCount(2);

    // „Пусни тази песен сега“ на следващата в опашката.
    await queue(b.page).nth(1).getByTitle("Пусни тази песен сега (за всички)").click();
    for (const p of [a.page, b.page]) await expect(now(p)).toContainText(SONG_C.title);

    // ✕ Махни → списъкът намалява и при двамата.
    const before = await queue(a.page).count();
    await queue(a.page).last().getByTitle("Махни от списъка").click();
    for (const p of [a.page, b.page]) await expect(queue(p)).toHaveCount(before - 1);
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("закъснял: влиза в канала и чува същата песен, от същото място", async ({ browser }) => {
    const { cleo, server, a, b } = await setup(browser);
    await addSong(a.page, SONG_B.url);
    await expect(now(b.page)).toContainText(SONG_B.title, { timeout: 20_000 });
    await a.page.waitForTimeout(4000);

    const c = await openAs(browser, cleo);
    await openServer(c.page, server.name);
    await joinVoice(c.page);
    await expect(now(c.page)).toContainText(SONG_B.title, { timeout: 15_000 });
    await expect(playBtn(c.page)).toHaveAttribute("title", "Пауза");
    // Същото място (±2 s), не от началото.
    const [pa, pc] = [await position(a.page), await position(c.page)];
    expect(pc).toBeGreaterThanOrEqual(3);
    expect(Math.abs(pa - pc)).toBeLessThanOrEqual(2);

    // ⏩ +10 s от Боб мести песента за всички.
    await b.page.getByTitle("10 секунди напред").click();
    await expect.poll(() => position(c.page)).toBeGreaterThanOrEqual(pc + 9);
    await expect.poll(() => position(a.page)).toBeGreaterThanOrEqual(pa + 9);
    await closeAll(a.context, b.context, c.context);
  });

  test("само за мен: заглушаване и сила на звука не пипат другите; 📺 видео прозорец; грешен линк", async ({ browser }) => {
    const { a, b } = await setup(browser);
    await addSong(a.page, SONG_A.url);
    await expect(now(b.page)).toContainText(SONG_A.title, { timeout: 20_000 });

    await a.page.locator(".music-mini").getByTitle("Заглуши музиката (само за теб)").click();
    await expect(a.page.locator(".music-mini").getByTitle("Включи музиката (само за теб)")).toBeVisible();
    await expect(b.page.locator(".music-mini").getByTitle("Заглуши музиката (само за теб)")).toBeVisible();
    await a.page.locator(".music-mini").getByTitle("Включи музиката (само за теб)").click();

    const vol = a.page.locator(".music-mini-volume-row input[type=range]");
    await vol.fill("33");
    await expect(vol).toHaveValue("33");
    await expect(b.page.locator(".music-mini-volume-row input[type=range]")).not.toHaveValue("33");

    // 📺 гледай видеото заедно → прозорец → затвори (музиката продължава).
    await a.page.locator(".music-mini .music-mini-control", { hasText: "📺" }).click();
    const close = a.page.getByTitle("Затвори (музиката продължава)");
    await expect(close).toBeVisible();
    await close.click();
    await expect(close).toHaveCount(0);
    await expect(playBtn(a.page)).toHaveAttribute("title", "Пауза");

    // Нещо, което не е YouTube → съобщение за грешка, опашката не се пипа.
    await addSong(a.page, "https://example.com/not-a-song");
    await expect(a.page.locator(".music-add-error")).toBeVisible();
    await expect(queue(a.page)).toHaveCount(1);
    await closeAll(a.context, b.context);
  });
});
