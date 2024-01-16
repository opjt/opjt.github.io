---
title: "[Java] 톰캣 DataSource DB 연결"
description: null
summary: null
tags: java 
published: true
categories:
- Tech
---

jdbc의 경우  

1. jdbc 드라이버 로드
2. 데이터베이스 연결
3. 스테이트먼트 생성
4. 쿼리문 전송
5. 데이터 출력
6. 해제  

매번 사용자가 요청할 때마다 위와 같은 6가지의 과정을 거치기 때문에 매우 비효율적이다  
이문제를 해결하기 위해 커넥션풀(ConnectionPool) 이라는 기술을 사용하는데
커넥션 풀은 웹서버가 실행됨과 동시에 연동할 데이터베이스와의 연결을 미리 설정하고 필요할 때마다 미리 연결해 놓은 상태를 이용하여 빠르게 데이터베이스와 연동하여 작업한다 이러한 기술을 커넥션풀 이라고 한다(커넥션들의 pool웅덩이)  

<!-- 톰캣에서 제공하는 커넥션풀의 동작 과정이다
1. 톰캣 컨테이너를 실행한 후 응용 프로그램을 실행한다
2. 톰캣 컨테이너 실행 시 커넥션풀 객체를 생성한다
3. 생성된 커넥션 객체는 DBMS와 연결한다
4. 데이터베이스와의 연동 작업이 필요할 경우 프로그램은 커넥션풀에서 제공하는 메서드를 호출하여 연동한다 -->

톰캣 datasource 설정 방법

이클립스에서 생성한 톰캣서버의 context.xml 파일 수정
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!--
 Licensed to the Apache Software Foundation (ASF) under one or more
 contributor license agreements. See the NOTICE file distributed with
 this work for additional information regarding copyright ownership.
 The ASF licenses this file to You under the Apache License, Version 2.0
 (the "License"); you may not use this file except in compliance with
 the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
--><!-- The contents of this file will be loaded for each web application --><Context>
 <!-- Default set of monitored resources. If one of these changes, the -->
 <!-- web application will be reloaded. -->
 <WatchedResource>WEB-INF/web.xml</WatchedResource>
 <WatchedResource>WEB-INF/tomcat-web.xml</WatchedResource>
 <WatchedResource>${catalina.base}/conf/web.xml</WatchedResource>
 <!-- Uncomment this to disable session persistence across Tomcat restarts -->
 <!--
 <Manager pathname="" />
 -->
 <Resource name="jdbc/oracle" auth="Container" type="javax.sql.DataSource"
 driverClassName="oracle.jdbc.driver.OracleDriver"
 url="jdbc:oracle:thin:@localhost:1521:XE"
 username="hr" password="1234" maxActive="100" maxWait="-1" />
</Context>

```

오라클 DBMS를 연결할 때 다른 속성들은 고정적으로 사용하며, 개발자가 주로 설정하는 정보는 driverClassName, user, password, url만 변경해서 설정한다

| 속성명              | 설명                                             |
|----------------------|--------------------------------------------------|
| name                 | DataSource에 대한 JNDI 이름                       |
| auth                 | 인증 주체                                        |
| driverClassName      | 연결할 데이터베이스 종류에 따른 드라이버 클래스 이름 |
| factory              | 연결할 데이터베이스 종류에 따른 ConnectionPool 생성 클래스 이름 |
| maxActive            | 동시에 최대로 데이터베이스에 연결할 수 있는 Connection 수 |
| maxIdle              | 동시에 idle 상태로 대기할 수 있는 최대 수         |
| maxWait              | 새로운 연결이 생길 때까지 기다릴 수 있는 최대 시간 |
| user                 | 데이터베이스 접속 ID                              |
| password             | 데이터베이스 접속 비밀번호                        |
| type                 | 데이터베이스 종류별 DataSource                    |
| url                  | 접속할 데이터베이스 주소와 포트 번호 및 SID      |

### JDNI란?
실제 웹 애플리케이션에서 ConnectinPool 객체를 구현할 때는 Java SE에서 제공하는 javax.sql.DataSource
클래스를 이용한다. 그리고 웹 애플리케이션 실행 시 톰캣이 만들어 놓은 ConnectinPool 객체에 접근할
때는 JNDI를 이용한다.
JNDI(Java Naming and Directory Interface)란 필요한 자원을 키/값(key/value) 쌍으로 저장한 후 필요할 때
키를 이용해 값을 얻는 방법이다. 즉, 미리 접근할 자원에 키를 지정한 후 애플리케이션이 실행 중일 때
이 키를 이용해 자원에 접근해서 작업하는 것이다.

기존 jdbc방법과 비교해보면
```java
package com.memberpre;
import java.sql.Connection;
import java.sql.Date;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;

public class MemberDAO {
    private static final String driver = "oracle.jdbc.driver.OracleDriver";
    private static final String url = "jdbc:oracle:thin:@localhost:1521:XE";
    private static final String user = "hr";
    private static final String pwd = "1234";
    private Connection con;
    private PreparedStatement pstmt;

    public List listMembers() {
        List list = new ArrayList();
        try {
            connDB();
            String query = "select * from t_member ";
            pstmt = con.prepareStatement(query);
            ResultSet rs = pstmt.executeQuery();
            while (rs.next()) {
                String id = rs.getString("id");
                String pwd = rs.getString("pwd");
                String name = rs.getString("name");
                String email = rs.getString("email");
                Date joinDate = rs.getDate("joinDate");
                MemberVO vo = new MemberVO();
                vo.setId(id);
                vo.setPwd(pwd);
                vo.setName(name);
                vo.setEmail(email);
                vo.setJoinDate(joinDate);
                list.add(vo);
            }
            rs.close();
            pstmt.close();
            con.close();
        } catch (Exception e) {
            e.printStackTrace();

        }
        return list;
        }
    private void connDB() {
        try {
            Class.forName(driver);
            System.out.println("Oracle 드라이버 로딩 성공");
            con = DriverManager.getConnection(url, user, pwd);
            System.out.println("Connection 생성 성공");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

```

커넥션풀 방식
```java
package com.memberpool;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.sql.DataSource;
public class MemberDAO {
    private Connection con;
    private PreparedStatement pstmt;
    private DataSource dataFactory;
    public MemberDAO() {

        try {
            Context ctx = new InitialContext();
            Context envContext = (Context) ctx.lookup("java:/comp/env");
            dataFactory = (DataSource) envContext.lookup("jdbc/oracle");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    public List listMembers() {
        List list = new ArrayList();
        try {
            con = dataFactory.getConnection();
            String query = "select * from t_member";
            System.out.println("prepareStatememt: " + query);
            pstmt = con.prepareStatement(query);
            ResultSet rs = pstmt.executeQuery();
            while (rs.next()) {
                String id = rs.getString("id");
                String pwd = rs.getString("pwd");
                String name = rs.getString("name");
                String email = rs.getString("email");
                Date joinDate = rs.getDate("joinDate");
                MemberVO vo = new MemberVO();
                vo.setId(id);
                vo.setPwd(pwd);
                vo.setName(name);
                vo.setEmail(email);
                vo.setJoinDate(joinDate);
                list.add(vo);
            }
            rs.close();
            pstmt.close();
            con.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
        return list;
    }
}
```

jdbc는 반복적인 코드와 sql 쿼리 작성, 예외 처리 등 개발자가 모두 수동으로 처리해야 한다 ORM(객체 관계 매핑) 프레임워크의 사용으로 비교적 로우 레벨 기술로 인식되고 있지만 아직까지 현업에서 안 쓰고 있는 곳은 없을 거라 생각이 된다