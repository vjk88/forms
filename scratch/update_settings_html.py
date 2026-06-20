import os

filepath = r"c:\Users\jayas\Documents\Projects\SF Projects\forms\design-settings.html"
with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Canvas Tab Content
canvas_target = """                <!-- PILLAR 1: CANVAS & FRAME -->
                <div id="tab-canvas" class="tab-content-area">
                    <div class="panel-header">
                        <div class="panel-title">Canvas & Frame</div>
                        <div class="panel-subtitle">Define structural shell archetype, size, and backdrops</div>
                    </div>
                    
                    <div class="section-divider">Form Layout Shell</div>

                    <div class="control-group">
                        <label class="control-label">Layout Archetype</label>
                        <select class="control-select" id="setting-layout" onchange="updateFormPreview()">
                            <option value="classic">Classic Enclosed Card</option>
                            <option value="split">Split Hero (Brand Rail)</option>
                            <option value="stepped">Stepped Wizard</option>
                            <option value="compact">Compact Form Grid</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Card Chrome style</label>
                        <div class="segmented-group" id="setting-chrome">
                            <button class="active">Card</button>
                            <button>Fullbleed</button>
                            <button>Paper</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Sizing Scale (Density)</label>
                        <div class="segmented-group" id="setting-density">
                            <button class="active" onclick="setDensity('comfortable', this)">Comfortable</button>
                            <button onclick="setDensity('compact', this)">Compact</button>
                        </div>
                    </div>

                    <div class="section-divider">Frame Styling</div>

                    <div class="control-group">
                        <label class="control-label">Corner Rounding</label>
                        <div class="slider-row">
                            <input type="range" min="0" max="24" value="10" class="slider-range" id="token-radius" oninput="updateTokenRadius(this.value)">
                            <span class="slider-val" id="val-radius">10px</span>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Card Shadow</label>
                        <select class="control-select" onchange="updateToken('--c-card-shadow', this.value)">
                            <option value="0 8px 24px rgba(0, 0, 0, 0.05)">Soft shadow</option>
                            <option value="0 16px 40px rgba(0, 0, 0, 0.12)">Strong elevation</option>
                            <option value="none">Flat (No shadow)</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <div class="switch-row">
                            <div class="switch-label-container">
                                <span class="switch-title">Glassmorphism</span>
                                <span class="switch-desc">Frosted translucent backdrop</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="token-glass" onchange="updateTokenGlass(this.checked)">
                                <span class="slider-round"></span>
                            </label>
                        </div>
                    </div>

                    <div class="section-divider">Canvas Colors</div>
                    <div class="control-group">
                        <div class="color-row-input">
                            <span class="color-row-label">Page Background</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-page-bg" class="color-picker-hex" value="#f3f4f6" readonly>
                                <input type="color" id="token-page-bg" value="#f3f4f6" class="color-picker-input" oninput="updatePageBgColor(this.value)">
                            </div>
                        </div>
                        <div class="color-row-input">
                            <span class="color-row-label">Card Background</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-card-bg" class="color-picker-hex" value="#ffffff" readonly>
                                <input type="color" id="token-card-bg" value="#ffffff" class="color-picker-input" oninput="updateCardBgColor(this.value)">
                            </div>
                        </div>
                    </div>
                </div>"""

