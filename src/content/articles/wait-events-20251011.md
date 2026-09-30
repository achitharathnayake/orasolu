---

title: "Oracle Wait Events: Reading the Signals"

description: "Understanding Oracle wait events, wait classes, session waits, and how they help identify database performance problems."

category: "Performance"

tags:

  - "Oracle Database"

  - "Wait Events"

  - "Performance"

  - "ASH"

  - "DBA"

publishedDate: "2025-10-11"

author: "Achitha Rathnayake"

featured: false

draft: false

---



## Introduction



An Oracle session does not always spend its time using CPU.



When a session cannot continue because a required resource is not immediately available, Oracle records a wait event.



Wait events are therefore an important source of information during performance analysis.



The important part is understanding what the wait represents and what is causing it.



## Wait Classes



Oracle groups wait events into wait classes.



Some commonly encountered classes are:



- User I/O

- System I/O

- Concurrency

- Commit

- Network

- Configuration

- Administrative

- Scheduler



Idle waits are normally excluded when investigating database performance.



You can view system-level waits with:



```sql
SELECT
    wait_class,
    event,
    total_waits,
    time_waited,
    average_wait
FROM v$system_event
WHERE wait_class <> 'Idle'
ORDER BY time_waited DESC;
```
The wait class provides the general area.
The event provides more detail.
## User I/O
User I/O waits occur when database sessions wait for I/O operations associated with user workload.
A common example is:
```text
db file sequential read
```
This is generally associated with single-block reads.
Another example is:
```text
db file scattered read
```
which is associated with multi-block reads.
The event alone does not identify the root cause.
For example, high `db file sequential read` could be related to SQL performing many index-driven single-block reads.
The next step is to identify the SQL generating the workload.
## Commit Waits
One important commit-related wait is:
```text
log file sync
```
This occurs when a session waits for the commit operation to be completed by the redo process.
A high number of `log file sync` waits may require investigation of:
- Commit frequency
- Redo generation
- Redo I/O latency
- Application transaction design
- Log writer activity
The correct investigation depends on the workload.
Simply increasing redo log size does not automatically resolve `log file sync`.
## Lock Contention
Another common wait is:
```text
enq: TX - row lock contention
```
This can occur when a session needs to access a row that is locked by another transaction.
The important question is:
**Which session is holding the lock?**
A current blocking relationship can be examined with:
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
The waiting session is not necessarily the source of the problem.
The blocking session and its transaction need to be investigated.
## Library Cache and Cursor Waits
Some waits are related to shared SQL and library cache activity.
Examples include:
```text
library cache lock
cursor: pin S wait on X
```
These waits can occur when sessions require access to library cache objects or cursors that are being modified or held by another session.
When investigating these waits, useful information includes:
- SQL ID
- Session
- Module
- Action
- Object
- Blocking session
- Current database activity
The surrounding workload is important because the same wait can have different causes in different environments.
## Current Session Waits
When an issue is occurring now, `V$SESSION` provides session-level wait information.
```sql
SELECT
    sid,
    serial#,
    username,
    status,
    sql_id,
    event,
    wait_class,
    state,
    seconds_in_wait
FROM v$session
WHERE type = 'USER'
AND status = 'ACTIVE'
ORDER BY seconds_in_wait DESC;
```
Useful columns include:
- `SQL_ID`
- `EVENT`
- `WAIT_CLASS`
- `STATE`
- `SECONDS_IN_WAIT`
This allows the DBA to connect a wait event to a specific session.
From there, the SQL statement can be identified.
## Find the SQL
Once a SQL ID is known, inspect its statistics.
```sql
SELECT
    sql_id,
    plan_hash_value,
    executions,
    elapsed_time / 1000000 AS elapsed_sec,
    cpu_time / 1000000 AS cpu_sec,
    buffer_gets,
    disk_reads
FROM v$sql
WHERE sql_id = '\&sql_id';
```
This provides useful context.
For example:
- High executions may indicate repeated workload.
- High elapsed time may indicate significant total impact.
- High CPU time may indicate CPU-intensive processing.
- High buffer gets may indicate heavy logical I/O.
- High disk reads may indicate significant physical I/O.
The wait event and SQL statistics should be considered together.
## CPU Is Not a Wait Event
A common mistake is to assume that every performance problem appears as a wait event.
CPU consumption is different.
A session actively using CPU is not waiting for another database resource.
This is why DB Time and DB CPU should be considered together.
For example:
```text
High DB Time
      |
      +---- High DB CPU
      |
      +---- High Wait Time
```
If DB CPU is responsible for most of the increase, investigate CPU-consuming SQL and workload.
If wait time is responsible for the increase, investigate the dominant waits.
## ASH and Wait Events
Active Session History can show wait activity over time.
For example:
```sql
SELECT
    event,
    wait_class,
    COUNT(\*) AS samples
FROM v$active_session_history
WHERE sample_time >= SYSDATE - INTERVAL '15' MINUTE
GROUP BY
    event,
    wait_class
ORDER BY samples DESC;
```
This can show which waits were most frequently sampled during the selected period.
ASH can also be combined with SQL IDs:
```sql
SELECT
    sql_id,
    event,
    wait_class,
    COUNT(\*) AS samples
FROM v$active_session_history
WHERE sample_time >= SYSDATE - INTERVAL '15' MINUTE
AND sql_id IS NOT NULL
GROUP BY
    sql_id,
    event,
    wait_class
ORDER BY samples DESC;
```
This creates a direct relationship between SQL and waits.
## Historical Wait Analysis
For historical analysis, AWR provides wait information across snapshots.
AWR can help answer:
- Which waits increased?
- When did they increase?
- Which wait class changed?
- Which SQL contributed to the workload?
- Was the behavior normal for the database?
A useful investigation compares the problem period with a normal period.
A wait event that appears consistently may simply represent normal workload.
A sudden increase is often more interesting.
## Wait Time Matters
The number of waits alone does not always tell the full story.
Consider two situations:
```text
Event A
10,000 waits
1 ms average wait
```
and:
```text
Event B
100 waits
500 ms average wait
```
Event B has fewer waits but may have a significant performance impact.
For this reason, consider:
- Number of waits
- Total wait time
- Average wait time
- Number of affected sessions
- SQL generating the waits
The workload context matters.
## From Wait to Root Cause
A wait event should lead to another question.
For example:
```text
db file sequential read
        |
        v
Which SQL?
        |
        v
Which object?
        |
        v
Why so many reads?
        |
        v
Execution plan?
        |
        v
Expected workload?
```
For:
```text
log file sync
```
the investigation may move toward:
```text
log file sync
        |
        v
Commit frequency
        |
        v
Redo generation
        |
        v
Redo I/O latency
        |
        v
Application workload
```
For:
```text
enq: TX - row lock contention
```
the investigation may move toward:
```text
Row lock contention
        |
        v
Blocking session
        |
        v
Blocking transaction
        |
        v
Application activity
```
The wait event tells you where the session is stuck.
The investigation determines why.
## Conclusion
Wait events are one of the most useful signals available during Oracle performance analysis.
They can show whether sessions are spending time on I/O, commits, locks, concurrency, or other database resources.
But a wait event should not be treated as the root cause by itself.
A useful investigation connects:
**Wait → Session → SQL → Resource → Cause**
Start with the wait.
Then find the session.
Identify the SQL.
Understand the resource involved.
Finally determine why the workload is producing that behavior.
That is how wait events become useful diagnostic information rather than just a list of database statistics.