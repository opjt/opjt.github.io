---
title: rootless 컨테이너 만들기 - cgroup 과 seccomp
date: 2026-03-23T20:06:41+09:00
tags: ["Container"]
description: ""
# draft: true
# summary: ""
---

전편 [컨테이너는 마법이 아니다](../12/index.md)에서는 namespace 와 pivot_root를 통하여 격리 환경을 구성하는데 집중하였다  
호스트와 분리된 PID, 파일시스템, hostname을 가진 환경을 만들었지만, 이것만으로 안전한 컨테이너라고 할 수는 없다

현재 상태에서는:

- 컨테이너가 호스트의 메모리를 전부 소진 가능
- `reboot` 같은 위험한 시스템 콜을 호출할 수 있다

이번 글에서는 **cgroup**을 통해 리소스를 제한하고, **seccomp**을 사용하여 시스템 콜을 필터링하여 보안을 강화해본다.

## cgroup

### Fork bomb

지금껏 만든 컨테이너 환경 안에서 다음 명령을 실행하면 어떻게 될까?

```bash
:(){ :|:& };:
```

이 한 줄의 명령은 프로세스가 자기 자신을 무한히 복제하여 시스템의 PID와 메모리를 전부 소진하게 된다.

namespace로 격리되어 있어도 **호스트의 리소스는** 공유되어 있기 때문에, 컨테이너 하나가 호스트 전체를 먹통으로 만들 수 있다.

이를 방지하는 것이 **cgroup** (Control Group)이다.

### cgroup이란

cgroup은 프로세스 그룹의 리소스 사용량을 **제한하고 모니터링**하는 커널 기능이다. 제한할 수 있는 리소스는 다양하다

- **pids.max** — 최대 프로세스 수
- **memory.max** — 최대 메모리 사용량
- **cpu.max** — CPU 사용 시간 제한

cgroup v2에서는 이 설정이 `/sys/fs/cgroup/` 아래의 파일로 관리된다. 파일에 값을 쓰면 해당 cgroup에 속한 프로세스들에게 제한이 적용된다.

테스트를 위해 `pivotRoot("rootfs")` 함수를 주석처리하여 잠시 host의 파일마운트를 유지한다  
이후 컨테이너환경에서 cgroup을 설정해보자

```bash
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ id
uid=502(pjt) gid=1000(pjt) groups=1000(pjt)
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ go run . run /bin/bash
root@nootainer:/Users/pjt/Projects/PJT/nootainer# cd /sys/fs/cgroup/user.slice/user-502.slice/user@502.service
root@nootainer:/sys/fs/cgroup/user.slice/user-502.slice/user@502.service# ll -lrt
total 0
-rw-r--r-- 1 root root 0 Mar 10 21:52 cgroup.type
-rw-r--r-- 1 root root 0 Mar 10 21:52 cgroup.procs
...(생략)
```

user.slice로 들어오다보면 파일 소유자가 **root** 인 디렉토리가 있다.(다른 파일들이 nobody로 보이는 이유는 uid_group을 pjt-root 한개만 했기 때문)

```bash
root@nootainer:/sys/fs/cgroup/user.slice/user-502.slice/user@502.service# mkdir test
root@nootainer:/sys/fs/cgroup/user.slice/user-502.slice/user@502.service# ll -lrt test
total 0
drwxr-xr-x+ 8 root root 0 Mar 23 21:27 ../
-rw-r--r-- 1 root root 0 Mar 23 21:27 cgroup.type
-rw-r--r-- 1 root root 0 Mar 23 21:27 cgroup.procs
-rw-r--r-- 1 root root 0 Mar 23 21:27 cgroup.threads
-r--r--r-- 1 root root 0 Mar 23 21:27 cgroup.controllers
-rw-r--r-- 1 root root 0 Mar 23 21:27 cgroup.subtree_control
-r--r--r-- 1 root root 0 Mar 23 21:27 cgroup.events
-rw-r--r-- 1 root root 0 Mar 23 21:27 cgroup.max.descendants
-rw-r--r-- 1 root root 0 Mar 23 21:27 cgroup.max.depth
...
```