canvas_replacement = """                <!-- PILLAR 1: CANVAS & FRAME -->
                <div id="tab-canvas" class="tab-content-area">
                    <div class="panel-header">
                        <div class="panel-title">Canvas & Frame</div>
                        <div class="panel-subtitle">Define structural shell archetype, size, and backdrops</div>
                    </div>
                    
                    <div class="section-divider">Form Layout Shell</div>

                    <div class="control-group">
                        <label class="control-label">Layout Archetype</label>
                        <select class="control-select" id="setting-layout" onchange="updateLayoutOptions()">
                            <option value="classic">Classic Enclosed Card</option>
                            <option value="split">Split Hero (Brand Rail)</option>
                            <option value="stepped">Stepped Wizard</option>
                            <option value="compact">Compact Form Grid</option>
                            <option value="tabbed">Tabbed Navigation</option>
                            <option value="accordion">Accordion Sections</option>
                            <option value="oneAtATime">One-at-a-time Slider</option>
                            <option value="sideNav">Side-Nav Layout</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Max content width</label>
                        <div class="segmented-group" id="setting-max-width">
                            <button class="active" onclick="setMaxWidth('medium', this)">Medium</button>
                            <button onclick="setMaxWidth('narrow', this)">Narrow</button>
                            <button onclick="setMaxWidth('wide', this)">Wide</button>
                            <button onclick="setMaxWidth('full', this)">Full</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Card Chrome style</label>
                        <div class="segmented-group" id="setting-chrome">
                            <button class="active" onclick="setChromeStyle('card', this)">Card</button>
                            <button onclick="setChromeStyle('fullbleed', this)">Fullbleed</button>
                            <button onclick="setChromeStyle('paper', this)">Paper</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Section Look & style</label>
                        <select class="control-select" id="setting-section-style" onchange="updateFormPreview()">
                            <option value="default">Default Card sections</option>
                            <option value="subtle">Subtle shadows (no border)</option>
                            <option value="plain">Plain borderless</option>
                            <option value="boxed">Boxed outline</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Section Inner Padding</label>
                        <div class="slider-row">
                            <input type="range" min="0" max="32" value="16" class="slider-range" id="setting-section-padding" oninput="updateSectionPadding(this.value)">
                            <span class="slider-val" id="val-section-padding">16px</span>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Sizing Scale (Density)</label>
                        <div class="segmented-group" id="setting-density">
                            <button class="active" onclick="setDensity('comfortable', this)">Comfortable</button>
                            <button onclick="setDensity('compact', this)">Compact</button>
                        </div>
                    </div>

                    <!-- Stepper Conditional Controls -->
                    <div id="stepper-only-settings" style="display: none; background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: var(--radius-md); padding: 12px; margin-bottom: 18px;">
                        <div class="control-group">
                            <label class="control-label">Stepper Placement</label>
                            <div class="segmented-group" id="setting-stepper-placement">
                                <button class="active" onclick="setStepperPlacement('top', this)">Top Card</button>
                                <button onclick="setStepperPlacement('rail', this)">Brand Rail</button>
                            </div>
                        </div>
                        <div class="control-group" style="margin-bottom: 0;">
                            <label class="control-label">Stepper Mode</label>
                            <select class="control-select" id="setting-stepper-mode" onchange="updateFormPreview()">
                                <option value="horizontal">Horizontal Steps</option>
                                <option value="vertical">Vertical Steps</option>
                                <option value="progress">Progress Ring</option>
                            </select>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Progress indicator</label>
                        <select class="control-select" id="setting-progress-indicator" onchange="updateFormPreview()">
                            <option value="auto">Auto-detect</option>
                            <option value="bar">Linear Progress Bar</option>
                            <option value="dots">Step Dots</option>
                            <option value="fraction">Fractional (e.g. 1/3)</option>
                            <option value="none">None</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Responsive Breakpoint</label>
                        <select class="control-select" id="setting-breakpoint" onchange="updateResponsiveBreakpoint(this.value)">
                            <option value="768">Tablet Portrait (768px)</option>
                            <option value="480">Mobile Portrait (480px)</option>
                            <option value="1024">Desktop Small (1024px)</option>
                        </select>
                    </div>

                    <div class="section-divider">Frame Styling</div>

                    <div class="control-group">
                        <label class="control-label">Corner Rounding</label>
                        <div class="slider-row">
                            <input type="range" min="0" max="24" value="10" class="slider-range" id="token-radius" oninput="updateTokenRadius(this.value)">
                            <span class="slider-val" id="val-radius">10px</span>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Card Shadow</label>
                        <select class="control-select" onchange="updateToken('--c-card-shadow', this.value)">
                            <option value="0 8px 24px rgba(0, 0, 0, 0.05)">Soft shadow</option>
                            <option value="0 16px 40px rgba(0, 0, 0, 0.12)">Strong elevation</option>
                            <option value="none">Flat (No shadow)</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <div class="switch-row">
                            <div class="switch-label-container">
                                <span class="switch-title">Glassmorphism</span>
                                <span class="switch-desc">Frosted translucent backdrop</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="token-glass" onchange="updateTokenGlass(this.checked)">
                                <span class="slider-round"></span>
                            </label>
                        </div>
                    </div>

                    <div class="section-divider">Canvas Colors</div>
                    <div class="control-group">
                        <div class="color-row-input">
                            <span class="color-row-label">Page Background</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-page-bg" class="color-picker-hex" value="#f3f4f6" readonly>
                                <input type="color" id="token-page-bg" value="#f3f4f6" class="color-picker-input" oninput="updatePageBgColor(this.value)">
                            </div>
                        </div>
                        <div class="color-row-input">
                            <span class="color-row-label">Card Background</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-card-bg" class="color-picker-hex" value="#ffffff" readonly>
                                <input type="color" id="token-card-bg" value="#ffffff" class="color-picker-input" oninput="updateCardBgColor(this.value)">
                            </div>
                        </div>
                    </div>
                </div>"""

