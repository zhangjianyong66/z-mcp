#!/usr/bin/env node
import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { TodoService } from "../src/service.js";
import { TodoStore } from "../src/store.js";

const args = process.argv.slice(2);

function parseArgs() {
  const flags = {
    plan: null as string | null,
    todos: false,
    stats: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--plan" || arg === "-p") {
      flags.plan = args[++i] ?? null;
    } else if (arg === "--todos" || arg === "-t") {
      flags.todos = true;
    } else if (arg === "--stats" || arg === "-s") {
      flags.stats = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    }
  }

  return flags;
}

function printHelp() {
  console.log(`Usage: npm run query:<command>

Commands:
  query:plans              List all plans with progress summary
  query:tree -- <id>       Show plan tree (plan -> tasks -> subtasks)
  query:todos              List all incomplete tasks and subtasks
  query:stats              Show global statistics
  query:help               Show this help message

Environment:
  TODO_MCP_DB_FILE  Path to SQLite database file (required)
`);
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusIcon(status: string): string {
  return status === "done" ? "✓" : "○";
}

async function listPlans(service: TodoService) {
  const { items } = await service.listPlans({ limit: 200 });
  if (items.length === 0) {
    console.log("No plans found.");
    return;
  }

  console.log(`Plans (${items.length} total)\n`);

  for (const plan of items) {
    const tree = await service.getPlanTree(plan.id);
    const summary = tree.summary;
    const progress =
      summary.total_tasks > 0
        ? `${summary.done_tasks}/${summary.total_tasks} tasks`
        : "0 tasks";
    const subProgress =
      summary.total_subtasks > 0
        ? `, ${summary.done_subtasks}/${summary.total_subtasks} subtasks`
        : "";

    const statusLabel = plan.status === "archived" ? "[archived]" : "[active]  ";
    console.log(`  ${statusLabel} ${plan.title}`);
    console.log(`      ID: ${plan.id}`);
    console.log(`      Progress: ${progress}${subProgress}`);
    if (plan.description) {
      console.log(`      Desc: ${plan.description}`);
    }
    console.log("");
  }
}

async function showPlanTree(service: TodoService, planId: string) {
  const tree = await service.getPlanTree(planId);
  const plan = tree.plan;

  const statusLabel = plan.status === "archived" ? "[archived]" : "[active]";
  console.log(`${statusLabel} ${plan.title}`);
  console.log(`ID: ${plan.id}`);
  if (plan.description) {
    console.log(`Description: ${plan.description}`);
  }
  console.log("");

  if (tree.tasks.length === 0) {
    console.log("  (no tasks)");
    return;
  }

  for (const task of tree.tasks) {
    const due = task.due_date ? ` (due ${formatDate(task.due_date)})` : "";
    console.log(
      `  ${statusIcon(task.status)} [P${task.priority}] ${task.title}${due}`
    );
    console.log(`      ID: ${task.id}`);

    if (task.subtasks.length === 0) {
      if (task.note) {
        console.log(`      Note: ${task.note}`);
      }
      continue;
    }

    for (const sub of task.subtasks) {
      const subDue = sub.due_date ? ` (due ${formatDate(sub.due_date)})` : "";
      console.log(
        `      ${statusIcon(sub.status)} [P${sub.priority}] ${sub.title}${subDue}`
      );
    }

    if (task.note) {
      console.log(`      Note: ${task.note}`);
    }
  }

  const s = tree.summary;
  console.log("");
  console.log(
    `Summary: ${s.done_tasks}/${s.total_tasks} tasks, ${s.done_subtasks}/${s.total_subtasks} subtasks done`
  );
  const rate = Math.round(s.completion_rate * 100);
  console.log(`Completion: ${rate}%`);
}

async function listTodos(service: TodoService) {
  const { items: plans } = await service.listPlans({ limit: 200 });
  let totalTasks = 0;
  let totalSubtasks = 0;

  for (const plan of plans) {
    const tree = await service.getPlanTree(plan.id);
    const todoTasks = tree.tasks.filter((t) => t.status === "todo");
    if (todoTasks.length === 0 && tree.tasks.every((t) => t.subtasks.every((s) => s.status === "done"))) {
      continue;
    }

    console.log(`\n${plan.title} (${plan.status})`);
    console.log(`ID: ${plan.id}`);

    for (const task of tree.tasks) {
      const todoSubs = task.subtasks.filter((s) => s.status === "todo");
      const showTask = task.status === "todo" || todoSubs.length > 0;
      if (!showTask) continue;

      totalTasks += task.status === "todo" ? 1 : 0;
      totalSubtasks += todoSubs.length;

      if (task.status === "todo") {
        const due = task.due_date ? ` (due ${formatDate(task.due_date)})` : "";
        console.log(`  ○ [P${task.priority}] ${task.title}${due}`);
        console.log(`    ID: ${task.id}`);
      }

      for (const sub of todoSubs) {
        const subDue = sub.due_date ? ` (due ${formatDate(sub.due_date)})` : "";
        const indent = task.status === "todo" ? "    " : "  ";
        console.log(`${indent}○ [P${sub.priority}] ${sub.title}${subDue}`);
      }
    }
  }

  console.log("");
  console.log(`Total incomplete: ${totalTasks} tasks, ${totalSubtasks} subtasks`);
}

async function showStats(service: TodoService) {
  const { items: plans } = await service.listPlans({ include_deleted: true, limit: 200 });

  let totalPlans = 0;
  let activePlans = 0;
  let archivedPlans = 0;
  let totalTasks = 0;
  let doneTasks = 0;
  let totalSubtasks = 0;
  let doneSubtasks = 0;

  for (const plan of plans) {
    totalPlans++;
    if (plan.status === "active") activePlans++;
    else archivedPlans++;

    const tree = await service.getPlanTree(plan.id, true);
    totalTasks += tree.summary.total_tasks;
    doneTasks += tree.summary.done_tasks;
    totalSubtasks += tree.summary.total_subtasks;
    doneSubtasks += tree.summary.done_subtasks;
  }

  const taskRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const subRate = totalSubtasks > 0 ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0;

  console.log("Global Statistics\n");
  console.log(`  Plans:        ${totalPlans} (active: ${activePlans}, archived: ${archivedPlans})`);
  console.log(`  Tasks:        ${totalTasks} (done: ${doneTasks}, rate: ${taskRate}%)`);
  console.log(`  Subtasks:     ${totalSubtasks} (done: ${doneSubtasks}, rate: ${subRate}%)`);
  console.log(`  Overall:      ${doneTasks + doneSubtasks}/${totalTasks + totalSubtasks} items done`);
}

async function main() {
  const flags = parseArgs();

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig();
  const store = new TodoStore(config.dbFile);
  const service = new TodoService(store);

  try {
    if (flags.plan) {
      await showPlanTree(service, flags.plan);
    } else if (flags.todos) {
      await listTodos(service);
    } else if (flags.stats) {
      await showStats(service);
    } else {
      await listPlans(service);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  } finally {
    await store.close();
  }
}

main();
