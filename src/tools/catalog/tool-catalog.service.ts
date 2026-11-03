import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PermissionPolicy } from '../../generated/prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { ToolExecutionLocation, ToolName } from './tool-name';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  executionLocation: ToolExecutionLocation;
  systemConfirmation: boolean;
  defaultPolicy: PermissionPolicy;
  argumentsSchema: z.ZodType<Record<string, unknown>>;
}

const path = z.string().min(1).max(2048);
const appName = z.string().min(1).max(200);
const directory = z.enum(['desktop', 'downloads', 'documents', 'pictures', 'music', 'videos']);
const searchDirectory = z.union([directory, z.enum(['drive_c', 'home'])]);
const resourceId = z.string().min(1).max(200);
const fileReference = z.union([
  z.object({ resourceId }).strict(),
  z.object({ path, directory: directory.optional() }).strict(),
]);
const transferArguments = z.union([
  z.object({ resourceId, destinationDirectory: directory, destinationPath: path }).strict(),
  z
    .object({
      sourceDirectory: directory,
      sourcePath: path,
      destinationDirectory: directory,
      destinationPath: path,
    })
    .strict(),
]);
const queryReference = z
  .object({
    original: z.string().min(1).max(100),
    candidates: z.array(z.string().min(1).max(100)).max(5),
  })
  .strict();
const directoryReference = z
  .object({
    canonicalId: directory.optional(),
    original: z.string().min(1).max(100),
    candidates: z.array(z.string().min(1).max(100)).max(5),
  })
  .strict();
const searchDirectoryReference = directoryReference.extend({
  canonicalId: searchDirectory.optional(),
});
const fileIntent = z.object({
  query: z.union([z.string().min(1).max(2048), queryReference]),
  extensions: z
    .array(z.string().regex(/^[A-Za-z0-9]{1,10}$/))
    .max(10)
    .optional(),
});
const transferIntent = fileIntent
  .extend({
    destination: z.union([path, queryReference]),
  })
  .strict();
