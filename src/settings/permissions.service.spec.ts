import { PermissionPolicy } from '../generated/prisma/client';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { ToolName } from '../tools/catalog/tool-name';
import { PermissionsService } from './permissions.service';
import { SettingsRepository } from './settings.repository';

describe('PermissionsService', () => {
  const repo = { permission: jest.fn(), setPermission: jest.fn(), permissions: jest.fn() };
  const service = new PermissionsService(repo as unknown as SettingsRepository, new ToolCatalog());
  beforeEach(() => jest.clearAllMocks());
  it('persists an account-scoped permission preference', async () => {
    repo.setPermission.mockResolvedValue({
      userId: 'user-a',
      toolName: ToolName.FILE_OPEN,
      policy: PermissionPolicy.ALWAYS_ALLOW,
    });
    repo.permission.mockResolvedValue({ policy: PermissionPolicy.ALWAYS_ALLOW });
    expect(
      await service.set('user-a', ToolName.FILE_OPEN, PermissionPolicy.ALWAYS_ALLOW),
    ).toMatchObject({ requiresConfirmation: false });
    expect(repo.setPermission).toHaveBeenCalledWith(
      'user-a',
      ToolName.FILE_OPEN,
      PermissionPolicy.ALWAYS_ALLOW,
    );
  });
  it('system confirmation overrides ALWAYS_ALLOW for destructive tools', async () => {
    repo.permission.mockResolvedValue({ policy: PermissionPolicy.ALWAYS_ALLOW });
    expect(await service.effective('user-a', ToolName.FILE_DELETE)).toMatchObject({
      policy: PermissionPolicy.ALWAYS_ALLOW,
      requiresConfirmation: true,
    });
  });
  it('rejects unknown tool names without modifying preferences', async () => {
    await expect(
      service.set('user-a', 'unknown.tool', PermissionPolicy.ALWAYS_ALLOW),
    ).rejects.toThrow();
    expect(repo.setPermission).not.toHaveBeenCalled();
  });
});
