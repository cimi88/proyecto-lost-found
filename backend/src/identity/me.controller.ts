import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { DemoIdentityGuard } from './demo-identity.guard';
import type { AuthenticatedUser } from './identity.types';
import type { MeResponse } from './me-response';

@Controller('v1/me')
@UseGuards(DemoIdentityGuard)
export class MeController {
  @Get()
  getMe(@CurrentUser() user: AuthenticatedUser): MeResponse {
    return { role: user.role };
  }
}
