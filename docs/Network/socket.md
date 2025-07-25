# Socket

> Socket에 대해 알아봅시다

## 소켓 넌 누구냐

소켓은 운영체제 커널이 관리하는 **네트워크 통신용 엔드포인트(종단점)** 입니다.

네트워크 상에서 데이터가 어디서 어디로 가야 하는지를 결정하는 논리적 통신 채널 역할을 하는 것이 `소켓`이라고 할 수 있겠습니다.

쉽게 비유하자면,  
데이터가 편지라면, 소켓은 그 편지를 주고받는 우편함과 같습니다.

::: info 구현적/프로그래밍 관점  
개발자가 TCP/UDP 같은 전송 계층을 직접적으로 컨트롤하기는 어렵기 때문에  
소켓은 운영체제가 제공하는 네트워크 통신용 인터페이스라고 볼 수도 있습니다.  
:::

## 소켓은 어떻게 식별될까?

TCP/IP 네트워크에서는 수많은 장비와 애플리케이션이 서로 데이터를 주고받습니다.  
그렇다면 운영체제는 "어떤 데이터를 어떤 프로그램에게 전달해야 하는지" 어떻게 알 수 있을까요?

바로 여기서 IP 주소와 포트 번호가 등장합니다.

### 포트란 무엇인가?

> 포트(port)는 하나의 컴퓨터 안에서 여러 네트워크 서비스나 프로세스를 식별하는 논리적 단위입니다.

같은 IP를 가진 서버에서 여러 프로그램(예: 웹서버, 데이터베이스, SSH 등)이 네트워크를 사용할 수 있게 해주는 식별자입니다.

::: info  
포트는 16비트 숫자로 표현되며, 0부터 65535까지의 값을 가집니다.  
실제로 네트워크 통신에서 포트는 전송 계층(Transport Layer)의 헤더 정보에 포함되어 사용됩니다.  
:::

소켓을 식별하기 위해서는 IP 주소와 포트 번호가 함께 필요합니다.

- IP 주소는 네트워크 상의 장비(호스트)를 구분하는 역할을 하며,
- 포트 번호는 그 장비 내에서 실행 중인 특정 프로세스를 구분하는 역할을 합니다.

따라서 네트워크에서 하나의 소켓은 보통 (IP 주소, 포트 번호) 쌍으로 식별됩니다.
