import { CreatorStore, type CreatorRepository } from "./creatorStore";
import { PostgresCreatorStore } from "./postgresCreatorStore";

export function createCreatorRepository(env: NodeJS.ProcessEnv = process.env): CreatorRepository {
  if (env.DATABASE_URL !== undefined && env.DATABASE_URL.trim().length > 0) {
    return new PostgresCreatorStore(env.DATABASE_URL);
  }

  return new CreatorStore();
}
