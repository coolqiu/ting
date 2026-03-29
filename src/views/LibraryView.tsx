import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/Toast";
import { LearningMaterial, PlaybackInfo } from "../types";
import { Search, MoreVertical, Trash2, Edit2, Play, Filter, BookOpen, Link, FileAudio } from "lucide-react";
import { resolveAndArchiveAudio } from "../utils/audioLoader";

export function LibraryView() {
    const { t } = useTranslation();
    const { error, success } = useToast();
    const [materials, setMaterials] = useState<LearningMaterial[]>([]);
    const [showUrlModal, setShowUrlModal] = useState(false);
    const [renameTarget, setRenameTarget] = useState<LearningMaterial | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("newest");
    const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchMaterials();
    }, [searchQuery, sortBy]);

    async function fetchMaterials() {
        try {
            const result = await invoke<LearningMaterial[]>("search_materials", {
                query: searchQuery,
                sortBy
            });
            setMaterials(result);
        } catch (err) {
            console.error("Failed to load materials:", err);
        }
    }

    const handleAddMaterial = async () => {
        const selected = await open({
            multiple: false,
            filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma"] }],
        });
        if (!selected) return;

        const selectedPath = typeof selected === 'string' ? selected : selected[0];
        const fileName = (selectedPath.split('/').pop() || selectedPath.split('\\').pop() || 'unknown.wav').split('?')[0];

        try {
            const finalPath = await resolveAndArchiveAudio(selectedPath, fileName);
            const info = await invoke<PlaybackInfo>("load_audio", { path: finalPath });
            if (info?.file_path) {
                const materialId: number = await invoke("add_or_update_material", {
                    title: info.file_name || fileName,
                    sourceUrl: info.file_path,
                    durationMs: Math.round((info.duration_secs || 0) * 1000),
                });
                await invoke("set_material_id", { id: materialId });
            }
            navigate("/workspace");
        } catch (e) {
            error(t("library.loadFail", { error: String(e) }));
        }

    };

    const handleContinueStudy = async (mat: LearningMaterial) => {
        try {
            const current = await invoke<PlaybackInfo>("get_playback_state");
            const alreadyLoaded = current && current.file_path && (current as any).material_id === mat.id;
            if (alreadyLoaded) {
                navigate("/workspace");
                return;
            }
            const finalPath = await resolveAndArchiveAudio(mat.source_url, mat.title);
            await invoke<PlaybackInfo>("load_audio", { path: finalPath });
            await invoke("set_material_id", { id: mat.id });
            
            // Set session flag for StudyWorkspace to show resume prompt
            sessionStorage.setItem('pending_resume_material', mat.id.toString());
            
            navigate("/workspace");
        } catch (e) {
            error(t("library.loadFail", { error: String(e) }));
        }
    };

    const handleDelete = async (mat: LearningMaterial) => {
        const confirmed = await confirm(t("library.deleteConfirm"), {
            title: t("common.confirm"),
            kind: "warning",
        });
        if (!confirmed) return;
        try {
            await invoke("delete_material", { materialId: mat.id });
            success(t("common.success"));
            fetchMaterials();
        } catch (e) {
            error(String(e));
        }
    };

    const handleRename = (mat: LearningMaterial) => {
        setRenameTarget(mat);
    };

    const fmtDate = (s: string) => {
        try { return new Date(s.replace(" ", "T")).toLocaleString(); }
        catch { return s; }
    };

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <div>
                        <h2 style={{ fontSize: "24px", margin: "0 0 4px 0" }}>{t("library.title")}</h2>
                        <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("library.subtitle")}</p>
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                        <button className="btn btn-ghost" onClick={() => setShowUrlModal(true)}>{t("library.importUrl")}</button>
                        <button className="btn btn-primary" onClick={handleAddMaterial}>{t("library.addLocal")}</button>
                    </div>
                </div>

                {/* Search and Sort Toolbar */}
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                        <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} size={16} />
                        <input
                            type="text"
                            placeholder={t("library.search")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 10px 10px 38px",
                                borderRadius: "12px",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-primary)",
                                fontSize: "14px",
                                outline: "none",
                                boxSizing: "border-box"
                            }}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-secondary)", padding: "4px", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
                        <Filter size={14} style={{ marginLeft: "8px", color: "var(--text-muted)" }} />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--text-primary)",
                                fontSize: "13px",
                                outline: "none",
                                padding: "6px 12px 6px 4px",
                                cursor: "pointer"
                            }}
                        >
                            <option value="newest" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>{t("library.sortNewest")}</option>
                            <option value="oldest" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>{t("library.sortOldest")}</option>
                            <option value="title" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>{t("library.sortTitle")}</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="view-content">
                <div className="material-list">
                    {materials.length === 0 ? (
                        <div
                            style={{
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                padding: "60px 20px", background: "var(--bg-secondary)", borderRadius: "16px",
                                border: "1px dashed var(--border-medium)", marginTop: "20px"
                            }}
                        >
                            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(var(--accent-primary-rgb), 0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px", color: "var(--accent-primary)" }}>
                                <BookOpen size={32} />
                            </div>
                            <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>{t("library.empty")}</h3>
                            <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "var(--text-secondary)", maxWidth: "300px", textAlign: "center", lineHeight: 1.5 }}>
                                {t("library.emptyDesc")}
                            </p>
                            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                                <button className="btn btn-ghost" onClick={() => setShowUrlModal(true)} style={{ gap: "8px" }}>
                                    <Link size={16} /> {t("library.importUrl")}
                                </button>
                                <button className="btn btn-primary" onClick={handleAddMaterial} style={{ gap: "8px" }}>
                                    <FileAudio size={16} /> {t("library.addLocal")}
                                </button>
                            </div>
                        </div>
                    ) : (
                        materials.map(mat => (
                            <div key={mat.id} className="material-card" style={{
                                padding: "16px 20px", background: "var(--bg-secondary)",
                                borderRadius: "16px", marginBottom: "12px",
                                display: "flex", flexDirection: "column",
                                border: "1px solid var(--border-subtle)", position: "relative"
                            }}>
                                <div style={{ flex: 1, minWidth: 0, marginBottom: "8px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
                                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{mat.title}</h3>
                                        {mat.progress_secs !== null && mat.progress_secs > 0 && (
                                            <span style={{
                                                background: "rgba(var(--accent-primary-rgb), 0.1)",
                                                color: "var(--accent-primary)",
                                                padding: "2px 8px",
                                                borderRadius: "8px",
                                                fontSize: "11px",
                                                fontWeight: 600
                                            }}>
                                                {t("library.progress", { percent: Math.round((mat.progress_secs / (mat.duration_ms / 1000)) * 100) })}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
                                        <span>{t("library.lastStudied")}: {fmtDate(mat.last_opened_at)}</span>
                                        <span>{t("library.duration")}: {mat.duration_ms ? `${Math.floor(mat.duration_ms / 1000)}s` : "0s"}</span>
                                    </div>
                                    <div className="card-actions" style={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleContinueStudy(mat)}
                                            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", whiteSpace: "nowrap" }}
                                        >
                                            <Play size={14} fill="currentColor" /> {t("library.continueStudy", "继续学习")}
                                        </button>
                                        <div style={{ position: "relative" }}>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === mat.id ? null : mat.id); }}
                                                style={{ padding: "8px" }}
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                            {activeMenuId === mat.id && (
                                                <>
                                                    <div
                                                        style={{ position: "fixed", inset: 0, zIndex: 90 }}
                                                        onClick={() => setActiveMenuId(null)}
                                                    />
                                                    <div style={{
                                                        position: "absolute",
                                                        right: 0,
                                                        bottom: "100%",
                                                        marginBottom: "8px",
                                                        background: "var(--bg-primary)",
                                                        border: "1px solid var(--border-medium)",
                                                        borderRadius: "12px",
                                                        padding: "8px",
                                                        zIndex: 100,
                                                        width: "140px",
                                                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
                                                        overflow: "hidden"
                                                    }}>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            style={{ width: "100%", justifyContent: "flex-start", gap: "8px", padding: "8px 12px" }}
                                                            onClick={() => { handleRename(mat); setActiveMenuId(null); }}
                                                        >
                                                            <Edit2 size={14} />
                                                            {t("library.rename")}
                                                        </button>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            style={{ width: "100%", justifyContent: "flex-start", gap: "8px", padding: "8px 12px", color: "var(--error)" }}
                                                            onClick={() => { handleDelete(mat); setActiveMenuId(null); }}
                                                        >
                                                            <Trash2 size={14} />
                                                            {t("common.delete", "删除")}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* URL Import Modal */}
            {showUrlModal && (
                <UrlImportModal
                    onClose={() => setShowUrlModal(false)}
                    onSuccess={async (path) => {
                        setShowUrlModal(false);
                        try {
                            const finalPath = await resolveAndArchiveAudio(path, "downloaded_audio.mp3");
                            const info = await invoke<PlaybackInfo>("load_audio", { path: finalPath });
                            if (info?.file_path) {
                                const materialId: number = await invoke("add_or_update_material", {
                                    title: info.file_name,
                                    sourceUrl: info.file_path,
                                    durationMs: Math.round(info.duration_secs * 1000),
                                });
                                await invoke("set_material_id", { id: materialId });
                                await fetchMaterials();
                            }
                            navigate("/workspace");
                        } catch (e) {
                            error(t("library.downloadFail", { error: String(e) }));
                        }
                    }}
                />
            )}

            {/* Rename Modal */}
            {renameTarget && (
                <div style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
                }}>
                    <div style={{
                        width: "400px", background: "var(--bg-secondary)",
                        borderRadius: "var(--radius-xl)", padding: "24px",
                        border: "1px solid var(--border-subtle)",
                    }}>
                        <h3 style={{ margin: "0 0 16px 0" }}>{t("library.rename")}</h3>
                        <input
                            id="rename-material-input"
                            type="text"
                            autoFocus
                            defaultValue={renameTarget.title}
                            placeholder={t("library.renamePlaceholder")}
                            onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                    const val = (e.target as HTMLInputElement).value;
                                    if (!val.trim()) return;
                                    try {
                                        await invoke("rename_material", { materialId: renameTarget.id, newTitle: val });
                                        success(t("common.success"));
                                        setRenameTarget(null);
                                        fetchMaterials();
                                    } catch (err) {
                                        error(String(err));
                                    }
                                } else if (e.key === "Escape") {
                                    setRenameTarget(null);
                                }
                            }}
                            style={{
                                width: "100%", padding: "10px 14px", borderRadius: "8px",
                                border: "1px solid var(--border-medium)", background: "var(--bg-primary)",
                                color: "var(--text-primary)", fontSize: "14px", boxSizing: "border-box",
                                outline: "none", marginBottom: "20px",
                            }}
                        />
                        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost" onClick={() => setRenameTarget(null)}>{t("common.cancel")}</button>
                            <button className="btn btn-primary" onClick={async () => {
                                const input = document.getElementById('rename-material-input') as HTMLInputElement;
                                if (input && input.value.trim()) {
                                    try {
                                        await invoke("rename_material", { materialId: renameTarget.id, newTitle: input.value });
                                        success(t("common.success"));
                                        setRenameTarget(null);
                                        fetchMaterials();
                                    } catch (err) {
                                        error(String(err));
                                    }
                                }
                            }}>{t("common.save") || "Save"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── URL Import Modal ───────────────────────────────────────────────────────
function UrlImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (path: string) => void }) {
    const { t } = useTranslation();
    const [url, setUrl] = useState("");
    const [ytdlpOk, setYtdlpOk] = useState<boolean | null>(null);
    const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        invoke<boolean>("check_ytdlp").then(setYtdlpOk);
        invoke<boolean>("check_ffmpeg").then(setFfmpegOk);
        const unlisten = listen<string>("ytdlp-output", e => {
            setLogs(prev => [...prev, e.payload]);
            setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
        });
        return () => { unlisten.then(f => f()); };
    }, []);

    const handleDownload = async () => {
        if (!url.trim()) return;
        setLogs([]);
        setDownloading(true);
        try {
            const path = await invoke<string>("download_url_audio", { url: url.trim() });
            onSuccess(path);
        } catch (e) {
            const errStr = String(e);
            if (errStr.includes("ffprobe") || errStr.includes("ffmpeg")) {
                setLogs(prev => [...prev, `❌ 错误: 缺少 ffmpeg 组件，无法提取音频。`]);
                setLogs(prev => [...prev, `💡 建议运行: choco install ffmpeg (Windows) 或 brew install ffmpeg (Mac)`]);
            } else if (errStr.includes("JavaScript runtime")) {
                setLogs(prev => [...prev, `❌ 错误: 缺少 JavaScript 运行时，YouTube 提取受限。`]);
                setLogs(prev => [...prev, `💡 建议安装 Node.js 或 Deno。`]);
            } else {
                setLogs(prev => [...prev, `❌ ${t("common.error")}: ${e}`]);
            }
            setDownloading(false);
        }
    };

    return (
        <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
            <div style={{
                width: "560px", background: "var(--bg-secondary)",
                borderRadius: "var(--radius-xl)", padding: "32px",
                border: "1px solid var(--border-subtle)",
            }}>
                <h3 style={{ margin: "0 0 6px 0" }}>{t("urlImport.title")}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "20px" }}>
                    {t("urlImport.subtitle")}
                </p>

                {(ytdlpOk === false || ffmpegOk === false) && (
                    <div style={{ background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#f44336", lineHeight: 1.6 }}>
                        {ytdlpOk === false && (
                            <div style={{ marginBottom: "8px" }}>
                                ⚠️ {t("urlImport.ytdlpMissing")}<br />
                                <code style={{ marginTop: "4px", display: "inline-block", background: "#333", padding: "2px 6px", borderRadius: "4px" }}>pip install yt-dlp</code>
                            </div>
                        )}
                        {ffmpegOk === false && (
                            <div>
                                ⚠️ 缺少 ffmpeg (必要组件，用于音频提取)<br />
                                <code style={{ marginTop: "4px", display: "inline-block", background: "#333", padding: "2px 6px", borderRadius: "4px" }}>winget install ffmpeg</code>
                                &nbsp;或&nbsp;
                                <code style={{ marginTop: "4px", display: "inline-block", background: "#333", padding: "2px 6px", borderRadius: "4px" }}>choco install ffmpeg</code>
                            </div>
                        )}
                    </div>
                )}

                <input
                    type="text" placeholder={t("urlImport.placeholder")} value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !downloading && handleDownload()}
                    style={{
                        width: "100%", padding: "12px 14px", borderRadius: "8px",
                        border: "1px solid var(--border-medium)", background: "var(--bg-primary)",
                        color: "var(--text-primary)", fontSize: "14px", boxSizing: "border-box",
                        outline: "none", marginBottom: "12px",
                    }}
                />

                {/* Log area */}
                {(logs.length > 0 || downloading) && (
                    <div ref={logRef} style={{
                        background: "#0d0d0d", borderRadius: "8px", padding: "12px",
                        height: "180px", overflowY: "auto", fontFamily: "monospace",
                        fontSize: "12px", lineHeight: 1.6, color: "#aaa",
                        marginBottom: "16px", border: "1px solid var(--border-subtle)",
                    }}>
                        {logs.map((l, i) => <div key={i} style={{ color: l.includes("❌") || l.includes("ERROR") ? "var(--error)" : l.includes("💡") ? "#64b5f6" : "inherit" }}>{l}</div>)}
                        {downloading && <div style={{ color: "var(--accent-primary)" }}>{t("urlImport.downloading_status")}</div>}
                    </div>
                )}

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={onClose} disabled={downloading}>{t("common.cancel")}</button>
                    <button
                        className="btn btn-primary" onClick={handleDownload}
                        disabled={!url.trim() || downloading || ytdlpOk === false || ffmpegOk === false}
                    >
                        {downloading ? t("urlImport.downloading") : t("urlImport.download")}
                    </button>
                </div>
            </div>
        </div>
    );
}

