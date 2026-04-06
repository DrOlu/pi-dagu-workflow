# pi-dagu-workflow Extension

A comprehensive Pi extension for Dagu workflow orchestration. Create, validate, deploy, and manage Dagu workflows directly from Pi.

## Features

### 🛠️ Custom Tools
- **dagu_create_workflow** - Create workflows from natural language requirements
- **dagu_validate_workflow** - Validate workflow YAML files
- **dagu_run_workflow** - Execute workflows manually
- **dagu_get_status** - Check workflow status and logs
- **dagu_template_workflow** - Create from predefined templates
- **dagu_manage_scheduler** - Start/stop/restart the Dagu scheduler

### ⌨️ Commands
- `/dagu-install` - Install Dagu on macOS/Linux
- `/dagu-start` - Start the scheduler
- `/dagu-stop` - Stop the scheduler
- `/dagu-list` - List all workflows
- `/dagu-status [workflow]` - Check workflow status

### 📋 Templates
- `etl_pipeline` - Data extraction, transform, load
- `ci_cd` - Build, test, deploy pipeline
- `backup_job` - Automated backups with verification
- `api_monitor` - API health checking
- `data_processing` - Batch data processing
- `notification_job` - Scheduled notifications

## Installation

### Option 1: Global Installation (Recommended)

```bash
# Copy to global extensions directory
mkdir -p ~/.pi/agent/extensions/pi-dagu-workflow
cp -r src ~/.pi/agent/extensions/pi-dagu-workflow/
cp package.json ~/.pi/agent/extensions/pi-dagu-workflow/

# Or clone directly
git clone https://github.com/yourusername/pi-dagu-workflow ~/.pi/agent/extensions/pi-dagu-workflow
```

Then reload Pi:
```
/reload
```

### Option 2: Quick Test

```bash
pi -e ./src/index.ts
```

### Option 3: npm Package (Future)

```bash
npm install -g pi-dagu-workflow
# Add to Pi settings.json
```

## Usage Examples

### Create a Workflow

```
Create a Dagu workflow that:
1. Downloads data from https://api.example.com/data every hour
2. Processes it with Python
3. Uploads results to S3
4. Sends Slack notification on completion
```

Pi will use the `dagu_create_workflow` tool to generate the YAML.

### Use a Template

```
Create an ETL pipeline workflow named "daily-sales-etl" using the etl_pipeline template.
Database host: db.company.com
Database name: sales_prod
```

### Deploy and Run

```
Deploy the "daily-sales-etl" workflow and start the scheduler
```

### Monitor

```
Check status of "daily-sales-etl" workflow
```

## Requirements

- Dagu 2.0+ installed (`brew install dagu-org/dagu/dagu` or see https://dagu.dev)
- Pi 1.0+

## File Structure

```
pi-dagu-workflow/
├── src/
│   └── index.ts          # Main extension file
├── package.json          # Extension metadata
└── README.md            # This file
```

## Extension API

The extension provides these tools to Pi:

### dagu_create_workflow
```typescript
{
  requirements: string,      // Natural language description
  name: string,              // Workflow name
  schedule?: string,        // Cron schedule
  steps: Step[],             // Step definitions
  validate?: boolean,       // Validate after creation
  deploy?: boolean,         // Deploy to ~/.config/dagu/dags/
  env_vars?: Record<string, string>,
  notifications?: {
    on_success?: boolean,
    on_failure?: boolean,
    slack_webhook?: string,
    email?: string,
  }
}
```

### dagu_template_workflow
```typescript
{
  template: "etl_pipeline" | "ci_cd" | "backup_job" | 
            "api_monitor" | "data_processing" | "notification_job",
  name: string,
  customize?: Record<string, string>,
  deploy?: boolean
}
```

### dagu_run_workflow
```typescript
{
  workflow_name: string,
  dry_run?: boolean,
  params?: Record<string, string>
}
```

## Configuration

The extension automatically detects Dagu installation and version on startup. It will:
- Notify if Dagu is not installed
- Show Dagu version in status bar
- Track scheduler state

## Development

### Testing

```bash
# Test extension with Pi
pi -e ./src/index.ts

# Or copy to extensions and reload
mkdir -p ~/.pi/agent/extensions/pi-dagu-workflow
cp src/index.ts ~/.pi/agent/extensions/pi-dagu-workflow/
cp package.json ~/.pi/agent/extensions/pi-dagu-workflow/
pi
/reload
```

### Build (if needed)

The extension uses jiti for TypeScript, so no build step is required.

## Troubleshooting

### Extension not loading
- Check file location: `~/.pi/agent/extensions/pi-dagu-workflow/src/index.ts`
- Run `/reload` in Pi
- Check Pi logs for errors

### Dagu not found
- Run `/dagu-install` command
- Or install manually: `brew install dagu-org/dagu/dagu`

### Scheduler won't start
- Check if port 8090 is in use: `lsof -i :8090`
- Check logs: `cat ~/.dagu/scheduler.log`

## License

MIT

## Contributing

PRs welcome! Please follow the Pi extension patterns.

## See Also

- [Dagu Documentation](https://docs.dagu.sh)
- [Pi Extensions Documentation](https://github.com/badlogic/pi-mono/tree/main/docs/extensions.md)
- [Dagu Examples](https://docs.dagu.sh/writing-workflows/examples)
