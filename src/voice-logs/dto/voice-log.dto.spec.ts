import { validate } from 'class-validator';
import { CreateVoiceLogDto } from './voice-log.dto';
import { ToolName } from '../../tools/catalog/tool-name';
describe('voice log tool contract', () => {
  it('accepts all 24 current native tools and rejects arbitrary commands', async () => {
    const tools = Object.values(ToolName).filter((tool) => tool !== ToolName.WEATHER_CURRENT);
    expect(tools).toHaveLength(24);
    for (const commandType of [...tools, 'system.status', 'unsupported']) {
      expect(
        await validate(
          Object.assign(new CreateVoiceLogDto(), { commandType, status: 'SUCCESS', duration: 1 }),
        ),
      ).toHaveLength(0);
    }
    expect(
      await validate(
        Object.assign(new CreateVoiceLogDto(), {
          commandType: 'shell.run',
          status: 'SUCCESS',
          duration: 1,
        }),
      ),
    ).not.toHaveLength(0);
  });
});
