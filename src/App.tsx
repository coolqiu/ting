import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { BookOpen, Headphones, CalendarDays, Mic, LogOut, Settings, Info, HelpCircle, BarChart3, User, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./App.css";
import "./i18n"; // i18n initialization
import { ToastProvider } from "./components/Toast";

import StudyWorkspace from "./views/StudyWorkspace";
import { LibraryView } from "./views/LibraryView";
import { ReviewDashboard } from "./views/ReviewDashboard";
import { SpeakingView } from "./views/SpeakingView";
import { LoginView } from "./views/LoginView";
import { SettingsView } from "./views/SettingsView";
import { AboutView } from "./views/AboutView";
import HelpView from "./views/HelpView";
import { ReviewSessionView } from "./views/ReviewSessionView";
import { StatisticsView } from "./views/StatisticsView";
import { ProfileView } from "./views/ProfileView";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ShortcutOverlay } from "./components/ShortcutOverlay";
import { OnboardingModal } from "./components/OnboardingModal";

interface UserInfo {
  id: number;
  username: string;
  created_at: string;
}

export default function App() {
  useKeyboardShortcuts();
  const [user, setUser] = useState<UserInfo | null | undefined>(undefined); // undefined = checking

  // Check if already logged in
  useEffect(() => {
    invoke<UserInfo | null>("get_current_user")
      .then(u => setUser(u))
      .catch(() => setUser(null));

    // Context menu is now allowed globally to enable native selection handles on Android
    /*
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
    */
  }, []);

  const handleLogin = (u: UserInfo) => setUser(u);
  const handleLogout = async () => {
    // Stop and completely clear backend audio state
    await invoke("stop").catch(() => { });
    await invoke("unload_audio").catch(() => { });
    await invoke("clear_shadowing_override").catch(() => { });
    await invoke("logout_user").catch(() => { });

    // Clear the router hash to ensure the next login starts at the home page (library)
    window.location.hash = "";

    setUser(null);
  };

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (user === null) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <ToastProvider>
      <Router>
        <AppContent user={user} onLogout={handleLogout} />
      </Router>
    </ToastProvider>
  );
}

function AppContent({ user, onLogout }: { user: UserInfo; onLogout: () => void }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(true); // Always force open on desktop resize
      } else if (!isMobile) {
        setSidebarOpen(false); // Collapse when resizing down to mobile
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobile]);

  // Clear shadowing override when navigating AWAY from shadowing view
  useEffect(() => {
    if (location.pathname !== "/speaking") {
      invoke("clear_shadowing_override").catch(() => { });
    }
  }, [location.pathname]);

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const navItems = [
    { id: "library", path: "/", icon: BookOpen, label: t("nav.library") },
    { id: "workspace", path: "/workspace", icon: Headphones, label: t("nav.workspace") },
    { id: "oral", path: "/speaking", icon: Mic, label: t("nav.speaking") },
    { id: "review", path: "/review", icon: CalendarDays, label: t("nav.review") },
    { id: "stats", path: "/statistics", icon: BarChart3, label: t("nav.stats") },
  ];

  const secondaryNavItems = [
    { id: "help", path: "/help", icon: HelpCircle, label: t("nav.help") },
    { id: "settings", path: "/settings", icon: Settings, label: t("nav.settings") },
    { id: "about", path: "/about", icon: Info, label: t("nav.about") },
  ];

  return (
    <div className={`app-container ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${isMobile ? "is-mobile" : "is-desktop"}`}>
      {/* Mobile Drawer Backdrop */}
      {isMobile && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <nav className="app-sidebar">
        <div className="sidebar-header">
          <div className="logo-container" onClick={() => !isMobile && setSidebarOpen(!sidebarOpen)}>
            <div className="logo-icon">🎧</div>
            {(sidebarOpen || isMobile) && <h1 className="logo-text">{t("common.appName")}</h1>}
          </div>
        </div>

        <div className="sidebar-nav">
          <div className="nav-section">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path === "/" && location.pathname === "");
              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  onClick={() => handleNavClick(item.path)}
                  title={!sidebarOpen && !isMobile ? item.label : undefined}
                >
                  <item.icon className="nav-icon" size={20} />
                  {(sidebarOpen || isMobile) && <span className="nav-label">{item.label}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          <div className="nav-section" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "8px" }}>
            {secondaryNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  onClick={() => handleNavClick(item.path)}
                  title={!sidebarOpen && !isMobile ? item.label : undefined}
                >
                  <item.icon className="nav-icon" size={20} />
                  {(sidebarOpen || isMobile) && <span className="nav-label">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* User footer */}
        <div className="sidebar-footer">
          {(sidebarOpen || isMobile) ? (
            <div
              className={`nav-item ${location.pathname === "/profile" ? "active" : ""}`}
              onClick={() => handleNavClick("/profile")}
              style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", marginBottom: "4px", gap: "8px", height: "auto" }}
            >
              <User size={18} className="nav-icon" />
              <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => { e.stopPropagation(); onLogout(); }}
                title={t("common.switchUser")}
                style={{ padding: "4px 6px", minWidth: 0, margin: "-4px" }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <button className={`nav-item ${location.pathname === "/profile" ? "active" : ""}`} onClick={() => handleNavClick("/profile")} title={user.username}>
                <User className="nav-icon" size={20} />
              </button>
              <button className="nav-item" onClick={onLogout} title={t("common.switchUser")}>
                <LogOut className="nav-icon" size={20} />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="app-main">
        {/* Mobile Header */}
        {isMobile && (
          <div className="mobile-header">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h2 className="mobile-header-title">{t("common.appName")}</h2>
          </div>
        )}

        <Routes>
          <Route path="/" element={<LibraryView />} />
          <Route path="/workspace" element={<StudyWorkspace />} />
          <Route path="/review" element={<ReviewDashboard />} />
          <Route path="/review/session" element={<ReviewSessionView />} />
          <Route path="/speaking" element={<SpeakingView />} />
          <Route path="/statistics" element={<StatisticsView />} />
          <Route path="/profile" element={<ProfileView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/about" element={<AboutView />} />
          <Route path="/help" element={<HelpView />} />
        </Routes>
      </main>

      <ShortcutOverlay />
      <OnboardingModal />
    </div>
  );
}

