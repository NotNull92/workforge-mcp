# TASK-21 — 한 파일의 여러 변경을 한 번에 적용

상태: **Claude 검수 REVISE 반영, v2 최종 설계 구현 및 대상 테스트 완료.**

## 문제와 목표

관련된 여러 문자열을 바꾸려면 현재 replace_text를 여러 번 호출하고 매번 새 해시를 사용해야 한다.
한 파일의 모든 변경을 원본 하나에 대해 검증한 뒤 한 번만 저장한다. 중간 변경 상태를 디스크에 남기지 않는다.
파일 간 트랜잭션이나 일반 patch 문법 도입은 이번 항목의 목적이 아니다.

## API와 호환성

새 도구 없이 기존 replace_text에 선택적 edits 배열을 추가한다.

기존: contextRevision, path, expectedSha256, oldText, newText.

추가 형태:

```json
{
  "contextRevision": "현재 bootstrap revision",
  "path": "src/example.ts",
  "expectedSha256": "현재 파일 SHA-256",
  "edits": [
    {"oldText": "const first = 1;", "newText": "const first = 2;"},
    {"oldText": "const second = 3;", "newText": "const second = 4;"}
  ]
}
```

- oldText/newText 쌍과 edits는 정확히 한 형태만 사용한다. 혼합, 불완전한 단일 쌍, 빈 edits는 거부한다.
- edits는 1~100개. 각 oldText는 비어 있으면 안 되며 기존처럼 각 문자열 최대 4 Mi 문자다.
- 배치 oldText/newText의 UTF-8 합계는 16 MiB로 제한한다. 실제 최종 파일도 기존 16 MiB 제한을 지킨다.
- 기존 path/expectedSha256/contextRevision 제한을 유지한다.
- 출력에 editsApplied를 추가한다. 기존 단일 호출은 1이며 기존 path/previousSha256/sha256/byteLength는 유지한다.

## 적용 의미

모든 oldText는 변경 전의 동일한 원본을 가리킨다. 앞의 변경 결과를 뒤의 oldText가 참조하는 순차 스크립트가 아니다.

1. 모든 입력과 전체 payload 예산을 확인한다.
2. 기존 경로 검증과 resolveWriteTarget으로 실제 단일 파일을 확인한다. hardlink mutation 거부 유지.
3. 기존 target write lease를 한 번 취득한다.
4. 원본을 한 번 읽고 expectedSha256을 확인한다.
5. 각 edit를 기존 replacementForCurrentText로 검증한다. LF/CRLF 호환 의미를 그대로 재사용한다.
6. 원본 기준 start/end와 실제 replacement를 수집하고, 범위를 정렬해 중복·겹침을 거부한다. 인접한 범위는 허용한다.
7. 원본의 변경되지 않는 부분과 치환 문자열을 순서대로 조합한다. JS replacement token 해석 없이 문자열 그대로 삽입한다.
8. BOM과 line-ending 정책을 유지하고 최종 byte limit을 확인한다.
9. 기존 atomicReplace가 최신 원본 해시를 다시 확인한 뒤 한 번 rename한다.

하나라도 실패하면 파일 변경은 0건이다. 부분 성공 응답은 없다.
다른 프로세스가 읽기 이후 파일을 변경하면 기존 stale hash 오류를 반환한다.
oldText==newText는 기존과 동일하게 허용하며, 별도 no-op 최적화는 추가하지 않는다.

## 함께 확인할 기존 모호성

현재 countOccurrences는 다음 탐색 위치를 needle.length만큼 이동한다. 예를 들어 aaa 안의 aa는 겹치는 두 후보가 있지만 한 개로 셀 수 있다.
정확히 한 번이라는 기존 계약에 맞추기 위해 다음 탐색 위치를 1만 이동하는 변경을 제안한다. 이 helper의 모든 호출자는 replacementForCurrentText 내부다.
호환성 변화는 이전에 받아들였던 겹치는 모호한 oldText가 이제 거부된다는 점이다. 명시적인 회귀 테스트와 문서로 고정한다.

## 영향 범위

