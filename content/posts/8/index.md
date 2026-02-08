---
title: 고루틴 아는 척 하기
date: 2026-02-08T12:37:21+09:00
tags: ["Go"]
description: "고루틴이 뭐에요, Go goroutine"
# draft: true
# summary: ""
---

Go를 사용하는 이유 중 가장 큰 이유는 마스코트가 귀여운 것도 있지만,  
고루틴을 사용하여 프로그래밍의 동시성을 쉽게 구현할 수 있기 때문이다

Go Team에서 잘 만들어 준 기능은 개발자는 잘 사용하면 되지만 Go를 좋아하는 사람 입장으로서

Go를 전도할 때

> 고루틴이 뭐에요?

정도에 대답할 수 있는 정도는 되야하지 않겠는가?

## 고루틴?

goroutine은 go런타임이 사용자 공간에서 관리(스케줄링)하는 실행 단위이다.

고루틴 특징으로는 OS 스레드와 달리 2KB 로 매우 작은 크기를 지닌다고 알려져 있는데  
초기`init` 스택이 매우 작게 시작하며(보통 수 KB), 함수 호출이 깊어지면 스택 크기도 증가한다.

고루틴의 특징으로는 다음과 같다.

- Go 런타임이 고루틴의 생명주기와 스케줄링을 관리한다.
- M:N 스케줄링 모델을 사용하여 다수의 고루틴을 제한된 OS 레벨 스레드에 매핑함으로써, 스레드 생성 및 컨텍스트 스위칭 비용을 줄인다.

## Go Runtime Scheduler

런타임 스케쥴러는 Go 프로그램 실행되는 시점에 같이 실행되며, goroutine 을 효율적으로 스케쥴링 하는 역할을 지닌다.

### GMP 모델

**GMP** 는 Go 런타임 스케줄러 핵심 구조이다.

간단하게 G.M.P 에 알아보면

