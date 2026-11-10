import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { DemoIdentityGuard } from '../identity/demo-identity.guard';
import type { AuthenticatedUser } from '../identity/identity.types';
import { CreateFoundPublicationDto } from './dto/create-found-publication.dto';
import type { FoundPublicationResponse } from './found-publication-response';
import { PublicationsService } from './publications.service';

@Controller('v1/found-publications')
export class FoundPublicationsController {
  constructor(private readonly publicationsService: PublicationsService) {}

  @Post()
  @UseGuards(DemoIdentityGuard)
  create(
    @Body() dto: CreateFoundPublicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FoundPublicationResponse> {
    return this.publicationsService.createFoundPublication(dto, user.id);
  }
}
