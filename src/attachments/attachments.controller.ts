import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ResourceIdPipe } from '../common/validation/resource-id.pipe';
import { AttachmentsService } from './attachments.service';
import { UploadFile } from './file-policy';

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}
  @Post('conversations/:conversationId/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 26214400, files: 1 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ResourceIdPipe) conversationId: string,
    @UploadedFile() file?: UploadFile,
  ) {
    return this.attachments.upload(user.userId, conversationId, file);
  }
  @Get('attachments/:id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ResourceIdPipe) id: string,
    @Res() response: Response,
  ) {
    const { attachment, absolutePath } = await this.attachments.download(user.userId, id);
    const encoded = encodeURIComponent(attachment.originalName);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.size.toString());
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encoded}`,
    );
    createReadStream(absolutePath).pipe(response);
  }
  @Delete('attachments/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ResourceIdPipe) id: string) {
    return this.attachments.remove(user.userId, id);
  }
}
