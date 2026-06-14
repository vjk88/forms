/**
 * Server-side Layout Spec validator — LAYOUT_SPEC.md §6 (schema) + semantic
 * checks. Mirrors c/layoutModel validateSpec() 1:1 (same error codes/paths)
 * so client lint and server gate never disagree.
 *
 * THE single gate for Layout_Spec__c persistence: designer save, AI patch
 * application and import all funnel through validate() before any write
 * (see FormDesignerController.applySpecPatch). Do not add a second writer.
 */
public with sharing class FormLayoutSpecValidator {
  // ---------------------------------------------------------------- limits
  public static final Integer MAX_BYTES = 32768;
  public static final Integer MAX_PAGES = 20;
  public static final Integer MAX_ZONES_PER_PAGE = 6;
  public static final Integer MAX_CHILDREN_PER_ZONE = 8;
  public static final Integer MAX_NODES_PER_PAGE = 30;
  public static final Integer MAX_STACK_SECTIONS = 15;
  public static final Integer MAX_TRACK_SECTIONS = 10;
  public static final Integer MAX_OPS_PER_PATCH = 15;
  public static final Integer MAX_KEY_LENGTH = 80;
  public static final Integer MAX_ARCHETYPE_LENGTH = 40;
  public static final Integer SPEC_VERSION = 1;

  private static final Set<String> NAV_ENUM = new Set<String>{
    'scroll', 'stepper', 'tabs', 'sidenav', 'oneAtATime', 'accordion'
  };
  private static final Set<String> STEPPER_PLACEMENT_ENUM = new Set<String>{ 'top', 'rail' };
  private static final Set<String> STEPPER_MODE_ENUM = new Set<String>{ 'vertical', 'horizontal', 'progress' };
  private static final Set<String> CHROME_ENUM = new Set<String>{ 'card', 'fullbleed', 'paper' };
  private static final Set<String> MAX_WIDTH_ENUM = new Set<String>{ 'narrow', 'medium', 'wide', 'full' };
  private static final Set<String> HEADER_ENUM = new Set<String>{ 'standard', 'hero', 'minimal', 'none' };
  private static final Set<String> PROGRESS_ENUM = new Set<String>{ 'auto', 'bar', 'dots', 'fraction', 'none' };
  private static final Set<String> DENSITY_ENUM = new Set<String>{ 'comfortable', 'compact' };
  private static final Set<String> PANEL_SIDE_ENUM = new Set<String>{ 'left', 'right', 'top' };
  private static final Set<String> PANEL_CONTENT_ENUM = new Set<String>{
    'logo', 'title', 'description', 'progress', 'image', 'props', 'quote'
  };
  private static final Set<String> SUBMIT_PLACEMENT_ENUM = new Set<String>{ 'flow', 'stickyBottom', 'brandPanel' };
  private static final Set<String> SUBMIT_ALIGNMENT_ENUM = new Set<String>{ 'left', 'center', 'right', 'stretch' };
  private static final Set<String> COLLAPSE_BELOW_ENUM = new Set<String>{ '480px', '768px', '1024px' };
  private static final Set<String> COLLAPSE_ORDER_ENUM = new Set<String>{ 'source', 'mainFirst' };

  private static final Set<String> SPEC_KEYS = new Set<String>{
    'version', 'archetype', 'density', 'shell', 'pages', 'responsive'
  };
  private static final Set<String> SHELL_KEYS = new Set<String>{
    'nav', 'stepperPlacement', 'stepperMode', 'chrome', 'maxWidth', 'header', 'progress', 'brandPanel', 'submit'
  };
  private static final Set<String> PANEL_KEYS = new Set<String>{ 'side', 'width', 'content', 'sticky' };
  private static final Set<String> SUBMIT_KEYS = new Set<String>{ 'placement', 'alignment' };
  private static final Set<String> PAGE_KEYS = new Set<String>{ 'pageKey', 'grid', 'zones' };
  private static final Set<String> ZONE_KEYS = new Set<String>{ 'type', 'span', 'sticky', 'children' };
  private static final Set<String> COLUMNS_KEYS = new Set<String>{ 'type', 'ratio', 'tracks' };
  private static final Set<String> STACK_KEYS = new Set<String>{ 'type', 'sections' };
  private static final Set<String> RESPONSIVE_KEYS = new Set<String>{ 'collapseBelow', 'collapseOrder' };
  private static final String PANEL_WIDTH_RE = '^(2[5-9]|3[0-9]|4[0-9]|50)%$';

  // ----------------------------------------------------------------- types
  public class Issue {
    @AuraEnabled
    public String code;
    @AuraEnabled
    public String path;
    @AuraEnabled
    public String message;
    public Issue(String code, String path, String message) {
      this.code = code;
      this.path = path;
      this.message = message;
    }
  }

  public class Result {
    @AuraEnabled
    public Boolean ok;
    @AuraEnabled
    public List<Issue> errors = new List<Issue>();
    @AuraEnabled
    public List<Issue> warnings = new List<Issue>();
  }

  // ------------------------------------------------------------ public API
  /** Schema + structural semantics. Pure; no SOQL. */
  public static Result validate(String specJson) {
    Result res = new Result();
    if (String.isBlank(specJson)) {
      res.errors.add(new Issue('not-object', '$', 'Spec must be an object'));
      res.ok = false;
      return res;
    }
    if (specJson.length() > MAX_BYTES) {
      res.errors.add(new Issue('too-large', '$', 'Spec exceeds ' + MAX_BYTES + ' bytes'));
    }
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(specJson);
    } catch (Exception e) {
      res.errors.add(new Issue('bad-json', '$', 'Invalid JSON: ' + e.getMessage()));
      res.ok = false;
      return res;
    }
    if (!(parsed instanceof Map<String, Object>)) {
      res.errors.add(new Issue('not-object', '$', 'Spec must be an object'));
      res.ok = false;
      return res;
    }
    Map<String, Object> spec = (Map<String, Object>) parsed;

    checkKeys(res.errors, spec, SPEC_KEYS, '$');
    Integer ver = asInt(spec.get('version'));
    if (ver == null || ver != SPEC_VERSION) {
      res.errors.add(new Issue('bad-version', '$.version', 'version must be ' + SPEC_VERSION));
    }
    if (!isStr(spec.get('archetype'), MAX_ARCHETYPE_LENGTH)) {
      res.errors.add(new Issue('bad-archetype', '$.archetype', 'archetype required (string <= 40)'));
    }
    checkEnum(res.errors, spec.get('density'), DENSITY_ENUM, '$.density');

    validateShell(res.errors, spec.get('shell'));
    validatePages(res.errors, spec.get('pages'));

    Object responsive = spec.get('responsive');
    if (responsive != null || spec.containsKey('responsive')) {
      if (!(responsive instanceof Map<String, Object>)) {
        res.errors.add(new Issue('bad-responsive', '$.responsive', 'responsive must be an object'));
      } else {
        Map<String, Object> r = (Map<String, Object>) responsive;
        checkKeys(res.errors, r, RESPONSIVE_KEYS, '$.responsive');
        checkEnum(res.errors, r.get('collapseBelow'), COLLAPSE_BELOW_ENUM, '$.responsive.collapseBelow');
        checkEnum(res.errors, r.get('collapseOrder'), COLLAPSE_ORDER_ENUM, '$.responsive.collapseOrder');
      }
    }

    addCompatWarnings(res, spec);
    res.ok = res.errors.isEmpty();
    return res;
  }

  /**
   * validate() + data cross-checks for one version: spec keys missing from
   * Form_Page__c/Form_Section__c data are WARNINGS (orphan rule §5 — the
   * client engine drops unknown keys and appends unplaced sections; nothing
   * is lost, so this must not block a save).
   */
  public static Result validateForVersion(String specJson, Id formVersionId) {
    Result res = validate(specJson);
    if (!res.ok || formVersionId == null) {
      return res;
    }
    Set<String> dataPageKeys = new Set<String>();
    Set<String> dataSectionKeys = new Set<String>();
    for (Form_Page__c p : [
      SELECT Key__c, (SELECT Key__c FROM Form_Sections__r)
      FROM Form_Page__c
      WHERE Form_Version__c = :formVersionId
      WITH USER_MODE
    ]) {
      if (String.isNotBlank(p.Key__c)) {
        dataPageKeys.add(p.Key__c);
      }
      for (Form_Section__c s : p.Form_Sections__r) {
        if (String.isNotBlank(s.Key__c)) {
          dataSectionKeys.add(s.Key__c);
        }
      }
    }
    Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(specJson);
    for (Object pageObj : (List<Object>) spec.get('pages')) {
      Map<String, Object> page = (Map<String, Object>) pageObj;
      String pk = (String) page.get('pageKey');
      if (!dataPageKeys.contains(pk)) {
        res.warnings.add(new Issue('unknown-page-key', '$', 'pageKey "' + pk + '" not found in version data'));
      }
    }
    for (String sk : collectSectionKeys(spec)) {
      if (!dataSectionKeys.contains(sk)) {
        res.warnings.add(new Issue('unknown-section-key', '$', 'sectionKey "' + sk + '" not found in version data'));
      }
    }
    return res;
  }

  // ----------------------------------------------------------------- shell
  private static void validateShell(List<Issue> errors, Object shellObj) {
    if (!(shellObj instanceof Map<String, Object>)) {
      errors.add(new Issue('bad-shell', '$.shell', 'shell required'));
      return;
    }
    Map<String, Object> shell = (Map<String, Object>) shellObj;
    checkKeys(errors, shell, SHELL_KEYS, '$.shell');
    Object nav = shell.get('nav');
    if (!(nav instanceof String) || !NAV_ENUM.contains((String) nav)) {
      errors.add(new Issue('invalid-enum', '$.shell.nav', 'nav required, one of ' + NAV_ENUM));
    }
    checkEnum(errors, shell.get('stepperPlacement'), STEPPER_PLACEMENT_ENUM, '$.shell.stepperPlacement');
    if (shell.containsKey('stepperPlacement') && nav != 'stepper') {
      errors.add(new Issue('incompatible', '$.shell.stepperPlacement', 'stepperPlacement only valid with nav: stepper'));
    }
    checkEnum(errors, shell.get('stepperMode'), STEPPER_MODE_ENUM, '$.shell.stepperMode');
    if (shell.containsKey('stepperMode') && nav != 'stepper') {
      errors.add(new Issue('incompatible', '$.shell.stepperMode', 'stepperMode only valid with nav: stepper'));
    }
    checkEnum(errors, shell.get('chrome'), CHROME_ENUM, '$.shell.chrome');
    checkEnum(errors, shell.get('maxWidth'), MAX_WIDTH_ENUM, '$.shell.maxWidth');
    checkEnum(errors, shell.get('header'), HEADER_ENUM, '$.shell.header');
    checkEnum(errors, shell.get('progress'), PROGRESS_ENUM, '$.shell.progress');

    Object bpObj = shell.get('brandPanel');
    if (shell.containsKey('brandPanel') && bpObj != null) {
      if (!(bpObj instanceof Map<String, Object>)) {
        errors.add(new Issue('bad-panel', '$.shell.brandPanel', 'brandPanel must be an object or null'));
      } else {
        Map<String, Object> bp = (Map<String, Object>) bpObj;
        checkKeys(errors, bp, PANEL_KEYS, '$.shell.brandPanel');
        Object side = bp.get('side');
        if (!(side instanceof String) || !PANEL_SIDE_ENUM.contains((String) side)) {
          errors.add(new Issue('invalid-enum', '$.shell.brandPanel.side', 'side required: left|right|top'));
        }
        Object width = bp.get('width');
        if (bp.containsKey('width') && (!(width instanceof String) || !Pattern.matches(PANEL_WIDTH_RE, (String) width))) {
          errors.add(new Issue('bad-width', '$.shell.brandPanel.width', 'width must be 25%-50%'));
        }
        if (bp.containsKey('content')) {
          Object content = bp.get('content');
          if (!(content instanceof List<Object>) || ((List<Object>) content).size() > 7) {
            errors.add(new Issue('bad-content', '$.shell.brandPanel.content', 'content: array, max 7'));
          } else {
            List<Object> items = (List<Object>) content;
            for (Integer i = 0; i < items.size(); i++) {
              checkEnum(errors, items[i], PANEL_CONTENT_ENUM, '$.shell.brandPanel.content[' + i + ']');
            }
          }
        }
        if (bp.containsKey('sticky') && !(bp.get('sticky') instanceof Boolean)) {
          errors.add(new Issue('bad-type', '$.shell.brandPanel.sticky', 'sticky must be boolean'));
        }
      }
    }
    Object subObj = shell.get('submit');
    if (shell.containsKey('submit')) {
      if (!(subObj instanceof Map<String, Object>)) {
        errors.add(new Issue('bad-submit', '$.shell.submit', 'submit must be an object'));
      } else {
        Map<String, Object> sub = (Map<String, Object>) subObj;
        checkKeys(errors, sub, SUBMIT_KEYS, '$.shell.submit');
        checkEnum(errors, sub.get('placement'), SUBMIT_PLACEMENT_ENUM, '$.shell.submit.placement');
        checkEnum(errors, sub.get('alignment'), SUBMIT_ALIGNMENT_ENUM, '$.shell.submit.alignment');
      }
    }
  }

  // ----------------------------------------------------------------- pages
  private static void validatePages(List<Issue> errors, Object pagesObj) {
    if (!(pagesObj instanceof List<Object>)) {
      errors.add(new Issue('bad-pages', '$.pages', 'pages: array of 1-' + MAX_PAGES));
      return;
    }
    List<Object> pages = (List<Object>) pagesObj;
    if (pages.isEmpty() || pages.size() > MAX_PAGES) {
      errors.add(new Issue('bad-pages', '$.pages', 'pages: array of 1-' + MAX_PAGES));
      return;
    }
    Set<String> pageKeys = new Set<String>();
    Set<String> sectionKeys = new Set<String>();
    for (Integer pi = 0; pi < pages.size(); pi++) {
      String p = '$.pages[' + pi + ']';
      if (!(pages[pi] instanceof Map<String, Object>)) {
        errors.add(new Issue('bad-page', p, 'page must be an object'));
        continue;
      }
      Map<String, Object> page = (Map<String, Object>) pages[pi];
      checkKeys(errors, page, PAGE_KEYS, p);
      Object pk = page.get('pageKey');
      if (!isStr(pk, MAX_KEY_LENGTH)) {
        errors.add(new Issue('bad-key', p + '.pageKey', 'pageKey required (string <= 80)'));
      } else if (pageKeys.contains((String) pk)) {
        errors.add(new Issue('duplicate-key', p + '.pageKey', 'duplicate pageKey "' + pk + '"'));
      } else {
        pageKeys.add((String) pk);
      }
      if (page.containsKey('grid')) {
        Integer grid = asInt(page.get('grid'));
        if (grid == null || grid != 12) {
          errors.add(new Issue('bad-grid', p + '.grid', 'grid must be 12'));
        }
      }
      Object zonesObj = page.get('zones');
      if (!(zonesObj instanceof List<Object>)) {
        errors.add(new Issue('bad-zones', p + '.zones', 'zones: array of 1-' + MAX_ZONES_PER_PAGE));
        continue;
      }
      List<Object> zones = (List<Object>) zonesObj;
      if (zones.isEmpty() || zones.size() > MAX_ZONES_PER_PAGE) {
        errors.add(new Issue('bad-zones', p + '.zones', 'zones: array of 1-' + MAX_ZONES_PER_PAGE));
        continue;
      }
      Integer nodeCount = 0;
      for (Integer zi = 0; zi < zones.size(); zi++) {
        nodeCount += 1 + validateZone(errors, zones[zi], p + '.zones[' + zi + ']', sectionKeys);
      }
      if (nodeCount > MAX_NODES_PER_PAGE) {
        errors.add(new Issue('too-many-nodes', p, 'page exceeds ' + MAX_NODES_PER_PAGE + ' nodes'));
      }
    }
  }

  /** @return number of child nodes (per-page node cap) */
  private static Integer validateZone(List<Issue> errors, Object zoneObj, String path, Set<String> sectionKeys) {
    if (!(zoneObj instanceof Map<String, Object>) || ((Map<String, Object>) zoneObj).get('type') != 'zone') {
      errors.add(new Issue('bad-node', path, 'expected { type: "zone" }'));
      return 0;
    }
    Map<String, Object> zone = (Map<String, Object>) zoneObj;
    checkKeys(errors, zone, ZONE_KEYS, path);
    Integer span = asInt(zone.get('span'));
    if (span == null || span < 1 || span > 12) {
      errors.add(new Issue('bad-span', path + '.span', 'span: integer 1-12'));
    }
    if (zone.containsKey('sticky') && !(zone.get('sticky') instanceof Boolean)) {
      errors.add(new Issue('bad-type', path + '.sticky', 'sticky must be boolean'));
    }
    Object childrenObj = zone.get('children');
    if (!(childrenObj instanceof List<Object>)) {
      errors.add(new Issue('bad-children', path + '.children', 'children: array of 1-' + MAX_CHILDREN_PER_ZONE));
      return 0;
    }
    List<Object> children = (List<Object>) childrenObj;
    if (children.isEmpty() || children.size() > MAX_CHILDREN_PER_ZONE) {
      errors.add(new Issue('bad-children', path + '.children', 'children: array of 1-' + MAX_CHILDREN_PER_ZONE));
      return 0;
    }
    for (Integer ci = 0; ci < children.size(); ci++) {
      validateChild(errors, children[ci], path + '.children[' + ci + ']', sectionKeys);
    }
    return children.size();
  }

  private static void validateChild(List<Issue> errors, Object childObj, String path, Set<String> sectionKeys) {
    if (!(childObj instanceof Map<String, Object>)) {
      errors.add(new Issue('bad-node', path, 'child must be an object'));
      return;
    }
    Map<String, Object> child = (Map<String, Object>) childObj;
    Object t = child.get('type');
    if (t == 'stack') {
      checkKeys(errors, child, STACK_KEYS, path);
      Object sectionsObj = child.get('sections');
      if (!(sectionsObj instanceof List<Object>) || ((List<Object>) sectionsObj).size() > MAX_STACK_SECTIONS) {
        errors.add(new Issue('bad-sections', path + '.sections', 'sections: array, max ' + MAX_STACK_SECTIONS));
        return;
      }
      List<Object> sections = (List<Object>) sectionsObj;
      for (Integer si = 0; si < sections.size(); si++) {
        addSectionKey(errors, sections[si], path + '.sections[' + si + ']', sectionKeys);
      }
    } else if (t == 'columns') {
      checkKeys(errors, child, COLUMNS_KEYS, path);
      Object ratioObj = child.get('ratio');
      Boolean ratioOk = false;
      if (ratioObj instanceof List<Object>) {
        List<Object> ratio = (List<Object>) ratioObj;
        ratioOk = ratio.size() >= 2 && ratio.size() <= 4;
        if (ratioOk) {
          for (Object r : ratio) {
            Integer ri = asInt(r);
            if (ri == null || ri < 1 || ri > 3) {
              ratioOk = false;
              break;
            }
          }
        }
      }
      if (!ratioOk) {
        errors.add(new Issue('bad-ratio', path + '.ratio', 'ratio: 2-4 integers of 1-3'));
      }
      Object tracksObj = child.get('tracks');
      if (!(tracksObj instanceof List<Object>) ||
          (ratioOk && ((List<Object>) tracksObj).size() != ((List<Object>) ratioObj).size())) {
        errors.add(new Issue('ratio-tracks-mismatch', path + '.tracks', 'tracks length must equal ratio length'));
        return;
      }
      List<Object> tracks = (List<Object>) tracksObj;
      for (Integer ti = 0; ti < tracks.size(); ti++) {
        if (!(tracks[ti] instanceof List<Object>) || ((List<Object>) tracks[ti]).size() > MAX_TRACK_SECTIONS) {
          errors.add(new Issue('bad-track', path + '.tracks[' + ti + ']', 'track: array, max ' + MAX_TRACK_SECTIONS));
          continue;
        }
        List<Object> track = (List<Object>) tracks[ti];
        for (Integer si = 0; si < track.size(); si++) {
          addSectionKey(errors, track[si], path + '.tracks[' + ti + '][' + si + ']', sectionKeys);
        }
      }
    } else {
      errors.add(new Issue('bad-node-type', path, 'unknown node type "' + t + '" (columns may not nest)'));
    }
  }

  private static void addSectionKey(List<Issue> errors, Object key, String path, Set<String> sectionKeys) {
    if (!isStr(key, MAX_KEY_LENGTH)) {
      errors.add(new Issue('bad-key', path, 'section key must be string <= 80'));
      return;
    }
    String k = (String) key;
    if (sectionKeys.contains(k)) {
      errors.add(new Issue('duplicate-section', path, 'section "' + k + '" placed more than once'));
    } else {
      sectionKeys.add(k);
    }
  }

  // ------------------------------------------------------------- semantics
  /** Nav-model compatibility WARNINGS (LAYOUT_SPEC §6 semantic check 5). */
  private static void addCompatWarnings(Result res, Map<String, Object> spec) {
    Object shellObj = spec.get('shell');
    Object pagesObj = spec.get('pages');
    if (!(shellObj instanceof Map<String, Object>) || !(pagesObj instanceof List<Object>)) {
      return;
    }
    Object nav = ((Map<String, Object>) shellObj).get('nav');
    if (nav != 'oneAtATime' && nav != 'accordion') {
      return;
    }
    for (Object pageObj : (List<Object>) pagesObj) {
      if (!(pageObj instanceof Map<String, Object>)) {
        continue;
      }
      Object zonesObj = ((Map<String, Object>) pageObj).get('zones');
      if (zonesObj instanceof List<Object> && ((List<Object>) zonesObj).size() > 1) {
        res.warnings.add(new Issue('nav-compat', '$.shell.nav',
          '' + nav + ' flattens multi-zone pages on render; zone structure is preserved in the spec'));
        return;
      }
    }
  }

  private static Set<String> collectSectionKeys(Map<String, Object> spec) {
    Set<String> keys = new Set<String>();
    for (Object pageObj : (List<Object>) spec.get('pages')) {
      for (Object zoneObj : (List<Object>) ((Map<String, Object>) pageObj).get('zones')) {
        for (Object childObj : (List<Object>) ((Map<String, Object>) zoneObj).get('children')) {
          Map<String, Object> child = (Map<String, Object>) childObj;
          if (child.get('type') == 'stack') {
            for (Object s : (List<Object>) child.get('sections')) {
              keys.add((String) s);
            }
          } else {
            for (Object trackObj : (List<Object>) child.get('tracks')) {
              for (Object s : (List<Object>) trackObj) {
                keys.add((String) s);
              }
            }
          }
        }
      }
    }
    return keys;
  }

  // --------------------------------------------------------------- helpers
  private static void checkKeys(List<Issue> errors, Map<String, Object> obj, Set<String> allowed, String path) {
    for (String k : obj.keySet()) {
      if (!allowed.contains(k)) {
        errors.add(new Issue('unknown-key', path + '.' + k, 'Unknown key "' + k + '"'));
      }
    }
  }

  private static void checkEnum(List<Issue> errors, Object value, Set<String> allowed, String path) {
    if (value != null && (!(value instanceof String) || !allowed.contains((String) value))) {
      errors.add(new Issue('invalid-enum', path, '"' + value + '" not in ' + allowed));
    }
  }

  private static Boolean isStr(Object v, Integer maxLen) {
    return v instanceof String && String.isNotBlank((String) v) && ((String) v).length() <= maxLen;
  }

  private static Integer asInt(Object v) {
    if (v instanceof Integer) {
      return (Integer) v;
    }
    if (v instanceof Long) {
      Long l = (Long) v;
      return (l == Integer.valueOf(l)) ? Integer.valueOf(l) : null;
    }
    if (v instanceof Decimal) {
      Decimal d = (Decimal) v;
      return (d.scale() == 0 || d == d.round()) ? d.intValue() : null;
    }
    return null;
  }
}
