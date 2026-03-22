---
title: 컨테이너는 마법이 아니다
date: 2026-03-22T14:37:19+09:00
tags: ["Container"]
description: "컨테이너는 마법이 아니다 namespace 격리 원리 이해 | Go로 rootless 컨테이너 만들기"
# draft: true
# summary: ""
---

처음 docker를 사용하며 컨테이너를 만들고 `exec -it`를 통해 컨테이너 내부에 처음 들어왔을 때 경험은 참 신기했다  
`ps` 명령어를 치면 몇 안되는 프로세스들과 낯선 파일 구조들은 마치 VM처럼 느껴졌다

블랙박스의 영역처럼 느껴졌던 이런 컨테이너의 격리 기술은 간단한 명령어나 몇 줄 안되는 소스코드로 생각보다 쉽게 구현해볼 수 있다

컨테이너 수준의 격리를 구성하기 위해서 핵심 3가지 기술들이 사용된다.

- namespace : 자원 격리
- cgroup : 자원 제한
- pivot root : 루트 파일시스템 격리

해당 포스트에서는 왜 루트리스 컨테이너를 사용해야하는지와 직접 rootless 컨테이너를 **Go**를 통해 만들어본다

## Namespace

namespace는 컨테이너 기술의 가장 근본적인 격리 기능을 제공하는 리눅스 커널 기능이다  
마치 같은 회사 건물이지만 여러 층을 이용하여 분리된 공간을 사용하는 것 처럼, 네임스페이스는 단일 운영체제 환경에서 프로세스그룹이 서로 격리된 환경을 갖도록 만들어 준다.  
이것이 가능한 이유는 네임스페이스가 특정 프로세스에게 시스템의 자원을 마치 자신만 사용하는 것처럼 보이도록 view를 제한하기 때문이다

시스템의 다양한 자원들을 대상으로 각각 다른 종류의 네임스페이스 기능들을 지원한다.

| Namespace   | 격리 대상         | 기능                                                    |
| ----------- | ----------------- | ------------------------------------------------------- |
| **User**    | UID/GID           | 컨테이너 안에서 root처럼 동작하되, 호스트에는 영향 없게 |
| **PID**     | 프로세스 ID       | 컨테이너 안에서 PID 1부터 시작, 호스트 프로세스 안 보임 |
| **UTS**     | hostname          | 컨테이너마다 독립적인 hostname 설정                     |
| **Mount**   | 파일시스템 마운트 | 컨테이너마다 독립적인 파일시스템 트리                   |
| **IPC**     | 프로세스간 통신   | shared memory, semaphore 등 격리                        |
| **Network** | 네트워크 스택     | 독립적인 네트워크 인터페이스, IP, 포트                  |

### unshare 실습

글로 이해하는 것 보다 직접 느껴보는 게 빠르다  
Linux에서는 `unshare` 명령어를 통해 네임스페이스를 직접 만들 수 있다

#### Unix Time-Sharing System namespace

가장 기본적인 네임스페이스인 UTS 네임스페이스를 만들어보겠다.

유닉스 시분할 시스템 네임스페이스는 말로는 거창한데  
단순히 hostname을 격리하는 기능을 지니고 있다.

```shell
pjt@lima-default:~$ sudo unshare --uts /bin/sh
# hostname
lima-default
# hostname container
# hostname
container
```

이후 다른 쉘에서 `hostname`을 입력하면 lima-default 가 나오는 것을 볼 수 있다

```bash
# ls -lrt /proc/self/ns
total 0
lrwxrwxrwx 1 root root 0 Mar 22 15:43 time_for_children -> 'time:[4026531834]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 time -> 'time:[4026531834]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 cgroup -> 'cgroup:[4026531835]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 mnt -> 'mnt:[4026531832]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 user -> 'user:[4026531837]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 pid_for_children -> 'pid:[4026531836]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 pid -> 'pid:[4026531836]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 ipc -> 'ipc:[4026531839]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 uts -> 'uts:[4026532929]'
lrwxrwxrwx 1 root root 0 Mar 22 15:43 net -> 'net:[4026531833]'

pjt@lima-default:~$ ls -lrt /proc/self/ns
total 0
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 time_for_children -> 'time:[4026531834]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 time -> 'time:[4026531834]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 cgroup -> 'cgroup:[4026531835]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 mnt -> 'mnt:[4026531832]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 user -> 'user:[4026531837]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 pid_for_children -> 'pid:[4026531836]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 pid -> 'pid:[4026531836]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 ipc -> 'ipc:[4026531839]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 uts -> 'uts:[4026531838]'
lrwxrwxrwx 1 pjt pjt 0 Mar 22 15:43 net -> 'net:[4026531833]'
```

