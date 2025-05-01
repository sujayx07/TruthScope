import React, { useEffect, useState } from "react";
import "./SidePanel.css";
import { FaSun, FaMoon, FaAdjust } from "react-icons/fa";

const SidePanel = () => {
  const [theme, setTheme] = useState("system");
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeTheme = () => {
      const storedTheme = localStorage.getItem("theme") || "system";
      applyThemeUI(storedTheme);
      setTheme(storedTheme);

      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
      prefersDark.addEventListener("change", () => {
        if (theme === "system") {
          applyThemeUI("system");
        }
      });

      return () => {
        prefersDark.removeEventListener("change", () => {
          if (theme === "system") {
            applyThemeUI("system");
          }
        });
      };
    };

    const loadResults = async () => {
      setLoading(true);
      try {
        const response = await fetchAnalysisData();
        setAnalysisData(response);
      } catch (err) {
        setError("Error fetching analysis results.");
      } finally {
        setLoading(false);
      }
    };

    initializeTheme();
    loadResults();
  }, [theme]);

  const applyThemeUI = (storedPreference) => {
    const htmlElement = document.documentElement;
    htmlElement.classList.remove("light", "dark", "theme-preference-system");

    let themeToApply = storedPreference;
    if (storedPreference === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
      themeToApply = prefersDark.matches ? "dark" : "light";
      htmlElement.classList.add("theme-preference-system");
    }
    htmlElement.classList.add(themeToApply);
  };

  const toggleTheme = () => {
    const nextTheme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    applyThemeUI(nextTheme);
  };

  const fetchAnalysisData = async () => {
    try {
      // Simulate fetching analysis data
      return {
        textResult: {
          label: "LABEL_1",
          score: 0.85,
          reasoning: [
            "Contradicts verified facts",
            "Disputed by multiple sources",
          ],
          highlights: ["Claim A", "Claim B"],
          fact_check: [
            {
              title: "Fact Check 1",
              url: "https://example.com",
              source: "Source A",
            },
            {
              title: "Fact Check 2",
              url: "https://example.com",
              source: "Source B",
            },
          ],
        },
        mediaResult: {
          manipulated_images_found: 1,
          images_analyzed: 5,
          manipulated_media: [
            { manipulation_type: "Photoshopped", confidence: 0.9 },
          ],
        },
      };
    } catch (error) {
      console.error("Error fetching analysis data:", error);
      throw new Error("Failed to fetch analysis data.");
    }
  };

  const renderFactCheckResults = () => {
    if (
      !analysisData ||
      !analysisData.textResult ||
      !analysisData.textResult.fact_check
    ) {
      return (
        <div className="text-gray-500 p-4">
          No fact-check sources available.
        </div>
      );
    }
    return analysisData.textResult.fact_check.map((source, index) => (
      <div key={index} className="source-item">
        <div className="source-title">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="source-link"
          >
            {source.title}
          </a>
        </div>
        <div className="source-meta">Source: {source.source}</div>
      </div>
    ));
  };

  const renderAIReasoning = () => {
    if (!analysisData || !analysisData.textResult) {
      return (
        <div className="text-gray-500 p-4">
          No data available to generate reasoning.
        </div>
      );
    }
    const { label, reasoning, highlights } = analysisData.textResult;
    const isFake = label === "LABEL_1";

    return (
      <div>
        <p className="mb-3">
          {isFake
            ? "This content is likely misleading or contains false information based on my analysis."
            : "This content appears to be credible based on my analysis."}
        </p>
        <ul className="list-disc ml-5 mb-3">
          {reasoning.map((point, index) => (
            <li key={index} className="mb-2">
              {point}
            </li>
          ))}
        </ul>
        {highlights && highlights.length > 0 && (
          <div>
            <p className="font-semibold mb-2">Problematic claims include:</p>
            <ul className="list-disc ml-5 mb-3 italic text-gray-600 dark:text-gray-400">
              {highlights.map((highlight, index) => (
                <li key={index} className="mb-1">
                  "{highlight}"
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderErrorState = () => (
    <div className="text-red-500 p-4">{error}</div>
  );

  const renderLoadingState = () => (
    <div className="text-gray-500 p-4">Loading...</div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div
            id="profileIconContainer"
            className="profile-icon-placeholder"
            title="User Profile"
          >
            <img src="avatar.png" alt="User Avatar" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-purple-700 dark:text-purple-300">
              TruthScope Analysis
            </h1>
          </div>
          <button
            id="themeToggleButton"
            className="theme-toggle-button"
            title="Change theme"
            onClick={toggleTheme}
          >
            {theme === "light" && <FaSun className="icon" />}
            {theme === "dark" && <FaMoon className="icon" />}
            {theme === "system" && <FaAdjust className="icon" />}
          </button>
        </div>

        {error && renderErrorState()}
        {loading && renderLoadingState()}

        {!loading && !error && (
          <>
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Credibility Score
              </h2>
              <div className="flex items-center space-x-4">
                <div id="statusBadge" className="status-badge loading">
                  {analysisData ? analysisData.textResult.label : "Unavailable"}
                </div>
                <div
                  id="confidence"
                  className="text-gray-600 dark:text-gray-400 text-sm"
                >
                  {analysisData
                    ? `Confidence: ${(
                        analysisData.textResult.score * 100
                      ).toFixed(1)}%`
                    : "Analysis not yet complete or page not supported."}
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                AI Analysis
              </h2>
              <div
                id="aiSummary"
                className="prose text-gray-700 dark:text-gray-300"
              >
                {renderAIReasoning()}
              </div>
            </div>

            <div className="card">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Related News
              </h2>
              <div id="factCheckResults" className="space-y-3">
                {renderFactCheckResults()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