이후 새로 디렉토리를 생성하게 되면 신기하게도 안에 파일들이 자동으로 채워진다.

여기 있는 `cpu.max`, `memory.max` `pids.max` 같은 파일들을 수정하고 제한받을 **pid**를 `cgroup.procs` 에 넣어주면 설정은 끝난다.

```bash
root@nootainer:/sys/fs/cgroup/user.slice/user-502.slice/user@502.service# echo $$
8
root@nootainer:/sys/fs/cgroup/user.slice/user-502.slice/user@502.service# echo "8" > cgroup.procs
bash: echo: write error: Permission denied
```

하지만 안타깝게도 설정할 수가 없다 왜그럴까?

### Rootless에서의 문제

User namespace 안에서 `/sys/fs/cgroup/` 하위에 직접 디렉토리를 만들고 `pids.max` 같은 제한값을 설정하는 것까지는 가능하다. 파일 소유자가 내 UID이기 때문이다.

하지만 프로세스를 해당 cgroup에 **넣는 것**이 문제다. `cgroup.procs`에 PID를 써서 프로세스를 이동시키려면, **출발지(부모 cgroup)와 도착지 양쪽**의 `cgroup.procs`에 쓰기 권한이 필요하다. 부모 cgroup의 `cgroup.procs`는 호스트 root 소유이므로 쓰기 권한이 없다.

```bash
root@nootainer:/# cat /proc/self/cgroup
0::/user.slice/user-502.slice/session-4.scope
root@nootainer:/# echo $$
8
root@nootainer:/# cat /sys/fs/cgroup/user.slice/user-502.slice/session-4.scope/cgroup.procs
...(생략)
8
```

- 현재 프로세스가 속한 cgroup을 확인하는 방법

제한값은 설정할 수 있어도 프로세스를 넣을 수 없으니 의미가 없다. 이를 해결하는 것이 **systemd의 cgroup delegation**이다.

```bash
systemd-run --quiet --user --scope -p Delegate=yes -- <command>
```

`systemd-run --user --scope`는 현재 유저 세션에 새로운 **scope** (cgroup 단위)를 만들어준다. `Delegate=yes`를 설정하면 해당 scope의 cgroup 파일에 대한 **쓰기 권한을 위임**받는다.

이렇게 하면 root 없이도 cgroup 제한을 설정할 수 있다.

```bash
pjt@lima-default:/$ systemd-run --quiet --user --scope -p Delegate=yes -- /bin/bash
pjt@lima-default:/$ cat /proc/self/cgroup
0::/user.slice/user-502.slice/user@502.service/app.slice/run-p245227-i245226.scope
pjt@lima-default:/$ echo "0" > /sys/fs/cgroup/user.slice/user-502.slice/user@502.service/app.slice/run-p245227-i245226.scope/pids.max
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ ps
bash: fork: retry: Resource temporarily unavailable
^Cbash: fork: Interrupted system call
```

`pids.max` 값을 0으로 수정한 결과 ps 명령어를 입력하면 더이상 fork할 수 없는 것을 확인할 수 있다. (ctrl+D 로 나오면 cgroup scope는 자동 정리된다)

이렇게 root 없이도 cgroup 제한을 설정할 수 있다. 이제 이걸 코드로 구현해보자

### 구현

이전 글에서 `run` → `child` 2단계 구조였다. `run`에서 namespace를 만들고, `child`에서 setup 후 사용자 명령을 실행했다.

```text
run  →  child
         ├ namespace setup (hostname, /proc, pivot_root)
         └ exec(사용자 명령)
```

여기에 cgroup을 추가하려면 문제가 생긴다. `run`에서 `systemd-run`으로 scope를 만들어야 하는데, 기존 `run`은 직접 `clone()`으로 `child`를 실행했다. scope 생성과 namespace 생성을 한 단계에서 동시에 할 수 없으므로, 단계를 하나 더 분리해야 한다.

