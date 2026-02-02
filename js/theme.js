const svgLogoTemplate = `
<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
  <style>
    polygon { 
      fill: FAVICON_COLOR; 
      shape-rendering: crispEdges; 
    }
  </style>
  <polygon points="0,200 100,100 100,200" />
  <polygon points="400,200 300,100 300,200" />
  <polygon points="100,0 300,0 300,100 200,200 100,100" />
</svg>
`;

const updateFavicon = (color) => {
  const faviconLink = document.getElementById('dynamic-favicon');
  if (!faviconLink) {
    console.error('Could not find #dynamic-favicon element in the DOM.');
    return;
  }

  const newSvg = svgLogoTemplate.replace('FAVICON_COLOR', color);

  const dataUrl = `data:image/svg+xml;base64,${btoa(newSvg)}`;

  faviconLink.href = dataUrl;
};

let currentSavedTheme = 'default';

const applyTheme = (themeName, isPreview = false) => {
  document.documentElement.dataset.theme = themeName;

  const newAccentColor = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();

  if (newAccentColor) {
    updateFavicon(newAccentColor);
  }
  if (typeof renderAll === 'function') {
    renderAll();
  }
  if (typeof rerenderLevelPreviews === 'function') {
    rerenderLevelPreviews();
  }
  if (typeof window.rerenderPalette === 'function') {
    window.rerenderPalette();
  }
  if (typeof rerenderExplorePreviews === 'function') {
    rerenderExplorePreviews();
  }
  if (typeof rerenderGameplayCanvases === 'function') {
    rerenderGameplayCanvases();
  }

  if (!isPreview) {
    localStorage.setItem('selectedTheme', themeName);
    currentSavedTheme = themeName;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const initialTheme = document.documentElement.dataset.theme || 'default';
  applyTheme(initialTheme, false);

  const themeDropdown = document.getElementById('theme-dropdown');
  const themeSelectorButtons = document.querySelectorAll(
    '#theme-selector-button, #theme-selector-button-mobile'
  );
  const infoButtons = document.querySelectorAll('#info-button, #info-button-mobile');
  const themeOptions = document.querySelectorAll('.theme-option');

  // Flag to prevent document click handler from reverting after a deliberate selection
  let themeJustSelected = false;

  const toggleThemeDropdown = (event) => {
    if (themeDropdown) {
      themeDropdown.classList.toggle('show');
    }
  };

  themeSelectorButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      toggleThemeDropdown(event);
    });
  });

  if (themeOptions.length > 0) {
    themeOptions.forEach((option) => {
      let previewTimer;
      const selectedTheme = option.dataset.theme;

      option.addEventListener('mouseenter', () => {
        previewTimer = setTimeout(() => {
          applyTheme(selectedTheme, true);
        }, 500);
      });

      option.addEventListener('mouseleave', () => {
        clearTimeout(previewTimer);
      });

      option.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        clearTimeout(previewTimer);

        // Set flag to prevent document click handler from reverting
        themeJustSelected = true;

        applyTheme(selectedTheme, false);
        if (themeDropdown) {
          themeDropdown.classList.remove('show');
        }

        // Reset flag after a brief delay
        setTimeout(() => {
          themeJustSelected = false;
        }, 100);
      });
    });
  }

  // --- Mobile Menu Toggle ---
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const navbarLinks = document.querySelector('.navbar-links');

  if (mobileMenuToggle && navbarLinks) {
    mobileMenuToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      navbarLinks.classList.toggle('show');
    });
  }

  document.addEventListener('click', (event) => {
    // Skip if a theme was just selected
    if (themeJustSelected) return;

    // Handle theme dropdown closing
    const isThemeClick = Array.from(themeSelectorButtons).some((btn) => btn.contains(event.target));
    if (themeDropdown && !isThemeClick && !themeDropdown.contains(event.target)) {
      if (themeDropdown.classList.contains('show')) {
        themeDropdown.classList.remove('show');

        // Revert preview to saved theme when clicking outside
        if (document.documentElement.dataset.theme !== currentSavedTheme) {
          applyTheme(currentSavedTheme, false);
        }
      }
    }

    // Handle mobile menu closing
    if (
      navbarLinks &&
      mobileMenuToggle &&
      !navbarLinks.contains(event.target) &&
      !mobileMenuToggle.contains(event.target)
    ) {
      navbarLinks.classList.remove('show');
    }
  });

  // Close mobile menu on resize if it's open
  window.addEventListener('resize', () => {
    if (window.innerWidth > 600 && navbarLinks && navbarLinks.classList.contains('show')) {
      navbarLinks.classList.remove('show');
    }
  });
});
