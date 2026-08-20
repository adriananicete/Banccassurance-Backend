import { mock } from "node:test";

// Types are callable so a model may write either sql.NVarChar or the sized form
// sql.NVarChar(sql.MAX). Nothing here inspects the type, only the value.
const types = new Proxy(
  {},
  {
    get: (_target, name) => {
      const type = () => type;
      type.toString = () => String(name);
      return type;
    },
  },
);

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
  const transactions = [];

  // `events` is the interesting part: begin, every statement issued on this
  // transaction in order, then commit or rollback. Asserting on that sequence is
  // how a test shows a write happened *inside* the transaction rather than
  // beside it.
  class FakeTransaction {
    constructor() {
      this.events = [];
      transactions.push(this);
    }
    async begin() {
      this.events.push("begin");
    }
    async commit() {
      this.events.push("commit");
    }
    async rollback() {
      this.events.push("rollback");
    }
  }

  class FakeRequest {
    constructor(transaction) {
      this.transaction = transaction;
    }
    input(name, type, value) {
      inputs.push({ name, value });
      return this;
    }
    async query(text) {
      queries.push(text);
      if (this.transaction) this.transaction.events.push(text);
      return { recordset: rowsToReturn, rowsAffected: [rowsToReturn.length] };
    }
    async execute(name) {
      queries.push(`EXEC ${name}`);
      if (this.transaction) this.transaction.events.push(`EXEC ${name}`);
      return { recordset: rowsToReturn, rowsAffected: [rowsToReturn.length] };
    }
  }

  const fakeSql = new Proxy(
    { Request: FakeRequest, Transaction: FakeTransaction },
    { get: (target, name) => (name in target ? target[name] : types[name]) },
  );

  active = mock.module("../../src/config/db.js", {
    exports: { default: fakeSql, connectDB: async () => {} },
  });

  generation += 1;
  const model = await import(`${modulePath}?sqlcapture=${generation}`);

  return { model, queries, inputs, transactions };
};

export const selectedColumns = (text) => {
  const match = text.match(/SELECT\s+([\s\S]*?)\s+FROM\s/i);
  if (!match) return null;

  return match[1]
    .split(",")
    .map((column) => column.trim().split(/\s+AS\s+/i).pop().split(".").pop().trim())
    .filter(Boolean);
};