# 2. Update Identity Tab Content
identity_target = """                <!-- PILLAR 2: BRAND & IDENTITY -->
                <div id="tab-identity" class="tab-content-area" style="display: none;">
                    <div class="panel-header">
                        <div class="panel-title">Brand & Identity</div>
                        <div class="panel-subtitle">Configure logo emblems, headers, and branding rails</div>
                    </div>

                    <div class="section-divider">Form Branding</div>

                    <div class="control-group">
                        <label class="control-label">Header Arrangement</label>
                        <select class="control-select" id="setting-arrangement" onchange="updateFormPreview()">
                            <option value="stacked">Stacked (Logo on top)</option>
                            <option value="inline">Inline (Logo beside Title)</option>
                            <option value="logoBeside">Logo Beside entire block</option>
                            <option value="textOnly">Text Only (Hide Logo)</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Built-in Logo Emblem</label>
                        <select class="control-select" id="setting-logo-emblem" onchange="updateFormPreview()">
                            <option value="triangle">Triangle Icon</option>
                            <option value="shield">Shield Icon</option>
                            <option value="globe">Globe Icon</option>
                            <option value="leaf">Leaf Icon</option>
                            <option value="aperture">Aperture Icon</option>
                            <option value="coffee">Coffee Icon</option>
                            <option value="cross">Cross Icon</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <div class="color-row-input">
                            <span class="color-row-label">Header Background</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-header-bg" class="color-picker-hex" value="#1e3a8a" readonly>
                                <input type="color" id="token-header-bg" value="#1e3a8a" class="color-picker-input" oninput="updateHeaderBgColor(this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="section-divider">Introduction content</div>

                    <div class="control-group">
                        <label class="control-label">Form Title</label>
                        <input type="text" class="control-input" id="setting-title" value="Registration Form" oninput="updateFormPreview()">
                    </div>

                    <div class="control-group">
                        <label class="control-label">Description Subtitle</label>
                        <textarea class="control-textarea" id="setting-desc" oninput="updateFormPreview()">Please tell us a little about yourself to get started.</textarea>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Highlight Message Badge</label>
                        <input type="text" class="control-input" id="setting-highlight" value="Closes Friday!" placeholder="e.g. Closes Friday!" oninput="updateFormPreview()">
                    </div>

                    <!-- Contextual Split Rail Section -->
                    <div class="section-divider">Split-Hero Brand Rail</div>
                    
                    <div id="split-rail-warning" class="context-placeholder">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        <span>Select the <strong>Split Hero Layout</strong> under the Canvas tab to configure side-rail parameters.</span>
                    </div>

                    <div id="split-rail-settings" style="opacity: 0.4; pointer-events: none;">
                        <div class="control-group">
                            <div class="switch-row">
                                <div class="switch-label-container">
                                    <span class="switch-title">Rail Alignment Side</span>
                                    <span class="switch-desc">Position the rail on the right side</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" id="setting-split-side" onchange="updateFormPreview()">
                                    <span class="slider-round"></span>
                                </label>
                            </div>
                        </div>
                        <div class="control-group">
                            <label class="control-label">Rail Panel Width</label>
                            <div class="slider-row">
                                <input type="range" min="25" max="50" value="42" class="slider-range" id="setting-split-width" oninput="updateSplitWidth(this.value)">
                                <span class="slider-val" id="val-split-width">42%</span>
                            </div>
                        </div>
                    </div>
                </div>"""

