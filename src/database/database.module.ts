import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { entities } from './entities';

function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const useSsl = process.env.DB_SSL !== 'false';
  const ssl = useSsl ? { rejectUnauthorized: false } : false;
  const base: TypeOrmModuleOptions = {
    type: 'postgres',
    entities,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    ssl,
    logging: process.env.DB_LOGGING === 'true',
  };
  if (process.env.DATABASE_URL) {
    return {
      ...base,
      url: process.env.DATABASE_URL,
    };
  }
  return {
    ...base,
    host: process.env.PGHOST ?? process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.PGPORT ?? process.env.DB_PORT ?? '5432', 10),
    username: process.env.PGUSER ?? process.env.DB_USER ?? 'postgres',
    password: process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? '',
    database: process.env.PGDATABASE ?? process.env.DB_NAME ?? 'railway',
  };
}

@Module({
  imports: [TypeOrmModule.forRoot(buildTypeOrmOptions())],
})
export class DatabaseModule {}
