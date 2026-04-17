# z-mcp playwright tools

一个独立的 Playwright 浏览器工具包，目标是把网页抓取和浏览器自动化能力集中到一个可复用入口里。

## 能力

- `open`
  - 打开一个 URL
  - 可输出标题、正文、HTML、链接数
  - 可选保存截图
- `snapshot`
  - 快速抓取页面快照
  - 适合验证网页结构和调试数据源

## 安装

```bash
npm install
npx playwright install chromium
```

## 开发

```bash
npm run dev -- open https://example.com
```

## 常用参数

- `--headless false`：以有界面模式启动
- `--wait-until networkidle`：控制页面等待策略
- `--timeout 30000`：页面导航超时
- `--viewport 1440x900`：设置视口
- `--screenshot ./tmp/page.png`：保存截图
- `--html`：输出页面 HTML
- `--text`：输出页面正文
- `PLAYWRIGHT_EXECUTABLE_PATH`：手动指定 Chromium 可执行文件路径

## 示例

```bash
npm run dev -- snapshot https://example.com --text --html
```
