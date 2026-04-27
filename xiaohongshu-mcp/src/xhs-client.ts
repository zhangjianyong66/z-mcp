import fs from "node:fs/promises";
import type { RuntimeConfig } from "./config.js";
import { CdpMcpClient } from "./cdp-mcp-client.js";
import { McpCdpBrowserDriver } from "./browser-driver.js";
import { AppError, type FeedItem, type SearchFilters } from "./types.js";

const RISK_PATTERNS = [
  "sorry, this page isn't available right now",
  "请打开小红书app扫码查看",
  "请打开小红书app",
  "当前内容无法在网页端展示",
  "访问过于频繁",
  "安全验证"
];

type SearchResult = {
  feeds: FeedItem[];
  count: number;
  keyword: string;
  filters?: SearchFilters;
};

type FeedDetailResult = {
  feed_id: string;
  xsec_token: string;
  note_detail: unknown;
};

type QrImageInfo = {
  local_path: string;
  mime_type: "image/png";
  width: number;
  height: number;
  size_bytes: number;
  source: "local_file";
};

const QR_OUTPUT_DIR = "/tmp/openclaw";
const QR_OUTPUT_PATH = `${QR_OUTPUT_DIR}/xhs-login-qrcode.png`;
const LOGIN_PENDING_TIMEOUT_MS = 4 * 60 * 1000;
const LOGIN_SUCCESS_KEEPALIVE_MS = 60 * 60 * 1000;
const LOGIN_POLL_INTERVAL_MS = 1000;
const QRCODE_REFRESH_WAIT_MS = 8000;
const QRCODE_REFRESH_MAX_ATTEMPTS = 2;
const QRCODE_REFRESH_POLL_INTERVAL_MS = 300;

type LoginSessionStatus = "pending" | "success";

type LoginSession = {
  status: LoginSessionStatus;
  qrCodeSrc: string;
  expiresAt: number;
  cleanupTimer: NodeJS.Timeout | null;
  pollTimer: NodeJS.Timeout | null;
};

type LoginState = "logged_in" | "logged_out" | "unknown";

type LoginStateProbe = {
  hasLoginQr: boolean;
  hasUserMarker: boolean;
  cookieText: string;
  hasLoginPanel: boolean;
  hasExpiredHint: boolean;
};

type QrcodeProbe = {
  src: string | null;
  hasLoginQr: boolean;
  hasExpiredHint: boolean;
};

export class XhsClient {
  private readonly cdpClient: CdpMcpClient;
  private readonly driver: McpCdpBrowserDriver;
  private loginSession: LoginSession | null = null;

  public constructor(private readonly config: RuntimeConfig) {
    this.cdpClient = new CdpMcpClient(config);
    this.driver = new McpCdpBrowserDriver(this.cdpClient, config);
  }

  public async checkLoginStatus(): Promise<{ is_logged_in: boolean; username?: string }> {
    return this.withRuntime(async () => {
      const activeLoginSession = await this.getActiveLoginSession();
      if (activeLoginSession) {
        if (activeLoginSession.status === "success") {
          const username = await this.readUsername();
          if (username) {
            return { is_logged_in: true, username };
          }
          return { is_logged_in: true };
        }
        return { is_logged_in: false };
      }

      await this.openExplore();
      const loggedIn = await this.isLoggedIn();
      if (!loggedIn) {
        return { is_logged_in: false };
      }

      const username = await this.readUsername();
      if (username) {
        return {
          is_logged_in: true,
          username
        };
      }

      return {
        is_logged_in: true
      };
    });
  }

  public async getLoginQrcode(): Promise<{
    is_logged_in: boolean;
    qr_local_path?: string;
    qr_image?: QrImageInfo;
    login_session?: {
      status: "pending" | "success";
      expires_at: string;
      reused: boolean;
    };
  }> {
    return this.withRuntime(async () => {
      const existing = await this.getActiveLoginSession();
      if (existing) {
        if (existing.status === "success") {
          return { is_logged_in: true };
        }

        await this.openExplore();
        const src = await this.resolveQrcodeSrc();
        existing.qrCodeSrc = src;
        await this.persistQrcode(src);
        await this.ensureQrcodeFileReady();
        const qrImage = await this.buildQrcodeInfo();
        return {
          is_logged_in: false,
          qr_local_path: QR_OUTPUT_PATH,
          qr_image: qrImage,
          login_session: {
            status: existing.status,
            expires_at: new Date(existing.expiresAt).toISOString(),
            reused: true
          }
        };
      }

      await this.openExplore();
      if (await this.isLoggedIn()) {
        return { is_logged_in: true };
      }

      const src = await this.resolveQrcodeSrc();
      await this.persistQrcode(src);
      await this.ensureQrcodeFileReady();
      const qrImage = await this.buildQrcodeInfo();

      const session: LoginSession = {
        status: "pending",
        qrCodeSrc: src,
        expiresAt: Date.now() + LOGIN_PENDING_TIMEOUT_MS,
        cleanupTimer: null,
        pollTimer: null
      };
      this.loginSession = session;
      this.scheduleCleanup(session, LOGIN_PENDING_TIMEOUT_MS);
      this.scheduleLoginPolling(session);

      return {
        is_logged_in: false,
        qr_local_path: QR_OUTPUT_PATH,
        qr_image: qrImage,
        login_session: {
          status: session.status,
          expires_at: new Date(session.expiresAt).toISOString(),
          reused: false
        }
      };
    });
  }

