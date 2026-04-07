import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Pi Dagu Workflow Extension
 * 
 * Comprehensive Dagu workflow orchestration for Pi.
 * Create, validate, deploy, and manage Dagu workflows through
 * natural language or structured commands.
 * 
 * Features:
 * - Natural language workflow creation
 * - YAML validation and generation
 * - Scheduler management
 * - Workflow monitoring
 * - Template library
 */

export default function (pi: ExtensionAPI) {
  // Track scheduler state
  let schedulerRunning = false;
  let schedulerPid: number | null = null;

  // ==================== EVENT HANDLERS ====================

  pi.on("session_start", async (_event, ctx) => {
    // Check if Dagu is installed
    try {
      const result = await checkDaguInstallation();
      if (result.installed) {
        ctx.ui.notify(`✓ Dagu ${result.version} ready`, "success");
        ctx.ui.setStatus("dagu", `v${result.version}`);
      } else {
        ctx.ui.notify("⚠ Dagu not installed. Use /dagu-install to set up.", "warning");
        ctx.ui.setStatus("dagu", "not installed");
      }
    } catch {
      ctx.ui.notify("⚠ Could not check Dagu installation", "warning");
    }
  });

  // ==================== COMMANDS ====================

  // Command: Install Dagu
  pi.registerCommand("dagu-install", {
    description: "Install Dagu on this system",
    handler: async (_args, ctx) => {
      const platform = process.platform;
      
      ctx.ui.notify("Installing Dagu...", "info");
      
      try {
        if (platform === "darwin") {
          await pi.exec("brew", ["install", "dagu-org/dagu/dagu"]);
        } else if (platform === "linux") {
          await pi.exec("sh", ["-c", "curl -fsSL https://dagu.dev/install.sh | sh"]);
        } else {
          ctx.ui.notify("Please install Dagu manually from https://dagu.dev", "error");
          return;
        }
        
        ctx.ui.notify("✓ Dagu installed successfully!", "success");
        ctx.ui.setStatus("dagu", "installed");
      } catch (err) {
        ctx.ui.notify(`✗ Installation failed: ${err}`, "error");
      }
    },
  });

  // Command: Start scheduler
  pi.registerCommand("dagu-start", {
    description: "Start Dagu scheduler",
    handler: async (_args, ctx) => {
      if (schedulerRunning) {
        ctx.ui.notify("Scheduler already running", "info");
        return;
      }

      try {
        await pi.exec("sh", ["-c", "nohup dagu scheduler > ~/.dagu/scheduler.log 2>&1 &"]);
        
        // Wait and check
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = await pi.exec("sh", ["-c", "pgrep -f 'dagu scheduler' || echo 'not running'"]);
        
        if (result.stdout?.includes("not running")) {
          ctx.ui.notify("✗ Failed to start scheduler", "error");
        } else {
          schedulerRunning = true;
          schedulerPid = parseInt(result.stdout?.trim() || "0");
          ctx.ui.notify("✓ Scheduler started", "success");
          ctx.ui.setStatus("dagu", "scheduler running");
        }
      } catch (err) {
        ctx.ui.notify(`✗ Error: ${err}`, "error");
      }
    },
  });

  // Command: Stop scheduler
  pi.registerCommand("dagu-stop", {
    description: "Stop Dagu scheduler",
    handler: async (_args, ctx) => {
      try {
        await pi.exec("sh", ["-c", "pkill -f 'dagu scheduler' || true"]);
        schedulerRunning = false;
        schedulerPid = null;
        ctx.ui.notify("✓ Scheduler stopped", "success");
        ctx.ui.setStatus("dagu", "scheduler stopped");
      } catch (err) {
        ctx.ui.notify(`Error: ${err}`, "error");
      }
    },
  });

  // Command: List workflows
  pi.registerCommand("dagu-list", {
    description: "List all Dagu workflows",
    handler: async (_args, ctx) => {
      try {
        const result = await pi.exec("sh", ["-c", "ls -la ~/.config/dagu/dags/ 2>/dev/null || echo 'No workflows found'"]);
        
        ctx.ui.notify("Workflows:", "info");
        console.log(result.stdout);
      } catch (err) {
        ctx.ui.notify(`Error: ${err}`, "error");
      }
    },
  });

  // Command: Workflow status
  pi.registerCommand("dagu-status", {
    description: "Check workflow status",
    handler: async (args, ctx) => {
      const workflowName = args || "all";
      
      try {
        const result = await pi.exec("sh", ["-c", workflowName === "all" 
          ? "dagu history 2>&1 | head -20 || echo 'No history available'"
          : `dagu status ${workflowName} 2>&1 || echo 'Workflow not found'`]);
        
        ctx.ui.notify(`Status for ${workflowName}:`, "info");
        console.log(result.stdout);
      } catch (err) {
        ctx.ui.notify(`Error: ${err}`, "error");
      }
    },
  });

  // ==================== TOOLS ====================

  // Tool: Create Dagu Workflow
  pi.registerTool({
    name: "dagu_create_workflow",
    label: "Create Dagu Workflow",
    description: "Create a Dagu workflow from requirements. Generates YAML and optionally validates and deploys it.",
    parameters: Type.Object({
      requirements: Type.String({ 
        description: "Natural language description of what the workflow should do" 
      }),
      name: Type.String({ 
        description: "Workflow name (snake_case recommended)" 
      }),
      schedule: Type.Optional(Type.String({ 
        description: "Cron schedule (e.g., '0 2 * * *' for 2 AM daily, '*/5 * * * *' for every 5 min)" 
      })),
      steps: Type.Array(Type.Object({
        name: Type.String({ description: "Step name" }),
        command: Type.String({ description: "Shell command to execute" }),
        depends_on: Type.Optional(Type.Array(Type.String({ description: "Step IDs this step depends on" }))),
        retry_count: Type.Optional(Type.Number({ description: "Number of retries on failure" })),
        timeout_seconds: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
      })),
      validate: Type.Optional(Type.Boolean({ 
        description: "Validate the workflow after creation", 
        default: true 
      })),
      deploy: Type.Optional(Type.Boolean({ 
        description: "Deploy to ~/.config/dagu/dags/", 
        default: false 
      })),
      env_vars: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Environment variables for the workflow"
      })),
      notifications: Type.Optional(Type.Object({
        on_success: Type.Optional(Type.Boolean()),
        on_failure: Type.Optional(Type.Boolean()),
        slack_webhook: Type.Optional(Type.String()),
        email: Type.Optional(Type.String()),
      })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        onUpdate({ toolCallId, content: [{ type: "text", text: "📝 Generating Dagu workflow..." }] });

        // Generate YAML
        const yaml = generateWorkflowYAML(params);
        
        // Write to temp file for validation
        const tempFile = `/tmp/${params.name}_workflow.yaml`;
        await pi.exec("sh", ["-c", `cat > ${tempFile} << 'EOF'\n${yaml}\nEOF`]);
        
        let validationResult = { valid: true, error: null };
        
        // Validate if requested
        if (params.validate) {
          onUpdate({ toolCallId, content: [{ type: "text", text: "🔍 Validating workflow..." }] });
          validationResult = await validateWorkflow(tempFile, pi);
        }
        
        // Deploy if requested and valid
        if (params.deploy && validationResult.valid) {
          onUpdate({ toolCallId, content: [{ type: "text", text: "🚀 Deploying workflow..." }] });
          
          const dagsDir = `${process.env.HOME}/.config/dagu/dags`;
          await pi.exec("sh", ["-c", `mkdir -p ${dagsDir}`]);
          await pi.exec("sh", ["-c", `cp ${tempFile} ${dagsDir}/${params.name}.yaml`]);
          
          onUpdate({ toolCallId, content: [{ type: "text", text: `✅ Deployed to ${dagsDir}/${params.name}.yaml` }] });
        }
        
        return {
          content: [{ 
            type: "text", 
            text: validationResult.valid 
              ? `✅ Workflow "${params.name}" created successfully!${params.deploy ? ' Deployed and ready to run.' : ''}`
              : `⚠️ Workflow created but validation failed: ${validationResult.error}`
          }],
          details: {
            yaml,
            file_path: params.deploy ? `${process.env.HOME}/.config/dagu/dags/${params.name}.yaml` : tempFile,
            validated: params.validate,
            deployed: params.deploy && validationResult.valid,
            valid: validationResult.valid,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // Tool: Validate Workflow
  pi.registerTool({
    name: "dagu_validate_workflow",
    label: "Validate Dagu Workflow",
    description: "Validate a Dagu workflow YAML file",
    parameters: Type.Object({
      file_path: Type.String({ description: "Path to workflow YAML file" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      try {
        onUpdate({ toolCallId, content: [{ type: "text", text: "🔍 Validating workflow..." }] });
        
        const result = await validateWorkflow(params.file_path, pi);
        
        return {
          content: [{ 
            type: "text", 
            text: result.valid 
              ? "✅ Workflow is valid"
              : `❌ Validation failed: ${result.error}`
          }],
          details: result,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // Tool: Run Workflow
  pi.registerTool({
    name: "dagu_run_workflow",
    label: "Run Dagu Workflow",
    description: "Execute a Dagu workflow immediately (manual run)",
    parameters: Type.Object({
      workflow_name: Type.String({ description: "Name of the workflow (without .yaml extension)" }),
      dry_run: Type.Optional(Type.Boolean({ 
        description: "Simulate without executing", 
        default: false 
      })),
      params: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Parameters to pass to the workflow"
      })),
    }),
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      try {
        const dagsDir = `${process.env.HOME}/.config/dagu/dags`;
        const workflowFile = `${dagsDir}/${params.workflow_name}.yaml`;
        
        // Check if file exists
        const checkResult = await pi.exec("sh", ["-c", `test -f ${workflowFile} && echo "exists" || echo "not found"`]);
        
        if (checkResult.stdout?.trim() !== "exists") {
          return {
            content: [{ type: "text", text: `❌ Workflow "${params.workflow_name}" not found in ${dagsDir}` }],
            details: { error: "Workflow not found" },
          };
        }
        
        onUpdate({ toolCallId, content: [{ type: "text", text: `🚀 ${params.dry_run ? 'Dry running' : 'Running'} workflow "${params.workflow_name}"...` }] });
        
        // Build command
        let command = params.dry_run 
          ? `dagu dry ${workflowFile}`
          : `dagu start ${workflowFile}`;
        
        // Add parameters if provided
        if (params.params && Object.keys(params.params).length > 0) {
          const paramStr = Object.entries(params.params)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
          command += ` -- ${paramStr}`;
        }
        
        const result = await pi.exec("sh", ["-c", command], { timeout: 300000 }); // 5 min timeout
        
        return {
          content: [{ 
            type: "text", 
            text: result.stdout || "Workflow executed"
          }],
          details: {
            stdout: result.stdout,
            stderr: result.stderr,
            exit_code: result.code,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // Tool: Get Workflow Status
  pi.registerTool({
    name: "dagu_get_status",
    label: "Get Workflow Status",
    description: "Get detailed status of a workflow run",
    parameters: Type.Object({
      workflow_name: Type.String({ description: "Workflow name" }),
      run_id: Type.Optional(Type.String({ description: "Specific run ID (optional)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      try {
        const command = params.run_id
          ? `dagu log ${params.workflow_name} ${params.run_id} 2>&1`
          : `dagu status ${params.workflow_name} 2>&1`;
        
        const result = await pi.exec("sh", ["-c", command]);
        
        return {
          content: [{ type: "text", text: result.stdout || "No status available" }],
          details: {
            workflow: params.workflow_name,
            run_id: params.run_id,
            raw_output: result.stdout,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // Tool: Create Workflow from Template
  pi.registerTool({
    name: "dagu_template_workflow",
    label: "Create from Template",
    description: "Create a workflow from a predefined template",
    parameters: Type.Object({
      template: Type.String({ 
        description: "Template name",
        enum: ["etl_pipeline", "ci_cd", "backup_job", "api_monitor", "data_processing", "notification_job"]
      }),
      name: Type.String({ description: "Workflow name" }),
      customize: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Template-specific customization options"
      })),
      deploy: Type.Optional(Type.Boolean({ default: false })),
    }),
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      try {
        onUpdate({ toolCallId, content: [{ type: "text", text: `📝 Creating workflow from ${params.template} template...` }] });
        
        const yaml = getTemplateYAML(params.template, params.name, params.customize || {});
        
        const tempFile = `/tmp/${params.name}_workflow.yaml`;
        await pi.exec("sh", ["-c", `cat > ${tempFile} << 'EOF'\n${yaml}\nEOF`]);
        
        // Validate
        const validation = await validateWorkflow(tempFile, pi);
        
        // Deploy if requested
        if (params.deploy && validation.valid) {
          const dagsDir = `${process.env.HOME}/.config/dagu/dags`;
          await pi.exec("sh", ["-c", `mkdir -p ${dagsDir}`]);
          await pi.exec("sh", ["-c", `cp ${tempFile} ${dagsDir}/${params.name}.yaml`]);
        }
        
        return {
          content: [{ 
            type: "text", 
            text: validation.valid 
              ? `✅ Created "${params.name}" from ${params.template} template${params.deploy ? ' and deployed' : ''}`
              : `⚠️ Created but validation failed: ${validation.error}`
          }],
          details: {
            yaml,
            template: params.template,
            valid: validation.valid,
            deployed: params.deploy && validation.valid,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // Tool: Manage Scheduler
  pi.registerTool({
    name: "dagu_manage_scheduler",
    label: "Manage Dagu Scheduler",
    description: "Start, stop, or check status of the Dagu scheduler",
    parameters: Type.Object({
      action: Type.String({ 
        description: "Action to perform",
        enum: ["start", "stop", "restart", "status"]
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      try {
        let result: { running: boolean; pid?: number; output?: string } = { running: false };
        
        switch (params.action) {
          case "start":
            onUpdate({ toolCallId, content: [{ type: "text", text: "🚀 Starting Dagu scheduler..." }] });
            
            // Check if already running
            const checkStart = await pi.exec("sh", ["-c", "pgrep -f 'dagu scheduler' || echo 'not running'"]);
            
            if (!checkStart.stdout?.includes("not running")) {
              return {
                content: [{ type: "text", text: "ℹ️ Scheduler already running" }],
                details: { running: true },
              };
            }
            
            await pi.exec("sh", ["-c", "nohup dagu scheduler > ~/.dagu/scheduler.log 2>&1 &"]);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            result = await checkSchedulerStatus(pi);
            break;
            
          case "stop":
            onUpdate({ toolCallId, content: [{ type: "text", text: "🛑 Stopping Dagu scheduler..." }] });
            await pi.exec("sh", ["-c", "pkill -f 'dagu scheduler' || true"]);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            result = await checkSchedulerStatus(pi);
            schedulerRunning = result.running;
            schedulerPid = result.pid || null;
            break;
            
          case "restart":
            onUpdate({ toolCallId, content: [{ type: "text", text: "🔄 Restarting Dagu scheduler..." }] });
            await pi.exec("sh", ["-c", "pkill -f 'dagu scheduler' || true"]);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await pi.exec("sh", ["-c", "nohup dagu scheduler > ~/.dagu/scheduler.log 2>&1 &"]);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            result = await checkSchedulerStatus(pi);
            break;
            
          case "status":
            result = await checkSchedulerStatus(pi);
            break;
        }
        
        schedulerRunning = result.running;
        schedulerPid = result.pid || null;
        
        return {
          content: [{ 
            type: "text", 
            text: result.running 
              ? `✅ Scheduler is running (PID: ${result.pid})`
              : params.action === "stop" 
                ? "✅ Scheduler stopped"
                : "❌ Scheduler is not running"
          }],
          details: result,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${err}` }],
          details: { error: String(err) },
        };
      }
    },
  });

  // ==================== HELPER FUNCTIONS ====================

  async function checkDaguInstallation(): Promise<{ installed: boolean; version?: string }> {
    try {
      const result = await pi.exec("sh", ["-c", "dagu version 2>&1 || echo 'not installed'"]);
      const output = result.stdout?.trim() || "";
      
      if (output.includes("not installed")) {
        return { installed: false };
      }
      
      // Parse version (e.g., "2.4.3" or "dagu version 2.4.3")
      const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
      return { 
        installed: true, 
        version: versionMatch ? versionMatch[1] : "unknown"
      };
    } catch {
      return { installed: false };
    }
  }

  async function validateWorkflow(filePath: string, piRef: ExtensionAPI): Promise<{ valid: boolean; error?: string }> {
    try {
      const result = await piRef.exec("sh", ["-c", `dagu validate ${filePath} 2>&1`]);
      
      if (result.stdout?.includes("valid") || result.stdout?.includes("succeeded")) {
        return { valid: true };
      }
      
      return { 
        valid: false, 
        error: result.stderr || result.stdout || "Validation failed" 
      };
    } catch (err) {
      return { valid: false, error: String(err) };
    }
  }

  async function checkSchedulerStatus(piRef: ExtensionAPI): Promise<{ running: boolean; pid?: number }> {
    try {
      const result = await piRef.exec("sh", ["-c", "pgrep -f 'dagu scheduler' || echo 'not running'"]);
      
      if (result.stdout?.includes("not running")) {
        return { running: false };
      }
      
      const pid = parseInt(result.stdout?.trim().split('\n')[0] || "0");
      return { running: true, pid };
    } catch {
      return { running: false };
    }
  }

  function generateWorkflowYAML(params: any): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`name: ${params.name}`);
    if (params.requirements) {
      lines.push(`description: ${params.requirements.substring(0, 100)}${params.requirements.length > 100 ? '...' : ''}`);
    }
    
    // Type for dependencies
    const hasDependencies = params.steps?.some((s: any) => s.depends_on && s.depends_on.length > 0);
    if (hasDependencies) {
      lines.push(`type: graph`);
    }
    
    lines.push('');
    
    // Schedule
    if (params.schedule) {
      lines.push(`schedule:`);
      lines.push(`  - "${params.schedule}"`);
      lines.push('');
    }
    
    // Environment variables
    if (params.env_vars && Object.keys(params.env_vars).length > 0) {
      lines.push(`env:`);
      for (const [key, value] of Object.entries(params.env_vars)) {
        lines.push(`  - ${key}: "${value}"`);
      }
      lines.push('');
    }
    
    // Notifications
    if (params.notifications) {
      lines.push(`mail_on:`);
      if (params.notifications.on_failure) lines.push(`  failure: true`);
      if (params.notifications.on_success) lines.push(`  success: true`);
      lines.push('');
      
      if (params.notifications.slack_webhook || params.notifications.email) {
        lines.push(`handler_on:`);
        if (params.notifications.on_failure) {
          lines.push(`  failure:`);
          if (params.notifications.slack_webhook) {
            lines.push(`    command: |`);
            lines.push(`      curl -X POST ${params.notifications.slack_webhook} -d '{"text":"Workflow ${params.name} failed"}'`);
          } else if (params.notifications.email) {
            lines.push(`    command: |`);
            lines.push(`      echo "Workflow failed" | mail -s "Dagu Alert" ${params.notifications.email}`);
          }
        }
        lines.push('');
      }
    }
    
    // Steps
    lines.push(`steps:`);
    
    for (const step of params.steps || []) {
      const stepId = step.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      
      lines.push(`  # ${step.name}`);
      lines.push(`  - id: ${stepId}`);
      lines.push(`    name: ${step.name}`);
      
      if (step.depends_on && step.depends_on.length > 0) {
        lines.push(`    depends:`);
        for (const dep of step.depends_on) {
          lines.push(`      - ${dep}`);
        }
      }
      
      lines.push(`    command: |`);
      // Indent the command
      const commandLines = step.command.split('\n');
      for (const cmdLine of commandLines) {
        lines.push(`      ${cmdLine}`);
      }
      
      if (step.retry_count) {
        lines.push(`    retry_policy:`);
        lines.push(`      limit: ${step.retry_count}`);
        lines.push(`      interval_sec: 10`);
        lines.push(`      backoff: true`);
      }
      
      if (step.timeout_seconds) {
        lines.push(`    timeout_sec: ${step.timeout_seconds}`);
      }
      
      lines.push('');
    }
    
    return lines.join('\n');
  }

  function getTemplateYAML(template: string, name: string, customize: Record<string, string>): string {
    const dbHost = customize.db_host || 'localhost';
    const dbName = customize.db_name || 'mydb';
    const email = customize.email || 'admin@company.com';
    
    switch (template) {
      case 'etl_pipeline':
        return `# ETL Pipeline Template
name: ${name}
description: Daily ETL pipeline

schedule:
  - "0 2 * * *"

type: graph

env:
  - DB_HOST: "${dbHost}"
  - DB_NAME: "${dbName}"

steps:
  - id: extract
    name: Extract Data
    depends: []
    command: |
      echo "Extracting data from ${DB_HOST}/${DB_NAME}"
      # Add your extract command here
    retry_policy:
      limit: 3
      interval_sec: 10
      backoff: true

  - id: transform
    name: Transform Data
    depends: [extract]
    command: |
      echo "Transforming data"
      # Add your transform command here

  - id: load
    name: Load to Warehouse
    depends: [transform]
    command: |
      echo "Loading to warehouse"
      # Add your load command here

handler_on:
  failure:
    command: echo "ETL failed" | mail -s "Alert" ${email}
  success:
    command: echo "ETL completed successfully"
`;

      case 'ci_cd':
        return `# CI/CD Pipeline Template
name: ${name}
description: Build, test, and deploy pipeline

type: graph

env:
  - APP_NAME: "${customize.app_name || 'myapp'}"

steps:
  - id: test
    name: Run Tests
    depends: []
    command: |
      echo "Running tests"
      npm test || pytest || make test

  - id: build
    name: Build Application
    depends: [test]
    command: |
      echo "Building ${APP_NAME}"
      docker build -t ${APP_NAME}:${DAG_RUN_ID} .

  - id: deploy
    name: Deploy
    depends: [build]
    command: |
      echo "Deploying ${APP_NAME}"
      # kubectl apply -f k8s/
    approval:
      prompt: "Approve deployment to production?"
`;

      case 'backup_job':
        return `# Backup Job Template
name: ${name}
description: Automated backup job

schedule:
  - "0 3 * * *"

steps:
  - id: backup
    name: Create Backup
    command: |
      DATE=$(date +%Y%m%d_%H%M%S)
      BACKUP_FILE="/backup/${name}_$DATE.tar.gz"
      tar -czf $BACKUP_FILE ${customize.source_dir || '/data'}
      echo "Created: $BACKUP_FILE"
    output: BACKUP_PATH

  - id: verify
    name: Verify Backup
    command: |
      if [ -f "${BACKUP_PATH}" ]; then
        echo "Backup verified"
      else
        echo "Backup failed" && exit 1
      fi

  - id: cleanup
    name: Cleanup Old Backups
    command: |
      find /backup -name "${name}_*" -mtime +7 -delete
    continue_on:
      exit_code: [0, 1]
`;

      case 'api_monitor':
        return `# API Monitor Template
name: ${name}
description: API health monitoring

schedule:
  - "*/5 * * * *"

env:
  - API_URL: "${customize.api_url || 'https://api.example.com/health'}"
  - SLACK_WEBHOOK: "${customize.slack_webhook || ''}"

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
      if [ -n "${SLACK_WEBHOOK}" ]; then
        curl -X POST ${SLACK_WEBHOOK} -d '{"text":"🚨 API is down!"}'
      fi
`;

      case 'data_processing':
        return `# Data Processing Template
name: ${name}
description: Batch data processing

type: graph

steps:
  - id: download
    name: Download Data
    depends: []
    command: |
      # Download from S3, FTP, or API
      wget -O /tmp/input.csv ${customize.data_url || 'https://example.com/data.csv'}

  - id: process
    name: Process Data
    depends: [download]
    command: |
      python3 << 'EOF'
      import pandas as pd
      df = pd.read_csv('/tmp/input.csv')
      # Processing logic here
      df.to_csv('/tmp/output.csv', index=False)
      print(f"Processed {len(df)} rows")
      EOF

  - id: upload
    name: Upload Results
    depends: [process]
    command: |
      # Upload to destination
      echo "Uploading /tmp/output.csv"
      # aws s3 cp /tmp/output.csv s3://bucket/
`;

      case 'notification_job':
        return `# Notification Job Template
name: ${name}
description: Scheduled notification job

schedule:
  - "0 9 * * 1"  # Monday 9 AM

env:
  - SLACK_WEBHOOK: "${customize.slack_webhook || ''}"
  - EMAIL_TO: "${customize.email_to || 'team@company.com'}"

steps:
  - id: gather_metrics
    name: Gather Weekly Metrics
    command: |
      echo "Gathering metrics..."
      # Your metrics collection here
      echo "METRICS=$(date): Weekly summary ready" > /tmp/metrics.txt

  - id: send_notification
    name: Send Notification
    depends: [gather_metrics]
    command: |
      MESSAGE=$(cat /tmp/metrics.txt)
      
      # Send to Slack if configured
      if [ -n "${SLACK_WEBHOOK}" ]; then
        curl -X POST ${SLACK_WEBHOOK} -d "{\"text\":\"$MESSAGE\"}"
      fi
      
      # Send email
      echo "$MESSAGE" | mail -s "Weekly Metrics" ${EMAIL_TO}
`;

      default:
        return `# Basic Workflow
name: ${name}
description: Template workflow

steps:
  - command: echo "Hello from ${name}"
`;
    }
  }
}