- **G**(Goroutine):
  - Go 코드가 실행되는 최소 단위로 고루틴을 말함.
  - [g Struct](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/runtime2.go#L473)
- **M**(Machine):
  - 워커 스레드, 실제 OS 스레드이다.
  - G가 실행되기 위해서는 `M머신`이 필요하다
  - [m Struct](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/runtime2.go#L618)
- **P**(Processor):
  - 실행에 필요한 자원(context)를 지닌 추상적인 프로세서이다.
  - `P`는 `G고루틴`를 `M머신`에 연결해주는 역할을 함.
  - 최대 `GOMAXPROCS` 개수 만큼 지닐 수 있다.
    - 실행 환경의 논리 CPU 개수를 기본값으로 한다. (GOMAXPROCS 환경변수를 통해 설정할 수 있음)
  - [p Struct](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/runtime2.go#L772)

![gmp.png](./gmp.png)

- P가 있어야 반드시 M이 일을 하고
- G는 반드시 P를 통해 M에서 실행된다

### 고루틴은 어떻게 스케줄링되는가?

`go f()`를 호출하면 컴파일 타임에  
`runtime.newproc` 호출로 변환된다.

```go
// Create a new g running fn.
// Put it on the queue of g's waiting to run.
// The compiler turns a go statement into a call to this.
func newproc(fn *funcval) {
    gp := getg()
    pc := sys.GetCallerPC()
    systemstack(func() {
        newg := newproc1(fn, gp, pc, false, waitReasonZero)

        pp := getg().m.p.ptr()
        runqput(pp, newg, true)

        if mainStarted {
            wakep()
        }
    })
}
```

> [https://go.dev/src/runtime/proc.go](https://go.dev/src/runtime/proc.go) 참고

해당 코드를 살펴보면 `runqput` 함수를 통해 고루틴을 넣어주는 것을 볼 수 있다.  
runtime/proc.go의 모든 소스코드를 분석할 수도 있겠지만, 아는 척 하기 위해서 흐름만 파악하도록 한다

```go
// runqput tries to put g on the local runnable queue.
// If next is false, runqput adds g to the tail of the runnable queue.
// If next is true, runqput puts g in the pp.runnext slot.
// If the run queue is full, runnext puts g on the global queue.
// Executed only by the owner P.
func runqput(pp *p, gp *g, next bool) {
...
}
```

`runqput` 함수의 주석을 살펴보면 실행 가능한 local queue에 고루틴을 넣는다는 것을 알 수 있다.

### LRQ와 GRQ

#### LRQ (Local Run Queue)

LRQ는 P가 실행 가능한 G를 모아놓은 Queue다.

**P**의 [구조체](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/runtime2.go#L802)를 살펴보면

저장할 수 있는 큐 형태가 있는 것을 볼 수 있다.

```go
type p struct {
    //... 생략
    runqhead uint32
    runqtail uint32
    runq     [256]guintptr //최대 256개
}
```

### GRQ (Global Run Queue)

- LRQ가 가득 찼을 때 사용는 전역 큐
- 모든 P가 접근 가능.

#### 왜 LRQ가 필요할까?

만약 LRQ가 존재하지 않고 GRQ만 사용했다면, 모든 **P**가 GRQ에 접근하게 된다 이럴 경우

- 공유자원을 보호하기 위해 mutex를 사용하게 되고 g 생성, g 스케줄링, 컨텍스트 스위칭을 할 때마다 lock,unlock이 반복되어 성능 저하
- cache locality(캐시 지역성) 효율 떨어짐
  - P1이 가져온 고루틴이 P2에서 놀던 놈이면 P1이 있는 CPU 코어의 캐시에는 이 고루틴이 필요로 하는 데이터가 없기 때문.
- 결국 스케줄링 비용이 작업 비용보다 커짐

### 스케줄러 세부 동작

#### runnext: 바로 실행시키는 고루틴

P마다 존재하는 **LRQ**는 일반적인 큐인 것처럼 보이지만 내부 로직을 살펴보면 [proc.go/runcqput](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/proc.go#L7478)

```go
func runqput(pp *p, gp *g, next bool) {
    // 생략 ...
    if next {
    retryNext:
        oldnext := pp.runnext
        if !pp.runnext.cas(oldnext, guintptr(unsafe.Pointer(gp))) {
            goto retryNext
        }
        if oldnext == 0 {
            return
        }
        // Kick the old runnext out to the regular run queue.
        gp = oldnext.ptr()
    }
}
```

next 조건에 따라 들어온 고루틴을 일반 대기열(LRQ)의 맨 뒤가 아니라 특별한 곳(`runnext`)으로 이동 시켜버리는 로직이 있다

이는 가장 최근에 들어온 고루틴이 가장 높은 실행 우선순위를 받는 로직으로  
Go 스케줄러가 이 고루틴은 바로 실행시키는 것이 성능상 이점(지역성 캐시)이 있을 경우 실행된다.

- 예를 들어 고루틴 A가 고루틴 B를 생성하는 경우, B는 A가 다루던 메모리 영역을 공유하거나 이어서 사용할 확률이 높기 때문(캐시 히트 높아짐)

실제로 아래 코드를 실행시켜보면 9가 먼저 출력되고 0부터 8까지 출력되는 것을 확인할 수 있다.

```go
func main() {

    runtime.GOMAXPROCS(1) // p를 1로 제한합니다.

    wg := &sync.WaitGroup{}

    for i := range 20 {
        wg.Add(1)
        go func(i int, t time.Time) {
            fmt.Println(i, t.String())
            wg.Done()
        }(i, time.Now())
    }

    wg.Wait()
}
```

```bash
# 실행 결과.
9 2026-02-08 16:13:46.34096 +0900 KST m=+0.000244043
0 2026-02-08 16:13:46.340905 +0900 KST m=+0.000189043
1 2026-02-08 16:13:46.340951 +0900 KST m=+0.000234584
2 2026-02-08 16:13:46.340952 +0900 KST m=+0.000235376
3 2026-02-08 16:13:46.340957 +0900 KST m=+0.000240126
4 2026-02-08 16:13:46.340957 +0900 KST m=+0.000240876
5 2026-02-08 16:13:46.340958 +0900 KST m=+0.000241251
6 2026-02-08 16:13:46.340958 +0900 KST m=+0.000241709
7 2026-02-08 16:13:46.340959 +0900 KST m=+0.000242918
8 2026-02-08 16:13:46.34096 +0900 KST m=+0.000243501
```

#### work stealing

Go 스케줄러는 P마다 LRQ를 가지고 대부분의 고루틴을 처리한다.

하지만 P1은 LRQ가 비어있고, P2는 가득차있다면?

똑똑이 스케줄러는 바로 P2의 고루틴을 도둑질하여 도와준다.

[proc.go/runqsteal](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/proc.go#L7730)

```bash
P A (idle)
  ↓
findRunnable
  ↓
stealWork
  ↓
for each P B
      ↓
   runqsteal
      ↓
   B의 LRQ 절반 가져옴
   A의 LRQ에 push
```

`findRunnable` 함수를 확인해보면 스틸 로직 외에도 효율적으로 고루틴을 돌리기 위한 로직들을 살펴볼 수 있다.

#### Syscall block 과 handoff

고루틴이 CPU Bound 작업만 한다면 스케줄링은 비교적 단순하겠지만, 고루틴을 사용하는 상황은 그렇게 호락호락하지 않다

보통은 파일 읽기 같은 시스템 콜(syscall)을 호출하게 되면 그 고루틴을 실행하던 `M머신`이 함께 블락된다

이럴 때 스케쥴러는 P의 다른 고루틴들이 블락되는 것을 방지하기 위해 M1과 잡고있는 G를 함께 분리(handoff)시켜버린다.

P는 M1이 없어졌기 때문에 스케쥴러는 idle상태인 다른 M2을 찾아 P에게 쥐어준다

- idle상태인 M이 없을 경우 새롭게 생성시킴

이후 시스템 콜을 마치고 돌아오면 ([proc.go/exitsyscall](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/proc.go#L4883), 참고)

- 원래 쓰던 P가 있으면 바로 재결합.
- 없으면 G를 스케줄러에게 위임한다

이 때문에 시스템 콜 블로킹이 발생하면 1개의 고루틴마다 1개의 스레드를 찍어낸다.

#### Netpoller

위에서 설명한 시스템 콜 방식대로면, 수만 개의 동시 접속을 처리하는 웹 서버는 수 만개의 스레드(M)을 생성해야 하고  
결국 메모리 부족(OOM)으로 터지게 될 것이다.

- go에서 발생시킬 수 있는 스레드는 최대 만개이다. [sched.maxmcount](https://github.com/golang/go/blob/release-branch.go1.26/src/runtime/proc.go#L863)

하지만 Go는 그렇게 허술하지 않다 이때 사용하는 것이 **Netpoller**이다

고루틴이 네트워크 IO를 시도하면, 일반 시스템콜 처럼 머신을 통째로 블락시키지 않는다  
대신 해당 고루틴(G)는 Netpoller 라는 별도의 공간에 분리되고, M은 즉시 다른 G를 실행하러 떠난다.

이때 Netpoller는 내부적으로 OS의 `비동기 I/O 이벤트 알림`(epoll(Linux), kqueue(BSD), iocp(Window) 등 )을 사용한다

- 핵심 원리는 응답이 오면 이벤트를 보내 스케쥴러가 다시 G를 데리고 갈 수 있도록 한다.

```go
func main() {
    c := make(chan bool)
    for i := 0; i < 1000; i++ {
        go func(c chan bool) {
            fmt.Println("block() enter")
            var s1 string
            _, _ = fmt.Scan(&s1)

            c <- true
        }(c)
    }
    for i := 0; i < 1000; i++ {
        _ = <-c
    }
}
```

![netpoll.png](./netpoll.png)

따라서 위에 코드를 실행해도 스레드는 12개 밖에 사용하지 않는다.

## 마무리

그 외에도 스케줄링 공평성을 위해 61번째마다 GRQ를 읽는 로직이라던지, 너무 오래실행되는 고루틴을 선점하는 로직 등

고루틴 박사가 되기 위해선 하루이틀로는 부족하다.. 하지만 위에 있는 내용들만으로도 충분히 아는 **척**은 할 수 있으리라 생각된다.

## 참조

- <https://github.com/golang/go>
- <https://ykarma1996.tistory.com/188> - 고루틴의 동작 원리에 관하여
- <https://dingyu.dev/posts/gmp/#netpoller-m> - 고루틴 1억 개 돌려도 괜찮을까?
- <https://changhoi.kim/posts/go/go-scheduler/> - Go Scheduler
- <https://www.youtube.com/watch?v=wQpC99Xu1U4> - [GopherCon 2021: Queues, Fairness, and The Go Scheduler - Madhav Jivrajani]
- <https://ssup2.github.io/blog-software/docs/theory-analysis/golang-goroutine-scheduling/>
- <https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part2.html>

본 글은 Go 1.26 버전을 기준으로 작성되었습니다
