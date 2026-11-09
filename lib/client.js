window.__ModuleLoader__.load({
  id: "dsh-plugin-wallpaper-cleanup",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const BASE = "/wallpaper-cleanup";
    const FOLDER_KEY = "dsh.wallpaper-cleanup.folder";

    const STYLE = `
.wpc-root{display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,#e8e8e8);font-size:13px;line-height:1.55;max-width:780px}
.wpc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.wpc-title{margin:0;font-size:18px;font-weight:600}
.wpc-sub{margin:2px 0 0;color:var(--dsw-alias-label-tertiary,#9a9a9a);font-size:13px}
.wpc-close{width:30px;height:30px;flex:none;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}
.wpc-close:hover{background:var(--dsw-alias-bg-l2,rgba(255,255,255,.08))}
.wpc-card{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:12px;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));background:var(--dsw-alias-bg-l1,rgba(255,255,255,.03))}
.wpc-field{display:flex;flex-direction:column;gap:6px}
.wpc-label{font-weight:600;font-size:13px}
.wpc-hint{color:var(--dsw-alias-label-tertiary,#9a9a9a);font-size:12px}
.wpc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wpc-input{flex:1;min-width:0;height:34px;padding:0 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:var(--dsw-alias-bg-l2,rgba(255,255,255,.04));color:inherit;font:inherit;outline:none}
.wpc-input:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}
.wpc-btn{height:34px;padding:0 14px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:transparent;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
.wpc-btn:hover{background:var(--dsw-alias-bg-l2,rgba(255,255,255,.06))}
.wpc-btn:disabled{opacity:.5;cursor:not-allowed}
.wpc-btn-primary{background:var(--dsw-alias-state-business-primary,#4d6bfe);border-color:transparent;color:#fff}
.wpc-btn-primary:hover{filter:brightness(1.08);background:var(--dsw-alias-state-business-primary,#4d6bfe)}
.wpc-btn-danger{background:#c94b45;border-color:transparent;color:#fff}
.wpc-btn-danger:hover{background:#d95a54}
.wpc-shot{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary,#bdbdbd);min-width:0}
.wpc-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;background:var(--dsw-alias-bg-l2,rgba(255,255,255,.06));font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wpc-ok{color:#3fb950}
.wpc-bad{color:#e5534b}
.wpc-url{font-size:12px;color:var(--dsw-alias-label-tertiary,#9a9a9a);word-break:break-all}
.wpc-btn-ghost{height:28px;padding:0 10px;font-size:12px}
.wpc-browser{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:10px;border:.5px dashed var(--dsw-alias-border-l2,rgba(255,255,255,.2));background:var(--dsw-alias-bg-l2,rgba(255,255,255,.03))}
.wpc-dir{cursor:pointer}
.wpc-dir:hover{background:var(--dsw-alias-bg-l2,rgba(255,255,255,.08))}
.wpc-list{margin:0;padding:0;list-style:none;max-height:190px;overflow:auto;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1))}
.wpc-list li{display:flex;gap:8px;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.07));font-size:12px}
.wpc-list li:last-child{border-bottom:0}
.wpc-id{color:var(--dsw-alias-label-tertiary,#8d8d8d);font-variant-numeric:tabular-nums;min-width:88px}
.wpc-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wpc-score{color:var(--dsw-alias-label-tertiary,#8d8d8d);font-variant-numeric:tabular-nums}
.wpc-summary{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wpc-pill{padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-l2,rgba(255,255,255,.06));font-size:12px}
.wpc-warn{padding:10px 12px;border-radius:10px;background:rgba(210,153,34,.12);border:.5px solid rgba(210,153,34,.35);font-size:12px}
.wpc-danger-zone{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:2px}
.wpc-textarea{width:100%;min-height:74px;resize:vertical;padding:8px 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:var(--dsw-alias-bg-l2,rgba(255,255,255,.04));color:inherit;font:inherit;outline:none;box-sizing:border-box}
.wpc-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#bdbdbd);font-size:12px}
.wpc-error{padding:10px 12px;border-radius:10px;background:rgba(229,83,75,.12);border:.5px solid rgba(229,83,75,.4);font-size:12px;white-space:pre-wrap}
.wpc-fab{position:fixed;right:24px;bottom:24px;z-index:900;height:40px;padding:0 16px;border-radius:999px;border:0;background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);display:flex;align-items:center;gap:8px}
.wpc-fab:hover{filter:brightness(1.08)}
.wpc-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:24px}
.wpc-modal{width:min(800px,calc(100vw - 48px));max-height:86vh;overflow:auto;box-sizing:border-box;padding:18px 18px 14px;border-radius:14px;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:var(--dsw-alias-bg-l1,#1c1c1e);box-shadow:0 18px 60px rgba(0,0,0,.5)}
.wpc-hidden{display:none}
`;

    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-wpc-style]")) return;
      const tag = document.createElement("style");
      tag.setAttribute("data-wpc-style", "1");
      tag.textContent = STYLE;
      document.head.appendChild(tag);
    }

    function desktopPicker() {
      try {
        return globalThis.__DSH_DIRECTORY_PICKER__ || null;
      } catch {
        return null;
      }
    }

    function hostPaths() {
      try {
        return globalThis.__DSH_HOST_PATHS__ || null;
      } catch {
        return null;
      }
    }

    async function api(path, options) {
      const response = await fetch(BASE + path, {
        credentials: "same-origin",
        ...options,
        headers: { "content-type": "application/json", "x-dsh-wc": "1", ...(options && options.headers) }
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok || !body || body.ok === false) {
        throw new Error((body && body.error) || `请求失败（HTTP ${response.status}）`);
      }
      return body;
    }

    function formatSize(bytes) {
      if (!bytes) return "";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
      return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }

    function CleanupPanel(props) {
      const onClose = props && props.onClose;
      const [folder, setFolder] = React.useState(() => {
        try {
          return localStorage.getItem(FOLDER_KEY) || "";
        } catch {
          return "";
        }
      });
      const [shot, setShot] = React.useState(null);
      const [manual, setManual] = React.useState("");
      const [plan, setPlan] = React.useState(null);
      const [applied, setApplied] = React.useState(null);
      const [busy, setBusy] = React.useState("");
      const [error, setError] = React.useState("");
      const [confirming, setConfirming] = React.useState(false);
      const [browse, setBrowse] = React.useState(null);
      const fileRef = React.useRef(null);

      React.useEffect(() => {
        ensureStyle();
      }, []);

      React.useEffect(() => {
        if (folder) return;
        let cancelled = false;
        api("/defaults")
          .then((value) => {
            if (!cancelled && value.folder) setFolder(value.folder);
          })
          .catch(() => {});
        return () => {
          cancelled = true;
        };
      }, [folder]);

      const remember = (value) => {
        setFolder(value);
        setPlan(null);
        setApplied(null);
        setConfirming(false);
        try {
          localStorage.setItem(FOLDER_KEY, value);
        } catch {
          /* private mode */
        }
      };

      const loadBrowser = async (target) => {
        setBrowse({ loading: true, path: target || "", entries: [], parent: "" });
        try {
          const value = await api("/browse" + (target ? "?path=" + encodeURIComponent(target) : ""));
          setBrowse({
            loading: false,
            path: value.path,
            parent: value.parent,
            entries: value.entries || []
          });
        } catch (e) {
          if (target) {
            await loadBrowser("");
            return;
          }
          setBrowse(null);
          setError(String((e && e.message) || e));
        }
      };

      const pickFolder = async () => {
        if (busy) return;
        setError("");
        setBusy("pick");
        try {
          const picker = desktopPicker();
          if (picker && typeof picker.pick === "function") {
            const picked = await picker.pick();
            const value = typeof picked === "string" ? picked : picked && picked.path;
            if (value) remember(String(value));
            return;
          }
          await loadBrowser(folder.trim() || "");
        } catch (e) {
          setError(String((e && e.message) || e));
        } finally {
          setBusy("");
        }
      };

      const pickShot = () => {
        setError("");
        fileRef.current && fileRef.current.click();
      };

      const acceptShot = async (file) => {
        if (!file) return;
        setError("");
        setBusy("upload");
        setPlan(null);
        setApplied(null);
        setConfirming(false);
        try {
          const bridge = hostPaths();
          if (bridge && typeof bridge.pathFor === "function") {
            let path = "";
            try {
              path = bridge.pathFor(file);
            } catch {
              path = "";
            }
            if (path) {
              setShot({ path, name: file.name || "screenshot.png", size: file.size });
              return;
            }
          }
          const response = await fetch(BASE + "/upload", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type": file.type || "image/png",
              "x-filename": encodeURIComponent(file.name || "screenshot.png"),
              "x-dsh-wc": "1"
            },
            body: file
          });
          const value = await response.json().catch(() => null);
          if (!response.ok || !value || value.ok === false) throw new Error((value && value.error) || "截图上传失败");
          setShot({ path: value.path, name: file.name || "screenshot.png", size: value.size || file.size });
        } catch (e) {
          setError(String((e && e.message) || e));
        } finally {
          setBusy("");
          if (fileRef.current) fileRef.current.value = "";
        }
      };

      const titles = manual
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const scan = async () => {
        if (busy) return;
        setError("");
        setPlan(null);
        setApplied(null);
        setConfirming(false);
        if (!folder.trim()) {
          setError("请先选择工坊文件夹");
          return;
        }
        if (!shot && !titles.length) {
          setError("请选择订阅截图，或在“手动补充标题”里填写标题");
          return;
        }
        setBusy("scan");
        try {
          const value = await api("/scan", {
            method: "POST",
            body: JSON.stringify({
              folder: folder.trim(),
              screenshot: shot ? shot.path : "",
              titles: titles.length ? titles : undefined
            })
          });
          setPlan(value);
        } catch (e) {
          setError(String((e && e.message) || e));
        } finally {
          setBusy("");
        }
      };

      const applyPlan = async () => {
        if (!plan || busy) return;
        setError("");
        setBusy("apply");
        try {
          const value = await api("/apply", {
            method: "POST",
            body: JSON.stringify({ planId: plan.planId, confirm: true })
          });
          setApplied(value);
          setPlan(null);
          setConfirming(false);
        } catch (e) {
          setError(String((e && e.message) || e));
        } finally {
          setBusy("");
        }
      };

      const removeCount = plan ? plan.remove.length : 0;
      const canApply = plan && plan.safeToApply && removeCount > 0;

      return h(
        "div",
        { className: "wpc-root" },
        h(
          "div",
          { className: "wpc-head" },
          h(
            "div",
            null,
            h("h2", { className: "wpc-title" }, "壁纸清理"),
            h(
              "p",
              { className: "wpc-sub" },
              "对照 Wallpaper Engine 的订阅截图，把不属于你的工坊壁纸文件夹移入回收站（可恢复）。扫描阶段不会删除任何文件。"
            )
          ),
          onClose
            ? h("button", { type: "button", className: "wpc-close", title: "关闭", onClick: onClose }, "×")
            : null
        ),

        h(
          "div",
          { className: "wpc-card" },
          h(
            "div",
            { className: "wpc-field" },
            h("span", { className: "wpc-label" }, "1. 工坊文件夹"),
            h(
              "div",
              { className: "wpc-row" },
              h("input", {
                className: "wpc-input",
                value: folder,
                placeholder: "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960",
                spellCheck: false,
                onChange: (event) => remember(event.target.value)
              }),
              h(
                "button",
                { type: "button", className: "wpc-btn", onClick: pickFolder, disabled: busy === "pick" },
                busy === "pick" ? "选择中…" : "选择文件夹…"
              )
            ),
            h("span", { className: "wpc-hint" }, "会弹出系统文件夹选择框；也可以直接把路径粘贴到输入框。")
          ),

          browse
            ? h(
                "div",
                { className: "wpc-browser" },
                h(
                  "div",
                  { className: "wpc-row", style: { justifyContent: "space-between" } },
                  h("strong", null, "选择文件夹"),
                  h("span", { className: "wpc-url" }, browse.path || "此电脑")
                ),
                h(
                  "div",
                  { className: "wpc-row" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "wpc-btn wpc-btn-ghost",
                      onClick: () => loadBrowser(browse.parent || ""),
                      disabled: browse.loading
                    },
                    "↑ 上一级"
                  ),
                  h(
                    "button",
                    { type: "button", className: "wpc-btn wpc-btn-ghost", onClick: () => loadBrowser(""), disabled: browse.loading },
                    "此电脑"
                  ),
                  h(
                    "button",
                    { type: "button", className: "wpc-btn wpc-btn-ghost", onClick: () => setBrowse(null) },
                    "取消"
                  )
                ),
                browse.loading
                  ? h("div", { className: "wpc-hint" }, "读取中…")
                  : h(
                      "ul",
                      { className: "wpc-list" },
                      (browse.entries || []).map((entry) =>
                        h(
                          "li",
                          { key: entry.path, className: "wpc-dir", title: entry.path, onClick: () => loadBrowser(entry.path) },
                          h("span", { className: "wpc-name" }, entry.name)
                        )
                      )
                    ),
                h(
                  "div",
                  { className: "wpc-row" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "wpc-btn wpc-btn-primary",
                      disabled: browse.loading || !browse.path,
                      onClick: () => {
                        remember(browse.path);
                        setBrowse(null);
                      }
                    },
                    "使用此文件夹"
                  ),
                  h("span", { className: "wpc-hint" }, "进入到包含 431960 的目录后点此确认")
                )
              )
            : null,

          h(
            "div",
            { className: "wpc-field" },
            h("span", { className: "wpc-label" }, "2. 订阅壁纸截图"),
            h(
              "div",
              { className: "wpc-row" },
              h("input", {
                ref: fileRef,
                type: "file",
                accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp",
                style: { display: "none" },
                onChange: (event) => acceptShot(event.target.files && event.target.files[0])
              }),
              h(
                "button",
                { type: "button", className: "wpc-btn", onClick: pickShot, disabled: busy === "upload" },
                busy === "upload" ? "处理中…" : "选择截图…"
              ),
              shot
                ? h(
                    "span",
                    { className: "wpc-shot" },
                    h("span", { className: "wpc-chip", title: shot.name }, shot.name),
                    shot.size ? h("span", null, formatSize(shot.size)) : null
                  )
                : h("span", { className: "wpc-shot" }, "未选择（也可以在下方手动填写标题）")
            ),
            shot ? h("span", { className: "wpc-url" }, shot.path) : null,
            h("span", { className: "wpc-hint" }, "截图需包含 Wallpaper Engine“已订阅/已安装”网格，磁贴右上角的蓝色勾选会被用来确定订阅数量。")
          ),

          h(
            "details",
            { className: "wpc-details" },
            h("summary", null, "识别不准？手动补充标题（每行一个，可截断）"),
            h("textarea", {
              className: "wpc-textarea",
              value: manual,
              placeholder: "例如：\n上伊那牡丹ep1\nWuthering Waves - Live Chisa\n刻晴",
              onChange: (event) => {
                setManual(event.target.value);
                setPlan(null);
                setApplied(null);
              }
            })
          ),

          h(
            "div",
            { className: "wpc-row" },
            h(
              "button",
              { type: "button", className: "wpc-btn wpc-btn-primary", onClick: scan, disabled: Boolean(busy) },
              busy === "scan" ? "扫描中…（首次约 20 秒）" : "开始扫描"
            ),
            h("span", { className: "wpc-hint" }, "扫描只生成计划，不会删除文件。")
          )
        ),

        error ? h("div", { className: "wpc-error" }, error) : null,

        applied
          ? h(
              "div",
              { className: "wpc-card" },
              h("strong", { className: "wpc-ok" }, "已执行"),
              h("div", null, `已把 ${applied.recycledCount} 个文件夹移入回收站，保留 ${applied.verifiedKeep} 个订阅壁纸。`),
              applied.failedCount
                ? h(
                    "div",
                    { className: "wpc-warn" },
                    `有 ${applied.failedCount} 个未能移动：` +
                      applied.failed.map((f) => `${f.id}（${f.error}）`).join("；")
                  )
                : null,
              h("span", { className: "wpc-hint" }, "如确认无误，可到 Windows 回收站清空这一批以释放空间。")
            )
          : null,

        plan
          ? h(
              "div",
              { className: "wpc-card" },
              h(
                "div",
                { className: "wpc-summary" },
                plan.mode === "ocr"
                  ? h("span", { className: "wpc-pill" }, `截图中订阅：${plan.badgeCount} 个`)
                  : h("span", { className: "wpc-pill" }, `提供标题：${plan.matchedCount} 个`),
                h("span", { className: "wpc-pill wpc-ok" }, `将保留：${plan.keep.length} 个`),
                h(
                  "span",
                  { className: removeCount ? "wpc-pill wpc-bad" : "wpc-pill" },
                  `将移入回收站：${removeCount} 个`
                ),
                plan.safeToApply ? null : h("span", { className: "wpc-pill wpc-bad" }, "未通过安全校验")
              ),

              plan.warnings && plan.warnings.length ? h("div", { className: "wpc-warn" }, plan.warnings.join("；")) : null,

              plan.unresolved && plan.unresolved.length
                ? h(
                    "div",
                    { className: "wpc-warn" },
                    `有 ${plan.unresolved.length} 个磁贴/标题无法确认，为避免误删已停止。可展开“手动补充标题”填写后重新扫描。`,
                    h(
                      "ul",
                      { className: "wpc-list", style: { marginTop: "8px" } },
                      plan.unresolved.slice(0, 12).map((item, index) =>
                        h(
                          "li",
                          { key: index },
                          h(
                            "span",
                            { className: "wpc-name" },
                            item.kind === "tile"
                              ? `第 ${(item.tile || 0) + 1} 个磁贴：${item.text || "（无可读文字）"}`
                              : `标题：${item.text}`
                          )
                        )
                      )
                    )
                  )
                : null,

              removeCount
                ? h(
                    "div",
                    { className: "wpc-field" },
                    h("span", { className: "wpc-label" }, "将移入回收站"),
                    h(
                      "ul",
                      { className: "wpc-list" },
                      plan.remove.map((item) =>
                        h(
                          "li",
                          { key: item.id },
                          h("span", { className: "wpc-id" }, item.id),
                          h("span", { className: "wpc-name", title: item.title }, item.title)
                        )
                      )
                    )
                  )
                : h("div", { className: "wpc-hint" }, "没有需要删除的壁纸，当前文件夹里的都是订阅项。"),

              h(
                "details",
                { className: "wpc-details" },
                h("summary", null, `查看将保留的 ${plan.keep.length} 个`),
                h(
                  "ul",
                  { className: "wpc-list", style: { marginTop: "8px" } },
                  plan.keep.map((item) =>
                    h(
                      "li",
                      { key: item.id },
                      h("span", { className: "wpc-id" }, item.id),
                      h("span", { className: "wpc-name", title: item.title }, item.title),
                      h("span", { className: "wpc-score" }, Number(item.score).toFixed(2))
                    )
                  )
                )
              ),

              h(
                "div",
                { className: "wpc-danger-zone" },
                confirming
                  ? h(
                      "div",
                      { className: "wpc-row" },
                      h("span", { className: "wpc-bad" }, `确认要把这 ${removeCount} 个文件夹移入回收站？`),
                      h(
                        "button",
                        { type: "button", className: "wpc-btn wpc-btn-danger", onClick: applyPlan, disabled: Boolean(busy) },
                        busy === "apply" ? "执行中…" : "确认执行"
                      ),
                      h(
                        "button",
                        { type: "button", className: "wpc-btn", onClick: () => setConfirming(false), disabled: Boolean(busy) },
                        "取消"
                      )
                    )
                  : h(
                      "button",
                      {
                        type: "button",
                        className: "wpc-btn wpc-btn-danger",
                        onClick: () => setConfirming(true),
                        disabled: Boolean(busy) || !canApply
                      },
                      removeCount ? `移入回收站（${removeCount} 个）` : "没有可移动的文件夹"
                    ),
                h("span", { className: "wpc-hint" }, "只移动“将移入回收站”列表里的直接子文件夹；保留项与其它文件不会被改动。")
              )
            )
          : null,

        h(
          "p",
          { className: "wpc-hint" },
          "所有删除都会进入 Windows 回收站，可随时还原。插件不会修改 appworkshop_*.acf、Steam 配置或文件夹之外的任何内容。"
        )
      );
    }

    function Section() {
      return h(CleanupPanel, null);
    }

    function Launcher() {
      const [open, setOpen] = React.useState(false);
      const [mounted, setMounted] = React.useState(false);

      React.useEffect(() => {
        ensureStyle();
      }, []);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [open]);

      const openModal = () => {
        setMounted(true);
        setOpen(true);
      };

      return h(
        React.Fragment,
        null,
        open
          ? null
          : h(
              "button",
              { type: "button", className: "wpc-fab", title: "壁纸清理", onClick: openModal },
              "壁纸清理"
            ),
        mounted
          ? h(
              "div",
              {
                className: open ? "wpc-backdrop" : "wpc-hidden",
                onMouseDown: (event) => {
                  if (event.target === event.currentTarget) setOpen(false);
                }
              },
              h("div", { className: "wpc-modal", role: "dialog", "aria-modal": "true" }, h(CleanupPanel, { onClose: () => setOpen(false) }))
            )
          : null
      );
    }

    function apply(ctx) {
      ensureStyle();
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          { name: "settings.section", id: "wallpaper-cleanup", order: 25, label: () => "壁纸清理" },
          Section
        )
      );
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register({ name: "shell.overlay", id: "wallpaper-cleanup-launcher", order: 100 }, Launcher)
      );
    }

    exports.name = "dsh-plugin-wallpaper-cleanup";
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  }
});