identity_replacement = """                <!-- PILLAR 2: BRAND & IDENTITY -->
                <div id="tab-identity" class="tab-content-area" style="display: none;">
                    <div class="panel-header">
                        <div class="panel-title">Brand & Identity</div>
                        <div class="panel-subtitle">Configure logo emblems, headers, and branding rails</div>
                    </div>

                    <div class="section-divider">Form Branding</div>

                    <div class="control-group">
                        <label class="control-label">Upload Brand Logo</label>
                        <div style="border: 2px dashed var(--input-border); border-radius: var(--radius-md); padding: 14px; text-align: center; cursor: pointer; background: rgba(255,255,255,0.01);" onclick="simulateLogoUpload()">
                            <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: var(--text-dark); margin: 0 auto 6px;"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
                            <span style="font-size: 0.72rem; color: var(--text-muted); display: block;" id="logo-upload-text">Upload image or click to browse</span>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Header Style</label>
                        <select class="control-select" id="setting-header-style" onchange="updateFormPreview()">
                            <option value="standard">Standard Header</option>
                            <option value="hero">Hero Accent Banner</option>
                            <option value="minimal">Minimalist Accent</option>
                            <option value="none">No Header</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Header Arrangement</label>
                        <select class="control-select" id="setting-arrangement" onchange="updateFormPreview()">
                            <option value="stacked">Stacked (Logo on top)</option>
                            <option value="inline">Inline (Logo beside Title)</option>
                            <option value="logoBeside">Logo Beside entire block</option>
                            <option value="textOnly">Text Only (Hide Logo)</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Built-in Logo Emblem</label>
                        <select class="control-select" id="setting-logo-emblem" onchange="updateFormPreview()">
                            <option value="triangle">Triangle Icon</option>
                            <option value="shield">Shield Icon</option>
                            <option value="globe">Globe Icon</option>
                            <option value="leaf">Leaf Icon</option>
                            <option value="aperture">Aperture Icon</option>
                            <option value="coffee">Coffee Icon</option>
                            <option value="cross">Cross Icon</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <div class="color-row-input">
                            <span class="color-row-label">Header Background</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-header-bg" class="color-picker-hex" value="#1e3a8a" readonly>
                                <input type="color" id="token-header-bg" value="#1e3a8a" class="color-picker-input" oninput="updateHeaderBgColor(this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="section-divider">Introduction content</div>

                    <div class="control-group">
                        <label class="control-label">Form Title</label>
                        <input type="text" class="control-input" id="setting-title" value="Registration Form" oninput="updateFormPreview()">
                    </div>

                    <div class="control-group">
                        <label class="control-label">Description Subtitle</label>
                        <textarea class="control-textarea" id="setting-desc" oninput="updateFormPreview()">Please tell us a little about yourself to get started.</textarea>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Highlight Message Badge</label>
                        <input type="text" class="control-input" id="setting-highlight" value="Closes Friday!" placeholder="e.g. Closes Friday!" oninput="updateFormPreview()">
                    </div>

                    <!-- Contextual Split Rail Section -->
                    <div class="section-divider">Split-Hero Brand Rail</div>
                    
                    <div id="split-rail-warning" class="context-placeholder">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        <span>Select the <strong>Split Hero Layout</strong> under the Canvas tab to configure side-rail parameters.</span>
                    </div>

                    <div id="split-rail-settings" style="opacity: 0.4; pointer-events: none;">
                        <div class="control-group">
                            <div class="switch-row">
                                <div class="switch-label-container">
                                    <span class="switch-title">Rail Alignment Side</span>
                                    <span class="switch-desc">Position the rail on the right side</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" id="setting-split-side" onchange="updateFormPreview()">
                                    <span class="slider-round"></span>
                                </label>
                            </div>
                        </div>
                        <div class="control-group">
                            <label class="control-label">Rail Panel Width</label>
                            <div class="slider-row">
                                <input type="range" min="25" max="50" value="42" class="slider-range" id="setting-split-width" oninput="updateSplitWidth(this.value)">
                                <span class="slider-val" id="val-split-width">42%</span>
                            </div>
                        </div>

                        <!-- Brand Rail Content Checkbox list -->
                        <div class="control-group" style="margin-top: 14px;">
                            <label class="control-label">Brand Rail Content</label>
                            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px; background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: var(--radius-md); padding: 10px;">
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: var(--text-main); cursor: pointer;">
                                    <input type="checkbox" id="brand-content-logo" checked onchange="updateFormPreview()">
                                    <span>Brand Logo Emblem</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: var(--text-main); cursor: pointer;">
                                    <input type="checkbox" id="brand-content-title" checked onchange="updateFormPreview()">
                                    <span>Form Title</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: var(--text-main); cursor: pointer;">
                                    <input type="checkbox" id="brand-content-desc" checked onchange="updateFormPreview()">
                                    <span>Description</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: var(--text-main); cursor: pointer;">
                                    <input type="checkbox" id="brand-content-progress" onchange="updateFormPreview()">
                                    <span>Progress Tracker</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: var(--text-main); cursor: pointer;">
                                    <input type="checkbox" id="brand-content-quote" onchange="updateFormPreview()">
                                    <span>Quote Testimonial</span>
                                </label>
                            </div>
                        </div>

                        <div class="control-group">
                            <div class="switch-row">
                                <div class="switch-label-container">
                                    <span class="switch-title">Sticky Brand Panel</span>
                                    <span class="switch-desc">Pin rail during scroll</span>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" id="setting-split-sticky" onchange="updateFormPreview()">
                                    <span class="slider-round"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>"""

