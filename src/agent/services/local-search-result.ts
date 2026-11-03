import { z } from 'zod';
const searchResult = z.object({
  search: z
    .object({
      count: z.number().int().min(0).max(50),
      partial: z.boolean(),
      displayedLocally: z.literal(true),
    })
    .strict(),
});

// Search choices stay in the desktop; no file names or paths need to reach AI.
export function localSearchMessage(
  tool: string,
  status: string,
  result: unknown,
): string | undefined {
  if (!['file.search', 'folder.search'].includes(tool) || status !== 'SUCCEEDED') return;
  const parsed = searchResult.safeParse(result);
  if (!parsed.success) return '검색을 완료했습니다. 앱의 검색 결과창을 확인해 주세요.';
  const { count, partial } = parsed.data.search;
  return (
    (count
      ? `검색 결과 ${count}개를 찾았습니다. 검색 결과창에서 확인해 주세요.`
      : '검색한 범위에서 일치하는 항목을 찾지 못했습니다.') +
    (partial ? ' 제한 시간에 도달해 일부 범위만 검색했습니다.' : '')
  );
}
