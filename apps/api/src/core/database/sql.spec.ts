import { identifier, sql } from './sql.js';

describe('raw SQL that cannot be built out of strings', () => {
  it('binds every value as a parameter, never as text in the query', () => {
    const name = "Robert'); drop table finance_transactions;--";
    const query = sql`select id from finance_income_sources where name = ${name}`;
    // .text is what Postgres is sent: the value is a numbered parameter, not
    // part of the statement.
    expect(query.text).toBe('select id from finance_income_sources where name = $1');
    expect(query.values).toEqual([name]);
  });

  it('quotes a table name, and refuses anything that is not one', () => {
    expect(identifier('finance_expense_items').sql).toBe('"finance_expense_items"');
    for (const bad of ['finance_items; drop table people', 'items"', 'ITEMS', '', 'a'.repeat(64)]) {
      expect(() => identifier(bad)).toThrow(/Not a table or column name/);
    }
  });
});
