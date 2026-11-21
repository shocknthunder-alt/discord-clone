import { expect, test, type Page } from "@playwright/test";
import {
  closeAll,
  expectNoCrashes,
  messageInput,
  messageRow,
  openAs,
  openServer,
  openTextChannel,
  register,
  screenshotsOnFailure,
  sendMessage,
  serverWith,
  uniq,
} from "./helpers";

screenshotsOnFailure();

async function pair(browser: import("@playwright/test").Browser) {
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

async function hoverToolbar(page: Page, text: string) {
  const row = messageRow(page, text);
  await row.hover();
  return row.locator(".message-toolbar");
}

test.describe("Менюта и бутони", () => {
  test("⚙️ потребителски настройки: всеки раздел се отваря; смяна на езика EN ↔ BG", async ({ browser }) => {
    const { a, b } = await pair(browser);
    const p = a.page;
    await p.locator(".user-bar-settings-button").click();
    const items = p.locator(".set-nav-item:not(.danger)");
    const n = await items.count();
    expect(n).toBeGreaterThan(5);
    const seen: string[] = [];
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      const label = (await item.innerText()).trim();
      await item.click();
      await expect(item).toHaveClass(/active/);
      seen.push(label);
    }
    console.log(`  разделите: ${seen.join(" · ")}`);

    // Език: English → интерфейсът е на английски → обратно.
    await p.locator(".set-nav-item", { hasText: /Външен вид и език|Appearance/ }).click();
    await p.getByText("The interface in English.").click();
    await expect(p.locator(".set-nav-item.danger")).toContainText("Log out");
    await p.getByText("Интерфейсът на български.").click();
    await expect(p.locator(".set-nav-item.danger")).toContainText("Изход");
    await p.keyboard.press("Escape");
    await expect(p.locator(".set-nav")).toHaveCount(0);
    expectNoCrashes(p);
    await closeAll(a.context, b.context);
  });

  test("🎨 теми: всяка тема се прилага; запазената остава след презареждане, незапазената се връща", async ({ browser }) => {
    const { a, b } = await pair(browser);
    const p = a.page;
    const theme = () => p.evaluate(() => document.documentElement.dataset.theme);
    const start = await theme();
    await p.locator(".user-bar-settings-button").click();
    await p.locator(".set-nav-item", { hasText: /Външен вид и език/ }).click();
    const swatches = p.locator(".theme-swatch");
    const n = await swatches.count();
    expect(n).toBeGreaterThanOrEqual(15);
    const applied = new Set<string | undefined>();
    for (let i = 0; i < n; i++) {
      await swatches.nth(i).click();
      applied.add(await theme());
    }
    expect(applied.size, "всяка тема сменя data-theme").toBe(n);
    // Без запазване → Затвори (потвърди) → връща се старата.
    p.once("dialog", (d) => d.accept());
    await p.keyboard.press("Escape");
    await expect.poll(theme).toBe(start);

    // Избор + Запази → остава и след презареждане.
    await p.locator(".user-bar-settings-button").click();
    await p.locator(".set-nav-item", { hasText: /Външен вид и език/ }).click();
    const pick = p.locator(".theme-swatch:not(.selected)").first();
    await pick.click();
    const chosen = await theme();
    await p.getByRole("button", { name: "Запази промените" }).click();
    await p.keyboard.press("Escape");
    await p.reload();
    await expect.poll(theme).toBe(chosen);
    expectNoCrashes(p);
    await closeAll(a.context, b.context);
  });
  test("🛡️ настройки на сървъра: табове, нов ранг, член получава ранга (вижда се и при него)", async ({ browser }) => {
    const { a, b, bob } = await pair(browser);
    await a.page.getByTitle("Настройки на сървъра").click();
    for (const tab of ["Общи", "Рангове", "Членове"]) {
      const btn = a.page.locator(".ss-tabs button", { hasText: tab });
      await btn.click();
      await expect(btn).toHaveClass(/on/);
    }
    await a.page.locator(".ss-tabs button", { hasText: "Рангове" }).click();
    await a.page.locator(".ss-btn.primary", { hasText: "Нов ранг" }).click();
    await expect(a.page.locator(".ss-role-name", { hasText: /^Нов ранг$/ })).toBeVisible();
    await a.page.keyboard.press("Escape");

    // Членът няма бутон за настройки на сървъра.
    await expect(b.page.getByTitle("Настройки на сървъра")).toHaveCount(0);

    await a.page.locator(".member-row", { hasText: bob.username }).click();
    const rank = a.page.locator(".profile-card .profile-mod select").first();
    const value = await rank.locator("option", { hasText: "Нов ранг" }).getAttribute("value");
    await rank.selectOption(value!);
    await a.page.keyboard.press("Escape");
    // Боб е в групата "Нов ранг" и при двамата.
    for (const p of [a.page, b.page]) {
      await expect(p.locator(".members-panel")).toContainText(/Нов ранг/);
    }
    await closeAll(a.context, b.context);
  });

  test("⚙️ на канал: преименуване се вижда при другия; 🔕 заглушаване на канал", async ({ browser }) => {
    const { a, b } = await pair(browser);
    await a.page.locator(".channel-item", { hasText: /^# general/ }).hover();
    await a.page.locator(".channel-item", { hasText: /^# general/ }).getByTitle("Настройки на канала").click();
    await a.page.locator(".modal-card .modal-input").fill("общ-чат");
    await a.page.locator(".modal-card .modal-create-button").click();
    await expect(b.page.locator(".channel-item-name", { hasText: "общ-чат" })).toBeVisible();
    await expect(b.page.locator(".chat-header-title")).toContainText("общ-чат");

    // Десен бутон → Заглуши канала → 🔕.
    await b.page.locator(".channel-item", { hasText: "общ-чат" }).click({ button: "right" });
    await b.page.locator(".mute-menu button", { hasText: "Докато не го включа" }).click();
    await expect(b.page.locator(".channel-item", { hasText: "общ-чат" }).locator(".muted-icon")).toBeVisible();
    await b.page.locator(".channel-item", { hasText: "общ-чат" }).click({ button: "right" });
    await b.page.locator(".mute-menu button", { hasText: "Включи канала" }).click();
    await expect(b.page.locator(".channel-item", { hasText: "общ-чат" }).locator(".muted-icon")).toHaveCount(0);

    // Десен бутон на иконата на сървъра → заглуши / включи сървъра.
    const icon = b.page.locator(".server-icon").nth(1);
    await icon.click({ button: "right" });
    await b.page.locator(".mute-menu button", { hasText: "За 1 час" }).click();
    await expect(icon).toHaveClass(/muted/);
    await icon.click({ button: "right" });
    await b.page.locator(".mute-menu button", { hasText: "Включи сървъра" }).click();
    await expect(icon).not.toHaveClass(/muted/);
    await closeAll(a.context, b.context);
  });

  test("съобщение: ☺ избор на емоджи за реакция, ⋮ Копирай текста, емоджи в полето за писане", async ({ browser }) => {
    const { a, b } = await pair(browser);
    const text = `реагирай ${uniq("r")}`;
    await sendMessage(a.page, text);

    await (await hoverToolbar(b.page, text)).getByRole("button", { name: /Реакция/ }).click();
    const picker = b.page.locator(".emoji-popover-card");
    await expect(picker).toBeVisible();
    await picker.locator("button.epr-emoji, .epr-emoji").first().click();
    await expect(messageRow(a.page, text).locator(".reaction-chip")).toHaveCount(1);

    await (await hoverToolbar(a.page, text)).getByTitle("Още").click();
    await a.page.locator(".toolbar-menu button", { hasText: "Копирай текста" }).click();
    expect(await a.page.evaluate(() => navigator.clipboard.readText())).toBe(text);

    await a.page.locator(".emoji-toggle-button").click();
    await a.page.locator(".emoji-picker-popover .epr-emoji").first().click();
    await expect(messageInput(a.page)).not.toHaveValue("");
    await closeAll(a.context, b.context);
  });

  test("👥 панелът с членове се скрива/показва; 🔗 покана се копира", async ({ browser }) => {
    const { a, b, server } = await pair(browser);
    await a.page.locator(".members-collapse").click();
    await expect(a.page.locator(".members-panel.collapsed")).toBeVisible();
    await a.page.locator(".members-rail").click();
    // И бутонът 👥 в горната лента на чата.
    await a.page.locator(".members-toggle").click();
    await expect(a.page.locator(".members-panel.collapsed")).toBeVisible();
    await a.page.locator(".members-toggle").click();
    await expect(a.page.locator(".members-panel:not(.collapsed)")).toBeVisible();
    await a.page.locator(".invite-row").click();
    await expect(a.page.locator(".invite-row")).toContainText("копиран");
    expect(await a.page.evaluate(() => navigator.clipboard.readText())).toContain(server.inviteCode);
    await closeAll(a.context, b.context);
  });

  test("моята карта: статус под името се вижда при другия", async ({ browser }) => {
    const { a, b, ana } = await pair(browser);
    await a.page.locator(".member-row", { hasText: ana.username }).click();
    await a.page.locator(".profile-card button", { hasText: /Задай статус|Смени статуса/ }).click();
    await a.page.locator(".status-input").fill("на кафе ☕");
    await a.page.locator(".status-actions button", { hasText: "Запази" }).click();
    await expect(b.page.locator(".member-row", { hasText: ana.username })).toContainText("на кафе ☕");
    await closeAll(a.context, b.context);
  });

  test("📅 таблото със събития: Всички / ＋ / затваряне", async ({ browser }) => {
    const { a, b } = await pair(browser);
    await a.page.getByTitle("Всички събития").click();
    await expect(a.page.locator(".ev-modal")).toBeVisible();
    const tabs = a.page.locator(".ev-tabs button");
    for (let i = 0; i < (await tabs.count()); i++) await tabs.nth(i).click();
    await a.page.locator(".ev-modal .ev-close").click();
    await expect(a.page.locator(".ev-modal")).toHaveCount(0);
    await closeAll(a.context, b.context);
  });

  test("сървъри: създаване и влизане с код през UI (бутоните в страничната лента)", async ({ browser }) => {
    const { a, b } = await pair(browser);
    const name = uniq("UiSrv");
    await a.page.locator(".sidebar-actions-group").hover();
    await a.page.locator(".sidebar-action-button", { hasText: "Създай сървър" }).click();
    await a.page.locator("#server-name-input").fill(name);
    await a.page.locator(".modal-create-button").click();
    await expect(a.page.locator(`.server-icon[title^="${name}"]`)).toBeVisible();
    await expect(a.page.locator(".channel-item-name", { hasText: /^# general$/ })).toBeVisible();
    const code = await a.page.locator(".invite-row").getAttribute("title");
    const invite = code!.split("/").pop()!;

    await b.page.locator(".sidebar-actions-group").hover();
    await b.page.locator(".sidebar-action-button", { hasText: "Влез в сървър" }).click();
    await b.page.locator("#invite-input").fill(invite);
    await b.page.locator(".modal-join-button").click();
    await expect(b.page.locator(`.server-icon[title^="${name}"]`)).toBeVisible();
    await closeAll(a.context, b.context);
  });

  test("🎤 бутоните в гласа: заглуши всички, soundboard, настройки, заключване", async ({ browser }) => {
    const { a, b } = await pair(browser);
    const p = a.page;
    await p.locator(".channel-item", { has: p.locator(".channel-item-name", { hasText: /(^|\s)General$/ }) }).click();
    await expect(p.getByTitle("Излез от канала")).toBeVisible({ timeout: 20_000 });

    await p.getByTitle("Заглуши всички").click();
    await expect(p.getByTitle("Включи звука")).toBeVisible();
    await p.getByTitle("Включи звука").click();
    await expect(p.getByTitle("Заглуши всички")).toBeVisible();

    await p.getByTitle("Soundboard").first().click();
    await expect(p.getByTitle("Затвори (Esc)").first()).toBeVisible();
    await p.keyboard.press("Escape");

    await p.locator("[title='Настройки']").last().click();
    await expect(p.locator(".set-nav")).toBeVisible();
    await p.keyboard.press("Escape");

    const lock = p.getByTitle(/Отключи — бутоните|Заключи бутоните/);
    const before = await lock.getAttribute("title");
    await lock.click();
    await expect(p.getByTitle(/Отключи — бутоните|Заключи бутоните/)).not.toHaveAttribute("title", before!);
    await lock.click();
    expectNoCrashes(p);
    await closeAll(a.context, b.context);
  });

  test("🔍 търсене: отваря се от бутона, Esc затваря, празен резултат", async ({ browser }) => {
    const { a, b } = await pair(browser);
    await a.page.getByTitle("Търси в съобщенията (Ctrl+K)").click();
    await a.page.locator(".search-input").fill("нямататакованещо");
    await expect(a.page.locator(".search-hint")).toContainText("Няма намерени");
    await a.page.keyboard.press("Escape");
    await expect(a.page.locator(".search-modal")).toHaveCount(0);
    await closeAll(a.context, b.context);
  });
});
