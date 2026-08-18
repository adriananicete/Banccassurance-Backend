import { mock } from "node:test";

export const scopeHit = () => ({ run: async () => ({ recordset: [{ InScope: 1 }] }) });
export const scopeMiss = () => ({ run: async () => ({ recordset: [] }) });

export const rows = (...records) => () => ({ run: async () => ({ recordset: records }) });

const active = [];
let generation = 0;

export const restoreStubs = () => {
  while (active.length) active.pop().restore();
};

export const withStubbedModules = async (mocks) => {
  restoreStubs();

  const calls = [];

  for (const [path, exports] of Object.entries(mocks)) {
    const recorded = Object.fromEntries(
      Object.entries(exports).map(([name, impl]) => [
        name,
        (...args) => {
          calls.push({ name, args });
          return impl(...args);
        },
      ]),
    );

    active.push(mock.module(path, { exports: recorded }));
  }

  generation += 1;
  const service = await import(
    `../../src/services/referralService.js?stub=${generation}`
  );

  return { service, calls };
};

export const withStubbedUserModel = (exports) =>
  withStubbedModules({ "../../src/models/userModel.js": exports });