`proc/self/ns` 를 살펴보면 uts 네임스페이스 번호만 다른 것을 확인할 수 있다

#### PID namespace

다음은 프로세스아이디를 격리해보자

```bash
sudo unshare --pid --fork sh
pjt@lima-default:~$ sudo unshare --pid --fork sh
# echo $$
1
```

`echo $$` 는 현재 쉘 프로세스의 pid를 나타내는데 1인 모습을 볼 수 있다

- _hostOS의 pid 1은 init 프로세스다_

하지만 unshare 한 쉘 내에서 `ps -ef`를 하면 수많은 프로세스들이 보인다

이유는 ps로 보여지는 프로세스들은 `/proc` 디렉토리를 읽어와서 보여주는데 아직 `/proc` 디렉터리를 보여주는 마운트 네임스페이스가 아직 그대로 바라보고 있기 때문이다

#### Mount namespace

이때 마운트 네임스페이스를 생성하여 `/proc` 디렉토리를 새로 올려줘보자

```bash
pjt@lima-default:~$ sudo unshare --mount --pid sh
# mount -t proc proc /proc
# ps -ef
sh: 2: Cannot fork
#
pjt@lima-default:~$ sudo unshare --mount --pid --fork sh
# mount -t proc proc /proc
# ps -ef
UID          PID    PPID  C STIME TTY          TIME CMD
root           1       0  0 16:05 pts/6    00:00:00 sh
root           3       1  0 16:05 pts/6    00:00:00 ps -ef
```

두번째 결과를 보면 전과 달리 격리된 pid 목록들만 보여지게 된다

첫번째 명령에서 `fork`하지 못하는 이유는 아래와 같다

- `--fork` 없이 unshare를 하게 될 경우 **sh** 프로세스가 아직 새 PID namespace의 맴버가 아니게 된다(PID namespace를 만들기만 하고, 기존 namespace에 남아 있음)
- /proc 를 새로 마운트하면 새 PID namespace의 proc가 올라가게 된다, 하지만 거기엔 아직 **sh** 프로세스가 포함되어있지 않기 때문에
- 그 상태에서 ps 를 하면 내부적으로 `fork()`를 수행하는데 새 PID namespace에 init(PID 1) 프로세스가 없어서 커널이 fork을 거부하게 된다
  - PID namespace 에는 반드시 PID 1이 존재해야 자식 프로세스를 만들 수 있다

#### User namespace

지금까지 실습에서 모두 `sudo` 명령어를 사용하였다. namespace를 생성하려면 root 권한이 필요하기 때문이다

하지만 컨테이너를 생성하기 위해 항상 루트권한이 필요하다면 이는 보안적으로 큰 리스크가 된다.  
컨테이너 런타임에서 취약점이 발견될 경우, 공격자는 호스트의 root 권한을 그대로 사용할 수 있기 때문이다

user namespace는 다른 네임스페이스와 다르게 비루트 권한으로도 생성이 가능하다.

```bash
pjt@lima-default:~$ id
uid=502(pjt) gid=1000(pjt) groups=1000(pjt)
pjt@lima-default:~$ unshare --user --map-root-user /bin/sh
# id
uid=0(root) gid=0(root) groups=0(root)
```

sudo 없이 root가 된 모습이다

```bash
# cat /proc/$$/uid_map
         0        502          1
#
```

root가 된 이유는 unshare 명령에서 사용한 `--map-root-user` 때문인데  
해당 옵션을 사용하면 `uid_map`을 자동으로 설정해준다  
uid_map 은 user namespace에서 적용되는 유저 매핑테이블이다

차례대로
namespace내 UID, 호스트 UID, 매핑 개수를 의미한다

즉 0 502 1 은 namespace 안의 uid 0부터 1개(매핑개수)를 호스트의 502 uid로 매핑하겠다 라는 뜻이다.

