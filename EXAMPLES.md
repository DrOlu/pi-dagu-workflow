# pi-dagu-workflow Extension Examples

## Example 1: Create a Simple Backup Workflow

**User says:**
> Create a Dagu workflow that backs up my PostgreSQL database daily at 3 AM, sends me an email if it fails, and keeps the last 7 days of backups.

**Pi will:**
1. Call `dagu_create_workflow` with:
   - requirements: "Backup PostgreSQL database daily at 3 AM..."
   - name: "daily_db_backup"
   - schedule: "0 3 * * *"
   - steps: extract, backup, verify, cleanup
   - notifications: on_failure email
   - deploy: true

**Generated Workflow:**
```yaml
name: daily_db_backup
description: Backup PostgreSQL database daily at 3 AM...

schedule:
  - "0 3 * * *"

type: graph

env:
  - DB_HOST: "localhost"
  - DB_NAME: "mydb"

steps:
  - id: backup_db
    name: Backup Database
    depends: []
    command: |
      pg_dump -h ${DB_HOST} ${DB_NAME} | gzip > /backup/db_$(date +%Y%m%d).sql.gz
    retry_policy:
      limit: 3
      interval_sec: 10
      backoff: true

  - id: verify_backup
    name: Verify Backup
    depends: [backup_db]
    command: |
      gzip -t /backup/db_$(date +%Y%m%d).sql.gz

  - id: cleanup_old
    name: Cleanup Old Backups
    depends: [verify_backup]
    command: |
      find /backup -name "db_*.sql.gz" -mtime +7 -delete
    continue_on:
      exit_code: [0, 1]

handler_on:
  failure:
    command: echo "Backup failed" | mail -s "Dagu Alert" admin@company.com
```

---

## Example 2: Create from Template

**User says:**
> Create an API monitoring workflow using the api_monitor template that checks https://api.myservice.com/health every 5 minutes and alerts to my Slack webhook.

**Pi will:**
1. Call `dagu_template_workflow` with:
   - template: "api_monitor"
   - name: "api_health_monitor"
   - customize: { api_url: "https://api.myservice.com/health", slack_webhook: "..." }
   - deploy: true

**Result:**
```yaml
name: api_health_monitor
description: API health monitoring

schedule:
  - "*/5 * * * *"

env:
  - API_URL: "https://api.myservice.com/health"
  - SLACK_WEBHOOK: "https://hooks.slack.com/..."

steps:
  - id: health_check
    name: Check API Health
    command: |
      curl -fsS ${API_URL} -o /dev/null
    retry_policy:
      limit: 3
      interval_sec: 5
      exit_code: [6, 22, 28]

handler_on:
  failure:
    command: |
      curl -X POST ${SLACK_WEBHOOK} -d '{"text":"🚨 API is down!"}'
```

---

## Example 3: ETL Pipeline

**User says:**
> Create an ETL pipeline that:
> 1. Extracts sales data from PostgreSQL at db.company.com
> 2. Transforms it with Python
> 3. Loads to our data warehouse
> 4. Runs daily at 2 AM

**Generated Workflow:**
```yaml
name: daily_sales_etl
description: Daily ETL pipeline for sales data

schedule:
  - "0 2 * * *"

type: graph

env:
  - DB_HOST: "db.company.com"
  - DB_NAME: "sales"

steps:
  - id: extract_sales
    name: Extract Sales Data
    depends: []
    command: |
      psql -h ${DB_HOST} ${DB_NAME} -c "COPY (SELECT * FROM sales WHERE date = CURRENT_DATE - 1) TO '/tmp/sales.csv' CSV"

  - id: transform_revenue
    name: Calculate Revenue
    depends: [extract_sales]
    command: python /scripts/calc_revenue.py --input /tmp/sales.csv
    output: REVENUE_DATA

  - id: transform_metrics
    name: Calculate Metrics
    depends: [extract_sales]
    command: python /scripts/calc_metrics.py --input /tmp/sales.csv
    output: METRICS_DATA

  - id: load_warehouse
    name: Load to Data Warehouse
    depends: [transform_revenue, transform_metrics]
    command: |
      python /scripts/load_dw.py --revenue ${REVENUE_DATA} --metrics ${METRICS_DATA}

  - id: cleanup
    name: Cleanup
    depends: [load_warehouse]
    command: rm -f /tmp/sales.csv
    continue_on:
      exit_code: [0, 1]

handler_on:
  success:
    command: echo "ETL completed for $(date +%Y-%m-%d)"
  failure:
    command: echo "ETL failed" | mail -s "Alert" data-team@company.com
```

