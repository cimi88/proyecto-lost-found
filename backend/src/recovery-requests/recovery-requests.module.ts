import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { RecoveryRequest } from './recovery-request.entity';
import { RecoveryRequestsController } from './recovery-requests.controller';
import { RecoveryRequestsService } from './recovery-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([RecoveryRequest]), IdentityModule],
  controllers: [RecoveryRequestsController],
  providers: [RecoveryRequestsService],
})
export class RecoveryRequestsModule {}
