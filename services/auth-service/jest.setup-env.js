// Prisma's generated client auto-loads the default `.env` the first time
// `@prisma/client` is required (which happens as soon as a spec file imports
// PrismaService), before any in-test `ConfigModule.forRoot({ envFilePath })`
// call runs. dotenv does not override already-set vars, so that auto-load
// would otherwise "win" and silently point integration tests at the dev
// database instead of `.env.test`. Loading `.env.test` here, in a Jest
// `setupFiles` script, runs before any spec module (and therefore before
// Prisma's own auto-load) is evaluated, so this value wins instead.
require('dotenv').config({
  path: require('path').resolve(__dirname, '.env.test'),
  override: true,
});
