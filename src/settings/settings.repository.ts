import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PermissionPolicy } from '../generated/prisma/client';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}
  settings(userId: string) {
    return this.prisma.agentSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  }
  update(userId: string, input: UpdateSettingsDto) {
    return this.prisma.agentSettings.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });
  }
  permissions(userId: string) {
    return this.prisma.permission.findMany({ where: { userId }, orderBy: { toolName: 'asc' } });
  }
  permission(userId: string, toolName: string) {
    return this.prisma.permission.findUnique({ where: { userId_toolName: { userId, toolName } } });
  }
  setPermission(userId: string, toolName: string, policy: PermissionPolicy) {
    return this.prisma.permission.upsert({
      where: { userId_toolName: { userId, toolName } },
      update: { policy },
      create: { userId, toolName, policy },
    });
  }
}
