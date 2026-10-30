import { expect, it } from "vitest";
import { reconcileTagReads } from "./scan-reconciliation";

it("reconciles duplicate observations without inflating stock quantities", () => {
  expect(reconcileTagReads(["3039AA"], ["3039aa", "3039AA"])).toEqual({ found: ["3039AA"], notSeen: [], unexpected: [] });
});
it("separates unobserved and unexpected tags without asserting physical absence", () => {
  expect(reconcileTagReads(["3039AA", "3039BB"], ["3039AA", "3039CC"])).toEqual({ found: ["3039AA"], notSeen: ["3039BB"], unexpected: ["3039CC"] });
});