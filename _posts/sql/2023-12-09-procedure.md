---
title: "[SQL] 프로시저"
toc: true
toc_sticky: true
toc_label: "목차"
tags: oracle sql
published: true
categories:
- Tech
---

**저장 프로시저(Stored Procedure : 스토어드 프로시저)**  
저장 프로시저는 자주 사용되는 쿼리문을 모듈화시켜서 필요할 때마다 호출하여 사용하는 것을 말한다.  
```sql
--프로시저의 생성구문
CREATE [OR REPLACE ] PROCEDURE prcedure_name
(매개변수1 [mode] 자료형,
 매개변수2 [mode] 자료형 . . . )
IS
 local_variable declaration
BEGIN
 statement1;
END [prcedure_name];
```

```sql
CREATE OR REPLACE PROCEDURE EMPPROC
IS
    VWORD VARCHAR2(1);
    VEMP EMPLOYEES%ROWTYPE;
    CURSOR C1 (VWORD VARCHAR2)
    IS
    SELECT EMPLOYEE_ID, FIRST_NAME, SALARY
    FROM EMPLOYEES
    WHERE FIRST_NAME LIKE '%' || VWORD || '%';
BEGIN
    VWORD := DBMS_RANDOM.STRING('U',1);
    DBMS_OUTPUT.PUT_LINE('임의의 문자 : ' || VWORD);
    OPEN C1(VWORD);
    DBMS_OUTPUT.PUT_LINE('직원번호 / 직원명 / 급여');
    DBMS_OUTPUT.PUT_LINE('--------------------------------------');
    LOOP
        FETCH C1 INTO VEMP.EMPLOYEE_ID, VEMP.FIRST_NAME, VEMP.SALARY;
        IF C1%ROWCOUNT = 0 THEN
        DBMS_OUTPUT.PUT_LINE('해당 직원이 존재하지 않습니다') ;
        END IF;
        EXIT WHEN C1%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(VEMP.EMPLOYEE_ID ||' / '|| VEMP.FIRST_NAME ||' / '|| VEMP.SALARY);
    END LOOP;
END;
/
```
생성한 프로시저를 삭제
```sql
DROP PROCEDURE procedure_name;
```
매개변수를 지정하여 프리시저를 생성할 수도 있다.

```sql
CREATE OR REPLACE PROCEDURE EMPPROC02
( VDEPTNO IN EMPLOYEES.DEPARTMENT_ID%TYPE )
IS
 CURSOR C1
 IS
 SELECT * FROM EMPLOYEES
WHERE DEPARTMENT_ID=VDEPTNO;
BEGIN
 DBMS_OUTPUT.PUT_LINE('직원번호 / 직원명 / 급여');
 DBMS_OUTPUT.PUT_LINE('--------------------------------');
 FOR VEMP IN C1 LOOP

 DBMS_OUTPUT.PUT_LINE(VEMP.EMPLOYEE_ID ||' / '|| VEMP.FIRST_NAME ||' / '|| VEMP.SALARY);
 END LOOP;
END;
/
SHOW ERROR;
```

## OUT MODE 매개변수  
프로시저 호출 후 해당 매개변수 값을 받아 사용 가능하다  
프로시저에 구한 결과 값을 얻어 내기 위해서는 MODE를 OUT으로 지정한다. OUT 매개변수는 프로시저 내에서 로직 처리 후, 해당 매개변수에 값을 할당해 프로시저 호출 부분에서 이 결과값을 참조할 수 있다.  
```sql
CREATE OR REPLACE PROCEDURE EMPPROC_OUTMODE(
 VEMPNO IN EMPLOYEES.EMPLOYEE_ID%TYPE,
 VENAME OUT EMPLOYEES.FIRST_NAME%TYPE,
 VSAL OUT EMPLOYEES.SALARY%TYPE,
 VJOB OUT EMPLOYEES.JOB_ID%TYPE
)
IS
BEGIN
 SELECT FIRST_NAME, SALARY, JOB_ID INTO VENAME, VSAL, VJOB
 FROM EMPLOYEES
 WHERE EMPLOYEE_ID = VEMPNO;
END;
/
```

```sql
DECLARE
 VEMP EMPLOYEES%ROWTYPE;
BEGIN
 EMPPROC_OUTMODE(200, VEMP.FIRST_NAME, VEMP.SALARY, VEMP.JOB_ID);
 DBMS_OUTPUT.PUT_LINE('직원명 : ' || VEMP.FIRST_NAME );
 DBMS_OUTPUT.PUT_LINE('급 여 : ' || VEMP.SALARY );
 DBMS_OUTPUT.PUT_LINE('직 무 : ' || VEMP.JOB_ID );
END;
/
/* 
직원명 : Jennifer
급 여 : 4400
직 무 : AD_ASST
*/
```
## IN OUT MODE 매개변수
매개변수를 통해 값을 입력받아 다시 해당 매개변수값으로 변형된 데이터를 반환 하는 형태이다  
IN과 OUT의 기능을 모두 수행한다  
```sql
CREATE OR REPLACE PROCEDURE PROC_INOUTMODE
(V_SAL IN OUT VARCHAR2)
IS
BEGIN
 V_SAL := '$' || SUBSTR(V_SAL, -9, 3) || ',' || SUBSTR(V_SAL, -6, 3) || ',' || SUBSTR(V_SAL, -3, 3);
END PROC_INOUTMODE;
/
```

```sql
DECLARE
 STRNUM VARCHAR2(20) := '123456789';
BEGIN
PROC_INOUTMODE (STRNUM);
DBMS_OUTPUT.PUT_LINE('STRNUM = ' || STRNUM);
END;
/
/*
STRNUM = $123,456,789
*/
```
자바의 메소드와 느낌이 비슷하다.