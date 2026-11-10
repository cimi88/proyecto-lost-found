import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AssistantContextController } from './assistant-context.controller';

@Module({
  imports: [IdentityModule],
  controllers: [AssistantContextController],
})
export class AssistantModule {}
