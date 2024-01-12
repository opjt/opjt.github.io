---
title: "[GITHUB-BLOG] 시리즈-1"
toc: true
toc_sticky: true
toc_label: "Getting Started"
tags: jekyll
published: true
categories:
- github-blog
---

[https://github.com/mmistakes/minimal-mistakes](https://github.com/mmistakes/minimal-mistakes)  

기존 디자인에서 조금 수정하여 사용하고 있다  

처음에는 카테고리를  
- 자바
- 알고리즘
- frontend
- sql  

이런 식으로 사용하다가 너무 번거로운 느낌이 들어 개발과 관련된 모든 부분은 tech 카테고리로 변경하였고 태그 기능을 이용해서 어느 정도 분류하였다 제목에도 어느 정도 이 글이 어떤 주제인지 표시하여 좀 더 보기 나아진 것 같다

![image](https://github.com/opjt/opjt.github.io/assets/57663597/a287e54e-9a5a-44bc-8418-4ca40935707b)
**before**

![image](https://github.com/opjt/opjt.github.io/assets/57663597/8728e8cb-ed97-4672-bf1a-a37d38e605dd)
**after**

카테고리를 테크로 모아서 상단에 있는 카테고리 메뉴를 빼고 뭘 추가할까 싶다가
[posts페이지](https://opjt.github.io/year-archive/)로 변경하였다  
(연도별로 모든 글을 보여주는 페이지인데 한 두개 밖에 없는 카테고리를 보여주는 것보다는 나을 거 같아서 변경해 줬다)   

글목록에 태그도 추가해 줬는데 #을 붙인 것이 보기 불편한 듯하여 이것도 수정하였다
*📁_includes\archive-single.html*  

차근차근 불편한 부분들을 수정할 생각이고 지금 생각나는 추가 기능들은
- 댓글 기능
- 다크모드

정도?? 업데이트 일기처럼 계속 쓸 생각이다.


> 자꾸 까먹는 bundle exec jekyll serve 명령어.
