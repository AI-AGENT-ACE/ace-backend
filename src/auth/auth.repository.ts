import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}
  createSession(id: string, userId: string, refreshHash: string, expiresAt: Date) {
    return this.prisma.authSession.create({ data: { id, userId, refreshHash, expiresAt } });
  }
  findActiveSession(id: string, userId: string) {
    return this.prisma.authSession.findFirst({
      where: { id, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  }
  rotate(id: string, userId: string, previousHash: string, refreshHash: string, expiresAt: Date) {
    return this.prisma.authSession.updateMany({
      where: {
        id,
        userId,
        refreshHash: previousHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { refreshHash, expiresAt },
    });
  }
  revoke(id: string, userId: string) {
    return this.prisma.authSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