  public async searchFeeds(keyword: string, filters?: SearchFilters): Promise<SearchResult> {
    return this.withRuntime(async () => {
      await this.ensureLoggedInForRead();

      const encoded = encodeURIComponent(keyword);
      const url = `https://www.xiaohongshu.com/search_result?keyword=${encoded}&source=web_explore_feed`;

      await this.driver.navigate(url);
      await this.driver.waitFor<boolean>(
        `return Boolean(globalThis.__INITIAL_STATE__);`,
        (ready) => ready === true,
        this.config.navTimeoutMs
      );

      await this.detectRisk();

      const feeds = await this.driver.evaluate<unknown[]>(`
        const state = globalThis.__INITIAL_STATE__;
        const raw = state?.search?.feeds?.value ?? state?.search?.feeds?._value;
        return Array.isArray(raw) ? raw : [];
      `);

      const response: SearchResult = {
        feeds: feeds as FeedItem[],
        count: Array.isArray(feeds) ? feeds.length : 0,
        keyword
      };
      if (filters !== undefined) {
        response.filters = filters;
      }
      return response;
    });
  }

  public async getFeedDetail(feedId: string, xsecToken: string, loadAllComments = false): Promise<FeedDetailResult> {
    if (loadAllComments) {
      throw new AppError(
        "invalid_input",
        "load_all_comments=true is disabled in ts-lite v1 to reduce platform risk"
      );
    }

    return this.withRuntime(async () => {
      await this.ensureLoggedInForRead();

      const url = `https://www.xiaohongshu.com/explore/${encodeURIComponent(feedId)}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_feed`;
      await this.driver.navigate(url);
      await this.driver.waitFor<boolean>(
        `return Boolean(globalThis.__INITIAL_STATE__);`,
        (ready) => ready === true,
        this.config.navTimeoutMs
      );

      await this.detectRisk();

      const noteDetail = await this.driver.evaluate<unknown>(`
        const state = globalThis.__INITIAL_STATE__;
        return state?.note?.noteDetailMap?.[${JSON.stringify(feedId)}] ?? null;
      `);

      if (!noteDetail) {
        throw new AppError("internal_error", "note detail not found in initial state");
      }

      return {
        feed_id: feedId,
        xsec_token: xsecToken,
        note_detail: noteDetail
      };
    });
  }

  private async withRuntime<T>(runner: () => Promise<T>): Promise<T> {
    try {
      await this.driver.ensureReady();
      await this.driver.ensureTab();
      return await runner();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (/timeout/i.test(message)) {
        throw new AppError("timeout", message);
      }
      throw new AppError("internal_error", message);
    }
  }

  private async openExplore(): Promise<void> {
    await this.driver.navigate("https://www.xiaohongshu.com/explore");
  }

  private async ensureLoggedInForRead(): Promise<void> {
    const activeLoginSession = await this.getActiveLoginSession();
    if (activeLoginSession?.status === "success") {
      return;
    }

    await this.openExplore();
    const state = await this.detectLoginState();
    if (state !== "logged_out") {
      return;
    }
    throw new AppError("login_required", "xiaohongshu login required, call get_login_qrcode first", {
      next_action: "get_login_qrcode",
      login_state: state
    });
  }

  private async isLoggedIn(): Promise<boolean> {
    const state = await this.detectLoginState();
    return state === "logged_in";
  }

  private async detectLoginState(): Promise<LoginState> {
    const probe = await this.driver.evaluate<LoginStateProbe>(`
      const cookieText = document.cookie || '';
      const hasLoginQr = Boolean(document.querySelector('.login-container .qrcode-img, .login-mask .qrcode-img'));
      const hasLoginPanel = Boolean(document.querySelector('.login-container, .login-mask'));
      const bodyText = (document.body?.innerText || '').toLowerCase();
      const hasExpiredHint = /二维码已过期|二维码过期|点击刷新|qrcode expired|qr code expired/.test(bodyText);
      const hasUserMarker = Boolean(document.querySelector('.main-container .user .link-wrapper .channel'));
      return { hasLoginQr, hasUserMarker, cookieText, hasLoginPanel, hasExpiredHint };
    `);

    if (probe.hasLoginQr || probe.hasLoginPanel || probe.hasExpiredHint) {
      return "logged_out";
    }

    if (probe.hasUserMarker) {
      return "logged_in";
    }

    if (this.hasAuthCookie(probe.cookieText)) {
      return "logged_in";
    }

    if (probe.hasLoginQr) {
      return "logged_out";
    }

    return "unknown";
  }

