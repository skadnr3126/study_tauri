1. 핵심 모델과 불변 규칙 정립

먼저 기능보다 무엇이 원본인지를 확정해야 해.

Block: 생각의 내용
Flow: Block의 순서와 분기
Link: 흐름 밖의 느슨한 관계
Inbox: 아직 Flow에 속하지 않은 Block
Layout: 화면 위치와 접힘 상태
Export: 파생 문서

그리고 규칙을 먼저 정해야 해.

한 Flow 안에서 같은 Block 중복 허용 여부
Flow에서 제거와 완전 삭제의 차이
Block 복제와 재사용의 차이
Branch 분리 시 원본 Block 처리
Link와 Flow 연결선의 차이
트리 합류를 허용할지
Block ID와 파일 경로 분리
원본과 캐시의 구분

여기까지 끝나면 실제 예시 데이터로 조작을 시뮬레이션해봐야 해.

Block 생성
→ Flow 삽입
→ Branch 생성
→ 순서 이동
→ Branch를 새 Flow로 분리
→ Detach
→ Trash
→ Undo

이 흐름에서 애매한 지점이 없으면 기본 모델이 잡힌 거야.


---- 여기서 해결해야 될 문제 ---

block 에 넣을것?
flow에 넣을것?
link에 넣을것?

inbox의 역할?
처음 생성됐을때 flow <-> inbox <-> block의 역할 구분?
block은 원본으로 하고 node가 flow의 하위 개념으로?
