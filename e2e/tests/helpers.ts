import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

export const API = process.env.E2E_API ?? "http://localhost:4610";
export const WEB = process.env.E2E_WEB ?? "http://localhost:5610";

let counter = 0;
/** Short unique name (usernames must be unique across the whole run). */
export function uniq(prefix: string) {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter}`;
}

export interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
  token: string;
  user: unknown;
}

export async function api<T = any>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return data as T;
}

export async function register(prefix: string): Promise<Account> {
  const username = uniq(prefix);
  const email = `${username}@e2e.test`;
  const password = `pass-${username}`;
  const { user, token } = await api(null, "POST", "/auth/register", { username, email, password });
  return { id: user.id, username, email, password, token, user };
}

/** A server owned by `owner` with the others joined through its invite code. */
export async function serverWith(owner: Account, ...others: Account[]) {
  const name = uniq("Srv");
  const { server } = await api(owner.token, "POST", "/servers", { name });
  for (const o of others) await api(o.token, "POST", "/servers/join", { inviteCode: server.inviteCode });
  return server as { id: string; name: string; inviteCode: string; textChannels: { id: string; name: string }[]; voiceChannels: { id: string; name: string }[] };
}

/** A browser window already logged in as `acc` (token put where the app looks for it). */
export async function openAs(
  browser: Browser,
  acc: Account,
  opts: { viewport?: { width: number; height: number }; isMobile?: boolean; deviceScaleFactor?: number; setup?: (context: BrowserContext) => Promise<void> } = {},
) {
  // browser.newContext() does not inherit the config's `use` — permissions etc. are given here.
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    locale: "bg-BG",
    permissions: ["microphone", "camera", "notifications", "clipboard-read", "clipboard-write"],
    baseURL: WEB,
    isMobile: opts.isMobile,
    hasTouch: opts.isMobile,
    deviceScaleFactor: opts.deviceScaleFactor,
  });
  await context.addInitScript(
    ([token, user]) => {
      if (!localStorage.getItem("token")) {
        localStorage.setItem("token", token as string);
        localStorage.setItem("user", JSON.stringify(user));
      }
      // The "get the desktop app" banner floats over the chat header — out of the way in tests.
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = ".desktop-app-banner{display:none!important}";
        document.head.appendChild(style);
      });
    },
    [acc.token, acc.user],
  );
  await opts.setup?.(context);
  const page = await context.newPage();
  collectErrors(page);
  openPages.push({ name: acc.username, page });
  await page.goto("/");
  return { context, page };
}

// Every window opened with openAs: on a failure each one gets a screenshot in the report.
const openPages: { name: string; page: Page }[] = [];
/** Call once at the top of every spec file. */
export function screenshotsOnFailure() {
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) {
    for (const { name, page } of openPages) {
      if (!page.isClosed()) await info.attach(`screen-${name}`, { body: await page.screenshot().catch(() => Buffer.alloc(0)), contentType: "image/png" });
    }
  }
  openPages.length = 0;
});
}

/** Console errors and page crashes go into the test log (and fail with `expectNoCrashes`). */
const crashes = new WeakMap<Page, string[]>();
export function collectErrors(page: Page) {
  const list: string[] = [];
  crashes.set(page, list);
  page.on("pageerror", (err) => list.push(`pageerror: ${err.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`  [console ${page.url()}] ${m.text().slice(0, 300)}`);
  });
}
export function expectNoCrashes(page: Page) {
  expect(crashes.get(page) ?? [], "uncaught exceptions in the page").toEqual([]);
}

export async function openServer(page: Page, serverName: string) {
  await page.locator(`.server-icon[title^="${serverName}"]`).click();
  await expect(page.locator(".channel-item").first()).toBeVisible();
}

export async function openTextChannel(page: Page, channelName: string) {
  await page.locator(".channel-item", { has: page.locator(".channel-item-name", { hasText: new RegExp(`^\\S+ ${escapeRe(channelName)}`) }) }).first().click();
  await expect(page.locator(".chat-header-title")).toContainText(channelName);
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function messageInput(page: Page) {
  return page.locator(".message-input-form .chat-textarea");
}

export async function sendMessage(page: Page, text: string) {
  const box = messageInput(page);
  await box.click();
  await box.fill(text);
  await box.press("Enter");
}

export function messageRow(page: Page, text: string | RegExp) {
  return page.locator(".message-list .message-row", { hasText: text });
}

export async function closeAll(...contexts: BrowserContext[]) {
  for (const c of contexts) await c.close().catch(() => {});
}

/** Direct, read-only look into the throw-away test database. */
export async function dbQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  try {
    return (await db.query(sql, params)).rows as T[];
  } finally {
    await db.end();
  }
}

export async function createTextChannel(page: Page, name: string, kind?: "forum" | "trivia" | "draw") {
  await page.locator(".channel-section", { hasText: "Текстови канали" }).click({ button: "right" });
  const item = page.locator(".context-menu .context-menu-item").first();
  await item.click({ timeout: 3000 });
  await page.locator("#channel-name-input").fill(name);
  if (kind) {
    const labels = { forum: "Форум", trivia: "Тривия", draw: "Paint Wars" };
    await page.locator(".channel-kind-options label", { hasText: labels[kind] }).click();
  }
  await page.locator(".modal-create-button").click();
  await expect(page.locator(".channel-item-name", { hasText: new RegExp(name) })).toBeVisible();
}
