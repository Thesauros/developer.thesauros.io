import { DataSource } from 'typeorm';
import { newDb, DataType } from 'pg-mem';
import { entities } from '../database/entities';
import { StoreService } from '../store/store.service';

export async function createTestStore(): Promise<{
  dataSource: DataSource;
  store: StoreService;
}> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'version',
    returns: DataType.text,
    implementation: () => 'PostgreSQL 16.0',
    impure: true,
  });
  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'thesauros_partner_test',
  });
  db.public.registerFunction({
    name: 'obj_description',
    args: [DataType.text, DataType.text],
    returns: DataType.text,
    implementation: () => null,
  });
  const dataSource: DataSource = await db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities,
    synchronize: true,
  });
  await dataSource.initialize();
  const store = new StoreService(dataSource);
  process.env.DB_SEED = 'true';
  await store.onModuleInit();
  return { dataSource, store };
}

export async function destroyTestStore(dataSource: DataSource): Promise<void> {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
