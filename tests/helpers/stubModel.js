import { mock } from "node:test";

export const scopeHit = () => ({ run: async () => ({ recordset: [{ InScope: 1 }] }) });
export const scopeMiss = () => ({ run: async () => ({ recordset: [] }) });

let active = null;
let generation = 0;

export const restoreUserModel = () => {
  if (active) {
    active.restore();
    active = null;
  }
};

export const withStubbedUserModel = async (exports) => {
  restoreUserModel();

  const calls = [];

  const recorded = Object.fromEntries(
    Object.entries(exports).map(([name, impl]) => [
      name,
      (...args) => {
        calls.push({ name, args });
        return impl(...args);
      },
    ]),
  );

  active = mock.module("../../src/models/userModel.js", { exports: recorded });

  generation += 1;
  const service = await import(
    `../../src/services/referralService.js?stub=${generation}`
  );

  return { service, calls };
};
