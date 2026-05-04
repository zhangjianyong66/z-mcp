#!/usr/bin/env node
import "dotenv/config";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
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

function truncateSingleLine(text: string, maxChars: number): string {
  if (maxChars <= 1) return "…";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

type KeypressEvent = { name?: string; sequence?: string; ctrl?: boolean };

export function getTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function getPageRange(totalItems: number, pageSize: number, currentPage: number): { start: number; end: number } {
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, totalItems);
  return { start, end };
}

export function clampPage(currentPage: number, totalItems: number, pageSize: number): number {
  const totalPages = getTotalPages(totalItems, pageSize);
  return Math.max(0, Math.min(currentPage, totalPages - 1));
}

export function clampSelectionToPage(
  selectedIndex: number,
  totalItems: number,
  pageSize: number,
  currentPage: number
): number {
  if (totalItems <= 0) return 0;
  const safePage = clampPage(currentPage, totalItems, pageSize);
  const { start, end } = getPageRange(totalItems, pageSize, safePage);
  return Math.max(start, Math.min(selectedIndex, Math.max(start, end - 1)));
}

export function isPrevPageKey(str: string, key: KeypressEvent): boolean {
  return str === "[" || key.name === "pageup" || key.name === "left";
}

export function isNextPageKey(str: string, key: KeypressEvent): boolean {
  return str === "]" || key.name === "pagedown" || key.name === "right";
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

export function printPlanList(
  plans: PlanWithProgress[],
  filter: PlanFilter,
  selectedIndex: number,
  pageSize: number,
  currentPage: number
) {
  const filtered = filterPlans(plans, filter);
  const filterLabel = filter === "todo" ? "未完成计划" : "已完成计划";
  const totalPages = getTotalPages(filtered.length, pageSize);
  const { start, end } = getPageRange(filtered.length, pageSize, currentPage);
  const pageItems = filtered.slice(start, end);

  clearScreen();
  console.log("==================");
  console.log("    浏览计划");
  console.log("==================");
  console.log(`按 [Tab] 切换: ${filterLabel}`);
  console.log("按 [↑↓] 选择  [Enter] 确认  [q] 返回");
  if (totalPages > 1) {
    console.log(`按 [ ] 翻页: 第 ${currentPage + 1}/${totalPages} 页`);
  }
  console.log(`总计划: ${filtered.length}`);
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

export function printPlanTaskList(
  tree: PlanTree,
  filter: PlanFilter,
  selectedIndex: number,
  pageSize: number,
  currentPage: number
) {
  const filtered = filterTree(tree, filter);
  const plan = tree.plan;
  const filterLabel = filter === "todo" ? "未完成" : "已完成";
  const totalPages = getTotalPages(filtered.tasks.length, pageSize);
  const { start, end } = getPageRange(filtered.tasks.length, pageSize, currentPage);
  const pageTasks = filtered.tasks.slice(start, end);

  clearScreen();
  console.log("==================");
  console.log(`${plan.title} [${plan.status}]`);
  if (plan.description) {
    console.log(plan.description);
  }
  console.log("==================");
  console.log(`按 [Tab] 切换: ${filterLabel}`);
  console.log("按 [↑↓] 选择  [Enter] 进入任务  [q] 返回");
  if (totalPages > 1) {
    console.log(`按 [ ] 翻页: 第 ${currentPage + 1}/${totalPages} 页`);
  }
  console.log(`总任务: ${filtered.tasks.length}`);
  console.log("");

  const s = filtered.summary;
  if (s.total_tasks === 0) {
    console.log("  (无任务)");
  } else {
    console.log(
      `Summary: ${s.done_tasks}/${s.total_tasks} 任务, ${s.done_subtasks}/${s.total_subtasks} 子任务完成 (${Math.round(s.completion_rate * 100)}%)`
    );
    console.log("");

    for (let i = 0; i < pageTasks.length; i++) {
      const task = pageTasks[i];
      const globalIndex = start + i;
      const cursor = globalIndex === selectedIndex ? ">" : " ";
      const due = task.due_date ? ` (due ${formatDate(task.due_date)})` : "";
      console.log(`${cursor} ${statusIcon(task.status === "done")} [P${task.priority}] ${task.title}${due}`);
    }
  }

  console.log("");
  console.log("==================");
}

export function printTaskDetail(
  tree: PlanTree,
  task: PlanTreeTask,
  filter: PlanFilter,
  detailPage: number,
  detailPageSize: number,
  termCols: number
) {
  const plan = tree.plan;
  const filterLabel = filter === "todo" ? "未完成" : "已完成";
  const filteredSubtasks = task.subtasks.filter((sub) => sub.status === filter);
  const totalPages = getTotalPages(filteredSubtasks.length, detailPageSize);
  const safePage = clampPage(detailPage, filteredSubtasks.length, detailPageSize);
  const { start, end } = getPageRange(filteredSubtasks.length, detailPageSize, safePage);
  const pageSubtasks = filteredSubtasks.slice(start, end);
  const maxTitleChars = Math.max(12, termCols - 14);

  clearScreen();
  console.log("==================");
  console.log(`${plan.title} [${plan.status}]`);
  console.log("==================");
  console.log(`按 [Tab] 切换: ${filterLabel}`);
  console.log("按 [Enter/q] 返回任务列表");
  if (totalPages > 1) {
    console.log(`按 [ ] 翻页: 第 ${safePage + 1}/${totalPages} 页`);
  }
  console.log(`总子任务: ${filteredSubtasks.length}`);
  console.log("");

  const due = task.due_date ? ` (due ${formatDate(task.due_date)})` : "";
  console.log(`  ${statusIcon(task.status === "done")} [P${task.priority}] ${task.title}${due}`);
  if (task.note) {
    console.log(`  Note: ${truncateSingleLine(task.note, Math.max(12, termCols - 8))}`);
  }
  console.log("");

  if (filteredSubtasks.length === 0) {
    console.log("  (无子任务)");
  } else {
    for (const sub of pageSubtasks) {
      const subDue = sub.due_date ? ` (due ${formatDate(sub.due_date)})` : "";
      const line = `  ${statusIcon(sub.status === "done")} [P${sub.priority}] ${sub.title}${subDue}`;
      console.log(truncateSingleLine(line, Math.max(12, maxTitleChars)));
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

    const getCurrentTotalPages = () => getTotalPages(filtered.length, pageSize);

    const render = () => {
      filtered = filterPlans(allPlans, filter);
      currentPage = clampPage(currentPage, filtered.length, pageSize);
      selectedIndex = clampSelectionToPage(selectedIndex, filtered.length, pageSize, currentPage);
      printPlanList(allPlans, filter, selectedIndex, pageSize, currentPage);
    };

    const onKeypress = (str: string, key: KeypressEvent) => {
      if (key.ctrl && key.name === "c") {
        runCleanup();
        process.exit(0);
      }

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

      if (isPrevPageKey(str, key)) {
        if (currentPage > 0) {
          currentPage--;
          selectedIndex = currentPage * pageSize;
          render();
        }
        return;
      }

      if (isNextPageKey(str, key)) {
        const totalPages = getCurrentTotalPages();
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
    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 } as any);
    setRawMode(true);
    setActiveCleanup(cleanup);
    process.stdin.on("keypress", onKeypress);
    render();
  });
}

async function planDetailPage(planId: string) {
  const tree = await service.getPlanTree(planId);

  return new Promise<void>((resolve) => {
    type DetailMode = "task_list" | "task_detail";
    let mode: DetailMode = "task_list";
    let filter: PlanFilter = "todo";
    let selectedIndex = 0;
    let currentPage = 0;
    const pageSize = Math.max(5, (process.stdout.rows || 20) - 10);
    const detailPageSize = Math.max(3, (process.stdout.rows || 20) - 13);
    const termCols = process.stdout.columns || 80;
    let currentTaskId: string | null = null;
    let detailPage = 0;

    const getTaskListTotalPages = () => {
      const filtered = filterTree(tree, filter);
      return getTotalPages(filtered.tasks.length, pageSize);
    };

    const getFilteredTasks = () => filterTree(tree, filter).tasks;

    const clampSelection = () => {
      const filteredTasks = getFilteredTasks();
      currentPage = clampPage(currentPage, filteredTasks.length, pageSize);
      selectedIndex = clampSelectionToPage(selectedIndex, filteredTasks.length, pageSize, currentPage);
    };

    const render = () => {
      clampSelection();
      const filteredTasks = getFilteredTasks();
      if (mode === "task_detail") {
        const task = currentTaskId ? filteredTasks.find((t) => t.id === currentTaskId) : undefined;
        if (!task) {
          mode = "task_list";
          printPlanTaskList(tree, filter, selectedIndex, pageSize, currentPage);
          return;
        }
        const filteredSubtasks = task.subtasks.filter((sub) => sub.status === filter);
        detailPage = clampPage(detailPage, filteredSubtasks.length, detailPageSize);
        printTaskDetail(tree, task, filter, detailPage, detailPageSize, termCols);
        return;
      }
      printPlanTaskList(tree, filter, selectedIndex, pageSize, currentPage);
    };

    const onKeypress = (str: string, key: KeypressEvent) => {
      if (key.ctrl && key.name === "c") {
        runCleanup();
        process.exit(0);
      }

      if (key.name === "tab") {
        filter = filter === "todo" ? "done" : "todo";
        if (mode === "task_list") {
          currentPage = 0;
          selectedIndex = 0;
        } else {
          detailPage = 0;
        }
        render();
        return;
      }

      if (mode === "task_list" && key.name === "up") {
        selectedIndex = Math.max(currentPage * pageSize, selectedIndex - 1);
        render();
        return;
      }

      if (mode === "task_list" && key.name === "down") {
        const filteredTasks = getFilteredTasks();
        const end = Math.min(filteredTasks.length, (currentPage + 1) * pageSize) - 1;
        selectedIndex = Math.min(end, selectedIndex + 1);
        render();
        return;
      }

      if (isPrevPageKey(str, key)) {
        if (mode === "task_list") {
          if (currentPage > 0) {
            currentPage--;
            selectedIndex = currentPage * pageSize;
            render();
          }
        } else if (detailPage > 0) {
          detailPage--;
          render();
        }
        return;
      }

      if (isNextPageKey(str, key)) {
        if (mode === "task_list") {
          const totalPages = getTaskListTotalPages();
          if (currentPage < totalPages - 1) {
            currentPage++;
            selectedIndex = currentPage * pageSize;
            render();
          }
        } else {
          const filteredTasks = getFilteredTasks();
          const task = currentTaskId ? filteredTasks.find((t) => t.id === currentTaskId) : undefined;
          const subtaskCount = task ? task.subtasks.filter((sub) => sub.status === filter).length : 0;
          const totalDetailPages = getTotalPages(subtaskCount, detailPageSize);
          if (detailPage < totalDetailPages - 1) {
            detailPage++;
            render();
          }
        }
        return;
      }

      if (key.name === "return") {
        if (mode === "task_list") {
          const filteredTasks = getFilteredTasks();
          if (filteredTasks.length > 0 && selectedIndex < filteredTasks.length) {
            currentTaskId = filteredTasks[selectedIndex].id;
            detailPage = 0;
            mode = "task_detail";
            render();
          }
          return;
        }
        mode = "task_list";
        render();
        return;
      }

      if (str === "q" || key.name === "escape") {
        if (mode === "task_detail") {
          mode = "task_list";
          render();
          return;
        }
        runCleanup();
        resolve();
        return;
      }
    };

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      setRawMode(false);
    };
    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 } as any);
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
    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        runCleanup();
        process.exit(0);
      }

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
    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 } as any);
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

    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        runCleanup();
        process.exit(0);
      }

      if (key.name === "return") {
        cleanup();
        runCleanup();
        resolve();
      }
    };

    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 } as any);
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

    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        runCleanup();
        process.exit(0);
      }

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

    readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 } as any);
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

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryHref) {
  void main();
}