---

## Example 4: CI/CD Pipeline

**User says:**
> Create a CI/CD pipeline for my Node.js app with testing, Docker build, and deployment with approval gate.

**Generated Workflow:**
```yaml
name: nodejs_app_deploy
description: CI/CD pipeline for Node.js app

type: graph

env:
  - APP_NAME: "myapp"

steps:
  - id: test
    name: Run Tests
    depends: []
    command: |
      npm ci
      npm test

  - id: build
    name: Build Docker Image
    depends: [test]
    command: |
      docker build -t ${APP_NAME}:${DAG_RUN_ID} .

  - id: push
    name: Push to Registry
    depends: [build]
    command: |
      docker push ${APP_NAME}:${DAG_RUN_ID}

  - id: deploy_staging
    name: Deploy to Staging
    depends: [push]
    command: |
      kubectl set image deployment/app app=${APP_NAME}:${DAG_RUN_ID} -n staging

  - id: deploy_production
    name: Deploy to Production
    depends: [deploy_staging]
    command: |
      kubectl set image deployment/app app=${APP_NAME}:${DAG_RUN_ID} -n production
    approval:
      prompt: "Review staging deployment before approving production"
      input: [APPROVED_BY, MAINTENANCE_WINDOW]
      required: [APPROVED_BY]
```

---

## Example 5: Managing the Scheduler

**User says:**
> Check if Dagu scheduler is running, start it if not, and show me all my workflows.

**Pi Actions:**
1. Run `/dagu-status` - Check scheduler status
2. If not running, run `/dagu-start`
3. Run `/dagu-list` to show all workflows

**Output:**
```
✅ Scheduler is running (PID: 12345)

Workflows:
- daily_db_backup.yaml
- api_health_monitor.yaml
- daily_sales_etl.yaml
- nodejs_app_deploy.yaml
```

---

## Example 6: Run and Monitor

**User says:**
> Run the daily_sales_etl workflow now (not waiting for schedule) and show me the status.

**Pi Actions:**
1. Call `dagu_run_workflow` with workflow_name: "daily_sales_etl"
2. After completion, call `dagu_get_status` with workflow_name: "daily_sales_etl"

**Output:**
```
🚀 Running workflow "daily_sales_etl"...

Workflow completed successfully!

Status: Succeeded
Run ID: 019d5fbc-...
Started: 2026-04-05 14:30:00
Duration: 45s

Steps:
✓ Extract Sales Data (12s)
✓ Calculate Revenue (15s)
✓ Calculate Metrics (15s)
✓ Load to Data Warehouse (3s)
✓ Cleanup (0s)
```

---

## Usage Summary

### Natural Language Creation
- "Create a workflow that..."
- "Build a Dagu job to..."
- "Set up automation for..."

### Template Usage
- "Use the ETL template..."
- "Create from the backup template..."
- "Use api_monitor template with..."

### Management
- "/dagu-start" - Start scheduler
- "/dagu-stop" - Stop scheduler
- "/dagu-list" - List workflows
- "/dagu-status" - Check status
- "/dagu-install" - Install Dagu

### Manual Operations
- "Run the backup workflow now"
- "Check status of daily-etl"
- "Validate my workflow file"
