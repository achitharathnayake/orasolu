---
title: "Understanding Oracle AWR Reports: A Practical Performance Troubleshooting Guide"
description: "A practical guide to using Oracle Automatic Workload Repository reports to identify performance changes, expensive SQL, wait events, and database workload patterns."
category: "Performance"
tags:
  - "Oracle Database"
  - "AWR"
  - "Performance"
  - "Troubleshooting"
publishedDate: "2026-09-30"
author: "Achitha Rathnayake"
featured: false
draft: false
---

## Introduction

Oracle Database performance investigations often involve a large amount of information.

CPU utilization, I/O activity, wait events, SQL execution statistics, memory usage, sessions, and database workload can all provide useful clues. The challenge is connecting those observations to a specific time period and identifying what changed.

Oracle Automatic Workload Repository (AWR) provides a historical view of database activity that can be extremely useful during performance investigations.

## What is AWR?

Automatic Workload Repository is an Oracle database repository that stores historical performance information.

AWR snapshots capture database performance statistics at regular intervals. These snapshots can then be used to compare database activity between two points in time.

A typical investigation might compare:

```text
Snapshot 101
    |
    | Performance problem
    |
Snapshot 102

The difference between those snapshots can help identify changes in workload and resource consumption.

Why AWR is useful

AWR is particularly useful when the performance problem is no longer occurring.

For example, suppose users reported slow application response between 10:00 and 10:30, but the DBA begins investigating at 11:00.

Real-time views may no longer show the original problem.

If appropriate AWR snapshots exist, historical information can still provide evidence about what happened during the affected period.

Start with the problem period

A common mistake is to immediately search through every section of an AWR report.

Start by establishing the problem period.

Determine:

When did the problem start?
When did it end?
Which database or service was affected?
Was the issue continuous or intermittent?
Was the workload different from normal?

Then identify the AWR snapshots covering the relevant period.

For example:

SELECT
    snap_id,
    begin_interval_time,
    end_interval_time
FROM
    dba_hist_snapshot
ORDER BY
    snap_id DESC;

The exact information available depends on the Oracle version and licensing configuration.

Look at database time

Database time is one of the most useful concepts when interpreting performance information.

A simplified way to think about database time is:

Database Time
    =
CPU Time
+
Non-Idle Wait Time

A database can have high database time because sessions are consuming CPU, waiting for I/O, waiting for locks, or waiting for other resources.

Therefore, database time should be investigated together with the waits and SQL responsible for it.

Examine wait events

Wait events can help identify where sessions are spending time.

Examples include:

db file sequential read
db file scattered read
direct path read
log file sync
enq: TX - row lock contention

A high wait time does not automatically mean that the corresponding resource is the root cause.

For example, a large amount of single-block I/O may be associated with SQL that is performing many index lookups.

The investigation should therefore continue from the wait event to the SQL and workload generating it.

Examine expensive SQL

AWR reports can identify SQL statements that consumed significant resources during the selected interval.

Depending on the report and Oracle version, useful metrics may include:

Elapsed time
CPU time
Executions
Buffer gets
Physical reads
Rows processed
Parse activity

A statement with high total elapsed time is not necessarily inefficient.

For example:

SQL A
1 execution
60 seconds elapsed

and:

SQL B
60,000 executions
0.01 seconds each

represent different types of performance problems.

Total impact and per-execution behavior should both be considered.

Compare with a normal period

One of the strongest uses of historical performance data is comparison.

Suppose an application normally performs:

10,000 executions/hour

but during the incident performs:

80,000 executions/hour

The SQL itself may not have changed.

The workload may have changed.

Similarly, if physical reads increased significantly while the application workload remained approximately constant, further investigation may be required.

Historical comparison helps distinguish normal workload characteristics from unusual behavior.

Do not treat the AWR report as the root cause

An AWR report provides evidence.

It does not automatically provide the root cause.

For example:

High elapsed time
        |
        v
High wait time
        |
        v
I/O wait
        |
        v
Expensive SQL
        |
        v
Execution plan / workload
        |
        v
Underlying cause

The final step requires understanding the application, SQL, database configuration, and workload.

A practical AWR investigation process

A useful investigation sequence is:

1. Establish the incident window

Identify the exact period affected by the performance problem.

2. Identify the dominant resource

Determine whether CPU, I/O, concurrency, commits, network activity, or another resource appears significant.

3. Examine wait events

Identify the important waits during the period.

4. Identify SQL contributors

Find SQL statements responsible for significant database time or resource consumption.

5. Compare with normal behavior

Compare the affected period with a known healthy period.

6. Correlate with application activity

Determine whether application workload, deployment activity, batch processing, or other operational changes occurred.

7. Investigate the underlying cause

Use SQL execution plans, session information, configuration, application behavior, and other evidence to determine why the observed behavior occurred.

Common mistakes when reading AWR reports

Several mistakes can make AWR analysis less effective.

Looking only at the highest wait event

The highest wait event is not automatically the root cause.

The DBA should correlate the wait with SQL, sessions, workload, and the incident timeline.

Looking only at CPU

CPU utilization is important, but a database can experience serious performance problems because of I/O, locking, commits, or other waits.

Ignoring execution counts

A SQL statement that executes thousands of times can have a significant cumulative impact even when each individual execution is relatively fast.

Ignoring the application workload

Database performance is closely connected to application behavior.

Changes in connection usage, transaction patterns, batch processing, or SQL execution frequency can significantly affect database performance.

Final thoughts

AWR is most valuable when it is used as part of a structured investigation rather than treated as a collection of performance numbers.

The important question is not simply:

Which statistic is highest?

The better question is:

What changed during the affected period, and what database activity explains that change?

A disciplined approach using database time, wait events, SQL statistics, and historical comparison can turn a large AWR report into a useful troubleshooting tool.
