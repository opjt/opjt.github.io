---
title: "[GITHUB-BLOG] 포스트 페이지네이션 수정"
toc: false
toc_sticky: true
toc_label: "Getting Started"
tags: jekyll
published: true
categories:
- github-blog
---

<br> 
``` 
modified:   _data/ui-text.yml
modified:   _includes/post_pagination.html
modified:   _sass/minimal-mistakes/_custom.scss
modified:   _sass/minimal-mistakes/_navigation.scss
```

**기존 페이지네이션**
![image](https://github.com/opjt/opjt.github.io/assets/57663597/5689b480-2580-4aa9-ac4e-f3b2aa0c4a83)

**변경 페이지네이션**
![image](https://github.com/opjt/opjt.github.io/assets/57663597/5c165568-21e5-452b-932b-7896c69b66ff)


```css
.pagination {
    display: flex;
    justify-content: space-between;
    column-gap: 0.5em;
}
.pagination--pager {
    padding: 0.5em 1em;
    
    border: inherit;
    background-color: #f7f7f7;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
}

//모바일 시
@media (max-width: 767px) {
    .pagination--pager {
        width: 100%;
    }
    .pagination {
        flex-direction: column;
        row-gap: 0.5em;
    }
}
```

기존 테마의 포스트 페이지네이션 부분이 너무 구리다고 생각들어 어느정도 css를 수정하였다  
다른사람이 만든 테마를 사용하다보니 파일이 어디에 있는지도 모르고 항상 찾는데 시간이 걸려서 포스트로 기록한다   
_custom.scss 파일을 이용하여 커스텀으로 수정한 부분들은 따로 빼서 관리하고 있다
디자인은 velog를 조금 참고하였고 모바일 반응형까지 수정하였다

