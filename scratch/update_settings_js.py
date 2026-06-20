import os

filepath = r"c:\Users\jayas\Documents\Projects\SF Projects\forms\design-settings.html"
with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

start_tag = "    <script>"
end_tag = "    </script>"

start_idx = html.find(start_tag)
end_idx = html.find(end_tag)

if start_idx == -1 or end_idx == -1:
    print("Error: script tags not found!")
    exit(1)

# Keep the tag itself
script_content = """    <script>
        // Preset configurations
        const PRESETS = {
            nordic: {
                accent: '#1e3a8a',
                accentText: '#ffffff',
                surface: '#ffffff',
                pageBg: '#f3f4f6',
                headerBg: '#1e3a8a',
                text: '#1f2937',
                textWeak: '#63738e',
                headerText: '#1e3a8a',
                border: '#d8dde6',
                borderLight: '#e5e7eb',
                radius: '8px',
                shadow: '0 4px 14px rgba(0, 0, 0, 0.05)',
                glass: false,
                font: "'Inter', sans-serif"
            },
            dracula: {
                accent: '#ff79c6',
                accentText: '#1e1f29',
                surface: '#282a36',
                pageBg: '#1e1f29',
                headerBg: '#6272a4',
                text: '#f8f8f2',
                textWeak: '#6272a4',
                headerText: '#f8f8f2',
                border: '#44475a',
                borderLight: '#6272a4',
                radius: '8px',
                shadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
                glass: false,
                font: "'Inter', sans-serif"
            },
            sunsetDunes: {
                accent: '#f97316',
                accentText: '#ffffff',
                surface: 'rgba(255, 255, 255, 0.78)',
                pageBg: 'linear-gradient(135deg, #f97316 0%, #ff8fb1 52%, #16d2c4 100%)',
                headerBg: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
                text: '#27272a',
                textWeak: '#6b7280',
                headerText: '#7c2d12',
                border: '#fed7aa',
                borderLight: '#ffedd5',
                radius: '16px',
                shadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
                glass: true,
                font: "'Outfit', sans-serif"
            }
        };

        // Active State variables
        let activeTabId = 'canvas';
        let currentLayout = 'classic';
        let currentDensity = 'comfortable';
        let currentViewport = 'desktop';
        let currentButtonAlign = 'left';
        let activePreset = 'nordic';

        // Helper to extract a valid hex color from gradient or rgba strings
        function getHexColor(colorStr, fallback) {
            if (!colorStr) return fallback;
            const trimmed = colorStr.trim();
            if (trimmed.startsWith('#')) {
                if (trimmed.length === 4) {
                    return '#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3];
                }
                return trimmed.substring(0, 7);
            }
            if (trimmed.startsWith('rgba')) {
                const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    const r = parseInt(match[1]).toString(16).padStart(2, '0');
                    const g = parseInt(match[2]).toString(16).padStart(2, '0');
                    const b = parseInt(match[3]).toString(16).padStart(2, '0');
                    return `#${r}${g}${b}`;
                }
            }
            if (trimmed.startsWith('linear-gradient')) {
                const hexMatch = trimmed.match(/#[0-9a-fA-F]{3,6}/);
                if (hexMatch) {
                    return getHexColor(hexMatch[0], fallback);
                }
            }
            return fallback;
        }

        // Initialize elements
        function init() {
            loadPresetValues(PRESETS.nordic);
            updateFormPreview();
        }

        // Tab Switching (Semantic 4 Pillars)
        window.switchTab = function(tabId, el) {
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            el.classList.add('active');

            document.querySelectorAll('.tab-content-area').forEach(tab => tab.style.display = 'none');
            const targetTab = document.getElementById('tab-' + tabId);
            if (targetTab) {
                targetTab.style.display = 'block';
            }
            activeTabId = tabId;
        };

        // Load Preset into editor
        window.loadPreset = function(presetId, el) {
            document.querySelectorAll('.presets-grid .preset-card, .toolbar-btn').forEach(c => c.classList.remove('active'));
            if (el) el.classList.add('active');
            activePreset = presetId;
            const values = PRESETS[presetId];
            loadPresetValues(values);
            updateFormPreview();
        };

        function loadPresetValues(values) {
            const setVal = (id, hexId, val, fallback) => {
                const el = document.getElementById(id);
                const hexEl = document.getElementById(hexId);
                const hexColor = getHexColor(val, fallback);
                if (el) el.value = hexColor;
                if (hexEl) hexEl.value = hexColor.toUpperCase();
            };

            setVal('token-accent', 'hex-accent', values.accent, '#6366f1');
            setVal('token-accent-text', 'hex-accent-text', values.accentText, '#ffffff');
            setVal('token-page-bg', 'hex-page-bg', values.pageBg, '#f3f4f6');
            setVal('token-card-bg', 'hex-card-bg', values.surface, '#ffffff');
            setVal('token-header-bg', 'hex-header-bg', values.headerBg, '#1e3a8a');
            setVal('token-text', 'hex-text', values.text, '#1f2937');
            setVal('token-text-weak', 'hex-text-weak', values.textWeak || '#63738e', '#63738e');
            setVal('token-header-text', 'hex-header-text', values.headerText || '#1e3a8a', '#1e3a8a');
            setVal('token-border', 'hex-border', values.border || '#d8dde6', '#d8dde6');
            setVal('token-border-light', 'hex-border-light', values.borderLight || '#e5e7eb', '#e5e7eb');

            const rEl = document.getElementById('token-radius');
            const rVal = document.getElementById('val-radius');
            const rPx = parseInt(values.radius) || 0;
            if (rEl) rEl.value = rPx;
            if (rVal) rVal.innerText = rPx + 'px';
            
            const gEl = document.getElementById('token-glass');
            if (gEl) gEl.checked = values.glass;

            // Apply direct CSS variables to preview form container
            const root = document.getElementById('preview-form-root');
            if (root) {
                root.style.setProperty('--c-accent', values.accent);
                root.style.setProperty('--c-on-accent', values.accentText);
                root.style.setProperty('--c-card-bg', values.surface);
                root.style.setProperty('--c-page-bg', values.pageBg);
                root.style.setProperty('--c-header-bg', values.headerBg);
                root.style.setProperty('--c-text', values.text);
                root.style.setProperty('--c-text-weak', values.textWeak || '#63738e');
                root.style.setProperty('--c-header-text', values.headerText || '#1e3a8a');
                root.style.setProperty('--c-border', values.border || '#d8dde6');
                root.style.setProperty('--c-border-light', values.borderLight || '#e5e7eb');
                root.style.setProperty('--c-radius', values.radius);
                root.style.setProperty('--c-radius-card', values.radius);
                root.style.setProperty('--c-card-shadow', values.shadow);
                root.style.setProperty('--c-glass-blur', values.glass ? '24px' : '0px');
                root.style.setProperty('--c-font-body', values.font);
                root.style.setProperty('--c-font-display', values.font);
            }

            calculateContrastRatio(values.accent, values.accentText);
        }

        // Inline token updates
        window.updateToken = function(variable, val) {
            const root = document.getElementById('preview-form-root');
            if (root) {
                root.style.setProperty(variable, val);
            }
        };

        // Accent updates with color pickers
        window.updateAccentColor = function(val) {
            const hexEl = document.getElementById('hex-accent');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-accent', val);
            const textValEl = document.getElementById('token-accent-text');
            const textVal = textValEl ? textValEl.value : '#ffffff';
            calculateContrastRatio(val, textVal);
        };

        window.updateAccentTextColor = function(val) {
            const hexEl = document.getElementById('hex-accent-text');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-on-accent', val);
            const accentValEl = document.getElementById('token-accent');
            const accentVal = accentValEl ? accentValEl.value : '#6366f1';
            calculateContrastRatio(accentVal, val);
        };

        window.updatePageBgColor = function(val) {
            const hexEl = document.getElementById('hex-page-bg');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-page-bg', val);
        };

        window.updateCardBgColor = function(val) {
            const hexEl = document.getElementById('hex-card-bg');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-card-bg', val);
        };

        window.updateHeaderBgColor = function(val) {
            const hexEl = document.getElementById('hex-header-bg');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-header-bg', val);
        };

        window.updateTextColor = function(val) {
            const hexEl = document.getElementById('hex-text');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-text', val);
            updateFormPreview();
        };

        window.updateMutedTextColor = function(val) {
            const hexEl = document.getElementById('hex-text-weak');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-text-weak', val);
        };

        window.updateHeaderText = function(val) {
            const hexEl = document.getElementById('hex-header-text');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-header-text', val);
            updateFormPreview();
        };

        window.updateBorderColor = function(val) {
            const hexEl = document.getElementById('hex-border');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-border', val);
        };

        window.updateBorderLightColor = function(val) {
            const hexEl = document.getElementById('hex-border-light');
            if (hexEl) hexEl.value = val.toUpperCase();
            updateToken('--c-border-light', val);
        };

        window.updateBorderWidth = function(val) {
            const valEl = document.getElementById('val-border-width');
            if (valEl) valEl.innerText = val + 'px';
            const root = document.getElementById('preview-form-root');
            if (root) {
                root.style.setProperty('--c-card-border-width', val + 'px');
            }
            updateFormPreview();
        };

        window.updateControlScale = function(val) {
            const scale = (val / 10).toFixed(1);
            const valEl = document.getElementById('val-control-scale');
            if (valEl) valEl.innerText = scale + 'x';
            const root = document.getElementById('preview-form-root');
            if (root) {
                root.style.setProperty('--c-control-scale', scale);
            }
            updateFormPreview();
        };

        window.updateMeshEffect = function(checked) {
            const root = document.getElementById('preview-form-root');
            if (root) {
                if (checked) {
                    root.style.setProperty('--c-mesh-effect', 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(244, 63, 94, 0.15) 0px, transparent 50%)');
                } else {
                    root.style.setProperty('--c-mesh-effect', 'none');
                }
            }
            updateFormPreview();
        };

        window.updatePanelDecor = function(checked) {
            const root = document.getElementById('preview-form-root');
            if (root) {
                if (checked) {
                    root.style.setProperty('--c-panel-decor-height', '4px');
                } else {
                    root.style.setProperty('--c-panel-decor-height', '0px');
                }
            }
            updateFormPreview();
        };

        window.setAfterAction = function(action, el) {
            const group = el.closest('.segmented-group');
            if (group) {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            }
            el.classList.add('active');
            
            const redirectEl = document.getElementById('redirect-url-setting');
            const thankyouEl = document.getElementById('thankyou-msg-setting');
            if (action === 'redirect') {
                if (redirectEl) redirectEl.style.display = 'block';
                if (thankyouEl) thankyouEl.style.display = 'none';
            } else {
                if (redirectEl) redirectEl.style.display = 'none';
                if (thankyouEl) thankyouEl.style.display = 'block';
            }
            updateFormPreview();
        };

        window.setLabelPosition = function(pos, el) {
            const group = el.closest('.segmented-group');
            if (group) {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            }
            el.classList.add('active');
            
            const root = document.getElementById('preview-form-root');
            if (root) {
                if (pos === 'left') {
                    root.style.setProperty('--c-label-col', 'row');
                } else {
                    root.style.setProperty('--c-label-col', 'column');
                }
            }
            updateFormPreview();
        };

        window.updateLayoutOptions = function() {
            const layoutEl = document.getElementById('setting-layout');
            const layout = layoutEl ? layoutEl.value : 'classic';
            currentLayout = layout;

            const stepperSettings = document.getElementById('stepper-only-settings');
            const isStep = ['stepped', 'tabbed', 'accordion', 'oneAtATime', 'sideNav'].includes(layout);
            
            if (stepperSettings) {
                stepperSettings.style.display = isStep ? 'block' : 'none';
            }

            const wizardNavSettings = document.getElementById('wizard-navigation-settings');
            if (wizardNavSettings) {
                wizardNavSettings.style.display = isStep ? 'block' : 'none';
            }

            updateFormPreview();
        };

        window.setMaxWidth = function(width, el) {
            const group = el.closest('.segmented-group');
            if (group) {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            }
            el.classList.add('active');
            
            const root = document.getElementById('preview-form-root');
            if (root) {
                let maxW = '620px';
                if (width === 'narrow') maxW = '420px';
                else if (width === 'wide') maxW = '840px';
                else if (width === 'full') maxW = '100%';
                root.style.setProperty('--c-max-width', maxW);
            }
            updateFormPreview();
        };

        window.setChromeStyle = function(style, el) {
            const group = el.closest('.segmented-group');
            if (group) {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            }
            el.classList.add('active');
            
            const root = document.getElementById('preview-form-root');
            if (root) {
                if (style === 'fullbleed') {
                    root.style.setProperty('--c-card-bg', 'transparent');
                    root.style.setProperty('--c-card-shadow', 'none');
                    root.style.setProperty('--c-card-border', 'none');
                } else if (style === 'paper') {
                    root.style.setProperty('--c-card-bg', '#fff9f5');
                    root.style.setProperty('--c-card-shadow', '0 2px 8px rgba(0,0,0,0.05)');
                    root.style.setProperty('--c-card-border', '1px solid #f3ebe5');
                } else { // card
                    root.style.setProperty('--c-card-bg', '#ffffff');
                    root.style.setProperty('--c-card-shadow', '0 8px 24px rgba(0, 0, 0, 0.05)');
                    root.style.setProperty('--c-card-border', '1px solid var(--c-border-light, #e5e7eb)');
                }
            }
            updateFormPreview();
        };

        window.updateSectionPadding = function(val) {
            const valEl = document.getElementById('val-section-padding');
            if (valEl) valEl.innerText = val + 'px';
            const root = document.getElementById('preview-form-root');
            if (root) {
                root.style.setProperty('--c-section-padding', val + 'px');
            }
            updateFormPreview();
        };

        window.setStepperPlacement = function(placement, el) {
            const group = el.closest('.segmented-group');
            if (group) {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            }
            el.classList.add('active');
            updateFormPreview();
        };

        window.updateResponsiveBreakpoint = function(val) {
            const frame = document.getElementById('viewport-frame');
            if (frame) {
                frame.style.width = val + 'px';
                if (val === '1024') {
                    frame.style.height = '100%';
                    frame.style.borderRadius = '0';
                    frame.style.border = 'none';
                    frame.style.margin = '0';
                } else if (val === '768') {
                    frame.style.height = '90%';
                    frame.style.borderRadius = '24px';
                    frame.style.border = '8px solid #1f2937';
                    frame.style.margin = 'auto';
                } else { // 480
                    frame.style.height = '75%';
                    frame.style.borderRadius = '24px';
                    frame.style.border = '8px solid #1f2937';
                    frame.style.margin = 'auto';
                }
            }
            updateFormPreview();
        };

        window.simulateLogoUpload = function() {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = function(e) {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        const uploadText = document.getElementById('logo-upload-text');
                        if (uploadText) {
                            uploadText.innerText = 'Uploaded: ' + file.name.substring(0, 15) + (file.name.length > 15 ? '...' : '');
                        }
                        window.customLogoUrl = event.target.result;
                        updateFormPreview();
                    };
                    reader.readAsDataURL(file);
                }
            };
            fileInput.click();
        };

        window.updateTokenRadius = function(val) {
            const valEl = document.getElementById('val-radius');
            if (valEl) valEl.innerText = val + 'px';
            const root = document.getElementById('preview-form-root');
            if (root) {
                root.style.setProperty('--c-radius', val + 'px');
                root.style.setProperty('--c-radius-card', val + 'px');
            }
        };

        window.updateTokenGlass = function(checked) {
            const root = document.getElementById('preview-form-root');
            if (root) {
                if (checked) {
                    root.style.setProperty('--c-card-bg', 'rgba(255, 255, 255, 0.72)');
                    root.style.setProperty('--c-glass-blur', '24px');
                    root.style.setProperty('--c-card-border', '1px solid rgba(255,255,255,0.3)');
                } else {
                    root.style.setProperty('--c-card-bg', '#ffffff');
                    root.style.setProperty('--c-glass-blur', '0px');
                    root.style.setProperty('--c-card-border', '1px solid var(--c-border-light, #e5e7eb)');
                }
            }
        };

        // Split Rail Slider
        window.updateSplitWidth = function(val) {
            const valEl = document.getElementById('val-split-width');
            if (valEl) valEl.innerText = val + '%';
            updateFormPreview();
        };

        // Spacing Scale (Density)
        window.setDensity = function(mode, el) {
            const group = el.closest('.segmented-group');
            if (group) {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            }
            el.classList.add('active');
            currentDensity = mode;
            
            const root = document.getElementById('preview-form-root');
            if (root) {
                if (mode === 'compact') {
                    root.style.setProperty('--c-grid-gap', '10px');
                    root.style.setProperty('--c-space-4', '10px');
                } else {
                    root.style.setProperty('--c-grid-gap', '16px');
                    root.style.setProperty('--c-space-4', '16px');
                }
            }
        };

        window.setBtnAlign = function(align, el) {
            const group = el.closest('.segmented-group');
            if (group) {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            }
            el.classList.add('active');
            currentButtonAlign = align;
            updateFormPreview();
        };

        // Viewport switches
        window.setViewport = function(mode) {
            document.querySelectorAll('.preview-toolbar .toolbar-btn').forEach(btn => btn.classList.remove('active'));
            const mobileBtn = document.getElementById('btn-mobile');
            const desktopBtn = document.getElementById('btn-desktop');
            const frame = document.getElementById('viewport-frame');
            if (mode === 'mobile') {
                if (mobileBtn) mobileBtn.classList.add('active');
                frame.style.width = '375px';
                frame.style.height = '660px';
                frame.style.borderRadius = '32px';
                frame.style.border = '10px solid #1f2937';
                frame.style.margin = '20px auto';
                frame.classList.add('mobile-mode');
            } else {
                if (desktopBtn) desktopBtn.classList.add('active');
                frame.classList.remove('mobile-mode');
                frame.style.width = '100%';
                frame.style.height = '100%';
                frame.style.borderRadius = '0';
                frame.style.border = 'none';
                frame.style.margin = '0';
            }
            currentViewport = mode;
        };

        // Contrast Ratio algorithm
        function parseToRgb(colorStr) {
            let hex = colorStr.replace(/^#/, '');
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            const num = parseInt(hex, 16);
            return {
                r: (num >> 16) & 255,
                g: (num >> 8) & 255,
                b: num & 255
            };
        }

        function getLuminance(rgb) {
            const a = [rgb.r, rgb.g, rgb.b].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }

        function calculateContrastRatio(color1, color2) {
            const rgb1 = parseToRgb(color1);
            const rgb2 = parseToRgb(color2);
            const lum1 = getLuminance(rgb1);
            const lum2 = getLuminance(rgb2);
            const ratio = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
            
            const badge = document.getElementById('contrast-checker');
            const valSpan = document.getElementById('contrast-ratio-value');
            
            if (!badge || !valSpan) return;

            const roundRatio = ratio.toFixed(1);
            if (ratio >= 4.5) {
                badge.className = 'contrast-badge contrast-pass';
                valSpan.innerText = `Contrast: ${roundRatio}:1 Pass (AA)`;
            } else if (ratio >= 3.0) {
                badge.className = 'contrast-badge contrast-pass';
                valSpan.innerText = `Contrast: ${roundRatio}:1 Pass (Large Text)`;
            } else {
                badge.className = 'contrast-badge contrast-fail';
                valSpan.innerText = `Contrast: ${roundRatio}:1 Fail (Low Contrast)`;
            }
        }

        // Dynamic SVG logo generator
        function getLogoUrl(logoType, accentColor, textColor, brandName) {
            const fontName = 'Outfit';
            let svg = '';
            const strokeColor = accentColor;
            const fillMark = accentColor;
            const fillText = textColor;
            
            switch (logoType) {
                case 'triangle':
                    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
                        <path d="M16 4L6 26h20L16 4z" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M16 12l-5 10h10l-5-10z" fill="${fillMark}"/>
                        <text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${fillText}">${brandName}</text>
                    </svg>`;
                    break;
                case 'shield':
                    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
                        <path d="M16 26s7-3.5 7-9V9l-7-2.5L9 9v8c0 5.5 7 9 7 9z" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M16 21.5s4.5-2.5 4.5-6v-4l-4-1.5-4 1.5v4c0 3.5 4.5 6 4.5 6z" fill="${fillMark}"/>
                        <text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${fillText}">${brandName}</text>
                    </svg>`;
                    break;
                case 'globe':
                    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
                        <circle cx="16" cy="16" r="9" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M7 16h18M16 7a13 13 0 0 1 3.5 9 13 13 0 0 1-3.5 9 13 13 0 0 1-3.5-9 13 13 0 0 1 3.5-9z" fill="none" stroke="${strokeColor}" stroke-width="1.2"/>
                        <text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${fillText}">${brandName}</text>
                    </svg>`;
                    break;
                case 'leaf':
                    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
                        <path d="M16 25A7 7 0 0 1 14.8 11c5.5-1 7-1.5 9-4 1 2 2 3.5 1 8a7 7 0 0 1-9 10zm0 0v-5" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M16 21A4 4 0 0 1 15.3 14c3-0.5 4-1 5-2.5v1.5c0 1.5-2.5 3-3.7 3z" fill="${fillMark}"/>
                        <text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${fillText}">${brandName}</text>
                    </svg>`;
                    break;
                case 'aperture':
                    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
                        <circle cx="16" cy="16" r="9" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <line x1="18" y1="9.3" x2="22.7" y2="17.3" stroke="${strokeColor}" stroke-width="1.5"/>
                        <line x1="14" y1="9.3" x2="23.7" y2="9.3" stroke="${strokeColor}" stroke-width="1.5"/>
                        <line x1="12" y1="12.8" x2="16.5" y2="4.8" stroke="${strokeColor}" stroke-width="1.5"/>
                        <line x1="14" y1="20" x2="9.3" y2="12" stroke="${strokeColor}" stroke-width="1.5"/>
                        <line x1="18" y1="20" x2="8.3" y2="20" stroke="${strokeColor}" stroke-width="1.5"/>
                        <line x1="20" y1="16.5" x2="15.5" y2="24.5" stroke="${strokeColor}" stroke-width="1.5"/>
                        <text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${fillText}">${brandName}</text>
                    </svg>`;
                    break;
                case 'coffee':
                    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
                        <path d="M21 12h1a2.5 2.5 0 0 1 0 5h-1M7 12h14v8a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 7 20v-8z" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <line x1="10" y1="6" x2="10" y2="9" stroke="${strokeColor}" stroke-width="1.2" stroke-linecap="round"/>
                        <line x1="14" y1="6" x2="14" y2="9" stroke="${strokeColor}" stroke-width="1.2" stroke-linecap="round"/>
                        <line x1="18" y1="6" x2="18" y2="9" stroke="${strokeColor}" stroke-width="1.2" stroke-linecap="round"/>
                        <text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${fillText}">${brandName}</text>
                    </svg>`;
                    break;
                case 'cross':
                    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">
                        <line x1="16" y1="6" x2="16" y2="26" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
                        <line x1="6" y1="16" x2="26" y2="16" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
                        <text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${fillText}">${brandName}</text>
                    </svg>`;
                    break;
                default:
                    return '';
            }
            return 'data:image/svg+xml,' + encodeURIComponent(svg.trim());
        }

        // Render Form Preview dynamically based on settings
        window.updateFormPreview = function() {
            const layoutEl = document.getElementById('setting-layout');
            const layout = layoutEl ? layoutEl.value : 'classic';

            const arrangementEl = document.getElementById('setting-arrangement');
            const arrangement = arrangementEl ? arrangementEl.value : 'stacked';

            const titleEl = document.getElementById('setting-title');
            const title = titleEl ? titleEl.value : 'Registration Form';

            const descriptionEl = document.getElementById('setting-desc');
            const description = descriptionEl ? descriptionEl.value : '';

            const highlightEl = document.getElementById('setting-highlight');
            const highlight = highlightEl ? highlightEl.value : '';

            const submitLabelEl = document.getElementById('setting-submit-label');
            const submitLabel = submitLabelEl ? submitLabelEl.value : 'Submit';

            const emblemEl = document.getElementById('setting-logo-emblem');
            const emblem = emblemEl ? emblemEl.value : 'triangle';
            
            // Handle Smart Settings for Split layout
            const splitWarning = document.getElementById('split-rail-warning');
            const splitSettings = document.getElementById('split-rail-settings');
            const splitSideEl = document.getElementById('setting-split-side');
            const splitSide = splitSideEl ? splitSideEl.checked : false;
            const splitWidthEl = document.getElementById('setting-split-width');
            const splitWidth = splitWidthEl ? splitWidthEl.value : 42;

            if (splitWarning && splitSettings) {
                if (layout === 'split') {
                    splitWarning.style.display = 'none';
                    splitSettings.style.opacity = '1';
                    splitSettings.style.pointerEvents = 'auto';
                } else {
                    splitWarning.style.display = 'flex';
                    splitSettings.style.opacity = '0.4';
                    splitSettings.style.pointerEvents = 'none';
                }
            }

            const card = document.getElementById('preview-card-element');
            if (!card) return;
            card.className = 'tc-card'; // reset classes
            card.style = ''; // reset inline styles
            
            const accentColorEl = document.getElementById('token-accent');
            const accentColor = accentColorEl ? accentColorEl.value : '#6366f1';
            const textColorEl = document.getElementById('token-text');
            const textColor = textColorEl ? textColorEl.value : '#1f2937';

            // Generate logo
            const logoUrl = window.customLogoUrl || getLogoUrl(emblem, accentColor, textColor, 'FormsPro');
            const showLogo = logoUrl && arrangement !== 'textOnly';

            // Highlight HTML
            let highlightHtml = '';
            if (highlight) {
                const isSplit = layout === 'split';
                const highlightBg = isSplit ? 'rgba(255, 255, 255, 0.15)' : `${accentColor}18`;
                const highlightText = isSplit ? '#ffffff' : accentColor;
                const highlightBorder = isSplit ? 'rgba(255, 255, 255, 0.3)' : accentColor;
                
                highlightHtml = `
                    <div class="tc-highlight" style="background: ${highlightBg}; color: ${highlightText}; border-left: 3px solid ${highlightBorder}; margin-bottom: 12px; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 0.72rem; font-weight: 600;">
                        ${highlight}
                    </div>
                `;
            }

            // Header style and arrangements
            const headerStyleEl = document.getElementById('setting-header-style');
            const headerStyle = headerStyleEl ? headerStyleEl.value : 'standard';

            let headerContentHtml = '';
            let headerStyleAttr = '';

            if (headerStyle === 'none') {
                headerContentHtml = '';
            } else if (headerStyle === 'hero') {
                headerStyleAttr = 'background: var(--c-header-bg, var(--c-accent, #6366f1)); color: #ffffff; padding: 24px 16px; margin: -24px -24px 16px -24px; border-bottom: 1px solid rgba(255,255,255,0.15);';
                const logoUrlHero = window.customLogoUrl || getLogoUrl(emblem, '#ffffff', '#ffffff', 'FormsPro');
                const showLogoHero = logoUrlHero && arrangement !== 'textOnly';
                
                if (arrangement === 'inline' && showLogoHero) {
                    headerContentHtml = `
                        <div class="tc-head tc-header-hero" style="${headerStyleAttr}">
                            <div class="tc-inline-header" style="display: flex; align-items: center; gap: 8px;">
                                <img src="${logoUrlHero}" alt="Logo" class="tc-logo-img tc-logo-inline" style="height: 24px; width: auto;" />
                                <h4 class="tc-h" style="color: #ffffff; margin: 0; font-size: 1.1rem; font-weight: 700;">${title}</h4>
                            </div>
                            <p class="tc-p" style="color: rgba(255,255,255,0.85); margin-top: 4px; font-size: 0.8rem;">${description}</p>
                        </div>
                    `;
                } else if (arrangement === 'logoBeside' && showLogoHero) {
                    headerContentHtml = `
                        <div class="tc-head tc-header-hero" style="${headerStyleAttr}">
                            <div class="tc-beside-header" style="display: flex; align-items: flex-start; gap: 12px;">
                                <img src="${logoUrlHero}" alt="Logo" class="tc-logo-img tc-logo-beside" style="height: 32px; width: auto;" />
                                <div>
                                    <h4 class="tc-h" style="color: #ffffff; margin: 0; font-size: 1.1rem; font-weight: 700;">${title}</h4>
                                    <p class="tc-p" style="color: rgba(255,255,255,0.85); margin-top: 4px; font-size: 0.8rem;">${description}</p>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    headerContentHtml = `
                        <div class="tc-head tc-header-hero" style="${headerStyleAttr}">
                            <div class="tc-stacked-header" style="display: flex; flex-direction: column; gap: 6px;">
                                ${showLogoHero ? `<img src="${logoUrlHero}" alt="Logo" class="tc-logo-img tc-logo-stacked" style="height: 24px; width: auto; align-self: flex-start;" />` : ''}
                                <h4 class="tc-h" style="color: #ffffff; margin: 0; font-size: 1.1rem; font-weight: 700;">${title}</h4>
                            </div>
                            <p class="tc-p" style="color: rgba(255,255,255,0.85); margin-top: 4px; font-size: 0.8rem;">${description}</p>
                        </div>
                    `;
                }
            } else if (headerStyle === 'minimal') {
                headerStyleAttr = 'padding: 8px 0; margin-bottom: 12px; border-bottom: 1px dashed var(--c-border-light, #e5e7eb);';
                headerContentHtml = `
                    <div class="tc-head tc-header-minimal" style="${headerStyleAttr}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h4 class="tc-h" style="font-size: 0.9rem; font-weight: 700; margin: 0; color: var(--c-header-text, var(--c-text, #1f2937));">${title}</h4>
                            ${showLogo ? `<img src="${logoUrl}" alt="Logo" style="height: 16px; width: auto;" />` : ''}
                        </div>
                    </div>
                `;
            } else { // standard
                headerContentHtml = `
                    <div class="tc-head" style="margin-bottom: 16px;">
                        ${arrangement === 'inline' && showLogo ? `
                            <div class="tc-inline-header" style="display: flex; align-items: center; gap: 8px;">
                                <img src="${logoUrl}" alt="Logo" class="tc-logo-img tc-logo-inline" style="height: 24px; width: auto;" />
                                <h4 class="tc-h" style="color: var(--c-header-text, var(--c-text, #1f2937)); margin: 0; font-size: 1.1rem; font-weight: 700;">${title}</h4>
                            </div>
                            <p class="tc-p" style="font-size: 0.8rem; color: var(--c-text-weak, #63738e); margin-top: 4px;">${description}</p>
                        ` : arrangement === 'logoBeside' && showLogo ? `
                            <div class="tc-beside-header" style="display: flex; align-items: flex-start; gap: 12px;">
                                <img src="${logoUrl}" alt="Logo" class="tc-logo-img tc-logo-beside" style="height: 32px; width: auto;" />
                                <div>
                                    <h4 class="tc-h" style="color: var(--c-header-text, var(--c-text, #1f2937)); margin: 0; font-size: 1.1rem; font-weight: 700;">${title}</h4>
                                    <p class="tc-p" style="font-size: 0.8rem; color: var(--c-text-weak, #63738e); margin-top: 4px;">${description}</p>
                                </div>
                            </div>
                        ` : `
                            <div class="tc-stacked-header" style="display: flex; flex-direction: column; gap: 6px;">
                                ${showLogo ? `<img src="${logoUrl}" alt="Logo" class="tc-logo-img tc-logo-stacked" style="height: 24px; width: auto; align-self: flex-start;" />` : ''}
                                <h4 class="tc-h" style="color: var(--c-header-text, var(--c-text, #1f2937)); margin: 0; font-size: 1.1rem; font-weight: 700;">${title}</h4>
                            </div>
                            <p class="tc-p" style="font-size: 0.8rem; color: var(--c-text-weak, #63738e); margin-top: 4px;">${description}</p>
                        `}
                    </div>
                `;
            }

            // Button alignment styling
            let alignStyle = 'justify-content: flex-start;';
            let btnStyle = '';
            if (currentButtonAlign === 'center') {
                alignStyle = 'justify-content: center;';
            } else if (currentButtonAlign === 'right') {
                alignStyle = 'justify-content: flex-end;';
            } else if (currentButtonAlign === 'stretch') {
                alignStyle = '';
                btnStyle = 'width: 100%;';
            }

            // Input look configuration
            const inputStyleEl = document.getElementById('setting-input-style');
            const inputStyle = inputStyleEl ? inputStyleEl.value : 'outline';
            
            function getInputStyleAttr() {
                const borderW = document.getElementById('token-border-width') ? document.getElementById('token-border-width').value : '1';
                const borderVal = `${borderW}px solid var(--c-border, #d8dde6)`;
                if (inputStyle === 'underline') {
                    return `border: none; border-bottom: ${borderVal}; border-radius: 0; background: transparent; padding: 6px 0; font-size: calc(0.85rem * var(--c-control-scale, 1.0));`;
                }
                if (inputStyle === 'filled') {
                    return `border: none; background: var(--c-border-light, #e5e7eb); padding: 8px 12px; border-radius: var(--radius-md); font-size: calc(0.85rem * var(--c-control-scale, 1.0));`;
                }
                // default outline
                return `border: ${borderVal}; padding: 8px 12px; background: transparent; border-radius: var(--radius-md); font-size: calc(0.85rem * var(--c-control-scale, 1.0));`;
            }
            const inputStyleAttr = getInputStyleAttr();

            // Label look configuration
            const labelStyleEl = document.getElementById('setting-label-style');
            const labelStyle = labelStyleEl ? labelStyleEl.value : 'default';
            
            function getLabelStyleAttr() {
                if (labelStyle === 'mono') {
                    return "font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--c-text-weak, #63738e);";
                }
                if (labelStyle === 'muted') {
                    return 'font-size: 0.72rem; color: var(--c-text-weak, #63738e); font-weight: normal;';
                }
                return 'font-size: 0.8rem; font-weight: 600; color: var(--c-text, #1f2937);';
            }
            const labelStyleAttr = getLabelStyleAttr();

            // Stepper helpers
            const stepperPlacementEl = document.getElementById('setting-stepper-placement');
            const stepperPlacementBtn = stepperPlacementEl ? stepperPlacementEl.querySelector('.active') : null;
            const stepperPlacement = stepperPlacementBtn ? stepperPlacementBtn.innerText.toLowerCase().includes('rail') ? 'rail' : 'top' : 'top';

            const stepperModeEl = document.getElementById('setting-stepper-mode');
            const stepperMode = stepperModeEl ? stepperModeEl.value : 'horizontal';

            function getStepperHtml(mode) {
                if (mode === 'progress') {
                    return `
                        <div class="tc-stepper-progress-ring" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                            <div style="position: relative; width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--c-border-light, #e5e7eb); border-top-color: var(--c-accent, #6366f1); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: var(--c-accent, #6366f1);">50%</div>
                            <span style="font-size: 0.72rem; font-weight: 600; color: var(--c-text, #1f2937);">Step 1 of 2</span>
                        </div>
                    `;
                }
                if (mode === 'vertical') {
                    return `
                        <div class="tc-stepper-vertical" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                            <div class="tc-step-item-vertical" style="display: flex; align-items: center; gap: 6px;">
                                <div class="tc-step-circle" style="background: var(--c-accent, #6366f1); color: var(--c-on-accent, #ffffff); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700;">1</div>
                                <span style="font-size: 0.72rem; font-weight: 600; color: var(--c-accent, #6366f1);">Profile</span>
                            </div>
                            <div style="width: 2px; height: 10px; background: var(--c-border-light, #e5e7eb); margin-left: 9px;"></div>
                            <div class="tc-step-item-vertical" style="display: flex; align-items: center; gap: 6px; opacity: 0.6;">
                                <div class="tc-step-circle" style="background: var(--c-border, #d8dde6); color: var(--c-text, #1f2937); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700;">2</div>
                                <span style="font-size: 0.72rem; font-weight: 500;">Review</span>
                            </div>
                        </div>
                    `;
                }
                // default horizontal
                return `
                    <div class="tc-stepper" style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--c-border-light, #e5e7eb); padding-bottom: 12px; margin-bottom: 12px;">
                        <div class="tc-step-item" style="display: flex; align-items: center; gap: 6px;">
                            <div class="tc-step-circle" style="background: var(--c-accent, #6366f1); color: var(--c-on-accent, #ffffff); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700;">1</div>
                            <span class="tc-step-label" style="font-size: 0.72rem; font-weight: 600; color: var(--c-text, #1f2937);">Profile</span>
                        </div>
                        <div class="tc-step-line" style="flex: 1; height: 1px; background: var(--c-border-light, #e5e7eb); min-width: 24px;"></div>
                        <div class="tc-step-item" style="display: flex; align-items: center; gap: 6px; opacity: 0.5;">
                            <div class="tc-step-circle" style="background: var(--c-border, #d8dde6); color: var(--c-text, #1f2937); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700;">2</div>
                            <span class="tc-step-label" style="font-size: 0.72rem;">Review</span>
                        </div>
                    </div>
                `;
            }

            // Progress indicator (auto, bar, dots, fraction, none)
            const progressIndicatorEl = document.getElementById('setting-progress-indicator');
            const progressIndicator = progressIndicatorEl ? progressIndicatorEl.value : 'auto';

            function getProgressIndicatorHtml() {
                if (progressIndicator === 'none') return '';
                if (progressIndicator === 'bar' || (progressIndicator === 'auto' && ['stepped', 'tabbed', 'oneAtATime'].includes(layout))) {
                    return `
                        <div class="tc-progress-bar-container" style="width: 100%; height: 5px; background: var(--c-border-light, #e5e7eb); border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
                            <div class="tc-progress-bar-fill" style="width: 50%; height: 100%; background: var(--c-accent, #6366f1); transition: width 0.3s ease;"></div>
                        </div>
                    `;
                }
                if (progressIndicator === 'dots') {
                    return `
                        <div class="tc-progress-dots" style="display: flex; gap: 6px; justify-content: center; margin-bottom: 12px;">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--c-accent, #6366f1);"></span>
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--c-border, #d8dde6);"></span>
                        </div>
                    `;
                }
                if (progressIndicator === 'fraction') {
                    return `
                        <div class="tc-progress-fraction" style="font-size: 0.68rem; color: var(--c-text-weak, #63738e); font-weight: bold; margin-bottom: 8px;">
                            Step 1 of 2
                        </div>
                    `;
                }
                return '';
            }
            const progressIndicatorHtml = getProgressIndicatorHtml();

            // Next/Back Labels
            const nextLabel = document.getElementById('setting-next-label') ? document.getElementById('setting-next-label').value : 'Next Step';
            const backLabel = document.getElementById('setting-back-label') ? document.getElementById('setting-back-label').value : 'Back';

            // Submit Button placement
            const submitPlacementEl = document.getElementById('setting-submit-placement');
            const submitPlacement = submitPlacementEl ? submitPlacementEl.value : 'flow';

            const showBtnInBody = !(submitPlacement === 'rail' && layout === 'split') && (submitPlacement !== 'sticky');
            const isMultiStep = ['stepped', 'tabbed', 'accordion', 'oneAtATime', 'sideNav'].includes(layout);

            const steppedNavHtml = `
                <div class="tc-btn-container" style="display: flex; justify-content: space-between; margin-top: 16px; gap: 8px; width: 100%;">
                    <button class="tc-btn-secondary" style="border: 1px solid var(--c-border, #d8dde6); background: transparent; color: var(--c-text-weak, #63738e); padding: 8px 16px; border-radius: var(--radius-md); font-size: 0.8rem; cursor: pointer; font-weight: 500;">${backLabel}</button>
                    <button class="tc-btn" style="background: var(--c-accent, #6366f1); color: var(--c-on-accent, #ffffff); border: none; padding: 8px 16px; border-radius: var(--radius-md); font-size: 0.8rem; font-weight: 600; cursor: pointer;">${nextLabel}</button>
                </div>
            `;

            // Form inputs body
            const formBodyHtml = `
                <div class="tc-body" style="padding: var(--c-section-padding, 16px); display: flex; flex-direction: column; gap: 12px; width: 100%;">
                    ${progressIndicatorHtml}
                    <div class="tc-field" style="display: flex; flex-direction: var(--c-label-col, column); gap: 6px; width: 100%;">
                        <span class="tc-label" style="${labelStyleAttr}">Full Name</span>
                        <div class="tc-input" style="${inputStyleAttr} color: var(--c-text, #1f2937); font-family: var(--c-font-body, inherit); width: 100%; box-sizing: border-box; text-align: left;">Jane Doe</div>
                    </div>
                    <div class="tc-field" style="display: flex; flex-direction: var(--c-label-col, column); gap: 6px; width: 100%;">
                        <span class="tc-label" style="${labelStyleAttr}">Email Address</span>
                        <div class="tc-input" style="${inputStyleAttr} color: var(--c-text, #1f2937); font-family: var(--c-font-body, inherit); width: 100%; box-sizing: border-box; text-align: left;">jane.doe@example.com</div>
                    </div>
                    <div class="tc-checkrow" style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <span class="tc-box" style="width: 14px; height: 14px; border: 1px solid var(--c-border, #d8dde6); border-radius: var(--radius-sm); display: inline-block;"></span>
                        <span class="tc-muted" style="font-size: 0.72rem; color: var(--c-text-weak, #63738e);">I agree to terms and conditions</span>
                    </div>
                    ${showBtnInBody ? (isMultiStep ? steppedNavHtml : `
                        <div class="tc-btn-container" style="${alignStyle} display: flex; margin-top: 16px; width: 100%;">
                            <button class="tc-btn" style="${btnStyle} background: var(--c-accent, #6366f1); color: var(--c-on-accent, #ffffff); border: none; padding: 10px 20px; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; font-size: 0.82rem;">${submitLabel}</button>
                        </div>
                    `) : ''}
                </div>
            `;

            // Max content width
            const maxWidthEl = document.getElementById('setting-max-width');
            const activeMaxWidthBtn = maxWidthEl ? maxWidthEl.querySelector('.active') : null;
            const maxWidthMode = activeMaxWidthBtn ? activeMaxWidthBtn.innerText.toLowerCase() : 'medium';
            
            if (maxWidthMode === 'narrow') {
                card.style.maxWidth = '420px';
            } else if (maxWidthMode === 'medium') {
                card.style.maxWidth = '620px';
            } else if (maxWidthMode === 'wide') {
                card.style.maxWidth = '840px';
            } else { // full
                card.style.maxWidth = '100%';
            }

            // Card shadow and border logic
            const borderWidthEl = document.getElementById('token-border-width');
            const borderWidth = borderWidthEl ? borderWidthEl.value : 1;
            const borderStyleEl = document.getElementById('setting-border-style');
            const borderStyle = borderStyleEl ? borderStyleEl.value : 'solid';

            const sectionStyleEl = document.getElementById('setting-section-style');
            const sectionStyle = sectionStyleEl ? sectionStyleEl.value : 'default';
            
            if (sectionStyle === 'subtle') {
                card.style.border = 'none';
                card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
            } else if (sectionStyle === 'plain') {
                card.style.border = 'none';
                card.style.boxShadow = 'none';
                card.style.background = 'transparent';
            } else if (sectionStyle === 'boxed') {
                card.style.border = `2px solid var(--c-border, #d8dde6)`;
                card.style.boxShadow = 'none';
            } else { // default
                if (borderStyle === 'none' || borderWidth == 0) {
                    card.style.border = 'none';
                } else {
                    card.style.border = `${borderWidth}px ${borderStyle} var(--c-border, #d8dde6)`;
                }
                card.style.boxShadow = `var(--c-card-shadow, 0 8px 24px rgba(0, 0, 0, 0.05))`;
            }

            // Section padding
            const paddingEl = document.getElementById('setting-section-padding');
            const paddingVal = paddingEl ? paddingEl.value + 'px' : '24px';
            if (layout === 'split') {
                card.style.padding = '0';
            } else {
                card.style.padding = paddingVal;
            }

            // Build sticky footer HTML if needed
            const stickyFooterHtml = (submitPlacement === 'sticky') ? `
                <div class="tc-sticky-footer" style="border-top: 1px solid var(--c-border-light, #e5e7eb); padding: 12px 16px; display: flex; ${alignStyle} background: var(--c-card-bg, #ffffff); margin: 16px -24px -24px -24px; width: calc(100% + 48px); box-sizing: border-box;">
                    <button class="tc-btn" style="${btnStyle} background: var(--c-accent, #6366f1); color: var(--c-on-accent, #ffffff); border: none; padding: 10px 20px; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; font-size: 0.82rem;">${submitLabel}</button>
                </div>
            ` : '';

            // Layout Shell assembly
            if (layout === 'split') {
                card.classList.add('tc-layout-split');
                const railWidthPercent = splitWidth + '%';
                const fieldsWidthPercent = (100 - splitWidth) + '%';
                if (splitSide) {
                    card.style.gridTemplateColumns = `${fieldsWidthPercent} ${railWidthPercent}`;
                } else {
                    card.style.gridTemplateColumns = `${railWidthPercent} ${fieldsWidthPercent}`;
                }
                
                const showRailLogo = document.getElementById('brand-content-logo') ? document.getElementById('brand-content-logo').checked : true;
                const showRailTitle = document.getElementById('brand-content-title') ? document.getElementById('brand-content-title').checked : true;
                const showRailDesc = document.getElementById('brand-content-desc') ? document.getElementById('brand-content-desc').checked : true;
                const showRailProgress = document.getElementById('brand-content-progress') ? document.getElementById('brand-content-progress').checked : false;
                const showRailQuote = document.getElementById('brand-content-quote') ? document.getElementById('brand-content-quote').checked : false;

                let railContent = '';
                if (highlightHtml) railContent += highlightHtml;
                if (showRailLogo && showLogo) railContent += `<img src="${logoUrl}" alt="Logo" class="tc-logo-img tc-logo-stacked" style="height: 28px; width: auto; align-self: flex-start; margin-bottom: 12px;" />`;
                if (showRailTitle) railContent += `<h4 class="tc-h" style="color: #ffffff; font-size: 1.2rem; font-weight: 700; margin: 0 0 6px 0;">${title}</h4>`;
                if (showRailDesc) railContent += `<p class="tc-p" style="color: rgba(255,255,255,0.85); font-size: 0.8rem; margin: 0;">${description}</p>`;
                if (showRailProgress) {
                    railContent += `<div style="margin-top: 24px; width: 100%;">` + getStepperHtml(stepperMode) + `</div>`;
                }
                if (showRailQuote) {
                    railContent += `
                        <div class="tc-quote" style="margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 12px; font-style: italic; font-size: 0.72rem; opacity: 0.85; line-height: 1.3;">
                            "This form is incredibly fast. Clean design!"
                            <div style="font-weight: bold; font-style: normal; margin-top: 4px; font-size: 0.65rem; opacity: 0.8;">— Sarah K.</div>
                        </div>
                    `;
                }
                if (submitPlacement === 'rail') {
                    railContent += `
                        <div class="tc-rail-submit" style="margin-top: auto; padding-top: 24px; width: 100%;">
                            <button class="tc-btn" style="width: 100%; background: #ffffff; color: var(--c-accent, #6366f1); border: none; padding: 10px 20px; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; font-size: 0.82rem;">${submitLabel}</button>
                        </div>
                    `;
                }

                const railHtml = `
                    <div class="tc-split-rail" style="background: var(--c-header-bg, var(--c-accent, #6366f1)); color: #ffffff; order: ${splitSide ? 2 : 1}; padding: 24px; display: flex; flex-direction: column; justify-content: flex-start; box-sizing: border-box; min-height: 280px; text-align: left;">
                        ${railContent}
                    </div>
                `;

                const fieldsHtml = `
                    <div class="tc-split-fields" style="order: ${splitSide ? 1 : 2}; display: flex; flex-direction: column; width: 100%; box-sizing: border-box; justify-content: center;">
                        ${formBodyHtml}
                        ${stickyFooterHtml}
                    </div>
                `;

                card.innerHTML = railHtml + fieldsHtml;
            } 
            else if (layout === 'stepped') {
                card.classList.add('tc-layout-stepped');
                
                const stepperHtml = (stepperPlacement === 'top') ? getStepperHtml(stepperMode) : '';
                
                card.innerHTML = `
                    ${stepperHtml}
                    ${headerContentHtml}
                    ${formBodyHtml}
                    ${stickyFooterHtml}
                `;
            } 
            else if (layout === 'compact') {
                card.classList.add('tc-layout-compact');
                
                const formBodyCompactHtml = `
                    <div class="tc-body" style="padding: var(--c-section-padding, 16px); display: flex; flex-direction: column; gap: 12px; width: 100%;">
                        ${progressIndicatorHtml}
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%;">
                            <div class="tc-field" style="display: flex; flex-direction: var(--c-label-col, column); gap: 6px;">
                                <span class="tc-label" style="${labelStyleAttr}">First Name</span>
                                <div class="tc-input" style="${inputStyleAttr} color: var(--c-text, #1f2937); width: 100%;">Jane</div>
                            </div>
                            <div class="tc-field" style="display: flex; flex-direction: var(--c-label-col, column); gap: 6px;">
                                <span class="tc-label" style="${labelStyleAttr}">Last Name</span>
                                <div class="tc-input" style="${inputStyleAttr} color: var(--c-text, #1f2937); width: 100%;">Doe</div>
                            </div>
                        </div>
                        <div class="tc-field" style="display: flex; flex-direction: var(--c-label-col, column); gap: 6px; width: 100%;">
                            <span class="tc-label" style="${labelStyleAttr}">Email Address</span>
                            <div class="tc-input" style="${inputStyleAttr} color: var(--c-text, #1f2937); width: 100%;">jane.doe@example.com</div>
                        </div>
                        ${showBtnInBody ? `
                            <div class="tc-btn-container" style="${alignStyle} display: flex; margin-top: 8px; width: 100%;">
                                <button class="tc-btn" style="${btnStyle} background: var(--c-accent, #6366f1); color: var(--c-on-accent, #ffffff); border: none; padding: 10px 20px; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; font-size: 0.82rem;">${submitLabel}</button>
                            </div>
                        ` : ''}
                    </div>
                `;

                card.innerHTML = `
                    ${headerContentHtml}
                    ${formBodyCompactHtml}
                    ${stickyFooterHtml}
                `;
            }
            else if (layout === 'tabbed') {
                card.classList.add('tc-layout-tabbed');
                const stepperHtml = getStepperHtml(stepperMode);
                
                card.innerHTML = `
                    <div class="tc-tabbar" style="display: flex; gap: 12px; border-bottom: 1px solid var(--c-border-light, #e5e7eb); padding: 8px 16px; font-size: 0.72rem; font-weight: 600; margin: -24px -24px 16px -24px; background: var(--c-page-bg, #f3f4f6);">
                        <div class="tc-tab-item" style="color: var(--c-accent, #6366f1); border-bottom: 2px solid var(--c-accent, #6366f1); padding: 6px 4px 10px 4px; cursor: pointer;">1. Profile</div>
                        <div class="tc-tab-item" style="color: var(--c-text-weak, #63738e); padding: 6px 4px 10px 4px; cursor: pointer; opacity: 0.7;">2. Review</div>
                    </div>
                    ${stepperPlacement === 'top' ? stepperHtml : ''}
                    ${headerContentHtml}
                    ${formBodyHtml}
                    ${stickyFooterHtml}
                `;
            }
            else if (layout === 'accordion') {
                card.classList.add('tc-layout-accordion');
                
                card.innerHTML = `
                    ${headerContentHtml}
                    <div class="tc-accordion-section active" style="border: 1px solid var(--c-border-light, #e5e7eb); border-radius: var(--radius-md); margin-bottom: 8px; overflow: hidden; text-align: left;">
                        <div class="tc-accordion-header" style="background: var(--c-border-light, #e5e7eb); padding: 8px 12px; display: flex; justify-content: space-between; font-size: 0.76rem; font-weight: 700; color: var(--c-text, #1f2937);">
                            <span>1. Personal Information</span>
                            <span>▼</span>
                        </div>
                        <div class="tc-accordion-body" style="background: var(--c-card-bg, #ffffff);">
                            ${formBodyHtml}
                        </div>
                    </div>
                    <div class="tc-accordion-section" style="border: 1px solid var(--c-border-light, #e5e7eb); border-radius: var(--radius-md); opacity: 0.7; text-align: left;">
                        <div class="tc-accordion-header" style="padding: 8px 12px; display: flex; justify-content: space-between; font-size: 0.76rem; font-weight: 700; color: var(--c-text, #1f2937); cursor: pointer;">
                            <span>2. Agreement & Submit</span>
                            <span>▶</span>
                        </div>
                    </div>
                    ${stickyFooterHtml}
                `;
            }
            else if (layout === 'oneAtATime') {
                card.classList.add('tc-layout-one-at-a-time');
                
                card.innerHTML = `
                    <div class="tc-one-at-a-time-layout" style="text-align: left; width: 100%;">
                        <div class="tc-step-info" style="font-size: 0.7rem; font-weight: 600; color: var(--c-text-weak, #63738e); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Question 1 of 2</div>
                        <div class="tc-field" style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                            <span class="tc-label" style="font-size: 1.05rem; font-weight: 600; color: var(--c-text, #1f2937);">${title}</span>
                            <div class="tc-input" style="font-size: 1.1rem; padding: 8px 0; border: none; border-bottom: 2px solid var(--c-accent, #6366f1); border-radius: 0; background: transparent; color: var(--c-text, #1f2937);">Jane Doe</div>
                        </div>
                        <div class="tc-slider-nav" style="display: flex; gap: 10px; margin-top: 24px; justify-content: flex-start;">
                            <button class="tc-btn-secondary" style="border: 1px solid var(--c-border, #d8dde6); background: transparent; color: var(--c-text-weak, #63738e); padding: 8px 16px; border-radius: var(--radius-md); font-size: 0.76rem; cursor: pointer; font-weight: 500;">${backLabel}</button>
                            <button class="tc-btn" style="background: var(--c-accent, #6366f1); color: var(--c-on-accent, #ffffff); border: none; padding: 8px 16px; border-radius: var(--radius-md); font-size: 0.76rem; font-weight: 600; cursor: pointer;">${nextLabel}</button>
                        </div>
                    </div>
                `;
            }
            else if (layout === 'sideNav') {
                card.classList.add('tc-layout-split');
                card.style.gridTemplateColumns = `140px 1fr`;
                
                const navRailHtml = `
                    <div class="tc-side-nav-rail" style="background: var(--c-page-bg, #f3f4f6); border-right: 1px solid var(--c-border-light, #e5e7eb); padding: 16px 8px; display: flex; flex-direction: column; gap: 6px; order: 1; box-sizing: border-box; text-align: left; min-height: 240px;">
                        <div style="font-size: 0.65rem; font-weight: 800; color: var(--c-text-weak, #63738e); padding: 0 4px 4px 4px; border-bottom: 1px solid var(--c-border-light, #e5e7eb); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Sections</div>
                        <div style="font-size: 0.74rem; font-weight: 700; color: var(--c-accent, #6366f1); background: var(--c-card-bg, #ffffff); padding: 6px 8px; border-radius: var(--radius-sm); border-left: 3px solid var(--c-accent, #6366f1);">1. Profile</div>
                        <div style="font-size: 0.74rem; font-weight: 500; color: var(--c-text-weak, #63738e); padding: 6px 8px; opacity: 0.8; cursor: pointer;">2. Review</div>
                    </div>
                `;
                const fieldsHtml = `
                    <div class="tc-split-fields" style="order: 2; display: flex; flex-direction: column; width: 100%; box-sizing: border-box; justify-content: center;">
                        ${headerContentHtml}
                        ${formBodyHtml}
                        ${stickyFooterHtml}
                    </div>
                `;
                card.innerHTML = navRailHtml + fieldsHtml;
            }
            else {
                // Classic standard
                const hasBanner = activePreset === 'sunsetDunes';
                
                if (hasBanner) {
                    card.innerHTML = `
                        <div class="tc-banner" style="border-bottom: 1px solid var(--c-border, #d8dde6); margin-bottom: 16px;">
                            ${headerContentHtml}
                        </div>
                        
                        <div>
                            ${formBodyHtml}
                        </div>
                        ${stickyFooterHtml}
                    `;
                } else {
                    card.innerHTML = `
                        ${headerContentHtml}
                        ${formBodyHtml}
                        ${stickyFooterHtml}
                    `;
                }
            }
        };

        // Trigger loading
        init();
"""

with open(filepath, 'r', encoding='utf-8') as f:
    current_content = f.read()

new_content = current_content[:start_idx] + script_content + current_content[end_idx + len(end_tag):]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("HTML JavaScript block updated successfully!")
