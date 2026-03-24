---
title: 컨테이너 이미지는 어디서 오는가?
date: 2026-03-24T21:50:14+09:00
tags: [""]
description: "docker pull 커맨드를 사용하면 어떻게 이미지를 가져올까? - rootless 컨테이너 구현하기 마지막편"
# draft: true
# summary: ""
---

전편 [격리만으로는 부족하다](../13/index.md)에서 cgroup, seccomp, capability로 컨테이너의 보안을 강화했다.
이것으로 얼추 rootless 컨테이너 런타임의 핵심 구현은 끝났다.

하지만 한 가지 불편한점이 있는데. 매번 컨테이너를 실행하려면 rootfs를 직접 준비해야 한다.  
지금까지는 `docker export`로 기존 컨테이너의 파일시스템을 뽑아서 사용했다.

- 컨테이너를 만들기 위해 Docker에 의존하고 있는 셈이다.

물론 alpine 같은 배포판은 공식 사이트에서 mini rootfs tar를 받을 수도 있지만, 이미지마다 찾아서 수동으로 받아야 한다는 불편함은 마찬가지다.

이번 편에서는 `docker pull`이 실제로 무엇을 하는지 들여다보고, **OCI 표준**을 따라 Docker Hub에서 직접 이미지를 가져오는 기능을 구현한다.

## OCI 표준

### OCI란

OCI (Open Container Initiative)는 컨테이너 관련 **표준**을 정의하는 프로젝트다.

Docker가 컨테이너 생태계를 사실상 독점하던 시절, 이미지 포맷과 런타임이 Docker라는 하나의 벤더에 종속되어 있었다. 이 문제를 해결하기 위해 Docker, Google, Red Hat 등이 모여 OCI를 설립했고, 컨테이너의 핵심 요소들을 개방형 표준으로 정의했다.

OCI는 세 가지 핵심 스펙을 정의한다:

- [OCI Runtime Spec](https://github.com/opencontainers/runtime-spec) — 컨테이너를 어떻게 실행할 것인가. [runc](https://github.com/opencontainers/runc)가 대표적인 구현체다
- [OCI Image Spec](https://github.com/opencontainers/image-spec) — 컨테이너 이미지의 구조. manifest, config, layer의 포맷을 정의한다
- [OCI Distribution Spec](https://github.com/opencontainers/distribution-spec) — 레지스트리와 이미지를 주고받는 HTTP API를 정의한다

덕분에 Docker Hub에 올린 이미지를 Podman으로 실행할 수 있고, GitHub Container Registry의 이미지를 Docker로 가져올 수 있다. 모두 같은 표준을 따르기 때문이다.

이번 글에서는 **Image Spec**과 **Distribution Spec**을 다룬다. 이미지가 어떤 구조로 되어 있는지, 레지스트리에서 어떻게 가져오는지에 대해 알아보자

### 이미지의 구조

컨테이너 이미지는 하나의 큰 파일이 아니다. **레이어(layer)들의 묶음**이다.

예를 들어 alpine 이미지는 base layer 하나로 구성되지만, 일반적인 애플리케이션 이미지는 여러 레이어가 쌓여있다:

```text
Layer 1: alpine base            (기본 파일시스템)
Layer 2: RUN apk add curl       (패키지 설치)
Layer 3: COPY app /app          (애플리케이션 코드)
```

**Dockerfile**의 각 명령이 하나의 레이어가 된다. 레이어는 이전 레이어 위의 **변경분만** 담고 있다. 그래서 base image가 같은 여러 이미지가 있을 때, Layer 1은 한 번만 다운로드하면 나머지 이미지에서 재사용할 수 있다. `docker pull`이 "Already exists"를 출력하며 건너뛰는 레이어가 바로 이것이다.

이 레이어들을 관리하는 구조는 세 단계로 되어 있다:

```text
Manifest Index (Fat Manifest)
├── Manifest (linux/amd64)
│   ├── Layer 1 (sha256:abc...)
│   ├── Layer 2 (sha256:def...)
│   └── Config  (sha256:789...)
├── Manifest (linux/arm64)
│   ├── Layer 1 (sha256:111...)
│   ├── Layer 2 (sha256:222...)
│   └── Config  (sha256:333...)
└── Manifest (linux/s390x)
    └── ...
```

- **Manifest Index** — 최상위 목록이다. `alpine:latest`라는 하나의 태그 뒤에 arm64, amd64 등 여러 플랫폼의 manifest가 존재한다. 같은 이미지 이름이라도 아키텍처에 따라 실제 내용이 다르기 때문에, 이 인덱스가 플랫폼별 manifest를 가리키는 역할을 한다
- **Manifest** — 특정 플랫폼용 이미지의 실제 구성 정보다. 어떤 레이어들로 이루어져 있는지, config는 무엇인지를 담고 있다
- **Layer** — 파일시스템의 변경분이다. gzip으로 압축된 tar 아카이브 형태로 저장된다

OCI 스펙에서 각 요소의 종류는 **mediaType**으로 구분한다. HTTP의 Content-Type과 같은 개념이다:

| 요소           | mediaType                                     |
| -------------- | --------------------------------------------- |
| Manifest Index | `application/vnd.oci.image.index.v1+json`     |
| Manifest       | `application/vnd.oci.image.manifest.v1+json`  |
| Layer          | `application/vnd.oci.image.layer.v1.tar+gzip` |

그리고 모든 요소는 **digest** (`sha256:...`)로 식별된다. digest는 해당 내용의 SHA256 해시값이다.  
내용이 같으면 반드시 같은 digest를 갖고, 내용이 다르면 반드시 다른 digest를 갖는다.  
이를 **content-addressable**이라 한다. 파일 이름이나 경로가 아니라 내용 자체가 주소가 되는 방식이다.

이 덕분에 레이어 중복 제거가 자연스럽게 이루어진다. 두 이미지가 같은 base layer를 쓰면 digest가 같으므로, 한 번만 저장하면 된다.

## Docker Registry API

OCI Distribution Spec을 기반으로 Docker Hub에서 이미지를 가져오는 과정을 살펴보자.

### 전체 흐름

```text
nootainer pull alpine
    │
    ▼
GET auth.docker.io/token          ── 인증 토큰 획득
    │
    ▼
GET /v2/library/alpine/manifests/latest  ── Manifest Index 조회
    │
    ▼
linux/arm64 manifest의 digest 추출
    │
    ▼
GET /v2/library/alpine/manifests/{digest}  ── Manifest 조회
    │
    ▼
레이어 목록 추출
    │
    ▼
GET /v2/library/alpine/blobs/{digest}  ── 각 레이어 다운로드
    │
    ▼
gzip 해제 → tar 추출 → rootfs_alpine/
```

크게 세 종류의 API를 사용한다: 인증, manifest 조회, blob 다운로드. 하나씩 살펴보자.

### 인증

Docker Hub는 공개 이미지라도 인증 토큰을 요구한다. 로그인이 필요한 건 아니고, 익명으로 토큰을 발급받는 방식이다.

```bash
curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/alpine:pull" | jq .token -r
```

`scope`에 어떤 레포지토리에 대해 어떤 권한(`pull`)을 요청하는지를 명시한다. 실행하면 긴 JWT 토큰 문자열이 반환된다. 이후 모든 레지스트리 API 요청에 `Authorization: Bearer <token>` 헤더를 붙여서 요청하면 된다.

### Manifest Index 조회

발급받은 토큰으로 manifest를 요청해보자:

```bash
TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/alpine:pull" | jq .token -r)

curl -s "https://registry-1.docker.io/v2/library/alpine/manifests/latest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.oci.image.index.v1+json" | jq .
```

응답으로 Manifest Index가 돌아온다:

```json
{
  "manifests": [
    {
      "digest": "sha256:abc...",
      "platform": { "architecture": "amd64", "os": "linux" }
    },
    {
      "digest": "sha256:def...",
      "platform": { "architecture": "arm64", "os": "linux" }
    },
    {
      "digest": "sha256:ghi...",
      "platform": { "architecture": "unknown" }
    }
  ]
}
```

여기서 살펴볼 점은 `architecture`가 `unknown`인 manifest가 있다는 것이다.  
이것은 **attestation manifest**로, 실제 컨테이너 이미지가 아니라 이미지의 **보안 메타데이터**를 담고 있다.

```json
{
    "annotations": {
        "com.docker.official-images.bashbrew.arch": "amd64",
        "vnd.docker.reference.digest": "sha256:59855d3dceb3ae53991193bd03301e082b2a7faa56a514b03527ae0ec2ce3a95",
        "vnd.docker.reference.type": "attestation-manifest"
    },
    "digest": "sha256:fe2385f276937dcf780967a5385767fd34b34580c8ed8d303a0cd1485a692635",
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "platform": {
    "architecture": "unknown",
    "os": "unknown"
    },
    "size": 838
},
```

이 안에는 **SBOM (Software Bill of Materials)** 이 포함되어 있는데,  
SBOM은 말 그대로 소프트웨어의 부품 목록으로 이 이미지에 어떤 패키지가 들어있는지, 어떤 버전인지, 어떻게 빌드되었는지를 기록한 명세서다.  
특정 라이브러리에 보안 취약점이 발견되었을 때, SBOM이 있으면 어떤 이미지가 영향을 받는지 바로 파악할 수 있다.

`docker pull`을 하면 단순히 파일시스템만 가져오는 것이 아닌, 그 안에 공급망 보안을 위한 데이터까지 함께 배포되고 있었다.

현재 구현에서는 `linux/{GOARCH}`에 매칭되는 manifest만 찾으므로, 이 attestation manifest는 자연스럽게 건너뛰게 된다.

### Manifest 조회

Manifest Index에서 현재 아키텍처(예: `arm64`)에 맞는 digest를 찾았다면, 그 digest로 다시 요청한다:

```bash
DIGEST="sha256:59855d3dceb3ae53991193bd03301e082b2a7faa56a514b03527ae0ec2ce3a95"  # Manifest Index에서 찾은 arm64 digest

curl -s "https://registry-1.docker.io/v2/library/alpine/manifests/$DIGEST" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.oci.image.manifest.v1+json" | jq .
```

응답으로 해당 플랫폼의 Manifest를 받는다. 여기에 아래와 같은 레이어 목록이 들어있다

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "config": {
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "digest": "sha256:a40c03cbb81c59bfb0e0887ab0b1859727075da7b9cc576a1cec2c771f38c5fb",
    "size": 611
  },
  "layers": [
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "digest": "sha256:589002ba0eaed121a1dbf42f6648f29e5be55d5c8a6ee0f8eaa0285cc21ac153",
      "size": 3861821
    }
  ],
  "annotations": {
    "com.docker.official-images.bashbrew.arch": "amd64",
    "org.opencontainers.image.base.name": "scratch",
    "org.opencontainers.image.created": "2026-01-28T01:18:02Z",
    "org.opencontainers.image.revision": "a037d70ba44f91b00dff940019d29a28f7ba1265",
    "org.opencontainers.image.source": "https://github.com/alpinelinux/docker-alpine.git#a037d70ba44f91b00dff940019d29a28f7ba1265:x86_64",
    "org.opencontainers.image.url": "https://hub.docker.com/_/alpine",
    "org.opencontainers.image.version": "3.23.3"
  }
}
```

alpine은 경량 이미지라 레이어가 하나뿐이지만, 일반적인 이미지는 여러 레이어가 나열된다.

### Blob 다운로드

각 레이어의 digest로 blob API를 호출하면 실제 데이터를 받을 수 있다:

```bash
LAYER_DIGEST="sha256:589002ba0eaed121a1dbf42f6648f29e5be55d5c8a6ee0f8eaa0285cc21ac153"  # Manifest에서 찾은 레이어 digest

curl -sL "https://registry-1.docker.io/v2/library/alpine/blobs/$LAYER_DIGEST" \
  -H "Authorization: Bearer $TOKEN" \
  -o layer.tar.gz

tar -tzf layer.tar.gz | head
# bin/
# bin/arch
# bin/ash
# bin/base64
# bin/bbconfig
# ...
```

- 응답은 gzip 압축된 tar 아카이브다. 이걸 풀면 해당 레이어의 파일시스템(rootfs)이 나온다.

## 구현

이제 위 과정을 Go 코드로 구현해보자. `registry.go` 파일을 생성하여 작성한다.

### 데이터 구조

먼저 API 응답을 파싱할 구조체들을 정의한다. OCI 스펙의 구조를 그대로 반영하고 있다

- <https://github.com/opencontainers/distribution-spec/blob/main/conformance/image.go> 참고

```go
const (
    authURL     = "https://auth.docker.io/token"
    registryURL = "https://registry-1.docker.io"
)

// Manifest Index: 멀티 아키텍처 manifest 목록
type manifestIndex struct {
    Manifests []platformManifest `json:"manifests"`
}

type platformManifest struct {
    Digest   string   `json:"digest"`
    Platform platform `json:"platform"`
}

type platform struct {
    Architecture string `json:"architecture"`
    OS           string `json:"os"`
}

// Manifest: 특정 플랫폼의 레이어 목록
type manifest struct {
    Layers []layer `json:"layers"`
}

type layer struct {
    MediaType string `json:"mediaType"`
    Digest    string `json:"digest"`
    Size      int64  `json:"size"`
}
```

### 인증

이미지를 요청하기 전에 Docker Hub의 토큰 엔드포인트에 요청하여 Bearer 토큰을 발급받는다

```go
func getAuthToken(image string) (string, error) {
    url := fmt.Sprintf("%s?service=registry.docker.io&scope=repository:%s:pull",
        authURL, image)

    resp, err := http.Get(url)
    if err != nil {
        return "", fmt.Errorf("token request failed: %w", err)
    }
    defer resp.Body.Close()

    var token tokenResponse
    if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
        return "", fmt.Errorf("token decode failed: %w", err)
    }

    return token.Token, nil
}
```

이후 모든 레지스트리 요청에 이 토큰을 붙이는 헬퍼 함수를 두어 사용하도록 한다

```go
func registryG어et(url, token string) (*http.Response, error) {
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }
    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Accept", "application/vnd.oci.image.manifest.v1+json")
    return http.DefaultClient.Do(req)
}
```

- `Accept` 헤더에 OCI manifest의 mediaType을 지정한다. 만약 명시하지 않으면 레지스트리가 Docker v2 포맷으로 응답할 수 있다.

### Manifest 조회

manifest 조회는 앞서 설명한 대로 3단계를 거친다

```go
func getManifest(repoName, tag, token string) (*manifest, error) {
    // 1단계: Manifest Index 가져오기
    url := fmt.Sprintf("%s/v2/%s/manifests/%s", registryURL, repoName, tag)
    resp, err := registryGet(url, token)
    if err != nil {
        return nil, fmt.Errorf("manifest index request failed: %w", err)
    }
    defer resp.Body.Close()

    var index manifestIndex
    json.NewDecoder(resp.Body).Decode(&index)

    // 2단계: 현재 아키텍처에 맞는 digest 찾기
    var digest string
    for _, m := range index.Manifests {
        if m.Platform.Architecture == runtime.GOARCH && m.Platform.OS == "linux" {
            digest = m.Digest
            break
        }
    }
    if digest == "" {
        return nil, fmt.Errorf("no linux/%s manifest found", runtime.GOARCH)
    }

    // 3단계: 해당 플랫폼의 Manifest 가져오기
    url = fmt.Sprintf("%s/v2/%s/manifests/%s", registryURL, repoName, digest)
    resp2, err := registryGet(url, token)
    if err != nil {
        return nil, fmt.Errorf("manifest request failed: %w", err)
    }
    defer resp2.Body.Close()

    var m manifest
    json.NewDecoder(resp2.Body).Decode(&m)

    return &m, nil
}
```

- `runtime.GOARCH`는 현재 바이너리가 빌드된 아키텍처를 반환한다. arm64 머신에서 빌드하면 `"arm64"`, amd64에서 빌드하면 `"amd64"`가 된다. 하드코딩 없이 환경에 맞는 이미지를 자동으로 선택할 수 있다.

### 레이어 다운로드 및 추출

각 레이어는 gzip 압축된 tar 아카이브다. HTTP 응답 스트림을 바로 gzip 해제하고, tar 엔트리를 순회하면서 파일을 추출한다:

```go
func downloadAndExtractLayer(repoName, digest, token, destDir string) error {
    url := fmt.Sprintf("%s/v2/%s/blobs/%s", registryURL, repoName, digest)

    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return err
    }
    req.Header.Set("Authorization", "Bearer "+token)

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    // HTTP 응답 > gzip 해제 > tar 읽기 (스트리밍)
    gr, _ := gzip.NewReader(resp.Body)
    defer gr.Close()
    tr := tar.NewReader(gr)

    for {
        hdr, err := tr.Next()
        if err == io.EOF {
            break
        }
        target := filepath.Join(destDir, hdr.Name)

        switch hdr.Typeflag {
        case tar.TypeDir:
            os.MkdirAll(target, os.FileMode(hdr.Mode))
        case tar.TypeReg:
            os.MkdirAll(filepath.Dir(target), 0755)
            f, _ := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC,
                os.FileMode(hdr.Mode))
            io.Copy(f, tr)
            f.Close()
        case tar.TypeSymlink:
            os.Remove(target)
            os.Symlink(hdr.Linkname, target)
        case tar.TypeLink:
            os.Remove(target)
            os.Link(filepath.Join(destDir, hdr.Linkname), target)
        }
    }
    return nil
}
```

tar 아카이브에는 여러 종류의 파일이 들어있고, 각각 다르게 처리해야 한다:

- **디렉토리** (`TypeDir`) — 경로를 생성한다
- **일반 파일** (`TypeReg`) — 파일을 생성하고 내용을 복사한다
- **심볼릭 링크** (`TypeSymlink`) — `/lib/libc.so` → `libc.so.6` 같은 링크를 만든다
- **하드 링크** (`TypeLink`) — 같은 파일 데이터를 가리키는 또 다른 이름을 만든다

레이어는 **순서대로** 같은 디렉토리에 추출된다. 나중 레이어의 파일이 이전 레이어의 파일을 덮어쓰면서 최종 rootfs가 완성된다. Dockerfile에서 아래쪽 명령이 위쪽 결과 위에 쌓이는 것과 같은 원리다.

코드를 단순하게 유지하기 위해 이번 구현에서는 몇 가지 디테일을 생략했다

- **Whiteout 파일**: OCI 스펙에서 이전 레이어의 파일을 "삭제"할 때는 `.wh.` 접두사가 붙은 whiteout 파일을 사용한다. 예를 들어 Layer 1에 `/app/config.json`이 있고 Layer 2에서 이를 삭제하면, Layer 2의 tar 안에 `.wh.config.json`이라는 빈 파일이 들어있다. 현재 구현에서는 이를 처리하지 않아 whiteout 파일이 그대로 생성된다.
- **디바이스 노드**: tar에는 `/dev/null` 같은 디바이스 노드(`TypeChar`, `TypeBlock`)도 포함될 수 있는데, rootless 환경에서는 `mknod` 권한이 없어 생성이 실패한다. 현재 코드가 기본 파일 타입만 처리하는 이유이기도 하다.
- **물리적 병합 vs OverlayFS**: 지금은 직관적인 이해를 위해 모든 레이어를 하나의 디렉토리에 물리적으로 합치고 있다. 실제 런타임은 각 레이어를 독립된 디렉토리에 저장한 뒤, 컨테이너 실행 시 커널의 OverlayFS로 논리적으로 합쳐서 보여준다. (이렇게 해야 레이어 단위 캐싱과 재사용이 가능하기 때문)

### pull 플로우

```go
func pull(image, tag string) {
    repoName := "library/" + image

    token, err := getAuthToken(repoName)
    if err != nil {
        log.Fatal("auth failed:", err)
    }
    fmt.Println("token acquired")

    m, err := getManifest(repoName, tag, token)
    if err != nil {
        log.Fatal("manifest failed:", err)
    }
    fmt.Printf("found %d layer(s)\n", len(m.Layers))

    destDir := filepath.Join("rootfs_" + image)
    os.MkdirAll(destDir, 0755)

    for i, l := range m.Layers {
        fmt.Printf("downloading layer %d/%d: %s\n",
            i+1, len(m.Layers), l.Digest[:25]+"...")
        if err := downloadAndExtractLayer(repoName, l.Digest, token, destDir); err != nil {
            log.Fatal("layer extract failed:", err)
        }
    }

    fmt.Printf("image extracted to %s/\n", destDir)
}
```

`library/` 접두사는 Docker Hub의 네이밍 규칙이다. `alpine`, `nginx` 같은 공식 이미지는 실제로 `library/alpine`, `library/nginx`라는 이름으로 레지스트리에 저장되어 있다.

추출된 rootfs는 `rootfs_alpine/` 같은 디렉토리에 저장되고, 기존의 `container` 함수가 이 경로를 사용하여 컨테이너를 실행한다.

```go
func main() {
    switch os.Args[1] {
    case "run":
        run()
    case "child":
        child()
    case "container":
        container()
    case "pull":
        image := os.Args[2]
        tag := "latest"
        if len(os.Args) > 3 {
            tag = os.Args[3]
        }
        pull(image, tag)
    default:
        log.Fatal("unknown command")
    }
}
```

`main.go`에서 pull 서브 커맨드를 연결해주면 준비는 끝났다

## 테스트

```bash
pjt@lima-default:~$ go run . pull alpine
token acquired
found 1 layer(s)
downloading layer 1/1: sha256:d8ad8cd72600f46cc0...
image extracted to rootfs_alpine/
```

```bash
pjt@lima-default:~$ go run . run alpine /bin/sh
/ # cat /etc/os-release
NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.23.3
PRETTY_NAME="Alpine Linux v3.23"
HOME_URL="https://alpinelinux.org/"
BUG_REPORT_URL="https://gitlab.alpinelinux.org/alpine/aports/-/issues"
/ # ls
bin    dev    etc    home   lib    ...
```

수동으로 rootfs를 준비할 필요 없이, Docker Hub에서 이미지를 가져와 바로 컨테이너를 실행할 수 있게 되었다.

## 마무리

3편에 걸쳐 rootless 나름의 컨테이너 런타임을 만들었다.

- **1편**: namespace + pivot_root로 프로세스를 **격리**
- **2편**: cgroup + seccomp + capability로 리소스를 **제한**하고 syscall을 **필터링**
- **3편**: OCI 표준을 따라 Docker Hub에서 이미지를 **가져오기**

`docker run`이라는 한 줄의 명령어 뒤에는 namespace 분리, cgroup 위임, seccomp BPF 필터, capability drop, OCI 레지스트리 인증과 manifest 파싱, 레이어 추출이 숨어있었다.  
컨테이너는 **마법**이 아니라 리눅스 커널이 제공하는 기능들의 조합이었고, 그 각각을 직접 호출하면서 "왜 이런 구조인지"를 이해할 수 있었다.

물론 지금껏 구현한 코드는 프로덕션 런타임과는 거리가 멀다. 네트워크 브릿지도 없고, 이미지 캐싱도 없고, 다운로드한 blob의 SHA256 해시를 검증하여 변조나 손상을 탐지하는 digest 검증도 빠져있다.

하지만 이 시리즈의 목적은 완성도 높은 런타임을 만드는 것이 아니라, 컨테이너가 어떻게 동작하는지를 **밑바닥부터 이해하는 것**이었다.

> 바퀴를 굳이 다시 발명할 필요는 없지만 바퀴에 대해 잘 알고 있으면 더 잘 굴릴 수 있지 않을까 싶다

이번에 직접 컨테이너를 구현하면서 느낀 것은,  
나는 내가 컨테이너를 좋아하는 줄 알았는데 어쩌면 리눅스를 좋아하는 거였을지도 모르겠다는 생각이 든다

---

프로젝트 전체코드 : <https://github.com/opjt/nootainer>
