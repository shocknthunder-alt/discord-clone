import { expect, test, type Page } from "@playwright/test";
import { closeAll, createTextChannel, expectNoCrashes, messageInput, messageRow, openAs, openServer, openTextChannel, register, sendMessage, serverWith, uniq, screenshotsOnFailure } from "./helpers";

screenshotsOnFailure();

/** Two people in one server, both looking at #general. */
async function twoInGeneral(browser: import("@playwright/test").Browser) {
  const ana = await register("ana");
  const bob = await register("bob");
  const server = await serverWith(ana, bob);
  const a = await openAs(browser, ana);
  const b = await openAs(browser, bob);
  for (const p of [a.page, b.page]) {
    await openServer(p, server.name);
    await openTextChannel(p, "general");
  }
  return { ana, bob, server, a, b };
}

async function toolbar(page: Page, text: string) {
  const row = messageRow(page, text);
  await row.hover();
  return row.locator(".message-toolbar");
}

test.describe("Текстов чат (двама души)", () => {
  test("съобщение, форматиране, редакция с история, реакция, изтриване — на живо при другия", async ({ browser }) => {
    const { a, b } = await twoInGeneral(browser);
    const text = `здрасти ${uniq("m")}`;

    await sendMessage(a.page, `**${text}** и ~~зачеркнато~~`);
    await expect(messageRow(b.page, text)).toBeVisible();
    await expect(messageRow(b.page, text).locator("strong", { hasText: text })).toBeVisible();
    await expect(messageRow(b.page, text).locator("s, del")).toHaveText("зачеркнато");
    await expect(messageInput(a.page)).toHaveValue("");

    // Редакция → "(редактирано)" при другия → история с предишния текст.
    await (await toolbar(a.page, text)).getByTitle("Още").click();
    await a.page.locator(".toolbar-menu button", { hasText: "Редактирай" }).click();
    const edit = messageRow(a.page, text).locator(".message-edit-textarea");
    await edit.fill(`${text} (оправено)`);
    await edit.press("Enter");
    await expect(messageRow(b.page, `${text} (оправено)`)).toBeVisible();
    const tag = messageRow(b.page, `${text} (оправено)`).locator(".edited-tag");
    await expect(tag).toBeVisible();
    await tag.click();
    await expect(b.page.locator(".edit-history")).toContainText("зачеркнато");
    await b.page.keyboard.press("Escape");

    // Бърза реакция от Боб → чипът се вижда и при Ана с брой 1.
    await (await toolbar(b.page, text)).locator(".toolbar-emoji").first().click();
    await expect(messageRow(a.page, text).locator(".reaction-chip")).toContainText("1");
    // Ана добавя същата → 2.
    await messageRow(a.page, text).locator(".reaction-chip").first().click();
    await expect(messageRow(b.page, text).locator(".reaction-chip")).toContainText("2");

    // Изтриване (с потвърждение) → изчезва и при Боб.
    a.page.once("dialog", (d) => d.accept());
    await (await toolbar(a.page, text)).getByTitle("Още").click();
    await a.page.locator(".toolbar-menu button.danger").click();
    await expect(messageRow(b.page, text)).toHaveCount(0);

    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("отговор в нишка + брояч на отговорите", async ({ browser }) => {
    const { a, b } = await twoInGeneral(browser);
    const root = `въпрос ${uniq("t")}`;
    await sendMessage(a.page, root);
    await expect(messageRow(b.page, root)).toBeVisible();

    await (await toolbar(b.page, root)).getByRole("button", { name: /Отговори/ }).click();
    const thread = b.page.locator(".thread-panel-messages");
    await expect(thread).toContainText(root);
    const reply = b.page.locator(".thread-panel .chat-textarea, .thread-panel-messages ~ * .chat-textarea").first();
    await reply.fill("отговор в нишката");
    await reply.press("Enter");
    await expect(thread).toContainText("отговор в нишката");

    // Ана вижда "1 отговор" под съобщението си и може да отвори нишката.
    const summary = messageRow(a.page, root).locator(".thread-summary");
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(a.page.locator(".thread-panel-messages")).toContainText("отговор в нишката");
    await closeAll(a.context, b.context);
  });

  test("закачане (📌) и панелът със закачени", async ({ browser }) => {
    const { a, b } = await twoInGeneral(browser);
    const text = `важно ${uniq("p")}`;
    await sendMessage(a.page, text);
    await (await toolbar(a.page, text)).getByTitle("Още").click();
    await a.page.locator(".toolbar-menu button", { hasText: "Закачи" }).click();
    await expect(messageRow(b.page, text).locator(".pinned-tag")).toBeVisible();
    await b.page.getByTitle("Закачени съобщения").click();
    await expect(b.page.locator(".pins-panel .pin-item")).toContainText(text);
    await closeAll(a.context, b.context);
  });

  test("@споменаване: червен @1 на канала при другия и светване на реда", async ({ browser }) => {
    const { a, b, bob } = await twoInGeneral(browser);
    // Боб отива в друг канал, за да види значката на #general.
    await createTextChannel(b.page, "offtopic").catch(() => {});
    // Боб не е собственик — каналът го прави Ана.
    if (!(await b.page.locator(".channel-item-name", { hasText: /offtopic/ }).count())) {
      await createTextChannel(a.page, "offtopic");
    }
    await openTextChannel(b.page, "offtopic");
    await sendMessage(a.page, `хей @${bob.username} виж това`);
    const general = b.page.locator(".channel-item", { has: b.page.locator(".channel-item-name", { hasText: /^# general/ }) });
    await expect(general.locator(".mention-badge")).toHaveText("@1");
    await openTextChannel(b.page, "general");
    await expect(messageRow(b.page, "виж това")).toHaveClass(/mentioned/);
    await expect(general.locator(".mention-badge")).toHaveCount(0);
    await closeAll(a.context, b.context);
  });

  test("търсене (Ctrl+K) намира съобщение и скача до него", async ({ browser }) => {
    const { a, b } = await twoInGeneral(browser);
    const needle = uniq("иглата");
    await sendMessage(a.page, `някъде тук е ${needle} в купа сено`);
    await expect(messageRow(b.page, needle)).toBeVisible();
    for (let i = 0; i < 3; i++) await sendMessage(a.page, `пълнеж ${i}`);
    await b.page.keyboard.press("Control+k");
    await b.page.locator(".search-input").fill(needle);
    const hit = b.page.locator(".search-result", { hasText: needle });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(messageRow(b.page, needle)).toBeInViewport();
    await closeAll(a.context, b.context);
  });

  test("нов канал се появява при другия на живо, членът няма ⚙️ на каналите", async ({ browser }) => {
    const { a, b } = await twoInGeneral(browser);
    await createTextChannel(a.page, "новини");
    await expect(b.page.locator(".channel-item-name", { hasText: /новини/ })).toBeVisible();
    // Член (Боб) няма ⚙️ на каналите.
    await expect(b.page.locator(".channel-item-settings")).toHaveCount(0);
    await closeAll(a.context, b.context);
  });
});