namespace 안에서는 root(uid:0) 으로 보이지만 호스트에서는 여전히 일반 유저인 것이다

참고로 init namespace(호스트)를 살펴보면 :

```bash
pjt@lima-default:~$ cat /proc/$$/uid_map
         0          0 4294967295
```

- 모든 UID가 1:1로 매핑된 모습이다 (격리가 없는 상태)

여기서 핵심은 user namespace 안에서 root가 되면, 그 안에서 다른 namespace도 생성할 수 있다는 점이다.

```bash
pjt@lima-default:~$ unshare --user --map-root-user --pid --fork --mount /bin/sh
# mount -t proc proc /proc
# ps -ef
UID          PID    PPID  C STIME TTY          TIME CMD
root           1       0  0 16:52 pts/4    00:00:00 /bin/sh
root           3       1  0 16:53 pts/4    00:00:00 ps -ef
```

unshare가 여러 namespace를 동시에 생성할 때 user namespace를 먼저 만들기 때문에, 그 안에서 root 권한을 얻은 상태로 나머지 namespace를 생성할 수 있다

이것이 **rootless 컨테이너**의 원리이다

## Container with Go

`unshare` 명령어를 통해 컨테이너 격리를 대략적으로 실습해봤다

이제 **Go**로 직접 컨테이너 런타임을 만들어보자.

컨테이너를 만들려면 격리된 **namespace** 안에서 프로세스를 실행해야 한다.

Go에서는 `exec` 패키지를 사용하여 자식 프로세스를 실행할 수 있는데, 이때 `SysProcAttr`에 `Cloneflags`를 설정하면 자식 프로세스를 생성하면서 동시에 새 namespace를 설정할 수 있다.

가장 단순한 구현부터 시작해보자

```go
func main() {
      switch os.Args[1] {
      case "run":
          run()
      default:
          log.Fatal("unknown command")
      }
  }

  func run() {
      cmd := exec.Command(os.Args[2], os.Args[3:]...)
      cmd.SysProcAttr = &syscall.SysProcAttr{
          Cloneflags:  syscall.CLONE_NEWUSER | syscall.CLONE_NEWUTS |
                       syscall.CLONE_NEWPID | syscall.CLONE_NEWNS |
                       syscall.CLONE_NEWIPC | syscall.CLONE_NEWNET,
          UidMappings: []syscall.SysProcIDMap{
              {ContainerID: 0, HostID: os.Getuid(), Size: 1},
          },
          GidMappings: []syscall.SysProcIDMap{
              {ContainerID: 0, HostID: os.Getgid(), Size: 1},
          },
      }
      cmd.Stdin = os.Stdin
      cmd.Stdout = os.Stdout
      cmd.Stderr = os.Stderr
      if err := cmd.Run(); err != nil {
          log.Fatal(err)
      }
  }
```

- **UidMappings**는 앞서 살펴본 `uid_map`과 동일하다.

실행 후 결과를 살펴보자

```bash
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ go run . run sh
# hostname
lima-default
# ps -ef | head -5
UID          PID    PPID  C STIME TTY          TIME CMD
nobody         1       0  0 Mar16 ?        00:01:09 /usr/lib/systemd/systemd --system --deserialize=67
nobody         2       0  0 Mar16 ?        00:00:00 [kthreadd]
nobody         3       2  0 Mar16 ?        00:00:00 [pool_workqueue_release]
nobody         4       2  0 Mar16 ?        00:00:00 [kworker/R-rcu_gp]
#
```

우리가 알던 컨테이너의 모습과는 다르다

- hostname 그대로
- /proc가 호스트 것이라 호스트 프로세스가 전부 보임

namespace는 생성되었지만, hostname 설정 및 /proc 마운트 같은 셋업을 할 타이밍이 없다.  
쉘이 바로 실행되어 버리기 때문이다.

이를 해결하기 위하여 사용자 명령을 바로 실행하는 것이 아닌, 자기 자신을 다시 실행하여 namespace 안에서 setup 코드를 설정할 수 있게 한다.

### 나 자신을 내가 실행시키기(re-exec 패턴)

