#!/usr/bin/env node
import "dotenv/config";
import readline from "node:readline";
import { loadConfig } from "../src/config.js";
import { TodoService } from "../src/service.js";
import { TodoStore } from "../src/store.js";
import type { Plan, PlanTree, PlanTreeTask } from "../src/types.js";

type PlanFilter = "todo" | "done";

type PlanWithProgress = {
  plan: Plan;
  isDone: boolean;
  taskSummary: string;
};

let store: TodoStore;
let service: TodoService;
let activeCleanup: (() => void) | null = null;

function setActiveCleanup(fn: (() => void) | null) {
  if (activeCleanup) {
    try {
      activeCleanup();
    } catch {
      // ignore cleanup errors
    }
  }
  activeCleanup = fn;
}

function runCleanup() {
  if (activeCleanup) {
    try {
      activeCleanup();
    } catch {
      // ignore cleanup errors
    }
    activeCleanup = null;
  }
}

function clearScreen() {
  console.clear();
}

function setRawMode(enabled: boolean) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(enabled);
  }
}

function statusIcon(done: boolean): string {
  return done ? "✓" : "○";
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

// ---------- 数据层 ----------

async function loadPlans(): Promise<PlanWithProgress[]> {
  const { items } = await service.listPlans({ limit: 200 });
  const result: PlanWithProgress[] = [];
  for (const plan of items) {
    const tree = await service.getPlanTree(plan.id);
    const s = tree.summary;
    const isDone =
      s.total_tasks > 0 &&
      s.total_tasks === s.done_tasks &&
      s.total_subtasks === s.done_subtasks;
    const taskText =
      s.total_tasks > 0
        ? `${s.done_tasks}/${s.total_tasks} 任务`
        : "无任务";
    result.push({ plan, isDone, taskSummary: taskText });
  }
  return result;
}

function filterPlans(plans: PlanWithProgress[], filter: PlanFilter): PlanWithProgress[] {
  return plans.filter((p) => (filter === "done" ? p.isDone : !p.isDone));
}

function filterTree(tree: PlanTree, filter: PlanFilter): { tasks: PlanTreeTask[]; summary: PlanTree["summary"] } {
  const filteredTasks = tree.tasks
    .filter((task) => task.status === filter)
    .map((task) => ({
      ...task,
      subtasks: task.subtasks.filter((sub) => sub.status === filter)
    }));

  const doneTasks = filteredTasks.filter((t) => t.status === "done").length;
  const totalSubtasks = filteredTasks.reduce((sum, t) => sum + t.subtasks.length, 0);
  const doneSubtasks = filteredTasks.reduce(
    (sum, t) => sum + t.subtasks.filter((s) => s.status === "done").length,
    0
  );

  const completionRate =
    totalSubtasks > 0
      ? doneSubtasks / totalSubtasks
      : filteredTasks.length > 0
        ? doneTasks / filteredTasks.length
        : 0;

  return {
    tasks: filteredTasks,
    summary: {
      total_tasks: filteredTasks.length,
      done_tasks: doneTasks,
      total_subtasks: totalSubtasks,
      done_subtasks: doneSubtasks,
      completion_rate: completionRate
    }
  };
}

// ---------- 渲染层 ----------

function printPlanList(
  plans: PlanWithProgress[],
  filter: PlanFilter,
  selectedIndex: number,
  pageSize: number,
  currentPage: number
) {
  const filtered = filterPlans(plans, filter);
  const filterLabel = filter === "todo" ? "未完成计划" : "已完成计划";
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, filtered.length);
  const pageItems = filtered.slice(start, end);

  clearScreen();
  console.log("==================");
  console.log("    浏览计划");
  console.log("==================");
  console.log(`按 [Tab] 切换: ${filterLabel}`);
  console.log("按 [↑↓] 选择  [Enter] 确认  [q] 返回");
  if (filtered.length > pageSize) {
    console.log(`按 [ ] 翻页: 第 ${currentPage + 1}/${totalPages} 页`);
  }
  console.log("");

  if (filtered.length === 0) {
    console.log("  (无计划)");
  } else {
    for (let i = 0; i < pageItems.length; i++) {
      const p = pageItems[i];
      const globalIndex = start + i;
      const cursor = globalIndex === selectedIndex ? ">" : " ";
      const icon = statusIcon(p.isDone);
      console.log(`${cursor} ${icon} ${p.plan.title}  (${p.taskSummary})`);
    }
  }

  console.log("");
  console.log("==================");
}

