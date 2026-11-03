const fs = require('node:fs');
const path = require('node:path');
const { ToolCatalog } = require('../dist/tools/catalog/tool-catalog.service');
const tools = new ToolCatalog().list();
if (tools.length !== 24 || tools.some((tool) => tool.executionLocation !== 'LOCAL'))
  throw new Error('Native 계약은 LOCAL 명령 24개여야 함');
const id = { type: 'string', format: 'uuid' };
const region = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'width', 'height'],
  properties: {
    x: { type: 'number', minimum: 0 },
    y: { type: 'number', minimum: 0 },
    width: { type: 'number', exclusiveMinimum: 0 },
    height: { type: 'number', exclusiveMinimum: 0 },
  },
};
const contract = {
  version: '1.1',
  description: 'AI 입력은 NestJS에서 검증하고, 로컬 대상 선택·승인은 Rust 내부 IPC에서 처리',
  tools,
  internalIpcContracts: {
    execute_native_tool: {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'tool', 'arguments', 'confirmed', 'executionId', 'attemptId'],
      properties: {
        version: { const: '1.1' },
        tool: { enum: tools.map((t) => t.name) },
        arguments: { type: 'object' },
        confirmed: { type: 'boolean' },
        approvalId: id,
        executionId: id,
        attemptId: id,
        requestId: id,
      },
    },
    prepare_native_tool: {
      type: 'object',
      additionalProperties: false,
      required: ['tool', 'arguments', 'executionId', 'attemptId'],
      properties: {
        tool: { enum: tools.filter((t) => t.systemConfirmation).map((t) => t.name) },
        arguments: { type: 'object' },
        executionId: id,
        attemptId: id,
      },
    },
    authorize_native_tool: {
      type: 'object',
      additionalProperties: false,
      required: ['pendingId'],
      properties: { pendingId: id },
    },
    capture_start: {
      type: 'object',
      additionalProperties: false,
      required: ['monitorId', 'mode'],
      properties: { monitorId: id, mode: { enum: ['full', 'region'] } },
    },
    complete_screen_capture: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId'],
      properties: { sessionId: id, region: { anyOf: [region, { type: 'null' }] } },
    },
    cancel_screen_capture: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId'],
      properties: { sessionId: id },
    },
  },
};
const target = path.join(__dirname, '../docs/native-tool-contract.json');
fs.writeFileSync(target, JSON.stringify(contract, null, 2) + '\n');
if (process.argv.includes('--desktop')) {
  const desktop = path.resolve(__dirname, '../../ace-desktop/docs/native-tool-contract.json');
  if (!fs.existsSync(path.dirname(desktop))) throw new Error('ace-desktop/docs를 먼저 확인해야 함');
  fs.copyFileSync(target, desktop);
}
console.log('LOCAL Native 계약 24개 내보내기 완료');
