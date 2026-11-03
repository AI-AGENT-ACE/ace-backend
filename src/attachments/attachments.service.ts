import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { basename } from 'path';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { PrismaService } from '../common/prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { AttachmentsRepository } from './attachments.repository';
import { UploadFile, validateUpload } from './file-policy';

const metadata = (item: {
  id: string;
  originalName: string;
  mimeType: string;
  size: bigint;
  createdAt: Date;
}) => ({
  id: item.id,
  originalName: item.originalName,
  mimeType: item.mimeType,
  size: Number(item.size),
  createdAt: item.createdAt,
});

function safeOriginalName(value: string) {
  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  const normalized = decoded.includes('\uFFFD') ? value : decoded;
  return basename(normalized.replace(/\\/g, '/'));
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AttachmentsRepository,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}
  async upload(userId: string, conversationId: string, file?: UploadFile) {
    if (!file) throw new AppException(400, ErrorCode.VALIDATION_ERROR, '파일을 선택해 주세요.');
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!conversation)
      throw new AppException(404, ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
    const checked = validateUpload(file, this.config.get<number>('MAX_UPLOAD_SIZE', 26214400));
    const directory = `users/${userId}/conversations/${conversationId}`;
    let stored: { storedName: string; storagePath: string } | undefined;
    try {
      stored = await this.storage.save(directory, checked.extension, file.buffer);
      const created = await this.repository.create({
        userId,
        conversationId,
        originalName: safeOriginalName(file.originalname),
        ...stored,
        mimeType: checked.mimeType,
        size: BigInt(file.size),
      });
      return metadata(created);
    } catch (error) {
      if (stored) await this.storage.delete(stored.storagePath).catch(() => undefined);
      if (error instanceof AppException) throw error;
      throw new AppException(500, ErrorCode.FILE_UPLOAD_FAILED, '파일을 저장하지 못했습니다.');
    }
  }
  async download(userId: string, id: string) {
    const attachment = await this.repository.owned(userId, id);
    if (!attachment)
      throw new AppException(404, ErrorCode.ATTACHMENT_NOT_FOUND, 'Attachment not found');
    if (!(await this.storage.exists(attachment.storagePath)))
      throw new AppException(404, ErrorCode.FILE_NOT_FOUND, 'Stored file not found');
    return { attachment, absolutePath: this.storage.absolutePath(attachment.storagePath) };
  }
  async remove(userId: string, id: string) {
    const attachment = await this.repository.owned(userId, id);
    if (!attachment)
      throw new AppException(404, ErrorCode.ATTACHMENT_NOT_FOUND, 'Attachment not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.fileDeletionJob.upsert({
        where: { storagePath: attachment.storagePath },
        create: { storagePath: attachment.storagePath },
        update: {},
      });
      await tx.attachment.deleteMany({ where: { id, userId } });
    });
  }
}

@Injectable()
export class AttachmentCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AttachmentCleanupService.name);
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.retryDeletions().catch(() => this.logger.error('FILE_DELETE_RETRY_FAILED'));
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}
  async retryDeletions() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.fileDeletionJob.findMany({
        where: { nextAttemptAt: { lte: new Date() }, attempts: { lt: 10 } },
        take: 100,
        orderBy: { nextAttemptAt: 'asc' },
      });
      for (const job of jobs) {
        try {
          await this.storage.delete(job.storagePath);
          await this.prisma.fileDeletionJob.deleteMany({ where: { id: job.id } });
        } catch {
          this.logger.warn({
            event: 'FILE_DELETE_RETRY',
            jobId: job.id,
            attempt: job.attempts + 1,
            exhausted: job.attempts + 1 >= 10,
          });
          await this.prisma.fileDeletionJob.updateMany({
            where: { id: job.id, attempts: job.attempts },
            data: {
              attempts: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + Math.min(86400000, 60000 * 2 ** job.attempts)),
            },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
