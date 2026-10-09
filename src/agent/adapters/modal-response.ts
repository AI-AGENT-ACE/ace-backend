import { z } from 'zod';

export const modalResponse = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), content: z.string().min(1).max(20000) }).strict(),
  z
    .object({
      type: z.literal('tool_call'),
      tool: z.string().min(1).max(100),
      arguments: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal('tool_sequence'),
      steps: z
        .array(
          z
            .object({
              id: z.string().min(1).max(128),
              tool: z.string().min(1).max(100),
              arguments: z.record(z.string(), z.unknown()).default({}),
            })
            .strict(),
        )
        .min(2)
        .max(16),
    })
    .strict(),
]);
export const modalEnvelope = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  conversationId: z.string().min(1).max(128),
  response: modalResponse,
});
export const unsupportedSequence =
  '여러 작업을 한 번에 실행하는 기능은 아직 지원하지 않습니다. 한 가지 작업씩 요청해 주세요.';
