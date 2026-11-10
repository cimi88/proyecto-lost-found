import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';

config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run TypeORM migrations');
}

export default new DataSource(buildDataSourceOptions(databaseUrl));