# 3. Update Fields Tab Content
fields_target = """                <!-- PILLAR 3: TYPOGRAPHY & FIELDS -->
                <div id="tab-fields" class="tab-content-area" style="display: none;">
                    <div class="panel-header">
                        <div class="panel-title">Typography & Fields</div>
                        <div class="panel-subtitle">Manage fonts, input styles, and surface effects</div>
                    </div>

                    <div class="section-divider">Typography</div>

                    <div class="control-group">
                        <label class="control-label">Font Pairings</label>
                        <select class="control-select" onchange="updateToken('--c-font-body', this.value)">
                            <option value="'Inter', sans-serif">Enterprise (Inter / SLDS)</option>
                            <option value="'Outfit', sans-serif">Geometric (Outfit / Outfit)</option>
                            <option value="'Lora', serif">Editorial (Lora / Lora)</option>
                            <option value="'JetBrains Mono', monospace">Technical (JetBrains Mono)</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <div class="color-row-input">
                            <span class="color-row-label">Text Color</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-text" class="color-picker-hex" value="#1f2937" readonly>
                                <input type="color" id="token-text" value="#1f2937" class="color-picker-input" oninput="updateTextColor(this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="section-divider">Input Fields</div>

                    <div class="control-group">
                        <label class="control-label">Input Style</label>
                        <select class="control-select">
                            <option>Standard Outline</option>
                            <option>Boutique Underline</option>
                            <option>Flat Filled</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Field Label Position</label>
                        <div class="segmented-group">
                            <button class="active">Top Stacked</button>
                            <button>Left Aligned</button>
                        </div>
                    </div>

                    <div class="section-divider">Surface FX</div>

                    <div class="control-group">
                        <label class="control-label">Background Texture</label>
                        <select class="control-select">
                            <option>None</option>
                            <option>Subtle Paper Grain</option>
                            <option>Phosphor grid mesh</option>
                        </select>
                    </div>
                </div>"""

