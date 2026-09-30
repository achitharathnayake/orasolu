---
title: "Oracle Tablespaces: Understanding Space, Datafiles, and Capacity"
description: "A practical guide to checking Oracle tablespace usage, datafiles, autoextend, free space, and database storage capacity."
category: "Storage & Capacity"

tags:
  - "Oracle Database"
  - "Tablespaces"
  - "Storage"
  - "Capacity"
  - "DBA"

publishedDate: "2025-11-08"

author: "Achitha Rathnayake"

featured: false

draft: false
---

## Introduction

Tablespaces are one of the basic storage structures in an Oracle Database.

When a database starts running out of space, the problem is often reported simply as:

```text
Tablespace is full
```

But that message does not immediately tell the DBA what is actually happening.

The tablespace may have:

- Very little free space
- A datafile that cannot autoextend
- Reached the datafile maximum size
- Underlying storage capacity problems
- Rapid data growth
- Fragmented free space
- Temporary tablespace pressure
- An unexpected growth pattern

A useful tablespace investigation should therefore answer:

- How much space is being used?
- How much free space is available?
- Which datafiles belong to the tablespace?
- Are the datafiles allowed to grow?
- What is the maximum possible size?
- Is the underlying storage capable of supporting the growth?
- Is the tablespace actually approaching a capacity limit?

This article focuses on the checks that are useful when investigating Oracle tablespace capacity.

## Tablespace and Datafile

A tablespace is a logical storage structure inside the database.

Datafiles are the physical files that provide storage for permanent tablespaces.

A simplified relationship is:

```text
Database
   |
   v
Tablespace
   |
   +---- Datafile
   |
   +---- Datafile
   |
   +---- Datafile
```

For example:

```text
USERS
   |
   +---- users01.dbf
   |
   +---- users02.dbf
```

The tablespace is the logical database structure.

The datafiles provide the storage allocated to that tablespace.

This distinction is important when investigating space problems.

A tablespace can appear to have available space while the datafiles have reached a growth limit.

Similarly, a datafile may have room to grow according to its configuration while the underlying filesystem or ASM disk group does not have enough capacity.

## Check Tablespaces

Start by reviewing the tablespaces in the database.

```sql
SELECT
    tablespace_name,
    status,
    contents,
    extent_management,
    segment_space_management
FROM dba_tablespaces
ORDER BY tablespace_name;
```

Useful columns include:

- `TABLESPACE_NAME`
- `STATUS`
- `CONTENTS`
- `EXTENT_MANAGEMENT`
- `SEGMENT_SPACE_MANAGEMENT`

The `CONTENTS` column is particularly useful.

Typical values include:

```text
PERMANENT
TEMPORARY
UNDO
```

These tablespaces have different purposes and should not all be analyzed in exactly the same way.

## Check Tablespace Usage

A quick way to review tablespace utilization is:

```sql
SELECT
    tablespace_name,
    used_percent
FROM dba_tablespace_usage_metrics
ORDER BY used_percent DESC;
```

This provides a percentage-based view of tablespace usage.

It is useful for quickly identifying tablespaces that require attention.

For example:

```text
TABLESPACE_NAME    USED_PERCENT
----------------  ------------
APP_DATA                 82.4
USERS                    61.7
SYSTEM                   48.2
SYSAUX                   44.5
```

A high percentage should trigger investigation.

It should not automatically trigger a datafile resize.

The next step is to understand how the space is allocated and how the datafiles are configured.

## Check Datafiles

For permanent and undo tablespaces, review the associated datafiles.

```sql
SELECT
    file_id,
    file_name,
    tablespace_name,
    bytes / 1024 / 1024 AS size_mb,
    autoextensible,
    maxbytes / 1024 / 1024 AS max_size_mb
FROM dba_data_files
ORDER BY tablespace_name, file_id;
```

Important columns include:

- `FILE_ID`
- `FILE_NAME`
- `TABLESPACE_NAME`
- `BYTES`
- `AUTOEXTENSIBLE`
- `MAXBYTES`

For example:

```text
TABLESPACE_NAME    SIZE_MB    AUTOEXTENSIBLE    MAX_SIZE_MB
----------------  ---------  -----------------  ------------
APP_DATA              50000    YES                    100000
USERS                  5000    NO                       5000
```