function printPlanDetail(
  tree: PlanTree,
  filter: PlanFilter,
  pageSize: number,
  currentPage: number
) {
  const filtered = filterTree(tree, filter);
  const plan = tree.plan;
  const filterLabel = filter === "todo" ? "未完成" : "已完成";
  const totalPages = Math.max(1, Math.ceil(filtered.tasks.length / pageSize));
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, filtered.tasks.length);
  const pageTasks = filtered.tasks.slice(start, end);

  clearScreen();
  console.log("==================");
  console.log(`${plan.title} [${plan.status}]`);
  if (plan.description) {
    console.log(plan.description);
  }
  console.log("==================");
  console.log(`按 [Tab] 切换: ${filterLabel}`);
  console.log("按 [q] 返回");
  if (filtered.tasks.length > pageSize) {
    console.log(`按 [ ] 翻页: 第 ${currentPage + 1}/${totalPages} 页`);
  }
  console.log("");

  const s = filtered.summary;
  if (s.total_tasks === 0) {
    console.log("  (无任务)");
  } else {
    console.log(
      `Summary: ${s.done_tasks}/${s.total_tasks} 任务, ${s.done_subtasks}/${s.total_subtasks} 子任务完成 (${Math.round(s.completion_rate * 100)}%)`
    );
    console.log("");

    for (const task of pageTasks) {
      const due = task.due_date ? ` (due ${formatDate(task.due_date)})` : "";
      console.log(`  ${statusIcon(task.status === "done")} [P${task.priority}] ${task.title}${due}`);

      if (task.subtasks.length > 0) {
        for (const sub of task.subtasks) {
          const subDue = sub.due_date ? ` (due ${formatDate(sub.due_date)})` : "";
          console.log(`      ${statusIcon(sub.status === "done")} [P${sub.priority}] ${sub.title}${subDue}`);
        }
      }

      if (task.note) {
        console.log(`      Note: ${task.note}`);
      }
    }
  }

  console.log("");
  console.log("==================");
}

function printStats(
  totalPlans: number,
  activePlans: number,
  archivedPlans: number,
  totalTasks: number,
  doneTasks: number,
  totalSubtasks: number,
  doneSubtasks: number
) {
  const taskRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const subRate = totalSubtasks > 0 ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0;

  clearScreen();
  console.log("==================");
  console.log("    全局统计");
  console.log("==================");
  console.log("");
  console.log(`  计划数:     ${totalPlans} (进行中: ${activePlans}, 已归档: ${archivedPlans})`);
  console.log(`  任务数:     ${totalTasks} (已完成: ${doneTasks}, 完成率: ${taskRate}%)`);
  console.log(`  子任务数:   ${totalSubtasks} (已完成: ${doneSubtasks}, 完成率: ${subRate}%)`);
  console.log(`  总计:       ${doneTasks + doneSubtasks}/${totalTasks + totalSubtasks} 项已完成`);
  console.log("");
  console.log("按 [q] 返回");
  console.log("==================");
}

// ---------- 页面层 ----------

async function planListPage(allPlans: PlanWithProgress[]): Promise<string | null> {
  return new Promise((resolve) => {
    let filter: PlanFilter = "todo";
    let filtered = filterPlans(allPlans, filter);
    let selectedIndex = 0;
    let currentPage = 0;
    const pageSize = Math.max(5, (process.stdout.rows || 20) - 10);

    const getTotalPages = () => Math.max(1, Math.ceil(filtered.length / pageSize));

    const render = () => {
      filtered = filterPlans(allPlans, filter);
      const totalPages = getTotalPages();
      if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
      if (selectedIndex >= filtered.length) selectedIndex = Math.max(0, filtered.length - 1);
      printPlanList(allPlans, filter, selectedIndex, pageSize, currentPage);
    };

    const onKeypress = (str: string, key: { name?: string; sequence?: string }) => {
      if (key.name === "tab") {
        filter = filter === "todo" ? "done" : "todo";
        selectedIndex = 0;
        currentPage = 0;
        render();
        return;
      }

      if (key.name === "up") {
        selectedIndex = Math.max(currentPage * pageSize, selectedIndex - 1);
        render();
        return;
      }

      if (key.name === "down") {
        const end = Math.min(filtered.length, (currentPage + 1) * pageSize) - 1;
        selectedIndex = Math.min(end, selectedIndex + 1);
        render();
        return;
      }

      if (str === "[" || key.name === "pageup") {
        if (currentPage > 0) {
          currentPage--;
          selectedIndex = currentPage * pageSize;
          render();
        }
        return;
      }

      if (str === "]" || key.name === "pagedown") {
        const totalPages = getTotalPages();
        if (currentPage < totalPages - 1) {
          currentPage++;
          selectedIndex = currentPage * pageSize;
          render();
        }
        return;
      }

      if (key.name === "return") {
        if (filtered.length > 0 && selectedIndex < filtered.length) {
          runCleanup();
          resolve(filtered[selectedIndex].plan.id);
        }
        return;
      }

      if (str === "q" || key.name === "escape") {
        runCleanup();
        resolve(null);
        return;
      }
    };

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      setRawMode(false);
    };
    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 });
    setRawMode(true);
    setActiveCleanup(cleanup);
    process.stdin.on("keypress", onKeypress);
    render();
  });
}

