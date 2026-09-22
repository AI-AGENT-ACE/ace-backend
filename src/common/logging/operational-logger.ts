type OperationalLog = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  service: 'ace-backend';
  requestId: string;
  method: string;
  route: string;
  status: number;
  duration: number;
  errorCode?: string;
};

export function writeOperationalLog(entry: OperationalLog) {
  const line = `${JSON.stringify(entry)}\n`;
  if (entry.level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
}