The second datafile cannot grow beyond its current size because autoextend is disabled.

The first datafile can grow up to its configured maximum.

This distinction is important when assessing future capacity.

## Autoextend

Autoextend allows Oracle to automatically increase the size of a datafile when additional space is required.

A datafile can be configured with:

```text
AUTOEXTEND ON
```

or:

```text
AUTOEXTEND OFF
```

You can identify the configuration with:

```sql
SELECT
    file_name,
    autoextensible,
    increment_by,
    maxbytes / 1024 / 1024 AS max_size_mb
FROM dba_data_files
ORDER BY file_name;
```

`INCREMENT_BY` represents the autoextend increment in Oracle blocks.

The actual growth amount therefore depends on the database block size.

Autoextend can reduce the risk of a tablespace reaching its current allocated size.

However, autoextend does not create unlimited storage.

The datafile may still have a configured maximum size.

The underlying filesystem or ASM storage must also have enough capacity for the growth.

## Check Maximum Datafile Size

When investigating a capacity problem, compare the current datafile size with its maximum configured size.

```sql
SELECT
    file_name,
    bytes / 1024 / 1024 AS current_size_mb,
    maxbytes / 1024 / 1024 AS max_size_mb,
    CASE
        WHEN autoextensible = 'YES'
        THEN (maxbytes - bytes) / 1024 / 1024
        ELSE 0
    END AS growth_available_mb
FROM dba_data_files
ORDER BY growth_available_mb;
```

This helps answer an important question:

```text
Can this datafile still grow?
```

For example:

```text
Current Size:       90 GB
Maximum Size:      100 GB
Growth Available:   10 GB
```

If the tablespace continues growing rapidly, the remaining 10 GB may not provide much protection.

Capacity planning should therefore consider the growth rate rather than only the current free space.

## Check Free Space

For permanent tablespaces, free extents can be reviewed using `DBA_FREE_SPACE`.

```sql
SELECT
    tablespace_name,
    SUM(bytes) / 1024 / 1024 AS free_space_mb
FROM dba_free_space
GROUP BY tablespace_name
ORDER BY free_space_mb;
```

This provides the amount of free space represented by free extents.

For example:

```text
TABLESPACE_NAME    FREE_SPACE_MB
----------------  --------------
USERS                    1250
APP_DATA                  820
REPORTING                5400
```

This is useful when investigating where free space exists.

However, free space should not be interpreted without considering the total allocated size and the datafile configuration.

## Compare Used and Free Space

A useful capacity check combines allocated space and free space.

For example:

```sql
SELECT
    df.tablespace_name,
    ROUND(SUM(df.bytes) / 1024 / 1024) AS allocated_mb,
    ROUND(NVL(fs.free_bytes, 0) / 1024 / 1024) AS free_mb,
    ROUND(
        (SUM(df.bytes) - NVL(fs.free_bytes, 0))
        / 1024 / 1024
    ) AS used_mb
FROM dba_data_files df
LEFT JOIN (
    SELECT
        tablespace_name,
        SUM(bytes) AS free_bytes
    FROM dba_free_space
    GROUP BY tablespace_name
) fs
    ON fs.tablespace_name = df.tablespace_name
GROUP BY
    df.tablespace_name,
    fs.free_bytes
ORDER BY allocated_mb DESC;
```

This gives a useful high-level view of permanent and undo tablespaces.

The important values are:

```text
Allocated Space
Free Space
Used Space
```

The numbers should be interpreted together with datafile growth settings.

## Tablespace Percentage Is Not the Whole Story

A common mistake is to look only at a percentage.

Consider:

```text
Tablespace A
Used: 90%
Free: 10 GB

Tablespace B
Used: 70%
Free: 2 GB
```

Tablespace A has a higher utilization percentage.

However, Tablespace B has less absolute free space.

The correct interpretation depends on:

- Current growth rate
- Datafile size
- Maximum datafile size
- Number of datafiles
- Underlying storage capacity
- Application workload
- Expected future growth

A percentage is therefore a signal for investigation, not the complete capacity decision.

## Check Datafile Location

The physical location of the datafile is also important.

