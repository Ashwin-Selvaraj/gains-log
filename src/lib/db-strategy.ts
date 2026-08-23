/**
 * Spread into any Prisma query that uses `include`.
 *
 * On Postgres this asks Prisma to fetch the row and its relations in a single
 * LATERAL join rather than issuing one query per relation. On SQLite the
 * `relationJoins` preview feature is off (it isn't supported there), so this
 * resolves to an empty object and the query is unchanged.
 */
const useJoins = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');

export const withJoins = (useJoins ? { relationLoadStrategy: 'join' } : {}) as {
  relationLoadStrategy?: 'join';
};
