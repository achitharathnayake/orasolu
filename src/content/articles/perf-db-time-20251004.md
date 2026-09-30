---

title: "Oracle Performance: From DB Time to SQL ID"

description: "How to trace Oracle Database performance issues from DB Time and wait events to the sessions and SQL statements causing the workload."

category: "Performance"

tags:

  - "Oracle Database"

  - "Performance"

  - "AWR"

  - "ASH"

  - "SQL"

  - "DBA"

publishedDate: "2025-10-04"

author: "Achitha Rathnayake"

featured: true

draft: false

---



## Introduction



When an Oracle Database becomes slow, the first question should not be which parameter to change.



The first question should be:



**Where is the database spending its time?**



Oracle provides several performance views that allow a DBA to move from a database-level symptom to the session and SQL statement responsible for the workload.



A useful investigation path is:



**DB Time → Wait Events → Sessions → SQL ID → Execution Plan**



This approach helps turn a general performance complaint into a measurable investigation.



## DB Time



DB Time represents the amount of time spent by foreground sessions inside the database.



It includes time spent using CPU as well as time spent waiting for database resources.



The system time model can be queried with:



```sql
SELECT
    stat_name,
    value
FROM v$sys_time_model
WHERE stat_name IN (
    'DB time',
    'DB CPU'
);
```
Two values are particularly useful:
- `DB time`
- `DB CPU`
If DB Time increases significantly while DB CPU remains relatively stable, the additional time may be associated with waits.
If both DB Time and DB CPU increase, the database may be processing more work or consuming more CPU.
This gives us the first direction for the investigation.
## Wait Events
When a database session cannot continue immediately, Oracle records a wait event.
Current system-level wait information can be viewed with:
```sql
SELECT
    event,
    total_waits,
    time_waited,
    average_wait
FROM v$system_event
WHERE wait_class <> 'Idle'
ORDER BY time_waited DESC;
```
Some commonly encountered wait events include:
```text
db file sequential read
db file scattered read
direct path read
log file sync
enq: TX - row lock contention
library cache lock
cursor: pin S wait on X
```
The largest wait event is not automatically the root cause.
For example, `db file sequential read` represents single-block reads. The next question is which SQL statements are generating those reads and whether the I/O latency is abnormal.
Similarly, `log file sync` may point toward commit-related workload, but the DBA still needs to determine why the application is committing at that rate and whether redo I/O is contributing to the wait.
A wait event is therefore a starting point for investigation, not the final answer.
## Active Sessions
If the performance problem is happening now, `V$SESSION` provides a useful view of current activity.
```sql
SELECT
    sid,
    serial#,
    username,
    sql_id,
    event,
    wait_class,
    seconds_in_wait
FROM v$session
WHERE type = 'USER'
AND status = 'ACTIVE'
ORDER BY seconds_in_wait DESC;
```
Important columns include:
### SQL_ID
Identifies the SQL statement associated with the session.
### EVENT
Shows the current wait event when the session is waiting.
### WAIT_CLASS
Groups wait events into categories such as User I/O, Concurrency, Commit, Network, and Configuration.
### SECONDS_IN_WAIT
Shows how long the session has been waiting for the current event.
The `SQL_ID` is particularly useful because it allows the investigation to move from the session to the SQL statement.
## Find the SQL
Once a SQL ID has been identified, inspect its statistics in `V$SQL`.
```sql
SELECT
    sql_id,
    plan_hash_value,
    executions,
    elapsed_time / 1000000 AS elapsed_sec,
    cpu_time / 1000000 AS cpu_sec,
    buffer_gets,
    disk_reads,
    rows_processed
FROM v$sql
WHERE sql_id = '\&sql_id';
```
Several metrics are useful when evaluating the SQL.
### Executions
A statement executed many times can consume significant resources even if each individual execution is relatively small.
### Elapsed Time
Shows the total elapsed time accumulated by the SQL cursor.
### CPU Time
Shows the amount of CPU time consumed by the SQL.
### Buffer Gets
Represents logical reads.
A SQL statement performing a very large number of buffer gets may be doing significantly more work than expected.
### Disk Reads
Shows physical reads associated with the SQL.
### Rows Processed
Provides context when comparing the amount of work performed with the amount of data returned.
For example, a statement that performs millions of logical reads but returns only a small number of rows may require further investigation.
## Check the Execution Plan
After identifying an important SQL statement, inspect its execution plan.
```sql
SELECT \*
FROM TABLE(
    DBMS_XPLAN.DISPLAY_CURSOR(
        '\&sql_id',
        NULL,
        'ALLSTATS LAST'
    )
);
```
When available, `ALLSTATS LAST` provides actual execution statistics for the most recent execution.
Look for:
- Full table scans
- Large index range scans
- Unexpected join methods
- Significant differences between estimated and actual rows
- High buffer usage
- High physical reads
- Operations processing more rows than expected
A full table scan is not automatically a problem.
For a small table, a full table scan may be the correct access path.
The important question is whether the amount of work performed by the execution plan is appropriate for the workload.
## Connect Waits to SQL
Wait events become more useful when they are connected to the SQL statements generating them.
For example:
```text
High DB Time
     |
     v
High User I/O
     |
     v
db file sequential read
     |
     v
SQL_ID identified
     |
     v
High buffer gets
     |
     v
Execution plan examined
```
This creates an evidence chain.
Instead of simply saying:
> The database has high I/O.
The investigation can identify:
> DB Time increased, User I/O became significant, and a specific SQL ID generated a large amount of logical and physical I/O.
That is a much stronger starting point for finding the cause.
## Check for Blocking
Performance problems are not always caused by CPU or I/O.
Sessions may also be waiting for other sessions.
A simple query to identify sessions waiting for a blocker is:
```sql
SELECT
    sid,
    serial#,
    username,
    sql_id,
    event,
    blocking_session
FROM v$session
WHERE blocking_session IS NOT NULL;
```
A common example is:
```text
enq: TX - row lock contention
```
This can indicate transaction-level locking.
When this occurs, identify the blocking session and investigate the transaction holding the resource.
The important question is not simply why the waiting session is slow.
It is:
**Why is the blocking transaction still holding the resource?**
## Historical Performance
Dynamic performance views are most useful for current activity.
For historical incidents, AWR and ASH provide additional information.
AWR snapshots can be reviewed with:
```sql
SELECT
    snap_id,
    begin_interval_time,
    end_interval_time
FROM dba_hist_snapshot
ORDER BY snap_id DESC
FETCH FIRST 10 ROWS ONLY;
```
This helps identify the snapshot periods covering a performance incident.
Historical SQL statistics can then be examined using `DBA_HIST_SQLSTAT`.
```sql
SELECT
    sql_id,
    plan_hash_value,
    executions_delta,
    elapsed_time_delta / 1000000 AS elapsed_sec,
    cpu_time_delta / 1000000 AS cpu_sec,
    buffer_gets_delta,
    disk_reads_delta
FROM dba_hist_sqlstat
WHERE sql_id = '\&sql_id'
ORDER BY snap_id DESC;
```
This allows the DBA to compare SQL activity across different snapshot periods.
## Plan Changes
`PLAN_HASH_VALUE` is useful when investigating changes in SQL execution plans.
For example, the same SQL ID may appear with different plan hash values:
```text
SQL_ID:           8f3k2m1abcxyz
Plan Hash Value:  123456789
SQL_ID:           8f3k2m1abcxyz
Plan Hash Value:  987654321
```
This indicates that the SQL used different execution plans.
A plan change does not automatically mean that the new plan is worse.
The next step is to compare the plans and their execution statistics.
Useful things to compare include:
- Access paths
- Join methods
- Estimated rows
- Actual rows
- Buffer gets
- Physical reads
- Elapsed time
- CPU time
## ASH
Active Session History provides sampled information about active database sessions.
For a current investigation, `V$ACTIVE_SESSION_HISTORY` can be useful.
For example:
```sql
SELECT
    sql_id,
    event,
    wait_class,
    COUNT(\*) AS samples
FROM v$active_session_history
WHERE sample_time >= SYSDATE - INTERVAL '10' MINUTE
GROUP BY
    sql_id,
    event,
    wait_class
ORDER BY samples DESC;
```
This can help identify which SQL statements and wait events were most prominent during the selected period.
ASH is particularly useful when the problem is intermittent and the affected sessions are no longer active.
## A Simple Investigation Flow
A performance investigation can be reduced to a few steps:
```text
DB Time
   |
   v
Wait Events
   |
   v
Active Sessions
   |
   v
SQL_ID
   |
   v
SQL Statistics
   |
   v
Execution Plan
   |
   v
Root Cause
```
Each step narrows the investigation.
Start with the overall database workload.
Then identify the resource involved.
Then find the sessions using that resource.
Finally, trace those sessions to the SQL statements and execution plans responsible.
## Avoid Changing Parameters Too Early
During a performance incident, it can be tempting to change initialization parameters immediately.
That can make the investigation more difficult.
Before changing database configuration, establish:
1. What changed?
2. Which resource is affected?
3. Which sessions are affected?
4. Which SQL statements are responsible?
5. Did the execution plan change?
6\. Is the behavior different from a normal period?
Once the evidence is clear, configuration changes can be evaluated based on the actual problem.
## Conclusion
Oracle performance troubleshooting should move from the database level toward the workload.
Start with DB Time.
Identify important waits.
Find the active sessions.
Trace those sessions to SQL IDs.
Review SQL statistics and execution plans.
For historical incidents, use AWR and ASH to compare the problem period with normal activity.
The objective is not simply to find a slow SQL statement.
The objective is to connect:
**Symptom → Resource → Session → SQL → Execution Plan → Root Cause**
That connection provides the evidence needed for the next step in the investigation.