```go
// run: systemd-run으로 cgroup scope 생성
func run() {
    exe, err := os.Executable()
    if err != nil {
        log.Fatal(err)
    }
    args := append([]string{
        "--quiet", "--user", "--scope",
        "-p", "Delegate=yes",
        "--", exe, "child",
    }, os.Args[2:]...)

    cmd := exec.Command("systemd-run", args...)
    cmd.Stdin = os.Stdin
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    if err := cmd.Run(); err != nil {
        log.Fatal(err)
    }
}
```

`child`에서는 `/proc/self/cgroup`을 읽어 현재 scope의 경로를 찾고, 해당 경로의 cgroup 파일에 제한값을 쓴다:

```go
func getCgroupPath() string {
    data, err := os.ReadFile("/proc/self/cgroup")
    if err != nil {
        log.Fatal(err)
    }
    line := strings.TrimSpace(string(data))
    parts := strings.SplitN(line, ":", 3)
    return filepath.Join("/sys/fs/cgroup", parts[2])
}

func setCgroupV2() {
    cgroupPath := getCgroupPath()
    os.WriteFile(filepath.Join(cgroupPath, "pids.max"), []byte("20"), 0644)
    os.WriteFile(filepath.Join(cgroupPath, "memory.max"), []byte("100M"), 0644)
}
```

기존 `child`가 하던 namespace setup은 새로운 `container` 단계로 내려가고, `child`는 cgroup 설정을 담당한다.  
cgroup 설정을 하려면 두 가지 조건이 **동시에** 만족되어야 하기 때문이다

1. **scope가 이미 생성되어 있을 것** — cgroup 경로가 존재해야 파일에 쓸 수 있다
2. **user namespace에 아직 진입하지 않았을 것** — 앞에서 봤듯이 user namespace 안에서는 cgroup 파일에 쓸 수 없다

| 단계        | scope 존재?                    | namespace 밖?              | cgroup 설정 가능? |
| ----------- | ------------------------------ | -------------------------- | ----------------- |
| `run`       | ✗ (이제 막 `systemd-run` 호출) | ✓                          | ✗                 |
| `child`     | ✓ (scope 안에서 실행됨)        | ✓                          | **✓**             |
| `container` | ✓                              | ✗ (이미 user namespace 안) | ✗                 |

`child`만이 두 조건을 모두 만족한다.

```text
nootainer run <cmd>
       │
       ▼
  ┌─────────┐
  │   run   │  systemd-run --user --scope (cgroup scope 생성)
  └────┬────┘
       ▼
  ┌─────────┐
  │  child  │  cgroup 제한 설정 (pids.max, memory.max)  ← 여기
  └────┬────┘  clone(NEWUSER|NEWUTS|NEWNS|...)
       ▼
  ┌───────────┐
  │ container │  pivot_root, setup, exec
  └───────────┘
```

그래서 기존 2단계 사이에 cgroup 설정을 위한 단계가 끼어들면서 위와 같은 3단계 구조가 된다.

### 테스트

pids.max를 20으로 설정한 상태에서 fork bomb을 실행하면:

```bash
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ go run . run /bin/bash
root@nootainer:/Users/pjt/Projects/PJT/nootainer# :(){ :|:& };:
[1] 17
root@nootainer:/Users/pjt/Projects/PJT/nootainer# bash: fork: retry: Resource temporarily unavailable
```

프로세스 수가 20개로 제한되어 fork bomb이 호스트까지 번지지 않는다.

## Seccomp BPF: 시스템 콜 필터링

### 왜 필요한가

cgroup으로 리소스를 제한했지만, 컨테이너 안에서 호출할 수 있는 **시스템 콜**에는 아직 제한이 없다.

예를 들어 `reboot` syscall은 namespace 안에서도 호출 자체는 가능하다. 커널이 권한 체크를 하여 거부하긴 하지만, 1편에서 다뤘던 것처럼 **커널 코드 경로에 버그가 있으면** 문제가 될 수 있다.

seccomp은 이 문제를 해결한다. 커널 권한 체크에 도달하기 **전에** syscall 자체를 차단한다.

### seccomp과 BPF