  private hasAuthCookie(cookieText: string): boolean {
    const names = this.getAuthCookieNames();
    for (const name of names) {
      if (cookieText.includes(`${name}=`)) {
        return true;
      }
    }
    return false;
  }

  private getAuthCookieNames(): Set<string> {
    return new Set(["web_session", "web_session_sid"]);
  }

  private async detectRisk(): Promise<void> {
    const text = await this.driver.evaluate<string>(`return (document.body?.innerText || '').toLowerCase();`);
    for (const pattern of RISK_PATTERNS) {
      if (text.includes(pattern)) {
        throw new AppError("platform_blocked", `risk control detected: ${pattern}`);
      }
    }
  }

  private async getActiveLoginSession(): Promise<LoginSession | undefined> {
    const session = this.loginSession;
    if (!session) {
      return undefined;
    }

    if (!this.isLoginSessionAlive(session)) {
      await this.closeLoginSession(session);
      return undefined;
    }

    if (session.status === "pending") {
      const loggedIn = await this.isLoggedIn();
      if (loggedIn) {
        await this.markLoginSessionSuccess(session);
      } else if (Date.now() >= session.expiresAt) {
        await this.closeLoginSession(session);
        return undefined;
      }
    }

    if (session.status === "success") {
      const loggedIn = await this.isLoggedIn();
      if (!loggedIn) {
        await this.closeLoginSession(session);
        return undefined;
      }
    }

    return this.loginSession ?? undefined;
  }

  private isLoginSessionAlive(session: LoginSession): boolean {
    if (this.loginSession !== session) {
      return false;
    }
    return true;
  }

