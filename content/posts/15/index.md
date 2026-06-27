---
title: Lima VM의 containerd 버전 변경하기
date: 2026-06-27T09:27:16+09:00
tags: ["Lima", "Container"]
description: "메인테이너가 취약점 패치를 했어요"
# draft: true
# summary: ""
---

Lima의 장점중 하나는 컨테이너 런타임 환경을 탬플릿으로 제공해준다는 것이다.  
이말은 내가 생성할 vm의 탬플릿을 지정하면 `containerd`, `runc`, `nerdctl`이 모두 설치가 된다는 의미다

이 글은 **Lima**가 vm에 설치되는 containerd를 어떻게 관리하는지 코드 레벨에서 확인하고, 실제로 버전을 바꾸는 방법을 공유한다.

## Lima의 컨테이너런타임 설치 구조

Lima는 Containerd, runc, Buildkit을 개별적으로 설치하지 않고 **nerdctl-full** 이라는 번들 패키지를 통해 한꺼번에 설치한다.

```bash
$ limactl info | jq .defaultTemplate.containerd.archives
[
  {
    "location": "https://github.com/containerd/nerdctl/releases/download/v2.3.3/nerdctl-full-2.3.3-linux-amd64.tar.gz",
    "arch": "x86_64",
    "digest": "sha256:8d39a120d8414e3aff15ac05accf51bbbad6baf54764ae709b09087e4544c1ad"
  },
  {
    "location": "https://github.com/containerd/nerdctl/releases/download/v2.3.3/nerdctl-full-2.3.3-linux-arm64.tar.gz",
    "arch": "aarch64",
    "digest": "sha256:2322f29f451189dd790b5d7c599b4600c210ff0f2c10244308a8e6a024274066"
  }
]
```