seccomp (Secure Computing Mode)은 프로세스가 사용할 수 있는 시스템 콜을 제한하는 커널 기능이다.

seccomp에는 두 가지 모드가 있다:

- **strict mode** — `read`, `write`, `exit`, `sigreturn` 4개만 허용
- **filter mode** — BPF 프로그램으로 syscall별 정책을 직접 정의

컨테이너에서는 filter mode를 사용한다. 여기서 BPF (Berkeley Packet Filter)는 원래 네트워크 패킷 필터링을 위해 만들어진 바이트코드 VM인데, seccomp에서는 이를 **syscall 필터링에 재활용**한다.

동작 방식에 대해 간단히 알아보자면

- 프로세스가 `prctl`로 BPF 필터를 커널에 등록해두면, 이후 해당 프로세스가 syscall을 호출할 때마다 커널은 실제 syscall을 실행하기 **전에** 등록된 BPF 필터를 먼저 실행한다.
- 필터는 syscall 번호를 보고 허용할지 차단할지를 결정한다.
- 차단으로 판정되면 syscall은 커널 코드에 도달하지 못하고 바로 에러가 반환된다.

### BPF 바이트코드 직접 작성

해당 구현에서는 [libseccomp](https://github.com/seccomp/libseccomp) 같은 잘 만들어져있는 라이브러리를 사용하지 않고 BPF 바이트코드를 직접 작성한다.

- `seccomp.go` 파일을 생성 후 분리하여 작성한다.

BPF 필터는 커널이 이해하는 **명령어 블록**들을 직접 조합하는 방식이다.  
각 블록은 하나의 연산을 나타내고, 이 블록들을 배열로 나열하면 그것이 곧 필터 프로그램이 된다.  
스크래치 블록처럼 "값을 읽어라", "비교해라", "점프해라", "결과를 반환해라" 같은 기본 동작을 조합하여 원하는 필터 로직을 만든다.

사용할 수 있는 연산의 종류는 커널이 정의한 상수로 표현된다

```go
const (
    BPF_LD  = 0x00  // 값을 읽어오는 명령
    BPF_JMP = 0x05  // 조건부 점프
    BPF_RET = 0x06  // 결과 반환 (허용/차단)
    BPF_W   = 0x00  // 4바이트(Word) 단위로 읽기
    BPF_ABS = 0x20  // 절대 오프셋에서 읽기
    BPF_JEQ = 0x10  // 같으면 점프

    SECCOMP_RET_ALLOW = 0x7fff0000  // syscall 허용
    SECCOMP_RET_ERRNO = 0x00050000  // syscall 차단, 에러 반환

    SECCOMP_DATA_NR_OFF   = 0  // syscall 번호의 오프셋
    SECCOMP_DATA_ARCH_OFF = 4  // 아키텍처 정보의 오프셋
    AUDIT_ARCH_AARCH64    = 0xC00000B7
)
```

이 상수들을 비트 OR(`|`)로 조합하면 하나의 명령이 된다. 예를 들어 `BPF_LD|BPF_W|BPF_ABS`는 "절대 오프셋에서 4바이트를 읽어라"라는 뜻이다.

BPF 명령어는 `sockFilter` 구조체로 표현된다

```go
type sockFilter struct {
    Code uint16 // 연산코드 (load, jump, return 등)
    Jt   uint8  // 조건이 참이면 점프할 거리
    Jf   uint8  // 조건이 거짓이면 점프할 거리
    K    uint32 // 상수값
}
```

- [linux/filter.h](https://elixir.bootlin.com/linux/v6.12/source/include/uapi/linux/filter.h#L24) 참고

그리고 필터 작성을 위해 두 가지 헬퍼 함수를 만든다

```go
// 조건 없이 실행하는 명령
func bpfStmt(code uint16, k uint32) sockFilter {
    return sockFilter{Code: code, K: k}
}
// 조건부 비교 후 점프
func bpfJump(code uint16, k uint32, jt, jf uint8) sockFilter {
    return sockFilter{Code: code, Jt: jt, Jf: jf, K: k}
}
```

- stmt(statement)는 조건 분기 없이 반드시 실행되는 명령이다
  - 조건이 없기 때문에 `Jt`, `Jf` 를 넣지않음

이를 사용하여 필터를 작성해보자

```go
func setupSeccomp() {
    filter := []sockFilter{
        // 아키텍처 체크 (aarch64인지 확인)
        bpfStmt(BPF_LD|BPF_W|BPF_ABS, SECCOMP_DATA_ARCH_OFF),  // 아키텍처 정보 로드
        bpfJump(BPF_JMP|BPF_JEQ, AUDIT_ARCH_AARCH64, 1, 0),    // aarch64이면 다음으로, 아니면 차단
        bpfStmt(BPF_RET, SECCOMP_RET_ERRNO|uint32(syscall.EPERM)),

        // syscall 번호 로드
        bpfStmt(BPF_LD|BPF_W|BPF_ABS, SECCOMP_DATA_NR_OFF),

        // 차단 목록 체크 (매칭되면 ERRNO로, 아니면 다음으로)
        bpfJump(BPF_JMP|BPF_JEQ, 142, 4, 0), // SYS_REBOOT
        bpfJump(BPF_JMP|BPF_JEQ, 104, 3, 0), // SYS_KEXEC_LOAD
        bpfJump(BPF_JMP|BPF_JEQ, 294, 2, 0), // SYS_KEXEC_FILE_LOAD
        // 만약 로드한 syscall이 97번(SYS_UNSHARE)과 같다면 1만큼 점프하여 ERR로 가게 된다
        bpfJump(BPF_JMP|BPF_JEQ, 97, 1, 0),  // SYS_UNSHARE

        // 허용 / 차단
        bpfStmt(BPF_RET, SECCOMP_RET_ALLOW),
        bpfStmt(BPF_RET, SECCOMP_RET_ERRNO|uint32(syscall.EPERM)),
    }
    // 커널에 필터 로드
    prog := sockFprog{Len: uint16(len(filter)), Filter: &filter[0]}
    _, _, errno := syscall.RawSyscall(
        syscall.SYS_PRCTL,
        syscall.PR_SET_SECCOMP,
        SECCOMP_MODE_FILTER,
        uintptr(unsafe.Pointer(&prog)),
    )
    if errno != 0 {
        log.Fatal("seccomp load failed: ", errno)
    }

}
```

필터의 흐름을 그림으로 보면 아래와 같은 느낌이다

```text
syscall 발생
    │
    ▼
아키텍처가 aarch64인가? ──NO──→ ERRNO (차단)
    │ YES
    ▼
syscall 번호 로드
    │
    ▼
SYS_REBOOT인가? ──YES──→ ERRNO (차단)
    │ NO
    ▼
SYS_KEXEC_LOAD인가? ──YES──→ ERRNO (차단)
    │ NO
    ▼
SYS_UNSHARE인가? ──YES──→ ERRNO (차단)
    │ NO
    ▼
ALLOW (허용)
```

필터 배열을 만들었으면 커널에 등록해야 한다.

- `sockFprog` 구조체에 필터의 길이와 포인터를 담고, `prctl` syscall로 커널에 전달한다.
- `SECCOMP_MODE_FILTER`를 지정하면 커널은 이 BPF 프로그램을 현재 프로세스에 부착하고, 이후 모든 syscall에 대해 필터를 실행한다.

### 테스트

기존 seccomp이 없는 상태에서는 컨테이너 안에서 추가 namespace를 만들 수 있다:

```bash
root@nootainer:/# unshare --user sh
$   <- 성공. 컨테이너 안에서 또 다른 namespace 생성
```

컨테이너 안에서 추가 격리 환경을 만들 수 있다는 것은 공격자가 탐지를 회피하거나 추가적인 커널 공격 표면을 열 수 있다는 뜻이다.

이제 `setupSeccomp()` 함수를 `pivotRoot()` 밑에 추가하여 syscall이 제한되는지 확인해본다.

```bash
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ go run . run /bin/sh
/ # unshare --user sh
unshare: unshare(0x10000000): Operation not permitted
```

`SYS_UNSHARE`가 차단되어 커널에 도달하기 전에 `EPERM`이 반환된다.

## Capability

마지막으로 capability에 대해 간단히 짚고 넘어가자.

user namespace 안에서 root(UID 0)는 해당 namespace 범위 내에서 **full capability**를 가진다. `CAP_SYS_ADMIN`, `CAP_NET_RAW`, `CAP_SYS_PTRACE` 등 모든 권한이 열려 있다는 뜻이다. 호스트에 직접적인 영향은 없지만, namespace 안에서의 공격 표면을 넓힌다.

seccomp이 syscall 단위로 차단한다면, capability drop은 **권한 단위로** 불필요한 것을 제거하는 방식이다. 같은 목적의 다른 계층이라 볼 수 있다.

```go
//capability.go
var dropCaps = []uintptr{
    21, // CAP_SYS_ADMIN
    13, // CAP_NET_RAW
    19, // CAP_SYS_PTRACE
    16, // CAP_SYS_MODULE
    22, // CAP_SYS_BOOT
    23, // CAP_SYS_NICE
    24, // CAP_SYS_RESOURCE
    25, // CAP_SYS_TIME
}

func dropCapabilities() {
    for _, cap := range dropCaps {
        _, _, err := syscall.RawSyscall(syscall.SYS_PRCTL, PR_CAPBSET_DROP, cap, 0)
        if err != 0 {
            log.Fatal(err)
        }
    }
}
```

`prctl(PR_CAPBSET_DROP)`으로 capability bounding set에서 해당 capability를 제거한다. 한번 drop하면 다시 얻을 수 없다.

실제로 Docker도 컨테이너 실행 시 기본적으로 대부분의 capability를 drop한다. `CAP_NET_RAW`, `CAP_SYS_CHROOT` 등 최소한의 것만 남기고 나머지는 제거한다.

여기서 `docker run --privileged`가 왜 위험한지 알 수 있다.  
이 옵션은 **모든 capability를 부여**하고, seccomp 필터를 비활성화하며, `/dev` 아래의 호스트 디바이스에 접근할 수 있게 한다 지금까지 쌓아온 방어 계층을 전부 무력화하는 옵션인 셈이다.

예를 들어 `--privileged` 컨테이너 안에서는 호스트의 디스크를 직접 마운트할 수 있다:

```bash
# privileged 컨테이너 안에서
mount /dev/sda1 /mnt
ls /mnt  # 호스트의 루트 파일시스템이 보인다
```

`CAP_SYS_ADMIN`이 있으니 `mount` syscall이 허용되고, 호스트 디바이스에 접근 가능하니 `/dev/sda1`을 읽을 수 있다. 사실상 호스트의 root와 다를 바 없는 상태가 된다.

지금 구현하고 있는 방식은 rootless 컨테이너이므로 호스트의 진짜 root 권한이 애초에 없어 `--privileged` 같은 문제와는 거리가 멀다. 하지만 rootful 환경에서 습관적으로 `--privileged`를 붙이는 것이 얼마나 위험한지는 알아둘 필요가 있다.

## 마무리

namespace(격리) + cgroup(리소스 제한) + seccomp(syscall 필터링) + capability(권한 축소).

이 조합이 컨테이너 보안의 기본 구성이다. 각각 다른 계층에서 방어하며, 하나가 뚫려도 나머지가 버텨주는 **다층 방어(defense in depth)** 구조를 이룬다.

이것으로 rootless 컨테이너 런타임의 핵심 구현은 끝이다. root 권한 없이 프로세스를 격리하고, 리소스를 제한하고, 위험한 syscall을 차단하는 컨테이너를 만들었다.

다음 편에서는 부가적인 부분을 다룬다. 지금까지는 rootfs를 로컬에서 직접 준비해야 했는데, **OCI 표준**을 통해 Docker Hub에서 이미지를 직접 가져오는 방법을 구현해본다.

---

_nootainer의 전체 코드는 [GitHub](https://github.com/opjt/nootainer)에서 확인할 수 있다._
