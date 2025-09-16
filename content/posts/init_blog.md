---
title: "블로그 요이땅"
date: 2025-09-12T08:41:49+09:00
tags: ["hugo"]
draft: false
summary: "hugo로 정적 블로그를 만들어봐요"
description: "hugo로 다시 한번 github 블로그를 시작합니다"
---

## 젠장 또 SSG 블로그야

사실 이번이 첫 블로그는 아니다

이전에도 Jekyll로 블로그를 만든 적이 있었지만, 글을 잘 쓰지 않게 되고 왠지 손이 잘 안 가더라.  
게다가 구글 SEO에 등록했는데도 글이 검색에 뜨지 않는 문제가 있어, 그 경험이 블로그에 대한 인상을 좋지 않게 남겼던 것 같다.

그래서 이참에 새롭게 시작하자는 생각으로 `hugo` 를 통해 블로그를 다시 시작해보려 한다

## why hugo?

hugo는 go로 만들어졌는데 그 이유가 전부다  
최근 go에 관심을 갖고 go를 좋게 생각하기 때문이다

~~테마는 [https://canstand.github.io/compost/](https://canstand.github.io/compost/)를 사용하였는데
개인적으로 뭔가 부족해 보이지만 심플해서 좋다  
부족한 부분은 조금씩 수정하면서 완성할 생각이다~~

- compost의 전신이라고 판단되는 `Congo`로 테마를 변경하였다

## 블로그 목적

회사를 다니면서 무언가를 기록하는 것이 매우 중요하고 값진 행위라는 것을 느낀다  
개인적으로 멋진 기술 글들을 보면서 나도 저렇게 글을 잘 쓰고 싶다는 생각도 든다  
뭐든 꾸준히 하는 것이 어렵다지만,,  
정말 어렵습니다 이번에는 잘 쓰지는 못해도 꾸준히를 목적으로 하려고 해요

며칠 간 seo 부분을 해결하지 못하면 [velog](https://velog.io/)로 넘어갈 생각도 있다  
어찌보면 이 글은 처음이자 마지막이 될 수도 있는 글이다 ㅋㅋ

## hugo로 blog 만들기
<!-- 구글 검색엔진에 제 글이 등록되지 않아요,, 이전 글이 너무 빈약하다고 판단했나봐요 -->

hugo에서 사용할 수 있는 테마는 정말 많다 [https://themes.gohugo.io/](https://themes.gohugo.io/)

이 수많은 테마 중 심플하면서 블로그로서의 기능을 할 수 있을 것 같은 몇 가지 테마 입니다.

- [https://themes.gohugo.io/themes/loveit/](https://themes.gohugo.io/themes/loveit/)
- [https://themes.gohugo.io/themes/hugo-papermod/](https://themes.gohugo.io/themes/hugo-papermod/)
- [https://themes.gohugo.io/themes/congo/](https://themes.gohugo.io/themes/congo/)

저는 이 목록에 없는 [compost](https://canstand.github.io/compost/) 테마를 사용하여 블로그를 만드려고 하였으나  
이의 전신인 [congo](https://themes.gohugo.io/themes/congo/) 를 최종적으로 선택하게 되었습니다.

본 글에서는 `hugo`의 설치방법은 따로 가이드 하지 않겠습니다.

### hugo new site

_[Congo install guide](https://jpanther.github.io/congo/docs/installation/) 를 참고하세요_

hugo로 블로그를 만드는 것은 정말 5분도 걸리지 않습니다.

``` bash
hugo new site newblog
cd newblog
hugo mod init newblog
```

- 원래 mod init 뒤에 오는 부분은 go 모듈 경로로 보통 자신의 레포지토리 주소를 씁니다

사실 이 부분만 가능하다면 이미 절반은 온 셈입니다

이후 config/_default 디렉토리를 만들어 주세요.

**config 설정**

- [download a copy](https://jpanther.github.io/congo/docs/installation/#set-up-theme-configuration-files) 로 파일을 받아주세요
- 받은 파일을 `config/_default/` 경로에 넣어주세요
- 루트 레벨(go.mod가 있는 레벨)에 있는 `hugo.toml` 은 삭제하여 주세요.

``` tree
newblog
├── assets
├── config
│   └── _default
        ├── hugo.toml
        ├── languages.en.toml
        ├── markup.toml
        ├── menus.en.toml
        ├── module.toml
        └── params.toml
```

최종적으로 위와 같은 형태가 되어야 합니다

``` bash
hugo server
```

명령어 실행 후 `localhost:1313` 를 접속하면 짜자잔~ 블로그를 확인하실 수 있습니다

### congo theme setting

_[공식 설정 가이드](https://jpanther.github.io/congo/docs/getting-started/) 를 참고하여 주세요_

블로그처럼 사용하기 위해 최소한의 설정을 설명합니다

``` tree
.
├── config
│   └── _default
├── content
│   ├── _index.md # localhost:1313/
│   └── posts
│       ├── _index.md # localhost:1313/posts/
│   └── tags
│       ├── _index.md # localhost:1313/tags/
```

``` md
---
title: ""
---
```

위와 같은 구조로 `_index.md` 파일을 3개 만들어 주세요  
`title`에 들어가는 값은 각 페이지에 접근했을 때 표기될 타이틀명입니다

`config/_default`에 있는 다양하고 디테일한 설정들은 [Congo configuration 공식문서](https://jpanther.github.io/congo/docs/configuration/)를 참고하여 주세요

### hugo new content

`hugo new content posts/new_post.md` 명령어로 블로그 글을 생성해 보세요
