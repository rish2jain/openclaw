import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutboundThrottle, withOutboundThrottle } from "./outbound-throttle.js";

describe("OutboundThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs first call immediately", async () => {
    const throttle = new OutboundThrottle(100);
    const fn = vi.fn().mockResolvedValue(42);
    const p = throttle.run("k", fn);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("delays second call until after delayMs", async () => {
    const throttle = new OutboundThrottle(100);
    const results: number[] = [];
    await vi.advanceTimersByTimeAsync(1);
    const one = throttle.run("k", async () => {
      results.push(1);
      return 1;
    });
    const two = throttle.run("k", async () => {
      results.push(2);
      return 2;
    });
    await vi.advanceTimersByTimeAsync(250);
    await vi.runAllTimersAsync();
    await one;
    await two;
    expect(results).toEqual([1, 2]);
  });

  it("serializes multiple queued calls with delay between completions", async () => {
    const throttle = new OutboundThrottle(50);
    const order: number[] = [];
    await vi.advanceTimersByTimeAsync(1);
    const run = (n: number) =>
      throttle.run("k", async () => {
        order.push(n);
        return n;
      });
    const p1 = run(1);
    const p2 = run(2);
    const p3 = run(3);
    await vi.advanceTimersByTimeAsync(200);
    await vi.runAllTimersAsync();
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("isolates different keys (no cross-key blocking)", async () => {
    const throttle = new OutboundThrottle(200);
    const aCalls: number[] = [];
    const bCalls: number[] = [];
    await vi.advanceTimersByTimeAsync(1);
    const runA = (n: number) =>
      throttle.run("a", async () => {
        aCalls.push(n);
        return n;
      });
    const runB = (n: number) =>
      throttle.run("b", async () => {
        bCalls.push(n);
        return n;
      });
    const pA1 = runA(1);
    const pB1 = runB(10);
    const pA2 = runA(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(aCalls).toEqual([1, 2]);
    expect(bCalls).toEqual([10]);
    await vi.runAllTimersAsync();
    await expect(Promise.all([pA1, pB1, pA2])).resolves.toEqual([1, 10, 2]);
  });

  it("withOutboundThrottle with delayMs <= 0 runs without throttle", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withOutboundThrottle("ch", "key", 0, fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
