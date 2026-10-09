import { PermissionPolicy } from '../generated/prisma/client';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { ToolName } from '../tools/catalog/tool-name';
import { PermissionsService } from './permissions.service';
import { SettingsRepository } from './settings.repository';

describe('PermissionsService', () => {
  const repo = { permission: jest.fn(), setPermission: jest.fn(), permissions: jest.fn() };
  const service = new PermissionsService(repo as unknown as SettingsRepository, new ToolCatalog());
  beforeEach(() => jest.clearAllMocks());
  it('allows basic open operations by default but retains explicit account preferences', async () => {
    repo.permission.mockResolvedValue(null);
    for (const tool of [ToolName.APP_OPEN, ToolName.FILE_OPEN])
      expect(await service.effective('user-a', tool)).toMatchObject({
        policy: 'ALWAYS_ALLOW',
        requiresConfirmation: false,
      });
    repo.permission.mockResolvedValue({ policy: PermissionPolicy.ASK });
    expect(await service.effective('user-a', ToolName.APP_OPEN)).toMatchObject({
      requiresConfirmation: true,
    });
    expect(new ToolCatalog().list().some((tool) => tool.name === 'weather.current')).toBe(false);
  });
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
  it('marks a denied tool as blocked without requesting confirmation', async () => {
    repo.permission.mockResolvedValue({ policy: PermissionPolicy.DENY });
    expect(await service.effective('user-a', ToolName.FILE_OPEN)).toMatchObject({
      policy: PermissionPolicy.DENY,
      denied: true,
      requiresConfirmation: false,
    });
  });
  it('rejects unknown tool names without modifying preferences', async () => {
    await expect(
      service.set('user-a', 'unknown.tool', PermissionPolicy.ALWAYS_ALLOW),
    ).rejects.toThrow();
    expect(repo.setPermission).not.toHaveBeenCalled();
  });
});
