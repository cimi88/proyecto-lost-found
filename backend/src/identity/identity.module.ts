import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoIdentityGuard } from './demo-identity.guard';
import { DemoIdentityResolver } from './demo-identity.resolver';
import { MeController } from './me.controller';
import { CURRENT_USER_RESOLVER } from './identity.types';
import { User } from './user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [MeController],
  providers: [
    DemoIdentityResolver,
    DemoIdentityGuard,
    { provide: CURRENT_USER_RESOLVER, useExisting: DemoIdentityResolver },
  ],
  exports: [DemoIdentityGuard, CURRENT_USER_RESOLVER],
})
export class IdentityModule {}
