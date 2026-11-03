import { localSearchMessage } from './local-search-result';
describe('로컬 검색 완료 안내', () => {
  it('로컬 결과 개수·부분 검색을 안내하며 파일 목록을 요구하지 않음', () => {
    expect(
      localSearchMessage('file.search', 'SUCCEEDED', {
        search: { count: 2, partial: true, displayedLocally: true },
      }),
    ).toContain('검색 결과 2개');
    expect(
      localSearchMessage('file.search', 'SUCCEEDED', {
        search: { count: 0, partial: true, displayedLocally: true },
      }),
    ).toContain('일부 범위');
    expect(localSearchMessage('folder.search', 'SUCCEEDED', {})).toContain('검색 결과창');
  });
  it('실패·다른 명령을 검색 성공으로 바꾸지 않음', () => {
    expect(localSearchMessage('file.search', 'FAILED', {})).toBeUndefined();
    expect(localSearchMessage('file.open', 'SUCCEEDED', {})).toBeUndefined();
  });
});
