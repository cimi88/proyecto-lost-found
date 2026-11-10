import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { PublicationQueryDto } from './dto/publication-query.dto';
import type {
  PublicationDetailResponse,
  PublicationSearchResponse,
} from './publication-read-response';
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
export class PublicationsReadController {
  constructor(private readonly publicationsService: PublicationsService) {}

  @Get()
  search(
    @Query() query: PublicationQueryDto,
  ): Promise<PublicationSearchResponse> {
    return this.publicationsService.searchActivePublications(query);
  }

  @Get(':id')
  findOne(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
  ): Promise<PublicationDetailResponse> {
    return this.publicationsService.findActivePublicationById(id);
  }
}
