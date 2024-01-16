---
title: "[Java] 오라클db JDBC 연결 1"
description: null
summary: null
tags: sql java
published: true
categories:
- Tech
---


데이터베이스에 연결하기 위해서는 2가지 과정이 필요하다.  
드라이버 클래스를 로딩하고 그다음 DB와 접속으르 시도한다

>C:\app\유저\product\18.0.0\dbhomeXE\jdbc\lib  

폴더에 있는 ojdbc8.jar파일을 Java Build Path에서 추가해주면 된다

```java
public static Connection makeConnection() {
		Scanner input = new Scanner(System.in);
		String url = "jdbc:oracle:thin:@localhost:1521:xe";
		String id = "아이디";
		String password = "비번";
		Connection con = null;
	
		
		try {
			Class.forName("oracle.jdbc.driver.OracleDriver");
			System.out.println("드라이버 적재성공");
			con = DriverManager.getConnection(url, id, password);
			System.out.println("데이터베이스 연결 성공");
		} catch (ClassNotFoundException e) {
			System.out.println("드라이버를 찾을 수 없습니다");
		} catch (SQLException e) {
			System.out.println("연결에 실패하였습니다.");
		}
		return con;
	}
```

접속 주소는 어떤 db를 사용하는지에 따라 상이함

```java
public static void main(String[] args) throws SQLException {
		Connection con = makeConnection();
}
```

위에 만든 메서드를 불러오면서 디비 접속을 진행한다.
데이터베이스에 연결한 후에는 select와 같은 sql문을 사용할 수 있다

```java
Statement stmt = con.createStatement();
ResultSet rs = stmt.executeQuery("SELECT * FROM 테이블");
```

executeQuery 메소드에 의해 반환된 Resultset 객체에는 해당sql구문에 의해 추출된 모든 레코드가 들어 있다 하지만 한 번에 하나의 레코드만 접근할 수 있음.

```java

while(rs.next()) {

    //현재 레코드를 처리한다
}
```

|메소드|설명|
|--|--|
|close()|결과 집합을 닫는다|
|last()| 커서를 마지막 레코드로 옮긴다|
|getRow()|현재 레코드 번호를 얻는다|
|next()| 다음 레코드로 이동한다.|
|previous()|이전 레코드로 이동한다|
|absolute(int row)| 지정된 row로 커서를 이동한다.|
|isFirst()|첫 레코드이면 true 반환한다|
|isLast()|마지막 레코드이면 true 반환한다|
|--|--|

```java
public static void main(String[] args) throws SQLException {
		Connection con = makeConnection();
		Statement stmt = con.createStatement();
		ResultSet rs = stmt.executeQuery("SELECT * FROM EMPLOYEES");
		
		int empNo;
		String eName;
		String job;
		String mgr;
		Date hireDate;
		int sal;
		double comm;
		String deptNo;
	
		System.out.println("사원번호\t사원명\t\t업무\t\t상관번호\t입사일\t\t급여\t커미 션\t부서번호");
		while(rs.next()) {
			empNo = rs.getInt("EMPLOYEE_ID");
			eName = rs.getString("FIRST_NAME");
			job = rs.getString("JOB_ID");
			mgr = rs.getString("MANAGER_ID");
			hireDate =rs.getDate("HIRE_DATE");
			sal =  rs.getInt("SALARY");
			comm = rs.getDouble("COMMISSION_PCT");
			deptNo = rs.getString("DEPARTMENT_ID");
			
			System.out.println(empNo + "\t" + eName + " \t" + job + " \t" + mgr + "\t" + hireDate + "\t" + sal + "\t" + comm + "\t" + deptNo);
			
		}
	}
```