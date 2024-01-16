---
title: "[React] State란?"
toc: false
toc_sticky: true
toc_label: "목차"
tags: React
published: true
categories:
- Tech
---

State는 상태라는 뜻으로 디비 설계시 게시글의 상태를 나타내기 위해서 자주 사용했던 칼럼명이다 하지만 리액트에서 State는 어떤 것의 상태를 나타낼까?  
# State란?  
리액트 컴포넌트의 변경 가능한 데이터라고 볼 수 있다 state를 정의할 때 중요한 점은 꼭 렌더링이나 데이터 흐름에 사용되는 값만 state에 포함시켜야 한다  
이유는 state가 변경될 경우 컴포넌트가 재렌더링되기 때문에 랜더링과 데이터 흐름에 관련 없는 값을 포함하게 될 경우 컴포넌트가 재렌더링되어 성능을 저하 시킬 수 있기 때문이다  
  
# State 사용법  

클래스 컴포넌트와 함수 컴포넌트 두개의 종류에 따라 state사용법도 다르다

## 함수형
```js
import React, {useState} from "react";
```
우선 state를 사용하기 위해 useState를 임포트한다

```js
const [state, setState] = useState('초기값');
```
state는 정의된 이후 일반적인 자바스크립트 변수처럼 직접 값을 수정할 수 없다
그렇기 때문에 setState함수를 통하여 값을 수정해야 한다


```jsx
import { useState } from "react";

function Test() {
	const [count, setCount] = useState(0);

	function plus() {
		setCount(count + 1);
		console.log(count);
	}

	function minus() {
		setCount(count - 1);
		console.log(count);
	}

	return (
		<div>
			<button onClick={plus}>+1</button>
			<button onClick={minus}>-1</button>
			<p>Count : {count}</p>
		</div>
	);
}

export default Test;
```

## 클래스형


```js
import React, { Component } from 'react';

class Test extends Component {
  constructor(props) {
    super(props);
    this.state = {
      count: 0,
    };
  }

  handleIncrement = () => {
    this.setState({
        count: this.state.count + 1,
      })
  };

  handleDecrement = () => {
    this.setState({
      count: this.state.count - 1,
    })
  };

  render() {
    return (
      <div>
        <p>현재 값: {this.state.count}</p>
        <button onClick={this.handleIncrement}>+</button>
        <button onClick={this.handleDecrement}>-</button>
      </div>
    );
  }
}

export default Test;
```
마찬가지로 setState를 사용해서 state값을 변경해야 한다
