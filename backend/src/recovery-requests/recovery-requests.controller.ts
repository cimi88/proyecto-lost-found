import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { DemoIdentityGuard } from '../identity/demo-identity.guard';
import type { AuthenticatedUser } from '../identity/identity.types';
import { CancelRecoveryRequestDto } from './dto/cancel-recovery-request.dto';
import { CompleteRecoveryRequestDto } from './dto/complete-recovery-request.dto';
import { CreateRecoveryRequestDto } from './dto/create-recovery-request.dto';
import type { RecoveryRequestResponse } from './recovery-request-response';
import { RecoveryRequestsService } from './recovery-requests.service';

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

@Controller('v1')
@UseGuards(DemoIdentityGuard)
export class RecoveryRequestsController {
  constructor(
    private readonly recoveryRequests: RecoveryRequestsService,
  ) {}

  @Post('publications/:id/recovery-requests')
  create(
    @Param('id', UUID_VALIDATION_EXCEPTION) publicationId: string,
    @Body() dto: CreateRecoveryRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    return this.recoveryRequests.create(publicationId, dto, user);
  }

  @Get('recovery-requests/mine')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse[]> {
    return this.recoveryRequests.findMine(user.id);
  }

  @Get('recovery-requests/received')
  findReceived(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse[]> {
    return this.recoveryRequests.findReceived(user);
  }

  @Post('recovery-requests/:id/complete')
  @HttpCode(200)
  complete(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
    @Body() dto: CompleteRecoveryRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    return this.recoveryRequests.complete(id, dto, user);
  }

  @Post('recovery-requests/:id/approve')
  @HttpCode(200)
  approve(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    return this.recoveryRequests.approve(id, user);
  }

  @Post('recovery-requests/:id/reject')
  @HttpCode(200)
  reject(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    return this.recoveryRequests.reject(id, user);
  }

  @Post('recovery-requests/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
    @Body() dto: CancelRecoveryRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    return this.recoveryRequests.cancel(id, dto, user);
  }
}
