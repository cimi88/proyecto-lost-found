import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { DemoIdentityGuard } from '../identity/demo-identity.guard';
import type { AuthenticatedUser } from '../identity/identity.types';
import { CreatePublicationDto } from './dto/create-publication.dto';
import type { OwnPublicationResponse } from './publication-own-response';
import { PublicationsService } from './publications.service';

const UUID_VALIDATION_EXCEPTION = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [
        {
          field: 'id',
          message: 'El identificador debe ser un UUID válido.',
        },
      ],
    }),
});

@Controller('v1/publications')
@UseGuards(DemoIdentityGuard)
export class OwnPublicationsController {
  constructor(private readonly publicationsService: PublicationsService) {}

  @Get('mine')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OwnPublicationResponse[]> {
    return this.publicationsService.findMine(user.id);
  }

  @Get('mine/:id')
  findMineById(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OwnPublicationResponse> {
    return this.publicationsService.findMineById(id, user.id);
  }

  @Put(':id')
  update(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
    @Body() dto: CreatePublicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OwnPublicationResponse> {
    return this.publicationsService.updateOwnPublication(id, dto, user.id);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OwnPublicationResponse> {
    return this.publicationsService.closePublication(id, user);
  }
}
