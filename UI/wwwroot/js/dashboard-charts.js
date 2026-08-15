window.dashboardCharts = (function () {
    const charts = {};
    const colors = ["#90caf9", "#35e9ba", "#ffb13b", "#ef6c73", "#b39ddb"];
    let themeObserverStarted = false;

    function getThemeTextColor() {
        const isDarkMode = document.body.classList.contains("mud-theme-dark");
        const themeElement = document.querySelector(".mud-theme-provider") || document.body || document.documentElement;
        const styles = getComputedStyle(themeElement);
        const themeTextColor = styles.getPropertyValue("--mud-palette-text-primary").trim();

        return themeTextColor || (isDarkMode ? "#ffffff" : "#1C1E21");
    }

    function updateChartTheme() {
        const textColor = getThemeTextColor();

        Object.values(charts).forEach(chart => {
            if (!chart?.options?.plugins?.legend?.labels) {
                return;
            }

            chart.options.plugins.legend.labels.color = textColor;
            chart.update("none");
        });
    }

    function ensureThemeObserver() {
        if (themeObserverStarted || !document.body) {
            return;
        }

        themeObserverStarted = true;

        const observer = new MutationObserver(refreshTheme);

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["class", "style"]
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style"]
        });

        document.querySelectorAll(".mud-theme-provider").forEach(element => {
            observer.observe(element, {
                attributes: true,
                attributeFilter: ["class", "style"]
            });
        });
    }

    function refreshTheme() {
        setTimeout(updateChartTheme, 0);
        setTimeout(updateChartTheme, 75);
    }

    function destroyCanvasChart(canvasId, canvas) {
        const existingCharts = [
            charts[canvasId],
            Chart.getChart ? Chart.getChart(canvas) : null,
            Chart.getChart ? Chart.getChart(canvasId) : null,
            Chart.getChart ? Chart.getChart(canvas.getContext("2d")) : null
        ].filter(Boolean);

        if (Chart.instances) {
            Object.values(Chart.instances).forEach(chart => {
                if (chart?.canvas === canvas || chart?.canvas?.id === canvasId) {
                    existingCharts.push(chart);
                }
            });
        }

        [...new Set(existingCharts)].forEach(chart => chart.destroy());
        delete charts[canvasId];
    }

    function createChart(canvasId, canvas, config) {
        try {
            return new Chart(canvas, config);
        } catch (error) {
            if (!String(error?.message || "").includes("Canvas is already in use")) {
                throw error;
            }

            destroyCanvasChart(canvasId, canvas);
            return new Chart(canvas, config);
        }
    }

    function renderPieCharts(items) {
        if (!window.Chart || !Array.isArray(items)) {
            return;
        }

        ensureThemeObserver();

        items.forEach(item => {
            const canvasId = item.canvasId || item.CanvasId;
            const labels = item.labels || item.Labels || [];
            const data = item.data || item.Data || [];
            const chartType = item.chartType || item.ChartType || "pie";
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                return;
            }

            destroyCanvasChart(canvasId, canvas);

            charts[canvasId] = createChart(canvasId, canvas, {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors.slice(0, data.length),
                        borderColor: "#ffffff",
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: "bottom",
                            labels: {
                                boxWidth: 12,
                                padding: 14,
                                color: getThemeTextColor()
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return `${context.label}: ${context.parsed}`;
                                }
                            }
                        }
                    }
                }
            });
        });
    }

    return {
        renderPieCharts: renderPieCharts,
        renderTenantPieCharts: renderPieCharts,
        refreshTheme: refreshTheme
    };
})();