async function planDetailPage(planId: string) {
  const tree = await service.getPlanTree(planId);

  return new Promise<void>((resolve) => {
    let filter: PlanFilter = "todo";
    let currentPage = 0;
    const pageSize = Math.max(5, (process.stdout.rows || 20) - 10);

    const getTotalPages = () => {
      const filtered = filterTree(tree, filter);
      return Math.max(1, Math.ceil(filtered.tasks.length / pageSize));
    };

    const render = () => {
      printPlanDetail(tree, filter, pageSize, currentPage);
    };

    const onKeypress = (str: string, key: { name?: string }) => {
      if (key.name === "tab") {
        filter = filter === "todo" ? "done" : "todo";
        currentPage = 0;
        render();
        return;
      }

      if (str === "[" || key.name === "pageup") {
        if (currentPage > 0) {
          currentPage--;
          render();
        }
        return;
      }

      if (str === "]" || key.name === "pagedown") {
        const totalPages = getTotalPages();
        if (currentPage < totalPages - 1) {
          currentPage++;
          render();
        }
        return;
      }

      if (str === "q" || key.name === "escape") {
        runCleanup();
        resolve();
        return;
      }
    };

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      setRawMode(false);
    };
    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 });
    setRawMode(true);
    setActiveCleanup(cleanup);
    process.stdin.on("keypress", onKeypress);
    render();
  });
}

async function statsPage() {
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

  return new Promise<void>((resolve) => {
    const onKeypress = (str: string, key: { name?: string }) => {
      if (str === "q" || key.name === "escape" || key.name === "return") {
        runCleanup();
        resolve();
        return;
      }
    };

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      setRawMode(false);
    };
    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 });
    setRawMode(true);
    setActiveCleanup(cleanup);
    process.stdin.on("keypress", onKeypress);
    printStats(totalPlans, activePlans, archivedPlans, totalTasks, doneTasks, totalSubtasks, doneSubtasks);
  });
}

// ---------- 通用提示页 ----------

async function showMessagePage(message: string) {
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      setRawMode(false);
    };

    const onKeypress = (str: string, key: { name?: string }) => {
      if (key.name === "return") {
        cleanup();
        runCleanup();
        resolve();
      }
    };

    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 });
    setRawMode(true);
    setActiveCleanup(cleanup);
    process.stdin.on("keypress", onKeypress);

    clearScreen();
    console.log("==================");
    console.log(message);
    console.log("==================");
    console.log("按 [Enter] 返回");
  });
}

// ---------- 主菜单 ----------

async function mainMenu(): Promise<string> {
  const options = [
    { label: "浏览计划", action: "plans" },
    { label: "查看统计", action: "stats" },
    { label: "退出", action: "exit" }
  ];

  return new Promise((resolve) => {
    let selectedIndex = 0;

    const render = () => {
      clearScreen();
      console.log("==================");
      console.log("  todo-mcp 查看器");
      console.log("==================");
      for (let i = 0; i < options.length; i++) {
        const cursor = i === selectedIndex ? ">" : " ";
        console.log(`  ${cursor} ${options[i].label}`);
      }
      console.log("");
      console.log("按 [↑↓] 选择  [Enter] 确认");
      console.log("==================");
    };

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      setRawMode(false);
    };

    const onKeypress = (str: string, key: { name?: string }) => {
      if (key.name === "up") {
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
        return;
      }
      if (key.name === "down") {
        selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
        render();
        return;
      }
      if (key.name === "return") {
        cleanup();
        runCleanup();
        resolve(options[selectedIndex].action);
        return;
      }
    };

    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 });
    setRawMode(true);
    setActiveCleanup(cleanup);
    process.stdin.on("keypress", onKeypress);
    render();
  });
}

// ---------- 入口 ----------

async function main() {
  const config = loadConfig();
  store = new TodoStore(config.dbFile);
  service = new TodoService(store);

  process.on("SIGINT", () => {
    runCleanup();
    process.exit(0);
  });

  try {
    let running = true;
    while (running) {
      const action = await mainMenu();

      if (action === "exit") {
        running = false;
      } else if (action === "plans") {
        try {
          const allPlans = await loadPlans();
          if (allPlans.length === 0) {
            await showMessagePage("暂无计划");
          } else {
            let planId: string | null = null;
            do {
              planId = await planListPage(allPlans);
              if (planId) {
                await planDetailPage(planId);
              }
            } while (planId !== null);
          }
        } catch (error) {
          console.error("\n错误:", error instanceof Error ? error.message : String(error));
          await showMessagePage("发生错误，按 Enter 返回");
        }
      } else if (action === "stats") {
        try {
          await statsPage();
        } catch (error) {
          console.error("\n错误:", error instanceof Error ? error.message : String(error));
          await showMessagePage("发生错误，按 Enter 返回");
        }
      }
    }
    clearScreen();
    console.log("再见!");
  } catch (error) {
    console.error("\n错误:", error instanceof Error ? error.message : String(error));
  } finally {
    runCleanup();
    await store.close();
  }
}

main();