fields_replacement = """                <!-- PILLAR 3: TYPOGRAPHY & FIELDS -->
                <div id="tab-fields" class="tab-content-area" style="display: none;">
                    <div class="panel-header">
                        <div class="panel-title">Typography & Fields</div>
                        <div class="panel-subtitle">Manage fonts, input styles, and surface effects</div>
                    </div>

                    <div class="section-divider">Typography</div>

                    <div class="control-group">
                        <label class="control-label">Font Pairings</label>
                        <select class="control-select" onchange="updateToken('--c-font-body', this.value)">
                            <option value="'Inter', sans-serif">Enterprise (Inter / SLDS)</option>
                            <option value="'Outfit', sans-serif">Geometric (Outfit / Outfit)</option>
                            <option value="'Lora', serif">Editorial (Lora / Lora)</option>
                            <option value="'JetBrains Mono', monospace">Technical (JetBrains Mono)</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Typography Colors</label>
                        <div class="color-row-input">
                            <span class="color-row-label">Main Text</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-text" class="color-picker-hex" value="#1f2937" readonly>
                                <input type="color" id="token-text" value="#1f2937" class="color-picker-input" oninput="updateTextColor(this.value)">
                            </div>
                        </div>
                        <div class="color-row-input">
                            <span class="color-row-label">Muted Text</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-text-weak" class="color-picker-hex" value="#63738e" readonly>
                                <input type="color" id="token-text-weak" value="#63738e" class="color-picker-input" oninput="updateMutedTextColor(this.value)">
                            </div>
                        </div>
                        <div class="color-row-input">
                            <span class="color-row-label">Header Text</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-header-text" class="color-picker-hex" value="#16325c" readonly>
                                <input type="color" id="token-header-text" value="#16325c" class="color-picker-input" oninput="updateHeaderText(this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="section-divider">Input Fields</div>

                    <div class="control-group">
                        <label class="control-label">Input Style</label>
                        <select class="control-select" id="setting-input-style" onchange="updateFormPreview()">
                            <option value="outline">Standard Outline</option>
                            <option value="underline">Boutique Underline</option>
                            <option value="filled">Flat Filled</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Label style</label>
                        <select class="control-select" id="setting-label-style" onchange="updateFormPreview()">
                            <option value="default">Default Label</option>
                            <option value="mono">Uppercase Monospace</option>
                            <option value="muted">Muted Small</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Field Label Position</label>
                        <div class="segmented-group" id="setting-label-position">
                            <button class="active" onclick="setLabelPosition('top', this)">Top Stacked</button>
                            <button onclick="setLabelPosition('left', this)">Left Aligned</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Control scale (Sizing)</label>
                        <div class="slider-row">
                            <input type="range" min="10" max="15" value="10" step="1" class="slider-range" id="token-control-scale" oninput="updateControlScale(this.value)">
                            <span class="slider-val" id="val-control-scale">1.0x</span>
                        </div>
                    </div>

                    <div class="section-divider">Card Borders & FX</div>

                    <div class="control-group">
                        <label class="control-label">Border Colors</label>
                        <div class="color-row-input">
                            <span class="color-row-label">Border Strong</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-border" class="color-picker-hex" value="#d8dde6" readonly>
                                <input type="color" id="token-border" value="#d8dde6" class="color-picker-input" oninput="updateBorderColor(this.value)">
                            </div>
                        </div>
                        <div class="color-row-input">
                            <span class="color-row-label">Border Light</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-border-light" class="color-picker-hex" value="#e5e7eb" readonly>
                                <input type="color" id="token-border-light" value="#e5e7eb" class="color-picker-input" oninput="updateBorderLightColor(this.value)">
                            </div>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Card Border Width</label>
                        <div class="slider-row">
                            <input type="range" min="0" max="6" value="1" class="slider-range" id="token-border-width" oninput="updateBorderWidth(this.value)">
                            <span class="slider-val" id="val-border-width">1px</span>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Card Border Style</label>
                        <select class="control-select" id="setting-border-style" onchange="updateFormPreview()">
                            <option value="solid">Solid Border</option>
                            <option value="dashed">Dashed Border</option>
                            <option value="dotted">Dotted Border</option>
                            <option value="double">Double Border</option>
                            <option value="none">No Border</option>
                        </select>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Background Texture</label>
                        <select class="control-select" id="setting-texture" onchange="updateFormPreview()">
                            <option value="none">None</option>
                            <option value="grain">Subtle Paper Grain</option>
                            <option value="grid">Phosphor grid mesh</option>
                        </select>
                    </div>

                    <div class="control-group" style="margin-top: 14px;">
                        <div class="switch-row">
                            <div class="switch-label-container">
                                <span class="switch-title">Animated Mesh BG</span>
                                <span class="switch-desc">Flowing color hues backdrop</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="token-mesh-effect" onchange="updateMeshEffect(this.checked)">
                                <span class="slider-round"></span>
                            </label>
                        </div>
                    </div>

                    <div class="control-group">
                        <div class="switch-row">
                            <div class="switch-label-container">
                                <span class="switch-title">Top Accent Band</span>
                                <span class="switch-desc">Branded frame decor strip</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="token-panel-decor" onchange="updatePanelDecor(this.checked)">
                                <span class="slider-round"></span>
                            </label>
                        </div>
                    </div>
                </div>"""

