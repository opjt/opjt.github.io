---
title: "[JS]null 과 undefined의 차이와 변수들"
toc: false
toc_sticky: true
toc_label: "목차"
tags: javascript
published: true
last_modified_at: 2023-12-29
categories:
- Tech
---
# null, undefined
자바스크립트를 사용하다보면 null과 undefined가 자주 나온다.  
분명 차이점을 알고 있지만 개념을 확실하게 하기 위해 정리해보려 한다  

### null  
비어있는 값을 의미한다 사용자가 의도적으로 비어있는 값으로 지정할 때 사용한다

### undefined  
직역하면 정의되지 않은 이란 뜻으로 아무 값도 할당받지 않은 원시 자료형을 말한다.  
```javascript
var a;
console.log(a); // undefined
console.log(typeof a); // undefined
```  
가능하면 null로 빈값을 나타내자
<br>
<br>

# const let var
es6 업데이트 이후 var 이외에도 const와 let이 새로 등장하였다  

### const  
자바의 final과 흡사한 형태로 선언과동시에 값을 지정해야 하며 재선언과 재할당이 불가능하다.  

### let  
중복 선언이 불가능하고 재할당이 가능하다
```javascript
let str1 = 'javascript';
console.log(str1); // javascript

let str1 = 'react';
console.log(str1);
//에러

str1 = 'vue';
console.log(str1); // vue
```  

### var  
재선언, 재할당 모두 가능하다 전역에서 사용 가능하다.  
하지만 let은 블록범위에서 사용이 가능하다  

```javascript
let greeting = "say Hi";
let times = 4;

if (times > 3) {
    let hello = "say Hello instead";
    console.log(hello);// "say Hello instead"
}
console.log(hello) // hello is not defined
```