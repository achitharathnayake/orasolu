---

title: "Oracle AWR: Reading the Important Parts"

description: "A technical guide to reading Oracle AWR reports, understanding DB Time, wait events, SQL statistics, and execution plan changes."

category: "Performance"

tags:

  - "Oracle Database"

  - "AWR"

  - "Performance"

  - "SQL Tuning"

  - "DBA"

publishedDate: "2025-10-18"

author: "Achitha Rathnayake"

featured: false

draft: false

---



## Introduction



An Oracle AWR report contains a large amount of performance information.



The challenge is not generating the report.



The challenge is knowing where to start.



A useful AWR investigation should quickly answer:



- How much work did the database perform?

- Where was the time spent?

- Which SQL consumed the resources?

- Did the workload change?

- Did an execution plan change?



This article focuses on the sections that usually provide the most useful information during a performance investigation.



## Snapshot Information



Every AWR report covers a specific snapshot interval.



The first thing to check is the report period.



For example:



```text
Snap ID      Begin Time          End Time
---------    ----------------    ----------------
12501        10:00               11:00
12502        11:00               12:00
```
Make sure the report actually covers the period when the performance problem occurred.
A report from the wrong time period can lead to completely incorrect conclusions.
## Load Profile
The Load Profile provides a high-level view of database activity.
Important values include:
- DB Time
- DB CPU
- Logical reads
- Physical reads
- Parses
- Executes
- Transactions
- User calls
- Redo size
These values help establish the workload level during the snapshot period.
For example, a large increase in executions may indicate increased application activity.
A large increase in logical reads may indicate increased SQL processing.
A large increase in redo may indicate increased DML activity.
The values should be compared with a normal period rather than viewed in isolation.
## DB Time
DB Time is one of the most important metrics in an AWR report.
It represents the amount of time foreground sessions spent inside the database.
The report separates DB Time into CPU and non-CPU activity.
For example:
```text
DB Time
   |
   +---- DB CPU
   |
   +---- Wait Time
```
If DB Time increased significantly between two periods, determine whether the increase came mainly from CPU or waits.
That immediately narrows the investigation.
## Top Foreground Events
The Top 10 Foreground Events section shows where sessions spent their time.
Typical examples include:
```text
db file sequential read
log file sync
DB CPU
enq: TX - row lock contention
direct path read
```
The important values include:
- Event
- Waits
- Time(s)
- Avg wait
- % DB time
Focus on events contributing significant DB Time.
Do not automatically assume that the event at the top of the list is the root cause.
Use it to determine where the investigation should continue.
## CPU
DB CPU is shown in several parts of an AWR report.
A high CPU contribution can indicate that the database is spending significant time actively processing workload.
Possible areas to investigate include:
- High CPU SQL
- Increased SQL executions
- Inefficient execution plans
- Large logical reads
- Increased application workload
- Host CPU pressure
A database using high CPU is not necessarily experiencing a database problem.
The workload may simply have increased.
Compare CPU usage with a normal period before deciding that the CPU consumption is abnormal.
## SQL by Elapsed Time
The SQL ordered by elapsed time section identifies statements consuming significant total elapsed time.
Useful columns include:
- SQL ID
- Elapsed Time
- Executions
- Elapsed Time per Execution
- CPU Time
- Buffer Gets
- Disk Reads
Total elapsed time and elapsed time per execution answer different questions.
For example:
```text
SQL A
Executions:       500,000
Elapsed/Exec:     5 ms
```
may have a large total impact because it executes extremely frequently.
Another statement may look like:
```text
SQL B
Executions:       20
Elapsed/Exec:     30 sec
```
The second statement may have a much higher per-execution cost.
Both can be important.
## SQL by CPU Time
SQL ordered by CPU time helps identify statements consuming database CPU.
Look at:
- Total CPU time
- CPU per execution
- Executions
- Buffer gets
- Elapsed time
A SQL statement with high CPU consumption and high buffer gets may be performing excessive logical I/O.
This can lead to an execution plan investigation.
## SQL by Buffer Gets
Buffer gets represent logical reads.
A statement with very high buffer gets may be reading large amounts of data from the buffer cache.
Check:
- Total buffer gets
- Buffer gets per execution
- Executions
- Rows processed
- Execution plan
High buffer gets are not automatically bad.
The correct question is whether the amount of logical I/O is appropriate for the work being performed.
## SQL by Physical Reads
Physical reads show SQL activity requiring data to be read from storage.
A SQL statement with high physical reads deserves further investigation.
Check whether the workload involves:
- Large table scans
- Index access
- Large range scans
- Poor filtering
- Increased data volume
- Changed execution plans
Again, the execution plan should be examined before deciding what needs to change.
## Parse Activity
AWR also provides information about parsing.
Look at values such as:
- Parses
- Hard parses
- Executions
- Parse failures
High parsing activity may indicate application behavior that is generating excessive SQL parsing.
For example, applications that do not use bind variables effectively can produce large numbers of similar SQL statements.
This can increase parsing overhead and library cache activity.
The application workload should be considered before changing database configuration.
## Instance Activity
Instance Activity provides counters for database activity.
Useful areas include:
- Logical reads
- Physical reads
- Redo
- User calls
- Parses
- Executes
- Transactions
These values help identify how workload changed during the report period.
The absolute number is often less useful than the change between comparable periods.
## Compare Two AWR Reports
A single AWR report shows what happened during one period.
Two comparable reports can show what changed.
For example:
```text
Normal Period
DB Time       2,000 sec
DB CPU        1,200 sec
User I/O      500 sec
Problem Period
DB Time       5,500 sec
DB CPU        1,300 sec
User I/O      3,700 sec
```
The important observation is not simply that the database became slow.
DB Time increased substantially while DB CPU changed only slightly.
That suggests that the additional time is associated with waits.
The next step would be to investigate the dominant wait events and the SQL generating them.
## SQL Plan Changes
AWR can also help identify SQL statements that changed execution plans.
Look for:
- SQL ID
- Plan Hash Value
- Executions
- Elapsed time
- CPU time
- Buffer gets
- Physical reads
If the same SQL ID appears with different plan hash values, compare the plans.
For example:
```text
SQL_ID: 8f3k2m1abcxyz
Plan A
Buffer Gets:  100,000
Elapsed Time:  2 sec
Plan B
Buffer Gets:  8,000,000
Elapsed Time:  90 sec
```
This kind of change provides a strong reason to investigate the execution plan.
The next questions should include:
- What changed in the plan?
- Did statistics change?
- Did data volume change?
- Did bind values change?
- Did indexes change?
- Did optimizer-related settings change?
## AWR Reading Order
Instead of reading every section from top to bottom, a performance investigation can follow this order:
```text
Snapshot Period
      |
      v
Load Profile
      |
      v
DB Time / DB CPU
      |
      v
Top Foreground Events
      |
      v
Top SQL
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
This keeps the investigation focused.
## AWR Is Evidence
An AWR report should not be treated as a list of recommendations.
It provides evidence about what happened during a particular period.
For example:
```text
AWR shows high DB Time
        |
        v
Waits increased
        |
        v
SQL_ID identified
        |
        v
SQL statistics reviewed
        |
        v
Execution plan compared
```
The DBA still needs to establish why the observed behavior occurred.
## Conclusion
AWR contains a large amount of information, but a performance investigation does not require reading every section with equal attention.
Start with the snapshot period.
Review the Load Profile.
Check DB Time and DB CPU.
Look at the Top Foreground Events.
Identify important SQL using elapsed time, CPU, buffer gets, and physical reads.
Then investigate execution plans and changes between normal and problem periods.
The most useful AWR analysis is not about finding the biggest number.
It is about understanding **what changed, where the time went, and which workload caused it**.