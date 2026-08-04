import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'thesauros',
      password: process.env.DB_PASSWORD ?? 'thesauros',
      database: process.env.DB_NAME ?? 'thesauros_partner',
      entities,
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      logging: process.env.DB_LOGGING === 'true',
    }),
  ],
})
export class DatabaseModule {}
