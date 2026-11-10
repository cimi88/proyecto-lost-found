import type { DataSourceOptions } from 'typeorm';
import { User } from '../identity/user.entity';
import { PublicationMatch } from '../publications/matching/publication-match.entity';
import { Publication } from '../publications/publication.entity';
import { RecoveryRequest } from '../recovery-requests/recovery-request.entity';

export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [User, Publication, PublicationMatch, RecoveryRequest],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: false,
  };
}
