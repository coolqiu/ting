import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronLeft } from "lucide-react";

export function OnboardingModal() {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const hasSeenOnboarding = localStorage.getItem("has_seen_onboarding");
        if (!hasSeenOnboarding) {
            setIsVisible(true);
        }
    }, []);

    const handleClose = () => {
        localStorage.setItem("has_seen_onboarding", "true");
        setIsVisible(false);
    };

    const steps = [
        {
            title: t("help.library_title"),
            content: t("help.library_desc"),
            icon: "📚"
        },
        {
            title: t("help.workspace_title"),
            content: t("help.workspace_desc"),
            icon: "🎧"
        },
        {
            title: t("help.speaking_title"),
            content: t("help.speaking_desc"),
            icon: "🎤"
        }
    ];

    if (!isVisible) return null;

    return (
        <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            backdropFilter: "blur(4px)"
        }}>
            <div style={{
                background: "var(--bg-primary)",
                borderRadius: "24px",
                width: "480px",
                maxWidth: "90vw",
                overflow: "hidden",
                boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
                animation: "fade-in 0.3s ease-out"
            }}>
                <div style={{ background: "var(--accent-primary)", padding: "40px", color: "white", textAlign: "center" }}>
                    <div style={{ fontSize: "64px", marginBottom: "16px", animation: "bounce 2s infinite" }}>
                        {steps[currentStep].icon}
                    </div>
                    <h2 style={{ margin: 0, fontSize: "24px" }}>{steps[currentStep].title}</h2>
                </div>

                <div style={{ padding: "32px", minHeight: "140px", display: "flex", alignItems: "center" }}>
                    <p style={{ margin: 0, fontSize: "16px", color: "var(--text-secondary)", lineHeight: "1.6", textAlign: "center", width: "100%" }}>
                        {steps[currentStep].content}
                    </p>
                </div>

                <div style={{ padding: "16px 32px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                        {steps.map((_, idx) => (
                            <div key={idx} style={{
                                width: "8px", height: "8px", borderRadius: "50%",
                                background: idx === currentStep ? "var(--accent-primary)" : "var(--border-strong)",
                                transition: "background 0.2s"
                            }} />
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: "12px" }}>
                        {currentStep > 0 && (
                            <button className="btn btn-ghost" onClick={() => setCurrentStep(prev => prev - 1)}>
                                <ChevronLeft size={18} style={{ marginRight: "4px" }} />
                                {t("common.back")}
                            </button>
                        )}

                        {currentStep < steps.length - 1 ? (
                            <button className="btn btn-primary" onClick={() => setCurrentStep(prev => prev + 1)}>
                                {t("common.next", "Next")}
                                <ChevronRight size={18} style={{ marginLeft: "4px" }} />
                            </button>
                        ) : (
                            <button className="btn btn-primary" onClick={handleClose}>
                                {t("common.close", "Get Started")}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