# 4. Update Flow Tab Content
flow_target = """                <!-- PILLAR 4: INTERACTION & FLOW -->
                <div id="tab-flow" class="tab-content-area" style="display: none;">
                    <div class="panel-header">
                        <div class="panel-title">Interaction & Flow</div>
                        <div class="panel-subtitle">Manage color accents, action buttons, and completion redirects</div>
                    </div>

                    <div class="section-divider">Color Accent Palette</div>

                    <div class="control-group">
                        <div class="color-row-input">
                            <span class="color-row-label">Accent Color</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-accent" class="color-picker-hex" value="#6366f1" readonly>
                                <input type="color" id="token-accent" value="#6366f1" class="color-picker-input" oninput="updateAccentColor(this.value)">
                            </div>
                        </div>
                        <div class="color-row-input">
                            <span class="color-row-label">Button Text</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-accent-text" class="color-picker-hex" value="#ffffff" readonly>
                                <input type="color" id="token-accent-text" value="#ffffff" class="color-picker-input" oninput="updateAccentTextColor(this.value)">
                            </div>
                        </div>
                        
                        <!-- Live Contrast Checker Badge -->
                        <div id="contrast-checker" class="contrast-badge contrast-pass">
                            <span class="contrast-status-dot"></span>
                            <span id="contrast-ratio-value">4.5:1 Pass (AA)</span>
                        </div>
                    </div>

                    <div class="section-divider">Action Buttons</div>

                    <div class="control-group">
                        <label class="control-label">Submit Label</label>
                        <input type="text" class="control-input" id="setting-submit-label" value="Submit Form" oninput="updateFormPreview()">
                    </div>

                    <div class="control-group">
                        <label class="control-label">Button Alignment</label>
                        <div class="segmented-group" id="setting-btn-align">
                            <button class="active" onclick="setBtnAlign('left', this)">Left</button>
                            <button onclick="setBtnAlign('center', this)">Center</button>
                            <button onclick="setBtnAlign('right', this)">Right</button>
                            <button onclick="setBtnAlign('stretch', this)">Stretch</button>
                        </div>
                    </div>

                    <div class="section-divider">After Submit Action</div>

                    <div class="control-group">
                        <label class="control-label">Completion Outcome</label>
                        <div class="segmented-group" id="setting-after-action">
                            <button class="active">Message</button>
                            <button onclick="alert('Redirect settings will be loaded.')">Redirect</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Thank-you Message</label>
                        <textarea class="control-textarea">Thank you! Your response has been recorded successfully.</textarea>
                    </div>
                </div>"""

