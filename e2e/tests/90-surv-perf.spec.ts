import { test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { api, closeAll, openAs, openServer, openTextChannel, register, serverWith } from "./helpers";

// 🧟 Шмиркленд FPS check (not part of the normal run: SURV_PERF=1 npm test -- tests/90): a heavy late game in the real
// browser, frame times + a CPU profile of where the time goes.
test.skip(!process.env.SURV_PERF, "perf only on demand");

const heavy = (page: Page, gfx: string) =>
  page.evaluate((g) => {
    const w = (window as unknown as { __survWorld: () => Record<string, unknown> & { players: Record<string, unknown>[] } }).__survWorld();
    const p = w.players[0]!;
    p.weapons = ["tesla", "krik", "gaida", "kaval", "rakia", "kazan"].map((id) => ({ id, lvl: 8, evo: true, t: 0, t2: 0, on: false }));
    p.passives = { kiselo: 5, kafe: 5, lyutenitsa: 5, brojenitsa: 2, chasovnik: 5, salata: 5 };
    p.gifts = { perun_strike: 3, perun_crit: 3, veles_poison: 3, dazh_flare: 3, dazh_burn: 3, veles_bloom: 3 };
    p.relics = ["kukerchief", "swampking", "chuma", "vampking"];
    (w as unknown as { refreshStats: (p: unknown) => void }).refreshStats(p);
    w.wave = 34;
    w.level = 60;
    void g;
  }, gfx);

test("FPS in a heavy late game", async ({ browser }) => {
  test.setTimeout(240_000);
  const u = await register("perf");
  const server = await serverWith(u);
  await api(u.token, "POST", `/servers/${server.id}/text-channels`, { name: "шмиркленд", type: "survivors" });
  const a = await openAs(browser, u);
  await a.page.addInitScript((q) => {
    localStorage.setItem("survQuality", q);
    localStorage.setItem("survMusic", "0");
    localStorage.setItem("survSfx", "0");
    localStorage.setItem("survMission", "false");
    localStorage.setItem("survGfx2", "2d");
  }, process.env.SURV_Q ?? "auto");
  await a.page.setViewportSize({ width: 1600, height: 900 });
  await a.page.reload();
  await openServer(a.page, server.name);
  await openTextChannel(a.page, "шмиркленд");
  await a.page.getByRole("button", { name: /Играй сам/ }).click();
  await a.page.waitForTimeout(800);
  await heavy(a.page, "2d");
  // god mode + let the hordes fill up
  await a.page.evaluate(() => {
    const w = (window as unknown as { __survWorld: () => { players: { hp: number; maxHp: number; invulnT: number; dead: boolean }[]; over: boolean; choosing: boolean; pick: (u: string, i: number) => void } }).__survWorld();
    setInterval(() => {
      const p = w.players[0]!;
      p.hp = p.maxHp;
      p.invulnT = 1;
      p.dead = false;
      w.over = false;
    }, 50);
  });
  const clearCards = async () => {
    for (let n = 0; n < 6 && (await a.page.locator(".sv-card").count()) > 0; n++) {
      await a.page.keyboard.press("Digit1");
      await a.page.waitForTimeout(150);
    }
  };
  for (let i = 0; i < 20; i++) {
    await a.page.waitForTimeout(500);
    await clearCards();
  }
  const cdp = await a.context.newCDPSession(a.page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  const frames = await a.page.evaluate(
    () =>
      new Promise<{ times: number[]; enemies: number; projs: number }>((res) => {
        const times: number[] = [];
        let last = performance.now();
        const end = last + 8000;
        const tick = (t: number) => {
          times.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else {
            const w = (window as unknown as { __survWorld: () => { enemies: unknown[]; projs: unknown[] } }).__survWorld();
            res({ times, enemies: w.enemies.length, projs: w.projs.length });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  const { profile } = await cdp.send("Profiler.stop");
  // self time by function
  const self = new Map<string, number>();
  const dt = profile.timeDeltas ?? [];
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  (profile.samples ?? []).forEach((id, i) => {
    const n = byId.get(id)!;
    const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
    self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0));
  });
  const total = [...self.values()].reduce((x, y) => x + y, 0);
  const top = [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30);
  const t = [...frames.times].sort((x, y) => x - y);
  const avg = t.reduce((x, y) => x + y, 0) / t.length;
  const out = [
    `frames ${t.length} in 8 s → ${(1000 / avg).toFixed(1)} fps avg; p50 ${t[Math.floor(t.length / 2)]!.toFixed(1)} ms, p95 ${t[Math.floor(t.length * 0.95)]!.toFixed(1)} ms, worst ${t[t.length - 1]!.toFixed(1)} ms; enemies ${frames.enemies}, projs ${frames.projs}`,
    ...top.map(([k, v]) => `${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`),
  ].join("\n");
  writeFileSync("explore/surv-perf.txt", out);
  console.log(out);
  await a.page.screenshot({ path: "explore/surv-perf.png" });
  await closeAll(a.context);
});