```sql
SELECT
    file_id,
    tablespace_name,
    file_name,
    bytes / 1024 / 1024 AS size_mb
FROM dba_data_files
ORDER BY file_id;
```

For filesystem-based databases, the datafile path can help identify the filesystem that must be monitored.

For example:

```text
/u01/oradata/DB01/users01.dbf
/u02/oradata/DB01/app_data01.dbf
```

The tablespace may have free database space while the filesystem is approaching its capacity limit.

This can become a problem when Oracle attempts to extend a datafile.

## Filesystem Capacity

A database administrator should also check the operating system storage.

For example, on Linux:

```text
df -h
```

The important point is that database-level free space and operating-system free space are different measurements.

Consider:

```text
Tablespace
    |
    v
Datafile
    |
    v
Filesystem
    |
    v
Physical Storage
```

A datafile may be configured to grow by another 20 GB.

But if the filesystem has only 5 GB available, the datafile cannot successfully grow by 20 GB.

The database configuration and the underlying storage must therefore be considered together.

## ASM Storage

When Oracle Automatic Storage Management is being used, the underlying storage is usually an ASM disk group rather than a traditional filesystem.

A basic ASM capacity check can be performed from the ASM instance:

```sql
SELECT
    name,
    total_mb,
    free_mb,
    usable_file_mb
FROM v$asm_diskgroup
ORDER BY name;
```

Important values include:

- `TOTAL_MB`
- `FREE_MB`
- `USABLE_FILE_MB`

`USABLE_FILE_MB` is particularly useful when assessing how much space is available for files while considering ASM redundancy requirements.

For example:

```text
DISKGROUP    TOTAL_MB    FREE_MB    USABLE_FILE_MB
----------  ----------  ---------  ---------------
DATA         500000      85000          42000
FRA          200000      30000          30000
```

The available ASM capacity should be considered before adding or enlarging database files.

## Check Tablespace Growth

Current free space does not tell you how quickly the database is consuming storage.

A tablespace with 50 GB free may be healthy today but could become a problem if it is growing by several gigabytes every day.

A simple growth investigation can use AWR or historical monitoring data.

For example, compare tablespace usage across different observation periods.

```text
Day 1
APP_DATA
Used:  420 GB

Day 15
APP_DATA
Used:  455 GB

Day 30
APP_DATA
Used:  490 GB
```

The important observation is the growth trend.

The DBA should ask:

```text
How much space is being consumed?

How quickly is it growing?

How much capacity remains?

When will additional capacity be required?
```

Capacity planning is more useful than reacting only after the tablespace becomes full.

## Find Large Segments

When a tablespace is growing unexpectedly, identify the segments consuming the space.

A useful query is:

```sql
SELECT
    owner,
    segment_name,
    segment_type,
    tablespace_name,
    bytes / 1024 / 1024 AS size_mb
FROM dba_segments
WHERE tablespace_name = '&tablespace_name'
ORDER BY bytes DESC
FETCH FIRST 20 ROWS ONLY;
```

This can identify large:

- Tables
- Indexes
- LOB segments
- Partitions
- Other segment types

For example:

```text
TABLE
INDEX
TABLE
LOBSEGMENT
INDEX
```

The next question is whether the growth is expected.

A large table may simply reflect normal application growth.

An unexpectedly large index or LOB segment may require further investigation.

## Partitioned Tables

Partitioned objects can also contribute significantly to tablespace growth.

When investigating a large partitioned table, segment-level information can be reviewed with:

```sql
SELECT
    owner,
    segment_name,
    partition_name,
    segment_type,
    tablespace_name,
    bytes / 1024 / 1024 AS size_mb
FROM dba_segments
WHERE tablespace_name = '&tablespace_name'
AND partition_name IS NOT NULL
ORDER BY bytes DESC
FETCH FIRST 20 ROWS ONLY;
```

This can help identify which partitions are consuming the most space.

Partition growth can sometimes be associated with:

- Increasing transaction volume
- Historical data retention
- New partitions
- Bulk loads
- Index growth
- Application changes

The storage increase should be compared with the expected business workload.

## Check Temporary Tablespace

Temporary tablespaces are different from permanent tablespaces.

Temporary space is used for operations such as:

- Sorts
- Hash operations
- Temporary table processing
- Other operations requiring temporary workspace

The available temporary space can be reviewed with:

```sql
SELECT
    tablespace_name,
    tablespace_size / 1024 / 1024 AS tablespace_mb,
    allocated_space / 1024 / 1024 AS allocated_mb,
    free_space / 1024 / 1024 AS free_mb
FROM dba_temp_free_space
ORDER BY tablespace_name;
```

Temporary space should be investigated separately from permanent tablespace space.

A temporary tablespace reaching high utilization does not necessarily mean that permanent datafiles need to be resized.

The DBA should first identify which sessions or SQL statements are consuming temporary space.

## Find Sessions Using Temporary Space

Current temporary space usage can be investigated using `V$TEMPSEG_USAGE`.

```sql
SELECT
    username,
    session_addr,
    sql_id,
    tablespace,
    blocks,
    blocks * 8192 / 1024 / 1024 AS size_mb
FROM v$tempseg_usage
ORDER BY blocks DESC;
```

The block size in the example should match the relevant tablespace block size.

For databases with multiple block sizes, avoid assuming that `8192` is always correct.

A safer approach is to obtain the block size for the relevant temporary tablespace before converting blocks to megabytes.

The important point is to identify the sessions and SQL statements consuming temporary space.

## Check Undo Tablespace

Undo tablespaces should also be treated differently from normal application tablespaces.

You can identify the configured undo tablespace with:

```sql
SELECT
    value AS undo_tablespace
FROM v$parameter
WHERE name = 'undo_tablespace';
```

Then review its datafiles:

```sql
SELECT
    file_name,
    bytes / 1024 / 1024 AS size_mb,
    autoextensible,
    maxbytes / 1024 / 1024 AS max_size_mb
FROM dba_data_files
WHERE tablespace_name = (
    SELECT value
    FROM v$parameter
    WHERE name = 'undo_tablespace'
);
```

Undo capacity is influenced by workload and transaction behavior.

For example, long-running transactions can retain undo for a significant period.

Therefore, simply increasing undo space without understanding the workload may not address the underlying problem.

## Datafile Resize

If a tablespace requires more space, a datafile may need to be resized or a new datafile may need to be added.

For example:

```sql
ALTER DATABASE DATAFILE
'/u01/oradata/DB01/users01.dbf'
RESIZE 10G;
```

Before resizing a datafile, verify:

- The requested size is appropriate
- The underlying storage has capacity
- The datafile can be resized safely
- The tablespace actually requires more space
- The growth is expected

Resizing a datafile is not the same as enabling autoextend.

A resize changes the current allocated size.

Autoextend controls whether Oracle can automatically increase the file when more space is required.

## Add a Datafile

Another option is adding a new datafile.

For example:

```sql
ALTER TABLESPACE users
ADD DATAFILE
'/u01/oradata/DB01/users02.dbf'
SIZE 10G
AUTOEXTEND ON
NEXT 1G
MAXSIZE 50G;
```

The exact storage path and sizing strategy depend on the database architecture.

For ASM-managed databases, the syntax and storage configuration will normally differ from filesystem-based databases.

The important point is that adding space should be a deliberate capacity decision rather than simply a reaction to an alert.

## Autoextend Is Not Unlimited

A common misconception is:

```text
AUTOEXTEND ON = No Space Problems
```

That is not correct.

A datafile with autoextend enabled can still reach:

- Its `MAXSIZE`
- The operating system filesystem limit
- ASM capacity limits
- Platform-specific file size limits
- Database storage constraints

For example:

```text
Tablespace
   |
   v
Datafile
   |
   +---- AUTOEXTEND ON
   |
   +---- MAXSIZE 100 GB
   |
   v
Filesystem / ASM
   |
   v
Available Physical Capacity
```

All of these layers must have sufficient capacity.

## What Happens When a Tablespace Fills?

When Oracle cannot allocate additional space for an operation, the application may encounter an error.

A common example is:

```text
ORA-01653: unable to extend table
```

For an index, a related error can be:

```text
ORA-01654: unable to extend index
```

These errors indicate that Oracle could not allocate the required additional extent.

The correct response is not simply to resize a datafile immediately.

First determine:

