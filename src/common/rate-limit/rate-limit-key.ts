import type { ExecutionContext } from '@nestjs/common';

type RateLimitRequest = {
  auth?: { userId?: string };
  ip?: string;
  socket?: { remoteAddress?: string };
  route?: { path?: string };
  baseUrl?: string;
  path?: string;
};

export function rateLimitTracker(request: RateLimitRequest) {
  const ip = request.ip || request.socket?.remoteAddress || 'unknown';
  return request.auth?.userId ? `user:${request.auth.userId}:ip:${ip}` : `ip:${ip}`;
}

export function endpointCategory(request: RateLimitRequest) {
  const path = `${request.baseUrl || ''}${request.route?.path || request.path || ''}`;
  if (/\/auth\/(login|register|refresh)/.test(path)) return 'auth-sensitive';
  if (/\/attachments/.test(path)) return 'file-upload';
  if (/\/agent/.test(path)) return 'ai';
  return path.split('/').filter(Boolean)[0] || 'root';
}

export function rateLimitKey(context: ExecutionContext, tracker: string, name: string) {
  const request = context.switchToHttp().getRequest<RateLimitRequest>();
  return `ratelimit:${name}:${endpointCategory(request)}:${tracker}`;
}
