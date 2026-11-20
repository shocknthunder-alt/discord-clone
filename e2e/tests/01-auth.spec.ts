import { expect, test, type Page } from "@playwright/test";
import { api, collectErrors, expectNoCrashes, register, serverWith, uniq, screenshotsOnFailure } from "./helpers";

screenshotsOnFailure();

async function logout(page: Page) {
  await page.locator(".user-bar-settings-button").click();
  await page.locator(".set-nav-item.danger").click();
  await expect(page).toHaveURL(/\/login$/);
}

async function login(page: Page, loginName: string, password: string) {
  await page.locator("#email").fill(loginName);
  await page.locator("#password").fill(password);
  await page.locator("form.auth-card button[type=submit]").click();
}

test.describe("Акаунти", () => {
  test("регистрация → изход → вход с име и с имейл", async ({ page }) => {
    collectErrors(page);
    const username = uniq("reg");
    const email = `${username}@e2e.test`;
    const password = "secret-123";

    await page.goto("/register");
    await page.locator("#username").fill(username);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("button[type=submit]").click();
    await expect(page.locator(".user-bar-name")).toHaveText(username);

    await logout(page);
    await login(page, username, password);
    await expect(page.locator(".user-bar-name")).toHaveText(username);

    await logout(page);
    await login(page, email.toUpperCase(), password);
    await expect(page.locator(".user-bar-name")).toHaveText(username);
    expectNoCrashes(page);
  });

  test("грешна парола показва грешка и не влиза", async ({ page }) => {
    const acc = await register("wrong");
    await page.goto("/login");
    await login(page, acc.username, "not-the-password");
    await expect(page.locator(".auth-card .error")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("регистрация със заето име се отказва", async ({ page }) => {
    const acc = await register("dup");
    await page.goto("/register");
    await page.locator("#username").fill(acc.username);
    await page.locator("#email").fill(`other-${acc.email}`);
    await page.locator("#password").fill("secret-123");
    await page.locator("button[type=submit]").click();
    await expect(page.locator(".auth-card .error")).toBeVisible();
  });

  test("линк за покана: нов човек се регистрира и влиза направо в сървъра", async ({ page }) => {
    const owner = await register("own");
    const server = await serverWith(owner);
    await page.goto(`/invite/${server.inviteCode}`);
    await expect(page).toHaveURL(/\/register/);
    const username = uniq("inv");
    await page.locator("#username").fill(username);
    await page.locator("#email").fill(`${username}@e2e.test`);
    await page.locator("#password").fill("secret-123");
    await page.locator("button[type=submit]").click();
    await expect(page.locator(`.server-icon[title^="${server.name}"]`)).toBeVisible();
    await expect(page.locator(".channel-item-name", { hasText: /^# general$/ })).toBeVisible();
    await expect(page.locator(".member-list, body")).toContainText(owner.username);
  });

  test("двойно влизане по покана едновременно не срива сървъра", async () => {
    const owner = await register("own");
    const guest = await register("twice");
    const server = await serverWith(owner);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => api(guest.token, "POST", "/servers/join", { inviteCode: server.inviteCode })),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(5);
    // Сървърът е жив.
    await api(guest.token, "GET", "/servers");
  });

  test("невалиден/изтекъл токен праща към входа", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "garbage.token.value");
      localStorage.setItem("user", JSON.stringify({ id: "x", username: "ghost", email: "g@x", avatarUrl: null }));
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });

  test("смяна на паролата от екрана за вход", async () => {
    const acc = await register("chg");
    await api(null, "POST", "/auth/change-password", { email: acc.username, currentPassword: acc.password, newPassword: "brand-new-pass" });
    await api(null, "POST", "/auth/login", { email: acc.username, password: "brand-new-pass" });
    await expect(api(null, "POST", "/auth/login", { email: acc.username, password: acc.password })).rejects.toThrow(/401|400/);
  });
});
