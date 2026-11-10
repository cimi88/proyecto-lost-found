import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { DemoIdentityGuard } from '../identity/demo-identity.guard';
import type { AuthenticatedUser } from '../identity/identity.types';
import { CreateLostPublicationDto } from './dto/create-lost-publication.dto';
import type { LostPublicationResponse } from './lost-publication-response';
import { PublicationsService } from './publications.service';

@Controller('v1/lost-publications')
export class PublicationsController {
  constructor(private readonly publicationsService: PublicationsService) {}

  @Post()
  @UseGuards(DemoIdentityGuard)
  create(
    @Body() dto: CreateLostPublicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LostPublicationResponse> {
    return this.publicationsService.createLostPublication(dto, user.id);
  }
}