export const WINDOWS_SETTINGS_PAGES = [
  '',
  'display',
  'sound',
  'bluetooth',
  'network',
  'appsfeatures',
  'privacy-microphone',
  'privacy-webcam',
  'windowsupdate',
  'personalization',
  'notifications',
  'about',
] as const;
const empty = z.object({}).strict();
const searchArguments = z
  .object({
    directory: z.union([searchDirectory, searchDirectoryReference]).optional(),
    query: z.union([z.string().min(1).max(100), queryReference]),
    extensions: z
      .array(z.string().regex(/^[A-Za-z0-9]{1,10}$/))
      .max(10)
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
const local = (
  name: ToolName,
  description: string,
  argumentsSchema: ToolDefinition['argumentsSchema'],
  confirm = false,
): ToolDefinition => ({
  name,
  description,
  argumentsSchema,
  executionLocation: ToolExecutionLocation.LOCAL,
  systemConfirmation: confirm,
  defaultPolicy: confirm ? PermissionPolicy.ASK : PermissionPolicy.ALWAYS_ALLOW,
});
const definitions: ToolDefinition[] = [
  ...[ToolName.APP_FOCUS, ToolName.APP_MINIMIZE, ToolName.APP_MAXIMIZE].map((name) =>
    local(name, '선택한 앱 창 제어', z.object({ appName }).strict()),
  ),
  local(
    ToolName.FOLDER_OPEN,
    '허용된 폴더 열기',
    z.union([
      z.object({ resourceId }).strict(),
      z.object({ directory, path: path.optional() }).strict(),
      directoryReference,
    ]),
  ),
  local(ToolName.FOLDER_SEARCH, '허용된 폴더 검색', searchArguments),
  local(
    ToolName.FOLDER_CREATE,
    '허용된 부모 위치에 폴더 생성',
    z.union([
      z
        .object({
          parent: z.union([directory, directoryReference]),
          name: z.string().min(1).max(255),
        })
        .strict(),
      z.object({ parentResourceId: resourceId, name: z.string().min(1).max(255) }).strict(),
      z
        .object({ parentDirectory: directory, parentPath: path, name: z.string().min(1).max(255) })
        .strict(),
    ]),
    true,
  ),
  local(
    ToolName.WEB_OPEN,
    'HTTP/HTTPS 주소 열기',
    z
      .object({
        url: z
          .string()
          .max(2048)
          .url()
          .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
        original: z.string().min(1).max(100).optional(),
        candidates: z.array(z.string().min(1).max(100)).max(5).optional(),
      })
      .strict(),
  ),
  local(
    ToolName.WEB_SEARCH,
    '검색 엔진으로 웹 검색',
    z
      .object({
        engine: z.enum(['google', 'bing', 'duckduckgo']),
        query: z.string().min(1).max(2048),
      })
      .strict(),
  ),
  local(
    ToolName.CLIPBOARD_WRITE,
    '텍스트를 클립보드에 저장',
    z
      .object({
        text: z
          .string()
          .max(65536)
          .refine((value) => Buffer.byteLength(value, 'utf8') <= 65536 && !value.includes('\0')),
      })
      .strict(),
    true,
  ),
  local(ToolName.CLIPBOARD_READ, '클립보드 텍스트 읽기 및 채팅 요청 시 AI 답변에 사용', empty),
  local(ToolName.VOICE_ACTIVATE, 'Orb 음성 입력 활성화', empty),
  local(
    ToolName.SYSTEM_VOLUME_SET,
    '음량 설정',
    z.object({ level: z.number().min(0).max(100) }).strict(),
  ),
  local(
    ToolName.SYSTEM_VOLUME_MUTE,
    '음소거 설정 및 해제',
    z.object({ mute: z.boolean() }).strict(),
  ),
  local(
    ToolName.SYSTEM_OPEN_SETTINGS,
    '허용된 Windows 설정 화면 열기',
    z.object({ page: z.enum(WINDOWS_SETTINGS_PAGES).optional() }).strict(),
  ),
  local(ToolName.SYSTEM_LOCK, '사용자 승인 후 Windows 잠금', empty, true),
  {
    name: ToolName.APP_OPEN,
    description: 'Request the desktop to open an application',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: false,
    defaultPolicy: PermissionPolicy.ALWAYS_ALLOW,
    argumentsSchema: z.object({ appName }).strict(),
  },
  {
    name: ToolName.APP_CLOSE,
    description: 'Request the desktop to close an application',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: true,
    defaultPolicy: PermissionPolicy.ASK,
    argumentsSchema: z.object({ appName }).strict(),
  },
  {
    name: ToolName.FILE_OPEN,
    description: 'Request the desktop to open a file',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: false,
    defaultPolicy: PermissionPolicy.ALWAYS_ALLOW,
    argumentsSchema: z.union([
      z
        .object({
          path,
          directory: z
            .enum(['desktop', 'downloads', 'documents', 'pictures', 'music', 'videos'])
            .optional(),
        })
        .strict(),
      z.object({ resourceId: z.string().min(1).max(200) }).strict(),
      fileIntent
        .extend({ directory: z.union([directory, directoryReference]).optional() })
        .strict(),
    ]),
  },
  {
    name: ToolName.FILE_RENAME,
    description: 'Request the desktop to rename a file',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: true,
    defaultPolicy: PermissionPolicy.ASK,
    argumentsSchema: z.union([
      z
        .object({ path, directory: directory.optional(), newName: z.string().min(1).max(255) })
        .strict(),
      z.object({ resourceId, newName: z.string().min(1).max(255) }).strict(),
      fileIntent.extend({ newName: z.string().min(1).max(255) }).strict(),
      transferIntent,
    ]),
  },
  {
    name: ToolName.FILE_DELETE,
    description: 'Request the desktop to delete a file',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: true,
    defaultPolicy: PermissionPolicy.ASK,
    argumentsSchema: z.union([fileReference, fileIntent.strict()]),
  },
  ...[ToolName.FILE_COPY, ToolName.FILE_MOVE].map((name): ToolDefinition => ({
    name,
    description:
      name === ToolName.FILE_COPY
        ? '파일 복사. 목적지 생략 시 같은 폴더에 원본 이름의 복사본을 생성하며 목적지를 추가로 묻지 않음'
        : '파일 이동 요청',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: true,
    defaultPolicy: PermissionPolicy.ASK,
    argumentsSchema:
      name === ToolName.FILE_COPY
        ? z.union([
            transferArguments,
            transferIntent,
            fileIntent.strict(),
            z.object({ resourceId }).strict(),
            z.object({ sourceDirectory: directory, sourcePath: path }).strict(),
          ])
        : z.union([transferArguments, transferIntent]),
  })),
  {
    name: ToolName.FILE_SEARCH,
    description: '파일 이름으로 검색. 위치 생략 또는 drive_c는 C 드라이브의 접근 가능한 경로 검색',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: false,
    defaultPolicy: PermissionPolicy.ALWAYS_ALLOW,
    argumentsSchema: z
      .object({
        directory: z.union([searchDirectory, searchDirectoryReference]).optional(),
        query: z.union([z.string().min(1).max(100), queryReference]),
        extensions: z
          .array(z.string().regex(/^[A-Za-z0-9]{1,10}$/))
          .max(10)
          .optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .strict(),
  },
  {
    name: ToolName.SCREEN_CAPTURE,
    description: '데스크톱에서 사용자가 모니터와 전체/영역을 선택하는 화면 캡처',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: false,
    defaultPolicy: PermissionPolicy.ALWAYS_ALLOW,
    // Monitor IDs and coordinates originate only from the local picker, never the AI.
    argumentsSchema: z.object({ mode: z.enum(['full', 'region']).optional() }).strict(),
  },
];

@Injectable()
export class ToolCatalog {
  private readonly definitions = new Map(
    definitions.map((definition) => [definition.name, definition]),
  );
  get(name: string): ToolDefinition {
    const definition = this.definitions.get(name as ToolName);
    if (!definition) throw new AppException(400, ErrorCode.UNKNOWN_TOOL, 'Unknown tool');
    return definition;
  }
  validateArguments(name: string, input: unknown) {
    const parsed = this.get(name).argumentsSchema.safeParse(input);
    if (!parsed.success)
      throw new AppException(
        400,
        ErrorCode.INVALID_TOOL_ARGUMENTS,
        'Tool arguments do not match the schema',
      );
    return parsed.data;
  }
  list() {
    return [...this.definitions.values()].map(({ argumentsSchema, ...metadata }) => ({
      ...metadata,
      argumentsSchema: z.toJSONSchema(argumentsSchema),
      resultSchema: z.toJSONSchema(
        z
          .object({
            tool: z.literal(metadata.name),
            executionId: z.string().uuid().nullable(),
            requestId: z.string().uuid().nullable(),
            status: z.enum([
              'SUCCEEDED',
              'FAILED',
              'SELECTION_REQUIRED',
              'APPROVAL_REQUIRED',
              'CANCELLED',
              'REQUESTED',
            ]),
            success: z.boolean(),
            data: z.record(z.string(), z.unknown()).nullable(),
            error: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
          })
          .strict(),
      ),
    }));
  }
}