- src/filesystem.ts: 입력 정규화, 여러 원본 범위 검증·조합, countOccurrences의 겹침 감지.
- src/server.ts: 기존 단일 입력 optional화, edits schema, output editsApplied, 도구 설명.
- tests/filesystem.test.ts: 실제 파일에 대한 all-or-nothing, BOM/CRLF, stale hash/경계 회귀, MCP 두 입력 형태.
- README.md, README.ko.md, docs/ARCHITECTURE.md: 예시·원본 기준 의미·범위 겹침 거부.
- 도구 이름과 개수는 바뀌지 않으므로 smoke의 목록은 유지한다.

## 검증

- 입력 순서와 상관없이 원본의 두 비겹침 범위가 의도한 결과로 한 번 변경된다.
- 앞 replacement가 뒤 oldText를 생성/삭제해도 원본 기준 의미를 유지한다.
- 후속 edit 누락·중복·겹침·payload/출력 초과 시 원본 bytes/hash가 유지된다.
- 단일 oldText/newText 호출은 기존과 동일하게 동작하며 editsApplied=1.
- BOM·CRLF 파일에 LF로 지정한 여러 편집, dollar replacement token, Unicode를 보존한다.
- aaa/aa 같은 자체 겹침과 동일 edit 중복을 거부한다.
- stale contextRevision/hash, 다른 프로필 경로, hardlink 거부가 유지된다.
- 입력 혼합·빈 배열·101개·부분 단일 입력을 거부한다.
- 빌드, 전체 테스트, MCP roundtrip 및 기존 stdio 수정 흐름.

## 검수와 최종 결정

실제 Claude pane의 TASK-21-REVIEW를 수신했다. 원본 기준 의미와 atomic write 재사용은 적절하다는 평가, 아래 두 필수 보완을 받았다.

| 의견/아이디어 | 결정 | 최종 반영 |
| --- | --- | --- |
| 실패 edit 인덱스와 원인 | 채택 | edits[i] not found/multiple locations, overlap은 두 원래 인덱스; 내용 미노출 |
| 실제 normalized needle의 end 계산 | 채택 | helper가 start/end/replacement 반환; original oldText 길이 사용 금지 |
| 자기 겹침 유일성 수정 | 채택 | 첫 발견 위치 +1부터 두 번째 검색, count helper 단순화 |
| UTF-16 길이와 UTF-8 budget 구분 | 채택 | 단일 각4Mi UTF-16 코드 단위, batch 각1Mi 코드 단위; 합계16MiB는 파싱 후 처리량 제한으로 명시 |
| 새 파일의 edit별 줄 번호 | 보류 | 성공 후 기존 reader로 확인 가능, 응답 추가 계산 생략 |
| expectedCount, dryRun | 보류 | 첫 버전은 unique 교체와 실제 commit에 집중 |
| 원본 POSIX mode 보존 | 별도 후속 버그로 기록 | 기존 atomicReplace 공통 문제, 이번 Windows 기능 범위에 섞지 않음 |
| 여러 파일 transaction/patch | 거절 | 요청한 단일 파일 다중 편집을 넘어감 |

### 확정 v2

위 설계와 함께 원본 기준 범위를 helper에서 직접 반환한다. newText 빈 문자열은 허용하고 undefined만 누락이다. optional edits에는 default를 붙이지 않는다. XOR/aggregate 검증은 공통 replaceText 내부에서 파일 I/O 전에 수행해 직접 호출자도 보호한다. batch 문자열은 각각 1Mi UTF-16 코드 단위; 전체 UTF-8 합계16MiB. 이는 JSON transport 파싱 전 메모리 제한이 아니다.
기존 단일 호출의 실패 메시지는 유지하고 배치는 내용 없이 입력 인덱스/원인을 포함한다. CRLF 인접·겹침, 역순 입력, budget 사전 실패와 원본 불변 테스트를 추가한다.

## 구현 검증

빌드와 filesystem 22개 테스트 통과. CRLF/BOM/인접/겹침/자체 겹침/역순/빈 newText/aggregate preflight/원본 불변/MCP 단일·배치 응답을 확인했다. 기존 단일 형태에는 새 aggregate budget을 적용하지 않아 유효한 대용량 단일 호출의 호환성을 유지했다. POSIX 원본 mode 보존 문제는 기존 공통 writer의 별도 후속 항목이다.
