import { recreateSchema, TEST_DATABASE_URL } from './helpers/testDatabase.js';

export default async function setup(): Promise<void> {
  await recreateSchema(TEST_DATABASE_URL);
}
