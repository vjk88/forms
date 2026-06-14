/**
 * Stable-key slug generation for Layout Spec references (LAYOUT_SPEC §9).
 *
 * Keys are generated ONCE on insert when blank and never regenerated —
 * renames don't change them, and version clones copy them verbatim so a
 * cloned spec stays valid with zero rewriting. A short random suffix makes
 * collisions within a version practically impossible without needing a
 * per-version uniqueness query in the trigger.
 */
public with sharing class FormKeyUtil {
  public static final Integer MAX_KEY_LENGTH = 80;
  private static final String SUFFIX_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
  private static final Integer SUFFIX_LENGTH = 5;

  /** 'p_your_details_k3f9x' / 'sec_contact_info_8b2mq' */
  public static String generate(String prefix, String label) {
    String base = slugify(label);
    String key = prefix + (String.isBlank(base) ? '' : base + '_') + randomSuffix();
    return key.length() > MAX_KEY_LENGTH ? key.substring(0, MAX_KEY_LENGTH) : key;
  }

  /** Fill Key__c on records where blank. Idempotent; safe for before-insert. */
  public static void ensurePageKeys(List<Form_Page__c> pages) {
    if (pages == null) {
      return;
    }
    for (Form_Page__c p : pages) {
      if (String.isBlank(p.Key__c)) {
        p.Key__c = generate('p_', p.Name);
      }
    }
  }

  public static void ensureSectionKeys(List<Form_Section__c> sections) {
    if (sections == null) {
      return;
    }
    for (Form_Section__c s : sections) {
      if (String.isBlank(s.Key__c)) {
        s.Key__c = generate('sec_', s.Name);
      }
    }
  }

  private static String slugify(String label) {
    if (String.isBlank(label)) {
      return '';
    }
    String s = label.trim().toLowerCase().replaceAll('[^a-z0-9]+', '_').replaceAll('^_+|_+$', '');
    // Leave room for prefix + '_' + suffix within 80 chars.
    return s.length() > 60 ? s.substring(0, 60) : s;
  }

  private static String randomSuffix() {
    String out = '';
    for (Integer i = 0; i < SUFFIX_LENGTH; i++) {
      Integer idx = Math.mod(Math.abs(Crypto.getRandomInteger()), SUFFIX_CHARS.length());
      out += SUFFIX_CHARS.substring(idx, idx + 1);
    }
    return out;
  }
}
