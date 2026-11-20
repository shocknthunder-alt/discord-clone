import { expect, test } from "@playwright/test";
import { closeAll, expectNoCrashes, messageRow, openAs, register, screenshotsOnFailure, sendMessage, serverWith } from "./helpers";

screenshotsOnFailure();

test.describe("📱 Телефон (390×844)", () => {
  test("списък → канал → съобщение → назад към списъка; няма бутон за стрийм", async ({ browser }) => {
    const ana = await register("ana");
    const bob = await register("bob");
    const server = await serverWith(ana, bob);
    const phone = await openAs(browser, ana, { viewport: { width: 390, height: 844 }, isMobile: true });
    const desk = await openAs(browser, bob);
    const p = phone.page;

    await expect(p.locator(".app-shell.mobile")).toBeVisible();
    await p.locator(`.server-icon[title^="${server.name}"]`).tap();
    await p.locator(".channel-item", { hasText: "general" }).first().tap();
    await expect(p.locator(".app-shell.mobile.pane-content")).toBeVisible();
    await sendMessage(p, "пиша от телефона");

    await desk.page.locator(`.server-icon[title^="${server.name}"]`).click();
    await desk.page.locator(".channel-item", { hasText: /^# general/ }).click();
    await expect(messageRow(desk.page, "пиша от телефона")).toBeVisible();
    await sendMessage(desk.page, "видях го");
    await expect(messageRow(p, "видях го")).toBeVisible();

    // "Назад" на телефона връща към списъка, не излиза от приложението.
    await p.goBack();
    await expect(p.locator(".app-shell.mobile.pane-nav")).toBeVisible();
    await expect(p).toHaveURL(/localhost/);

    // Гласов канал от телефона: влиза, без бутон за стрийм на екрана.
    await p.locator(".channel-item", { has: p.locator(".channel-item-name", { hasText: /(^|\s)General$/ }) }).tap();
    await expect(p.getByTitle("Започни стрийм (Go Live)")).toHaveCount(0);
    expectNoCrashes(p);
    await closeAll(phone.context, desk.context);
  });
});
