import { mock } from "node:test";

const types = new Proxy({}, { get: (_target, name) => String(name) });

let active = null;
let generation = 0;

export const restoreSqlCapture = () => {
  if (active) {
    active.restore();
    active = null;
  }
};

export const captureSql = async (modulePath, rowsToReturn = []) => {
  restoreSqlCapture();

  const queries = [];
  const inputs = [];

  class FakeRequest {
    input(name, type, value) {
      inputs.push({ name, value });
      return this;
    }
    async query(text) {
      queries.push(text);
      return { recordset: rowsToReturn, rowsAffected: [rowsToReturn.length] };
    }
    async execute(name) {
      queries.push(`EXEC ${name}`);
      return { recordset: rowsToReturn, rowsAffected: [rowsToReturn.length] };
    }
  }

  const fakeSql = new Proxy(
    { Request: FakeRequest },
    { get: (target, name) => (name in target ? target[name] : types[name]) },
  );

  active = mock.module("../../src/config/db.js", {
    exports: { default: fakeSql, connectDB: async () => {} },
  });

  generation += 1;
  const model = await import(`${modulePath}?sqlcapture=${generation}`);

  return { model, queries, inputs };
};

export const selectedColumns = (text) => {
  const match = text.match(/SELECT\s+([\s\S]*?)\s+FROM\s/i);
  if (!match) return null;

  return match[1]
    .split(",")
    .map((column) => column.trim().split(/\s+AS\s+/i).pop().split(".").pop().trim())
    .filter(Boolean);
};
