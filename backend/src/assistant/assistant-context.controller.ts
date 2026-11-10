import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { DemoIdentityGuard } from '../identity/demo-identity.guard';
import type { AuthenticatedUser } from '../identity/identity.types';
import type { UserRole } from '../identity/user-role';

export interface AssistantContextResponse {
  role: UserRole;
}

@Controller('v1/assistant')
@UseGuards(DemoIdentityGuard)
export class AssistantContextController {
  @Get('context')
  getContext(@CurrentUser() user: AuthenticatedUser): AssistantContextResponse {
    return { role: user.role };
  }
}
