import { expect, test } from "@playwright/test";
import { api, closeAll, expectNoCrashes, messageRow, openAs, openServer, openTextChannel, register, sendMessage, serverWith, screenshotsOnFailure } from "./helpers";

screenshotsOnFailure();

test.describe("Хора: членове, профилна карта, лични съобщения, анкети, изгонване", () => {
  test("онлайн/офлайн в списъка с членове на живо", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    const a = await openAs(browser, ana);
    await openServer(a.page, server.name);
    const bobRow = a.page.locator(".member-row", { hasText: bob.username });
    await expect(bobRow).toHaveClass(/offline/);

    const b = await openAs(browser, bob);
    await openServer(b.page, server.name);
    await expect(bobRow).not.toHaveClass(/offline/);
    await b.context.close();
    await expect(bobRow).toHaveClass(/offline/, { timeout: 20_000 });
    await closeAll(a.context);
  });

  test("профилна карта → бързо лично съобщение → другият го получава и отговаря", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    const a = await openAs(browser, ana);
    const b = await openAs(browser, bob);
    await openServer(a.page, server.name);
    await openServer(b.page, server.name);

    await a.page.locator(".member-row", { hasText: bob.username }).click();
    const card = a.page.locator(".profile-card");
    await expect(card.locator(".profile-name")).toContainText(bob.username);
    const quick = card.locator(".profile-message input");
    await quick.fill("тайно съобщение");
    await quick.press("Enter");
    await expect(quick).toHaveAttribute("placeholder", /Изпратено/);

    // При Боб: брояч на 💬 → отваря личните → вижда съобщението.
    const dmIcon = b.page.locator(".server-icon[title='Лични съобщения']");
    await expect(b.page.locator(".server-icon-wrap", { has: dmIcon }).locator(".server-icon-badge")).toHaveText("1");
    await dmIcon.click();
    await b.page.locator(".channel-sidebar .channel-item", { hasText: ana.username }).click();
    await expect(messageRow(b.page, "тайно съобщение")).toBeVisible();
    const dmBox = b.page.locator(".chat-textarea").last();
    await dmBox.fill("получих го");
    await dmBox.press("Enter");

    await a.page.locator(".server-icon[title='Лични съобщения']").click();
    await a.page.locator(".channel-sidebar .channel-item", { hasText: bob.username }).click();
    await expect(messageRow(a.page, "получих го")).toBeVisible();
    expectNoCrashes(a.page);
    expectNoCrashes(b.page);
    await closeAll(a.context, b.context);
  });

  test("анкета: резултатите са скрити до гласуване, броят се на живо", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    const a = await openAs(browser, ana);
    const b = await openAs(browser, bob);
    for (const p of [a.page, b.page]) {
      await openServer(p, server.name);
      await openTextChannel(p, "general");
    }
    await a.page.locator(".poll-toggle-button").click();
    const inputs = a.page.locator(".poll-create .poll-create-input");
    await inputs.nth(0).fill("Кога играем?");
    await inputs.nth(1).fill("Довечера");
    await inputs.nth(2).fill("Утре");
    await a.page.locator(".poll-create button.primary").click();

    const bobPoll = b.page.locator(".poll-card", { hasText: "Кога играем?" });
    await expect(bobPoll).toBeVisible();
    await expect(bobPoll.locator(".poll-count")).toHaveCount(0); // скрити, докато не гласува
    await bobPoll.locator(".poll-option", { hasText: "Утре" }).click();
    await expect(bobPoll.locator(".poll-option", { hasText: "Утре" }).locator(".poll-count")).toContainText("1 · 100%");

    const anaPoll = a.page.locator(".poll-card", { hasText: "Кога играем?" });
    await anaPoll.locator(".poll-option", { hasText: "Довечера" }).click();
    await expect(bobPoll.locator(".poll-option", { hasText: "Довечера" }).locator(".poll-count")).toContainText("1 · 50%");
    await anaPoll.locator(".poll-end").click();
    await expect(bobPoll).toHaveClass(/closed/);
    await closeAll(a.context, b.context);
  });

  test("собственикът изгонва член → членът губи сървъра", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    const a = await openAs(browser, ana);
    const b = await openAs(browser, bob);
    await openServer(a.page, server.name);
    await openServer(b.page, server.name);

    // Членът не вижда секция "Управление" за собственика.
    await b.page.locator(".member-row", { hasText: ana.username }).click();
    await expect(b.page.locator(".profile-card .profile-mod")).toHaveCount(0);
    await b.page.keyboard.press("Escape");

    await a.page.locator(".member-row", { hasText: bob.username }).click();
    a.page.once("dialog", (d) => d.accept());
    await a.page.locator(".profile-card .profile-action.danger", { hasText: "Изгони" }).click();
    await expect(a.page.locator(".member-row", { hasText: bob.username })).toHaveCount(0);
    await expect(b.page.locator(`.server-icon[title^="${server.name}"]`)).toHaveCount(0, { timeout: 15_000 });
    // И API-то вече го спира.
    await expect(api(bob.token, "GET", `/servers/${server.id}`)).rejects.toThrow(/403/);
    await closeAll(a.context, b.context);
  });

  test("член не може да изгони собственика (сървърът проверява)", async () => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    await expect(api(bob.token, "DELETE", `/servers/${server.id}/members/${ana.id}`)).rejects.toThrow(/403/);
    await expect(api(bob.token, "PATCH", `/servers/${server.id}`, { name: "hacked" })).rejects.toThrow(/403/);
    const { server: s } = await api(ana.token, "GET", `/servers/${server.id}`);
    expect(s.name).toBe(server.name);
  });
});