```go
func main() {
      switch os.Args[1] {
      case "run":
          run()
      case "child":
          child()
      default:
          log.Fatal("unknown command")
      }
  }

  func run() {
      cmd := exec.Command("/proc/self/exe", append([]string{"child"}, os.Args[2:]...)...)
      cmd.SysProcAttr = &syscall.SysProcAttr{
          Cloneflags:  syscall.CLONE_NEWUSER | syscall.CLONE_NEWUTS |
                       syscall.CLONE_NEWPID | syscall.CLONE_NEWNS |
                       syscall.CLONE_NEWIPC | syscall.CLONE_NEWNET,
          UidMappings: []syscall.SysProcIDMap{
              {ContainerID: 0, HostID: os.Getuid(), Size: 1},
          },
          GidMappings: []syscall.SysProcIDMap{
              {ContainerID: 0, HostID: os.Getgid(), Size: 1},
          },
      }
      cmd.Stdin = os.Stdin
      cmd.Stdout = os.Stdout
      cmd.Stderr = os.Stderr
      if err := cmd.Run(); err != nil {
          log.Fatal(err)
      }
  }

  func child() {
      // namespace 안에서 setup
      syscall.Sethostname([]byte("nootainer"))
      syscall.Mount("proc", "/proc", "proc", 0, "")

      // setup 완료 후 사용자 명령 실행
      cmd := exec.Command(os.Args[2], os.Args[3:]...)
      cmd.Stdin = os.Stdin
      cmd.Stdout = os.Stdout
      cmd.Stderr = os.Stderr
      if err := cmd.Run(); err != nil {
          log.Fatal(err)
      }
  }
```

`/proc/self/exe`는 현재 실행 중인 바이너리 자기 자신을 가리킨다.  
인자값 **child**를 통해 단계를 구분하고, **child**에서 namespace 안의 setup을 수행한 뒤 사용자 명령을 실행한다

```text
go run . run sh
         │
         ▼
    ┌─────────┐
    │   run   │  clone(NEWUSER|NEWUTS|NEWNS|NEWPID|NEWIPC|NEWNET)
    └────┬────┘
         │  /proc/self/exe child
         ▼
    ┌─────────┐
    │  child  │  /proc/self/exe sh
    └─────────┘
```

- 그림으로 보면 위와 같은 구조가 된다.

```bash
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ go run . run sh
# hostname
nootainer
# ps -ef
UID          PID    PPID  C STIME TTY          TIME CMD
root           1       0  0 22:26 pts/6    00:00:00 /proc/self/exe child s
root           8       1  0 22:26 pts/6    00:00:00 sh
root          10       8  0 22:26 pts/6    00:00:00 ps -ef
```

다시 실행해보면 이제 새로 생성된 네임스페이스 안에서 setup이 적용된 환경으로 사용자 명령(sh)이 실행된다

## 파일시스템 격리

namespace로 프로세스를 격리했지만, 아직 호스트의 파일시스템이 그대로 보인다.

이를 해결하기 위해 setup단계에서 루트 파일시스템을 변경할 필요가 있다  
이때 사용하는 syscall이 **pivot_root** 이다

pivot_root는 마운트 네임스페이스 수준에서 루트 파일시스템 자체를 교체한다

- old root를 특정 디렉토리를 옮기고, new root를 `/` 로 만든다
- 그다음 old root unmount하고 삭제하면 완전히 격리된다 (다시 못들어가기 때문)

```go
  func pivotRoot(rootfs string) {
      // rootfs를 bind mount
      syscall.Mount(rootfs, rootfs, "", syscall.MS_BIND|syscall.MS_REC, "")

      // 기존 루트를 임시 디렉토리로 이동
      putOld := filepath.Join(rootfs, "put_old")
      os.MkdirAll(putOld, 0700)
      syscall.PivotRoot(rootfs, putOld)

      // 새 루트로 이동
      os.Chdir("/")

      // proc 마운트
      syscall.Mount("proc", "/proc", "proc", 0, "")

      // 기존 루트 해제 및 정리
      syscall.Unmount("/put_old", syscall.MNT_DETACH)
      os.Remove("/put_old")
  }
```

이를 테스트하기 전에 pivot할 **rootfs**이 필요하므로 컨테이너 도구를 통해 받아오도록 한다