바이너리에 내장된 기본 버전은 해당 명령어를 통해 확인할 수 있다.  
이 값은 프로젝트의 [pkg/limayaml/containerd.yaml](https://github.com/lima-vm/lima/blob/v2.1.3/pkg/limayaml/containerd.yaml) 에 저장되어 있고 `go:embed`를 통해 빌드 시에 바이너리에 구워진다. 즉 Lima 바이너리를 업그레이드하지 않으면 기본값은 바뀌지 않는다.

```go
// pkg/limayaml/defaults.go
//go:embed containerd.yaml
var defaultContainerdYAML []byte

func defaultContainerdArchives() []limatype.File {
    var containerd ContainerdYAML
    yaml.Unmarshal(defaultContainerdYAML, &containerd)
    return containerd.Archives
}
```

### 우선순위

```go
// pkg/limayaml/defaults.go:546-548
y.Containerd.Archives = slices.Concat(o.Containerd.Archives, y.Containerd.Archives, d.Containerd.Archives)
if len(y.Containerd.Archives) == 0 {
    y.Containerd.Archives = defaultContainerdArchives()
}
```

Lima의 설정 정보는 `~/.lima/{vm}/lima.yaml` 에 저장된다  
containerd.archives이 주석되어 읽어오는 값이 없으면 바이너리 내장 기본값을 사용하게 된다

```yaml
containerd:
  # Enable system-wide (aka rootful)  containerd and its dependencies (BuildKit, Stargz Snapshotter)
  # Note that `nerdctl.lima` only works in rootless mode; you have to use `lima sudo nerdctl ...`
  # to use rootful containerd with nerdctl.
  # 🟢 Builtin default: false
  system: null
  # Enable user-scoped (aka rootless) containerd and its dependencies
  # 🟢 Builtin default: true (for x86_64 and aarch64)
  user: null
#  # Override containerd archive
#  # 🟢 Builtin default: hard-coded URL with hard-coded digest (see the output of `limactl info | jq .defaultTemplate.containerd.archives`)
# archives:
# - location: "https://github.com/containerd/nerdctl/releases/download/v2.3.3/nerdctl-full-2.3.3-linux-amd64.tar.gz"
#   arch: "x86_64"
#   digest: "sha256:8d39a120d8414e3aff15ac05accf51bbbad6baf54764ae709b09087e4544c1ad"
# - location: "https://github.com/containerd/nerdctl/releases/download/v2.3.3/nerdctl-full-2.3.3-linux-arm64.tar.gz"
#   arch: "aarch64"
#   digest: "sha256:2322f29f451189dd790b5d7c599b4600c210ff0f2c10244308a8e6a024274066"
#
```

> 오픈소스의 재미는 원한다면 내부동작을 다 살펴볼 수 있다는 것이다

## VM에 번들 패키지를 전달하기

Lima는 VM 부팅에 필요한 스크립트와 아카이브를 **ISO 9660 포맷**의 가상 CD-ROM으로 만들어서 VM에 전달한다.

- 운영체제 이미지 파일은 .iso 와 같은 포맷이지만 용도가 다름

ISO 안에 들어가는 것들:

- `boot/*.sh` — provisioning 스크립트 (containerd 설치 등)
- `nerdctl-full.tgz` — nerdctl 아카이브
- `user-data`, `meta-data` — cloud-init 설정

VM이 부팅되면 cloud-init이 ISO를 마운트하고 스크립트를 실행한다.

ISO는 매번 새로 만들어지기 때문에, `lima.yaml`의 `archives`를 바꾸고 재시작하면 새 아카이브가 ISO에 반영된다.

## 설치 스크립트의 업그레이드 판단 방식

`pkg/cidata/cidata.TEMPLATE.d/boot.Linux/40-install-containerd.sh`:

```bash
tmp_extract_nerdctl="$(mktemp -d)"
tar Cxaf "${tmp_extract_nerdctl}" "${LIMA_CIDATA_MNT}"/"${LIMA_CIDATA_CONTAINERD_ARCHIVE}" bin/nerdctl

if [ ! -f "${LIMA_CIDATA_GUEST_INSTALL_PREFIX}"/bin/nerdctl ] || \
   [[ "${tmp_extract_nerdctl}"/bin/nerdctl -nt "${LIMA_CIDATA_GUEST_INSTALL_PREFIX}"/bin/nerdctl ]]; then
    # 설치 진행
    tar Cxaf "${LIMA_CIDATA_GUEST_INSTALL_PREFIX}" "${LIMA_CIDATA_MNT}"/"${LIMA_CIDATA_CONTAINERD_ARCHIVE}"
fi
```

- `! -f` : nerdctl이 없으면 설치
- `-nt` (newer than) : ISO의 nerdctl 바이너리가 설치된 것보다 **파일 수정 시각이 최신**이면 설치

버전 숫자가 아니라 **파일 타임스탬프**로 비교한다.  
따라서 다운그레이드를 실행하고 싶다면 vm에 설치된 nerdctl를 제거하면 된다

## 버전 변경 방법

### 방법 1: `lima.yaml`에 archives 직접 명시 (가장 간단)

```yaml
# lima.yaml
containerd:
  system: false
  user: true
  archives:
    - location: "https://github.com/containerd/nerdctl/releases/download/v2.3.3/nerdctl-full-2.3.3-linux-amd64.tar.gz"
      arch: "x86_64"
      digest: "sha256:..."
    - location: "https://github.com/containerd/nerdctl/releases/download/v2.3.3/nerdctl-full-2.3.3-linux-arm64.tar.gz"
      arch: "aarch64"
      digest: "sha256:..."
```

lima.yaml에서 archives에 버전을 수정 후 재기동한다.

```bash
limactl stop <instance> && limactl start <instance>
```

시작 로그에서 `Upgrading existing nerdctl` 메시지가 보이면 성공.

단, 같은 URL을 이미 받은 적 있으면 ~/Library/Caches/lima/의 캐시를 재사용하므로 재다운로드 없이 바로 설치된다.

### 방법 2: 소스 빌드 시 기본값 변경

`pkg/limayaml/containerd.yaml`을 수정하고 빌드:

```bash
# containerd.yaml 수정 후
make
./bin/limactl info | jq '.defaultTemplate.containerd.archives'  # 확인
```

이 방법은 `archives`를 명시하지 않은 모든 인스턴스의 기본값을 바꾼다.
