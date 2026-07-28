(() => {
    const theme = localStorage.getItem('theme') || 'light';
    if (theme === 'dark') {
        document.documentElement.style.setProperty('color-scheme', 'dark');
        document.documentElement.classList.add('dark-theme');
    } else {
        document.documentElement.style.setProperty('color-scheme', 'light');
        document.documentElement.classList.remove('dark-theme');
    }
})();