  private scheduleLoginPolling(session: LoginSession): void {
    session.pollTimer = setTimeout(async () => {
      if (!this.isLoginSessionAlive(session) || session.status !== "pending") {
        return;
      }

      try {
        const loggedIn = await this.withRuntime(async () => this.isLoggedIn());
        if (loggedIn) {
          await this.markLoginSessionSuccess(session);
          return;
        }
      } catch (error) {
        process.stderr.write(`[xhs] login polling failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }

      this.scheduleLoginPolling(session);
    }, LOGIN_POLL_INTERVAL_MS);
  }

  private async markLoginSessionSuccess(session: LoginSession): Promise<void> {
    if (!this.isLoginSessionAlive(session)) {
      return;
    }
    if (session.status === "success") {
      return;
    }

    session.status = "success";
    session.expiresAt = Date.now() + LOGIN_SUCCESS_KEEPALIVE_MS;
    if (session.pollTimer) {
      clearTimeout(session.pollTimer);
      session.pollTimer = null;
    }
    this.scheduleCleanup(session, LOGIN_SUCCESS_KEEPALIVE_MS);
  }

  private scheduleCleanup(session: LoginSession, ms: number): void {
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
    }
    session.cleanupTimer = setTimeout(() => {
      void this.closeLoginSession(session);
    }, ms);
  }

  private async closeLoginSession(session: LoginSession): Promise<void> {
    if (this.loginSession !== session) {
      return;
    }

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }
    if (session.pollTimer) {
      clearTimeout(session.pollTimer);
      session.pollTimer = null;
    }

    this.loginSession = null;
  }

  private async resolveQrcodeSrc(): Promise<string> {
    const initialProbe = await this.readQrcodeProbe();
    if (initialProbe.src && !initialProbe.hasExpiredHint) {
      return initialProbe.src;
    }

    for (let attempt = 1; attempt <= QRCODE_REFRESH_MAX_ATTEMPTS; attempt += 1) {
      const shouldRefresh = initialProbe.hasExpiredHint || initialProbe.hasLoginQr || attempt > 1;
      if (shouldRefresh) {
        const clicked = await this.tryClickQrcodeRefresh();
        if (!clicked) {
          await this.openExplore();
        }
      }

      try {
        const src = await this.waitForUsableQrcode(QRCODE_REFRESH_WAIT_MS);
        return src;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/timeout/i.test(message) || attempt >= QRCODE_REFRESH_MAX_ATTEMPTS) {
          throw error;
        }
        await this.openExplore();
      }
    }

    throw new AppError("timeout", "qrcode refresh timed out");
  }

  private async readQrcodeProbe(): Promise<QrcodeProbe> {
    return this.driver.evaluate<QrcodeProbe>(`
      const img = document.querySelector('.login-container .qrcode-img, .login-mask .qrcode-img');
      const src = img?.getAttribute('src') ?? null;
      const bodyText = (document.body?.innerText || '').toLowerCase();
      const hasExpiredHint = /二维码已过期|二维码过期|点击刷新|qrcode expired|qr code expired/.test(bodyText);
      const hasLoginQr = Boolean(img);
      return { src, hasLoginQr, hasExpiredHint };
    `);
  }

  private async tryClickQrcodeRefresh(): Promise<boolean> {
    return this.driver.evaluate<boolean>(`
      const exactKeywords = ['点击刷新', '刷新二维码', '刷新'];
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, div'))
        .map((el) => ({ el, text: (el.textContent || '').trim() }))
        .filter((item) => item.text.length > 0 && isVisible(item.el));
      const exact = candidates.find((item) => exactKeywords.includes(item.text));
      const fuzzy = candidates.find((item) => exactKeywords.some((keyword) => item.text.includes(keyword)) && item.text.length <= 12);
      const target = (exact?.el ?? fuzzy?.el) || null;
      if (!target) {
        return false;
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    `);
  }

  private async waitForUsableQrcode(timeoutMs: number): Promise<string> {
    const probe = await this.driver.waitFor<QrcodeProbe>(
      `
        const img = document.querySelector('.login-container .qrcode-img, .login-mask .qrcode-img');
        const src = img?.getAttribute('src') ?? null;
        const bodyText = (document.body?.innerText || '').toLowerCase();
        const hasExpiredHint = /二维码已过期|二维码过期|点击刷新|qrcode expired|qr code expired/.test(bodyText);
        const hasLoginQr = Boolean(img);
        return { src, hasLoginQr, hasExpiredHint };
      `,
      (value) => {
        if (typeof value.src !== "string" || value.src.length === 0) {
          return false;
        }
        if (value.hasExpiredHint) {
          return false;
        }
        return true;
      },
      timeoutMs,
      QRCODE_REFRESH_POLL_INTERVAL_MS
    );

    if (!probe.src) {
      throw new AppError("internal_error", "failed to read qrcode src");
    }
    return probe.src;
  }

  private async readUsername(): Promise<string | undefined> {
    const username = await this.driver.evaluate<string>(`
      const el = document.querySelector('.main-container .user .link-wrapper .channel');
      return (el?.textContent ?? '').trim();
    `);
    return username || undefined;
  }

  private async persistQrcode(src: string): Promise<void> {
    await fs.mkdir(QR_OUTPUT_DIR, { recursive: true });

    if (src.startsWith("data:image")) {
      const match = src.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
      if (!match?.[1]) {
        throw new AppError("internal_error", "invalid qrcode data url");
      }

      const buffer = Buffer.from(match[1], "base64");
      if (buffer.length === 0) {
        throw new AppError("internal_error", "decoded qrcode image is empty");
      }

      await fs.writeFile(QR_OUTPUT_PATH, buffer);
      return;
    }

    const response = await fetch(src);
    if (!response.ok) {
      throw new AppError("internal_error", `failed to download qrcode image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      throw new AppError("internal_error", "downloaded qrcode image is empty");
    }

    await fs.writeFile(QR_OUTPUT_PATH, buffer);
  }

  private async ensureQrcodeFileReady(): Promise<void> {
    try {
      const stat = await fs.stat(QR_OUTPUT_PATH);
      if (!stat.isFile()) {
        throw new AppError("internal_error", "qrcode output path is not a file");
      }
      if (stat.size <= 0) {
        throw new AppError("internal_error", "qrcode output file is empty");
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "qrcode output file missing");
    }
  }

  private async buildQrcodeInfo(): Promise<QrImageInfo> {
    const buffer = await fs.readFile(QR_OUTPUT_PATH);
    const dimensions = this.readPngDimensions(buffer);
    const stat = await fs.stat(QR_OUTPUT_PATH);
    if (!stat.isFile() || stat.size <= 0) {
      throw new AppError("internal_error", "qrcode output file missing");
    }
    return {
      local_path: QR_OUTPUT_PATH,
      mime_type: "image/png",
      width: dimensions.width,
      height: dimensions.height,
      size_bytes: stat.size,
      source: "local_file"
    };
  }

  private readPngDimensions(buffer: Buffer): { width: number; height: number } {
    if (buffer.length < 24) {
      throw new AppError("internal_error", "qrcode png is too small");
    }

    const pngSignature = "89504e470d0a1a0a";
    if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
      throw new AppError("internal_error", "qrcode output is not a png image");
    }

    const ihdrChunkType = buffer.subarray(12, 16).toString("ascii");
    if (ihdrChunkType !== "IHDR") {
      throw new AppError("internal_error", "qrcode png missing ihdr chunk");
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width <= 0 || height <= 0) {
      throw new AppError("internal_error", "qrcode png has invalid dimensions");
    }

    return { width, height };
  }
}
