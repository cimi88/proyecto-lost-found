import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { DemoIdentityGuard } from '../identity/demo-identity.guard';
import type { AuthenticatedUser } from '../identity/identity.types';
import type { OwnPublicationResponse } from './publication-own-response';
import { PublicationsService } from './publications.service';

@Controller('v1/admin/publications')
@UseGuards(DemoIdentityGuard)
export class AdminPublicationsController {
  constructor(private readonly publicationsService: PublicationsService) {}

  @Get()
  findActiveOthers(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OwnPublicationResponse[]> {
    return this.publicationsService.findActivePublicationsForAdmin(user);
  }
}
