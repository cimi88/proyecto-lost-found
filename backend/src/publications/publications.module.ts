import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { AdminPublicationsController } from './admin-publications.controller';
import { FoundPublicationsController } from './found-publications.controller';
import { PublicationMatch } from './matching/publication-match.entity';
import { OwnPublicationsController } from './own-publications.controller';
import { Publication } from './publication.entity';
import { PublicationsReadController } from './publications-read.controller';
import { PublicationsController } from './publications.controller';
import { PublicationsService } from './publications.service';
import { PublicationMatchingService } from './matching/publication-matching.service';
import { PublicationMatchesController } from './matching/publication-matches.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Publication, PublicationMatch]), IdentityModule],
  controllers: [
    PublicationsController,
    FoundPublicationsController,
    OwnPublicationsController,
    AdminPublicationsController,
    PublicationsReadController,
    PublicationMatchesController,
  ],
  providers: [PublicationsService, PublicationMatchingService],
})
export class PublicationsModule {}