flow_replacement = """                <!-- PILLAR 4: INTERACTION & FLOW -->
                <div id="tab-flow" class="tab-content-area" style="display: none;">
                    <div class="panel-header">
                        <div class="panel-title">Interaction & Flow</div>
                        <div class="panel-subtitle">Manage color accents, action buttons, and completion redirects</div>
                    </div>

                    <div class="section-divider">Color Accent Palette</div>

                    <div class="control-group">
                        <div class="color-row-input">
                            <span class="color-row-label">Accent Color</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-accent" class="color-picker-hex" value="#6366f1" readonly>
                                <input type="color" id="token-accent" value="#6366f1" class="color-picker-input" oninput="updateAccentColor(this.value)">
                            </div>
                        </div>
                        <div class="color-row-input">
                            <span class="color-row-label">Button Text</span>
                            <div class="color-picker-wrapper">
                                <input type="text" id="hex-accent-text" class="color-picker-hex" value="#ffffff" readonly>
                                <input type="color" id="token-accent-text" value="#ffffff" class="color-picker-input" oninput="updateAccentTextColor(this.value)">
                            </div>
                        </div>
                        
                        <!-- Live Contrast Checker Badge -->
                        <div id="contrast-checker" class="contrast-badge contrast-pass">
                            <span class="contrast-status-dot"></span>
                            <span id="contrast-ratio-value">4.5:1 Pass (AA)</span>
                        </div>
                    </div>

                    <div class="section-divider">Action Buttons</div>

                    <div class="control-group">
                        <label class="control-label">Submit Label</label>
                        <input type="text" class="control-input" id="setting-submit-label" value="Submit Form" oninput="updateFormPreview()">
                    </div>

                    <div class="control-group">
                        <label class="control-label">Button Alignment</label>
                        <div class="segmented-group" id="setting-btn-align">
                            <button class="active" onclick="setBtnAlign('left', this)">Left</button>
                            <button onclick="setBtnAlign('center', this)">Center</button>
                            <button onclick="setBtnAlign('right', this)">Right</button>
                            <button onclick="setBtnAlign('stretch', this)">Stretch</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <label class="control-label">Submit Button Placement</label>
                        <select class="control-select" id="setting-submit-placement" onchange="updateFormPreview()">
                            <option value="flow">Inline with Flow</option>
                            <option value="sticky">Sticky Bottom Bar</option>
                            <option value="rail">Inside Brand Rail</option>
                        </select>
                    </div>

                    <!-- Wizard Navigation Inputs -->
                    <div id="wizard-navigation-settings" style="display: none; background: rgba(255,255,255,0.01); border: 1px solid var(--panel-border); border-radius: var(--radius-md); padding: 12px; margin-bottom: 18px;">
                        <div class="control-group">
                            <label class="control-label">Next Button Label</label>
                            <input type="text" class="control-input" id="setting-next-label" value="Next Step" oninput="updateFormPreview()">
                        </div>
                        <div class="control-group" style="margin-bottom: 0;">
                            <label class="control-label">Back Button Label</label>
                            <input type="text" class="control-input" id="setting-back-label" value="Back" oninput="updateFormPreview()">
                        </div>
                    </div>

                    <div class="section-divider">After Submit Action</div>

                    <div class="control-group">
                        <label class="control-label">Completion Outcome</label>
                        <div class="segmented-group" id="setting-after-action">
                            <button class="active" id="btn-outcome-message" onclick="setAfterAction('message', this)">Message</button>
                            <button id="btn-outcome-redirect" onclick="setAfterAction('redirect', this)">Redirect</button>
                        </div>
                    </div>

                    <!-- Redirect URL input -->
                    <div id="redirect-url-setting" style="display: none; margin-bottom: 18px;">
                        <div class="control-group">
                            <label class="control-label">Redirect URL</label>
                            <input type="text" class="control-input" id="setting-redirect-url" value="https://example.com/thankyou" oninput="updateFormPreview()">
                        </div>
                    </div>

                    <div class="control-group" id="thankyou-msg-setting">
                        <label class="control-label">Thank-you Message</label>
                        <textarea class="control-textarea" id="setting-thankyou-msg" oninput="updateFormPreview()">Thank you! Your response has been recorded successfully.</textarea>
                    </div>
                </div>"""

# Replace html tabs
html = html.replace(canvas_target, canvas_replacement)
html = html.replace(identity_target, identity_replacement)
html = html.replace(fields_target, fields_replacement)
html = html.replace(flow_target, flow_replacement)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)

print("HTML tabs updated successfully!")