```text
Which tablespace?
        |
        v
Which object?
        |
        v
How much free space?
        |
        v
Can the datafile grow?
        |
        v
Is underlying storage available?
        |
        v
Why is the object growing?
```

This provides a much more useful troubleshooting path.

## A Practical Capacity Check

A regular tablespace health check can follow this sequence:

```text
Tablespace
    |
    v
Usage
    |
    v
Datafiles
    |
    v
Free Space
    |
    v
Autoextend / Max Size
    |
    v
Filesystem / ASM
    |
    v
Growth Rate
    |
    v
Large Segments
    |
    v
Capacity Action
```

Each step answers a different question.

The objective is to understand both the current state and the expected future state.

## Common Mistakes

Several common mistakes can make tablespace investigations misleading.

### Looking Only at Used Percentage

A percentage does not show the entire capacity situation.

Always consider the actual amount of free space and the growth rate.

### Assuming Autoextend Solves Capacity

Autoextend only allows the datafile to grow according to its configuration.

It does not guarantee that additional storage exists.

### Ignoring Maximum Size

A datafile may be configured with autoextend enabled but still have a maximum size.

Check `MAXBYTES`.

### Ignoring ASM or Filesystem Capacity

Database free space is different from physical storage capacity.

Both should be checked.

### Resizing Without Understanding Growth

Adding a large amount of space may hide an unexpected growth problem.

When possible, identify the objects consuming the space.

### Treating TEMP Like a Permanent Tablespace

Temporary space has different usage patterns and should be investigated with temporary-space views.

### Ignoring Undo Workload

Undo consumption can be influenced by long-running transactions and workload behavior.

The solution is not always simply adding more space.

## A Simple DBA Investigation

When a tablespace alert is received, the investigation can follow this sequence:

```text
Tablespace Alert
      |
      v
Check Usage
      |
      v
Check Datafiles
      |
      v
Check Free Space
      |
      v
Check Autoextend
      |
      v
Check Maximum Size
      |
      v
Check Filesystem / ASM
      |
      v
Check Growth
      |
      v
Find Large Segments
      |
      v
Determine Action
```

The final action may be:

```text
Resize Datafile
       OR
Add Datafile
       OR
Enable / Adjust Autoextend
       OR
Investigate Unexpected Growth
       OR
Increase Underlying Storage
```

The correct choice depends on the evidence.

## Capacity Planning

Tablespace monitoring should not only answer:

```text
Is the tablespace full?
```

A better question is:

```text
When will the available capacity become insufficient?
```

For example:

```text
Current Free Space:       100 GB
Average Daily Growth:       5 GB
Estimated Remaining Time:  20 days
```

This gives the DBA time to plan the required storage change.

Capacity planning should consider:

- Current free space
- Datafile maximum size
- Autoextend settings
- Daily or weekly growth
- Application release schedules
- Data retention policies
- Filesystem capacity
- ASM capacity
- Backup and recovery requirements

The goal is to increase capacity before the database reaches a critical condition.

## Tablespace Capacity Checklist

A practical checklist can be:

```text
[ ] Check tablespace status
[ ] Check tablespace type
[ ] Check used percentage
[ ] Check allocated space
[ ] Check free space
[ ] Check datafile sizes
[ ] Check autoextend
[ ] Check maximum datafile size
[ ] Check filesystem or ASM capacity
[ ] Check growth rate
[ ] Identify large segments
[ ] Check TEMP separately
[ ] Check UNDO separately
[ ] Determine required capacity action
```

This provides a repeatable process for regular database health checks.

## Conclusion

Tablespace management is not simply about finding a percentage that is too high.

A useful capacity investigation connects:

```text
Tablespace
    |
    v
Usage
    |
    v
Datafiles
    |
    v
Free Space
    |
    v
Autoextend / Maximum Size
    |
    v
Underlying Storage
    |
    v
Growth Rate
    |
    v
Capacity Decision
```

Check the current usage.

Understand how the datafiles are configured.

Determine whether they can still grow.

Check the underlying filesystem or ASM storage.

Then investigate what is consuming the space and how quickly the database is growing.

The most useful tablespace monitoring is not about waiting for a tablespace to become full.

It is about understanding the capacity trend early enough to take action before the database runs out of space.