```bash
pjt@lima-default:~$ mkdir rootfs
pjt@lima-default:~$ nerdctl export $(nerdctl create alpine) | tar -C rootfs -xf -
pjt@lima-default:~$ ls rootfs
bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

- _nerdctl 대신 docker 명령어를 사용해도 된다_

이제 `pivotRoot` 함수를 setup 부분에 추가하여 파일시스템이 격리되는지 확인해보자

```bash
pjt@lima-default:/Users/pjt/Projects/PJT/nootainer$ go run . run /bin/sh
/ # ls
bin    dev    etc    home   lib    lib64  proc   root   sys    tmp    usr    var
```

이제 독립된 hostname, 독립된 PID 공간, 독립된 파일시스템. sudo 없이 호스트와 격리된 환경이 만들어졌다.

## 왜 Rootless여야 하는가

전통적으로 **Docker** 같은 컨테이너 런타임은 root 권한으로 실행되었다. namespace, cgroup 같은 커널 기능이 root를 요구했기 때문이다.

하지만 이는 런타임에 취약점이 있을 경우 공격자가 호스트의 root 권한을 그대로 탈취할 수 있다는 뜻이다.

반면 rootless 컨테이너는 user namespace를 통해 이 문제를 해결한다. 런타임 전체가 일반 유저 권한으로 실행되고, namespace 안에서만 root가 된다.  
런타임에 버그가 있어도 호스트에서는 일반 유저 권한이므로 피해가 제한된다.

다만 **user namespace** 자체에 대한 논란도 있다. 일반 유저가 **user namespace**를 만들면 커널의 root-only 코드 경로에 접근할 수 있게 되는데, 커널 코드에서 **namespace root**와 진짜 root의 구분을 빼먹은 부분이 있다면 namespace 탈출이 가능해진다.

실제로 이런 류의 CVE가 보고된적이 있고, 일부 배포판에서는 user namespace를 기본 비활성화하기도 했다.

- CVE-2024-1086 — netfilter(nf_tables) use-after-free. 일반 유저가 user namespace를 만들어서 netfilter에 접근, 권한 상승.
- CVE-2023-0386 — OverlayFS에서 파일 copy-up 시 UID/GID 매핑 검증을 빠뜨림. user namespace의 가짜 root로 SUID 바이너리를 만들면 진짜 root 소유가 되어버림.
- CVE-2022-0185 — filesystem context에서 heap buffer overflow. user namespace 안의 [CAP_SYS_ADMIN으로 호스트 root 탈취 + 컨테이너 탈출](https://www.aquasec.com/blog/cve-2022-0185-linux-kernel-container-escape-in-kubernetes/)

그래서 rootless 컨테이너라 하더라도 namespace 격리만으로는 충분하지 않다.

이러한 커널 공유로 인한 공격 표면을 근본적으로 줄이기 위해 [gVisor](https://github.com/google/gvisor)나 [Kata Containers](https://github.com/kata-containers) 같은 프로젝트도 존재한다.

- gVisor는 사용자 공간에서 커널 syscall을 대신 처리하고, Kata Containers는 경량 VM 안에서 컨테이너를 실행하여 호스트 커널을 직접 공유하지 않는 방식을 취한다. 하지만 이는 별도의 주제이므로 여기서는 다루지 않는다.

현재 주요 컨테이너 런타임들은 rootless 모드를 지원하고 있다.  
Podman은 처음부터 rootless를 기본으로 설계되었고, Docker는 20.10 버전부터 rootless 모드를 공식 지원한다(다만 기본 설치는
여전히 root 모드). nerdctl도 rootless를 지원한다

## 마무리

unshare 를 통한 네임스페이스 실습과 Go를 통해 실제 유사컨테이너를 만들어보았다.

**namespace**와 **pivot_root**만으로 컨테이너 수준의 격리를 구현할 수 있었지만 아직 부족한 것들이 많다

- 리소스 제한이 없다 — 컨테이너가 호스트의 CPU, 메모리를 무한히 사용할 수 있다
- 시스템 콜 제한이 없다 — reboot, kexec_load 같은 위험한 syscall을 호출할 수 있다

다음 글에서는 cgroup v2로 리소스를 제한하고, seccomp BPF로 시스템 콜을 필터링하여 보안을 강화해본다.

---

전체 소스코드는 [github](https://github.com/opjt/nootainer)에서 확인할 수 있다.

참고

- <https://www.youtube.com/watch?v=8fi7uSYlOdc>
