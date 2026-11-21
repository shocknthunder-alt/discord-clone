import { expect, test, type Page } from "@playwright/test";
import { closeAll, createTextChannel, expectNoCrashes, messageRow, openAs, openServer, openTextChannel, register, sendMessage, serverWith, screenshotsOnFailure } from "./helpers";

screenshotsOnFailure();

async function pair(browser: import("@playwright/test").Browser) {
  const ana = await register("ana");
  const bob = await register("bob");
  const server = await serverWith(ana, bob);
  const a = await openAs(browser, ana);
  const b = await openAs(browser, bob);
  await openServer(a.page, server.name);
  await openServer(b.page, server.name);
  return { ana, bob, server, a, b };
}

/** How many pixels of the board are not background (white). */
async function inkOnCanvas(page: Page) {
  return page.locator(".draw-canvas-wrap canvas").first().evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) n++;
    return n;
  });
}

test.describe("Функции", () => {
  test("🎨 Paint Wars: двама играчи, рисунка се вижда при другия, позната дума дава точки", async ({ browser }) => {
    test.setTimeout(120_000);
    const { a, b, ana, bob } = await pair(browser);
    await createTextChannel(a.page, "paint wars", "draw");
    for (const p of [a.page, b.page]) await openTextChannel(p, "paint wars");
    await expect(a.page.locator(".draw-game")).toBeVisible();

    // С един играч не може да се започне.
    await a.page.getByRole("button", { name: /Включи се/ }).click();
    await expect(a.page.getByRole("button", { name: /Започни|Трябват поне двама/ })).toBeDisabled();
    await b.page.getByRole("button", { name: /Включи се/ }).click();
    const start = a.page.getByRole("button", { name: /Започни/ });
    await expect(start).toBeEnabled();
    await start.click();

    // Който рисува, вижда 3 думи.
    const choicesA = a.page.locator(".draw-choices button");
    const choicesB = b.page.locator(".draw-choices button");
    await expect.poll(async () => (await choicesA.count()) + (await choicesB.count()), { timeout: 15_000 }).toBeGreaterThan(0);
    const drawerIsA = (await choicesA.count()) > 0;
    const drawer = drawerIsA ? a.page : b.page;
    const guesser = drawerIsA ? b.page : a.page;
    const guesserName = drawerIsA ? bob.username : ana.username;
    const choices = drawer.locator(".draw-choices button");
    await expect(choices).toHaveCount(3);
    const word = (await choices.first().innerText()).trim();
    await choices.first().click();

    // Познаващият вижда само чертички с правилната дължина.
    await expect(guesser.locator(".draw-word")).not.toContainText(word);

    // Рисува линия.
    const canvas = drawer.locator(".draw-canvas-wrap canvas").first();
    const box = (await canvas.boundingBox())!;
    await drawer.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await drawer.mouse.down();
    for (let i = 1; i <= 20; i++) await drawer.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.3 + i * 0.015));
    await drawer.mouse.up();
    await expect.poll(() => inkOnCanvas(guesser), { timeout: 10_000 }).toBeGreaterThan(20);

    // Грешна догадка остава видима, правилната — не (спойлер), но дава точки.
    const input = guesser.locator(".draw-chat-input input");
    await input.fill("съвсем-грешно");
    await input.press("Enter");
    await expect(drawer.locator(".draw-chat-lines")).toContainText("съвсем-грешно");
    await input.fill(word);
    await input.press("Enter");
    const lines = drawer.locator(".draw-chat-lines");
    await expect(lines).toContainText(/позна думата! \(\+\d+\)/);
    // Самата догадка не се показва като съобщение (иначе би издала думата).
    await expect(lines).not.toContainText(`${guesserName}: ${word}`);
    // С двама играчи всички са познали → ходът свършва и думата се разкрива.
    await expect(lines).toContainText(`Думата беше: ${word}`);
    // Точки и за двамата (познал + рисувач).
    await expect(guesser.locator(".draw-players")).not.toContainText(/\b0 т\./);
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("🎨 Paint Wars инструменти: молив, кофа, ↶ връщане, гума, изчисти всичко, ⏹ спри играта", async ({ browser }) => {
    test.setTimeout(120_000);
    const { a, b } = await pair(browser);
    await createTextChannel(a.page, "paint wars", "draw");
    for (const p of [a.page, b.page]) await openTextChannel(p, "paint wars");
    for (const p of [a.page, b.page]) await p.getByRole("button", { name: /Включи се/ }).click();
    await a.page.getByRole("button", { name: /Започни/ }).click();
    const choicesA = a.page.locator(".draw-choices button");
    const choicesB = b.page.locator(".draw-choices button");
    await expect.poll(async () => (await choicesA.count()) + (await choicesB.count()), { timeout: 15_000 }).toBeGreaterThan(0);
    const drawer = (await choicesA.count()) > 0 ? a.page : b.page;
    const viewer = drawer === a.page ? b.page : a.page;
    await drawer.locator(".draw-choices button").first().click();

    const canvas = drawer.locator(".draw-canvas-wrap canvas").first();
    const box = (await canvas.boundingBox())!;
    const line = async (y: number) => {
      await drawer.mouse.move(box.x + box.width * 0.15, box.y + box.height * y);
      await drawer.mouse.down();
      for (let i = 1; i <= 15; i++) await drawer.mouse.move(box.x + box.width * (0.15 + i * 0.04), box.y + box.height * y);
      await drawer.mouse.up();
    };

    // Цвят + най-дебелата четка + линия.
    await drawer.locator(".draw-colors button").nth(7).click(); // червено
    await drawer.locator(".draw-sizes button").last().click();
    await line(0.3);
    await expect.poll(() => inkOnCanvas(viewer), { timeout: 10_000 }).toBeGreaterThan(50);
    const afterLine = await inkOnCanvas(viewer);

    // ↶ Връщане (бутон) → чисто.
    await drawer.getByTitle("Върни (Ctrl+Z)").click();
    await expect.poll(() => inkOnCanvas(viewer), { timeout: 10_000 }).toBeLessThan(afterLine / 4);

    // Кофа в празното → почти целият лист оцветен.
    await drawer.getByTitle("Кофа (запълни)").click();
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
    await expect.poll(() => inkOnCanvas(viewer), { timeout: 10_000 }).toBeGreaterThan(afterLine * 5);
    // Ctrl+Z от клавиатурата връща кофата.
    await drawer.keyboard.press("Control+z");
    await expect.poll(() => inkOnCanvas(viewer), { timeout: 10_000 }).toBeLessThan(afterLine / 4);

    // Молив + линия, после гума върху нея.
    await drawer.getByTitle("Молив").click();
    await line(0.6);
    await expect.poll(() => inkOnCanvas(viewer), { timeout: 10_000 }).toBeGreaterThan(50);
    const withLine = await inkOnCanvas(viewer);
    await drawer.getByTitle("Гума").click();
    await line(0.6);
    await expect.poll(() => inkOnCanvas(viewer), { timeout: 10_000 }).toBeLessThan(withLine);

    // Изчисти всичко (с потвърждение).
    await drawer.getByTitle("Молив").click();
    await line(0.4);
    drawer.once("dialog", (d) => d.accept());
    await drawer.getByTitle("Изчисти всичко").click();
    await expect.poll(() => inkOnCanvas(viewer), { timeout: 10_000 }).toBeLessThan(20);

    // ⏹ Спри играта → обратно в лобито при двамата.
    drawer.once("dialog", (d) => d.accept());
    await drawer.locator(".draw-stop").click();
    for (const p of [a.page, b.page]) await expect(p.getByRole("button", { name: /Започни|Излез от играта|Включи се/ }).first()).toBeVisible();
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });
  test("🎲 тривия: !trivia пуска въпрос от бота", async ({ browser }) => {
    const { a } = await pair(browser);
    await createTextChannel(a.page, "trivia", "trivia");
    await openTextChannel(a.page, "trivia");
    await sendMessage(a.page, "!trivia 1");
    // Ботът пише нещо (въпрос / обявяване) от свое име.
    await expect(a.page.locator(".message-list .message-row").filter({ hasNotText: "!trivia 1" }).first()).toBeVisible({ timeout: 20_000 });
    await closeAll(a.context);
  });

  test("🗂️ форум: тема с отговор", async ({ browser }) => {
    const { a, b } = await pair(browser);
    await createTextChannel(a.page, "идеи", "forum");
    for (const p of [a.page, b.page]) await openTextChannel(p, "идеи");
    await a.page.locator(".forum-new").click();
    await a.page.locator(".forum-title-input").fill("Нова игра в петък");
    const body = a.page.locator(".forum-composer .chat-textarea");
    await body.fill("Кой е за?");
    await body.press("Enter");
    await expect(b.page.locator(".forum-card-title", { hasText: "Нова игра в петък" })).toBeVisible();
    await b.page.locator(".forum-card-title", { hasText: "Нова игра в петък" }).click();
    const reply = b.page.locator(".thread-panel .chat-textarea");
    await reply.fill("Аз!");
    await reply.press("Enter");
    await expect(b.page.locator(".thread-panel-messages")).toContainText("Аз!");
    await closeAll(a.context, b.context);
  });

  test("📅 събитие: създаване, вижда се при другия, отговор ✅", async ({ browser }) => {
    const { a, b, bob } = await pair(browser);
    await a.page.getByTitle("Ново събитие").click();
    await a.page.locator(".ev-input").first().fill("Рейд в събота");
    const d = new Date(Date.now() + 3 * 86400_000);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await a.page.locator(".ev-input[type=date]").fill(ymd);
    await a.page.locator(".ev-input[type=time]").first().fill("20:30");
    await a.page.locator("button[type=submit].ev-btn.primary").click();
    await expect(a.page.locator(".ev-modal")).toContainText("Рейд в събота");

    // Другият получава известие "Ново събитие" с бутон "Виж".
    const toast = b.page.locator("text=Ново събитие").locator("xpath=ancestor::div[.//button][1]");
    await expect(toast).toContainText("Рейд в събота", { timeout: 15_000 });
    await toast.getByRole("button", { name: "Виж" }).click();
    await b.page.locator(".ev-rsvp .going").click();
    await expect(b.page.locator(".ev-rsvp .going")).toHaveClass(/on/);
    await expect(b.page.locator(".ev-people")).toContainText(bob.username);
    await closeAll(a.context, b.context);
  });
});
