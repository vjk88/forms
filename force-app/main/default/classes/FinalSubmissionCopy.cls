/**
 * FinalSubmissionCopy — the PDF copy saved on a Freeform submission or a
 * survey response
 * (IMPL_PLAN_FORM_PDF §6.4).
 *
 * Built on the server from what was STORED: the submission's answer rows and
 * the version that was filled in (both written once, at submit, and never
 * changed), rendered with Apex Blob.toPdf() — the Visualforce PDF engine,
 * without a Visualforce page. The look follows the browser copy
 * (c/finalPdfWriter) within what that CSS 2.1 engine can draw: the header
 * band in the form's colors with its logo, accent headings, question and
 * answer, "Page n of m". Everything is set in Arial Unicode MS so answers in
 * any language print. Colors come from the version's `resolved.print`
 * (frozen at publish by c/finalPdfTheme); older versions get neutral ones.
 *
 * Runs `without sharing`: the background job may run as the guest who
 * submitted. Callers decide who may ask (the trigger for new submissions,
 * FinalSubmissionController.saveCopy after a user-mode read check).
 * Never throws: a failure is recorded on the submission, never lost.
 */
public without sharing class FinalSubmissionCopy {
    // Serves both answer stores that are written once at submit and never
    // changed: Freeform (Form_Submission__c + Form_Submission_Answer__c) and
    // Survey (Form_Response__c + Form_Response_Answer__c). Classic forms write
    // business records that can change later, so they wait for the receipt
    // (PLAN_DOCUMENTS_AND_PAYMENTS M0).
    public static final String STATUS_NOT_NEEDED = 'Not needed';
    public static final String STATUS_QUEUED = 'Queued';
    public static final String STATUS_SAVED = 'Saved';
    public static final String STATUS_FAILED = 'Failed';

    private static final Set<String> NOT_QUESTIONS = new Set<String>{
        'richText',
        'image',
        'callout',
        'divider',
        'spacer',
        'file',
        'emptySpace',
        'video',
        'map',
        'hero'
    };
    private static final Pattern HEX = Pattern.compile('^#[0-9a-fA-F]{6}$');
    private static final Map<String, String> DEFAULT_COLORS = new Map<String, String>{
        'text' => '#1f2937',
        'textWeak' => '#526071',
        'accent' => '#0f766e',
        'accentFill' => '#0f766e',
        'headerBg' => '#ffffff',
        'headerText' => '#1f2937',
        'headerTextWeak' => '#526071',
        'border' => '#7c8999',
        'hairline' => '#d5dadf'
    };

    /** True when the published spec asks for a saved copy. */
    public static Boolean wanted(String specJson) {
        if (String.isBlank(specJson)) {
            return false;
        }
        try {
            Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
                specJson
            );
            Map<String, Object> docs = FinalAnswerWords.asMap(
                FinalAnswerWords.asMap(spec.get('settings')).get('documents')
            );
            return docs.get('saveCopy') == true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Builds the PDF and saves it on the record (a Freeform submission or a
     * survey response). Records the outcome there (Saved with the file, or
     * Failed with why).
     * @param force true = make a new copy even when one is already saved
     * @return the new ContentVersion Id, or null when nothing was saved
     */
    public static Id save(Id recordId, Boolean force) {
        try {
            Source src = sourceOf(recordId);
            if (src == null) {
                return null;
            }
            if (
                !force &&
                src.copyStatus == STATUS_SAVED &&
                String.isNotBlank(src.copyFileId)
            ) {
                return null; // a retried job: the copy already exists
            }
            Blob pdf = Blob.toPdf(
                html(src, answers(recordId), attachmentNames(recordId))
            );
            ContentVersion cv = new ContentVersion(
                Title = title(src),
                PathOnClient = fileName(src),
                VersionData = pdf,
                FirstPublishLocationId = recordId
            );
            Database.insert(cv, AccessLevel.SYSTEM_MODE);
            record(recordId, STATUS_SAVED, null, cv.Id);
            return cv.Id;
        } catch (Exception e) {
            record(
                recordId,
                STATUS_FAILED,
                'The PDF copy couldn’t be saved: ' + e.getMessage(),
                null
            );
            return null;
        }
    }

    /** Status fields are the same on both objects; set them generically. */
    private static void record(
        Id recordId,
        String status,
        String message,
        Id fileId
    ) {
        try {
            SObject row = recordId.getSObjectType().newSObject(recordId);
            row.put('Copy_Status__c', status);
            row.put(
                'Copy_Message__c',
                message == null ? null : message.abbreviate(255)
            );
            row.put('Copy_File_Id__c', fileId);
            Database.update(row, true, AccessLevel.SYSTEM_MODE);
        } catch (Exception ignored) {
            // nothing more to do: the job's own log keeps the reason
        }
    }

    /** What the copy needs to know about the record, from either object. */
    public class Source {
        public Id id;
        public String recordNumber;
        public Datetime submitted;
        public String submittedBy;
        public String formName;
        public Decimal versionNumber;
        public String specJson;
        public String copyStatus;
        public String copyFileId;
    }

    // -------------------------------------------------------------- data --

    @TestVisible
    static Source sourceOf(Id recordId) {
        Source src = new Source();
        src.id = recordId;
        if (recordId.getSObjectType() == Form_Response__c.SObjectType) {
            List<Form_Response__c> rows = [
                SELECT
                    Name,
                    Submitted_Date__c,
                    Submitted_By__r.Name,
                    Form_Version__r.Form__r.Name,
                    Form_Version__r.Version_Number__c,
                    Form_Version__r.Spec_JSON__c,
                    Copy_Status__c,
                    Copy_File_Id__c
                FROM Form_Response__c
                WHERE Id = :recordId
                WITH SYSTEM_MODE
                LIMIT 1
            ];
            if (rows.isEmpty()) {
                return null;
            }
            Form_Response__c r = rows[0];
            src.recordNumber = r.Name;
            src.submitted = r.Submitted_Date__c;
            src.submittedBy = r.Submitted_By__r == null
                ? null
                : r.Submitted_By__r.Name;
            src.formName = r.Form_Version__r == null ||
                r.Form_Version__r.Form__r == null
                ? null
                : r.Form_Version__r.Form__r.Name;
            src.versionNumber = r.Form_Version__r == null
                ? null
                : r.Form_Version__r.Version_Number__c;
            src.specJson = r.Form_Version__r == null
                ? null
                : r.Form_Version__r.Spec_JSON__c;
            src.copyStatus = r.Copy_Status__c;
            src.copyFileId = r.Copy_File_Id__c;
            return src;
        }
        List<Form_Submission__c> rows = [
            SELECT
                Name,
                Submitted_Date__c,
                Submitted_By__r.Name,
                Form__r.Name,
                Form_Version__r.Version_Number__c,
                Form_Version__r.Spec_JSON__c,
                Copy_Status__c,
                Copy_File_Id__c
            FROM Form_Submission__c
            WHERE Id = :recordId
            WITH SYSTEM_MODE
            LIMIT 1
        ];
        if (rows.isEmpty()) {
            return null;
        }
        Form_Submission__c f = rows[0];
        src.recordNumber = f.Name;
        src.submitted = f.Submitted_Date__c;
        src.submittedBy = f.Submitted_By__r == null
            ? null
            : f.Submitted_By__r.Name;
        src.formName = f.Form__r == null ? null : f.Form__r.Name;
        src.versionNumber = f.Form_Version__r == null
            ? null
            : f.Form_Version__r.Version_Number__c;
        src.specJson = f.Form_Version__r == null
            ? null
            : f.Form_Version__r.Spec_JSON__c;
        src.copyStatus = f.Copy_Status__c;
        src.copyFileId = f.Copy_File_Id__c;
        return src;
    }

    /** Answer rows as Form_Submission_Answer__c, whichever object holds them. */
    @TestVisible
    static List<Form_Submission_Answer__c> answers(Id recordId) {
        if (recordId.getSObjectType() != Form_Response__c.SObjectType) {
            return [
                SELECT
                    Element_Key__c,
                    Label_Snapshot__c,
                    Answer_Type__c,
                    Value_Unparsed__c,
                    Entry_Index__c,
                    Text_Value__c,
                    Numeric_Value__c,
                    Boolean_Value__c,
                    Date_Value__c,
                    DateTime_Value__c,
                    Selected_Options_JSON__c
                FROM Form_Submission_Answer__c
                WHERE Form_Submission__c = :recordId
                WITH SYSTEM_MODE
                ORDER BY Entry_Index__c NULLS FIRST, Element_Key__c
            ];
        }
        List<Form_Submission_Answer__c> out = new List<Form_Submission_Answer__c>();
        for (Form_Response_Answer__c r : [
            SELECT
                Element_Key__c,
                Label_Snapshot__c,
                Entry_Index__c,
                Text_Value__c,
                Numeric_Value__c,
                Boolean_Value__c,
                Date_Value__c,
                DateTime_Value__c,
                Selected_Options_JSON__c
            FROM Form_Response_Answer__c
            WHERE Form_Response__c = :recordId
            WITH SYSTEM_MODE
            ORDER BY Entry_Index__c NULLS FIRST, Element_Key__c
        ]) {
            out.add(asSubmissionAnswer(r));
        }
        return out;
    }

    /**
     * A survey answer row in the Freeform shape. Survey rows carry no
     * Answer_Type__c: the survey writer picks the column from the value's own
     * shape (FinalSubmitService.writeUntypedValue) and only writes a row for a
     * real answer, so the one column holding a value names the type. A row
     * with none of them set holds a yes/no in the checkbox column.
     */
    @TestVisible
    static Form_Submission_Answer__c asSubmissionAnswer(
        Form_Response_Answer__c r
    ) {
        String type = 'Boolean';
        if (String.isNotBlank(r.Selected_Options_JSON__c)) {
            type = 'Options';
        } else if (r.Numeric_Value__c != null) {
            type = 'Number';
        } else if (r.DateTime_Value__c != null) {
            type = 'DateTime';
        } else if (r.Date_Value__c != null) {
            type = 'Date';
        } else if (String.isNotBlank(r.Text_Value__c)) {
            type = 'Text';
        }
        return new Form_Submission_Answer__c(
            Element_Key__c = r.Element_Key__c,
            Label_Snapshot__c = r.Label_Snapshot__c,
            Answer_Type__c = type,
            Entry_Index__c = r.Entry_Index__c,
            Text_Value__c = r.Text_Value__c,
            Numeric_Value__c = r.Numeric_Value__c,
            Boolean_Value__c = r.Boolean_Value__c,
            Date_Value__c = r.Date_Value__c,
            DateTime_Value__c = r.DateTime_Value__c,
            Selected_Options_JSON__c = r.Selected_Options_JSON__c
        );
    }

    /** Files the respondent attached (by name only: never merged or linked). */
    private static List<String> attachmentNames(Id submissionId) {
        Set<Id> docIds = new Set<Id>();
        for (ContentDocumentLink l : [
            SELECT ContentDocumentId
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :submissionId
            WITH SYSTEM_MODE
        ]) {
            docIds.add(l.ContentDocumentId);
        }
        List<String> out = new List<String>();
        if (docIds.isEmpty()) {
            return out;
        }
        for (ContentVersion cv : [
            SELECT Title, FileExtension
            FROM ContentVersion
            WHERE ContentDocumentId IN :docIds AND IsLatest = TRUE
            WITH SYSTEM_MODE
            ORDER BY CreatedDate
        ]) {
            if (
                cv.FileExtension == 'pdf' && cv.Title.endsWith(' (saved copy)')
            ) {
                continue; // an earlier saved copy is not an attachment
            }
            out.add(
                String.isBlank(cv.FileExtension)
                    ? cv.Title
                    : cv.Title + '.' + cv.FileExtension
            );
        }
        return out;
    }

    @TestVisible
    static String title(Source src) {
        String form = String.isBlank(src.formName) ? 'Form' : src.formName;
        return (form +
            ' - ' +
            src.recordNumber +
            ' (saved copy)')
            .abbreviate(255);
    }

    private static String fileName(Source src) {
        return title(src).replaceAll('[\\\\/:*?"<>|]+', ' ') + '.pdf';
    }

    // -------------------------------------------------------------- html --

    @TestVisible
    static String html(
        Source sub,
        List<Form_Submission_Answer__c> rows,
        List<String> files
    ) {
        Map<String, Object> spec = new Map<String, Object>();
        try {
            spec = (Map<String, Object>) JSON.deserializeUntyped(sub.specJson);
        } catch (Exception e) {
            spec = new Map<String, Object>();
        }
        Map<String, String> c = colors(spec);
        Map<String, Object> header = FinalAnswerWords.asMap(spec.get('header'));
        String formTitle = firstNonBlank(
            (String) header.get('title'),
            sub.formName,
            'Form'
        );
        String footer = cssString(formTitle + ' · ' + sub.recordNumber);

        // answers by element key (matrix rows keep their composite key)
        Map<String, List<Form_Submission_Answer__c>> byKey = new Map<String, List<Form_Submission_Answer__c>>();
        for (Form_Submission_Answer__c a : rows) {
            if (!byKey.containsKey(a.Element_Key__c)) {
                byKey.put(
                    a.Element_Key__c,
                    new List<Form_Submission_Answer__c>()
                );
            }
            byKey.get(a.Element_Key__c).add(a);
        }
        Set<String> seen = new Set<String>();

        String body = headerHtml(sub, header, formTitle, c);
        List<Map<String, Object>> pages = FinalAnswerWords.maps(
            spec.get('pages')
        );
        for (Map<String, Object> page : pages) {
            String pageHtml = '';
            for (
                Map<String, Object> section : FinalAnswerWords.maps(
                    page.get('sections')
                )
            ) {
                String rowsHtml = '';
                for (
                    Map<String, Object> el : FinalAnswerWords.maps(
                        section.get('elements')
                    )
                ) {
                    String id = (String) el.get('id');
                    if (
                        id == null ||
                        NOT_QUESTIONS.contains((String) el.get('type'))
                    ) {
                        continue;
                    }
                    rowsHtml += questionHtml(el, byKey, seen);
                }
                if (rowsHtml == '') {
                    continue;
                }
                String sectionTitle = (String) section.get('title');
                if (String.isNotBlank(sectionTitle)) {
                    pageHtml +=
                        '<h3 class="section">' +
                        esc(sectionTitle) +
                        '</h3>';
                }
                pageHtml += rowsHtml;
            }
            if (pageHtml == '') {
                continue;
            }
            String pageName = (String) page.get('name');
            if (pages.size() > 1 && String.isNotBlank(pageName)) {
                body += '<h2 class="page">' + esc(pageName) + '</h2>';
            }
            body += pageHtml;
        }

        // answers whose question is gone from this version still count
        String orphans = '';
        for (String key : byKey.keySet()) {
            if (seen.contains(key)) {
                continue;
            }
            for (Form_Submission_Answer__c a : byKey.get(key)) {
                orphans += qa(
                    firstNonBlank(a.Label_Snapshot__c, key, ''),
                    FinalAnswerWords.storedLines(a, null),
                    null
                );
            }
        }
        if (orphans != '') {
            body +=
                '<h3 class="section">Questions no longer on this form</h3>' +
                orphans;
        }
        if (!files.isEmpty()) {
            body +=
                '<h3 class="section">Files</h3>' +
                qa('Attached files', files, null);
        }

        return '<html><head><style>' +
            '@page { size: ' +
            (FinalAnswerWords.usesLetter() ? 'letter' : 'A4') +
            '; margin: 48px 50px 60px 50px;' +
            ' @bottom-left { content: "' +
            footer +
            '"; font-family: "Arial Unicode MS"; font-size: 7.5pt; color: ' +
            c.get('textWeak') +
            '; }' +
            ' @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: "Arial Unicode MS"; font-size: 7.5pt; color: ' +
            c.get('textWeak') +
            '; } }' +
            'body { font-family: "Arial Unicode MS", sans-serif; color: ' +
            c.get('text') +
            '; font-size: 10.5pt; margin: 0; }' +
            '.band { background-color: ' +
            c.get('headerBg') +
            '; color: ' +
            c.get('headerText') +
            '; padding: 18px 22px; margin-bottom: 18px;' +
            (c.get('headerIsPaper') == 'true'
                ? ' border-bottom: 3px solid ' + c.get('accentFill') + ';'
                : '') +
            ' }' +
            '.band h1 { font-size: 19pt; margin: 0; font-weight: bold; }' +
            '.band .desc { margin-top: 4px; font-size: 10pt; color: ' +
            c.get('headerTextWeak') +
            '; }' +
            '.band .meta { margin-top: 8px; font-size: 8pt; color: ' +
            c.get('headerTextWeak') +
            '; }' +
            '.band .logo { margin-bottom: 10px; }' +
            'h2.page { color: ' +
            c.get('accent') +
            '; font-size: 13.5pt; margin: 18px 0 8px 0; padding-bottom: 3px; border-bottom: 1.2px solid ' +
            c.get('accentFill') +
            '; page-break-after: avoid; }' +
            'h3.section { font-size: 11.5pt; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 0.75px solid ' +
            c.get('hairline') +
            '; page-break-after: avoid; }' +
            '.q { margin: 0 0 9px 0; page-break-inside: avoid; }' +
            '.label { font-size: 8.5pt; font-weight: bold; color: ' +
            c.get('textWeak') +
            '; margin-bottom: 2px; }' +
            '.answer { font-size: 10.5pt; }' +
            '.none { color: ' +
            c.get('textWeak') +
            '; }' +
            'table.matrix { width: 100%; border-collapse: collapse; }' +
            'table.matrix td { font-size: 9.5pt; padding: 3px 0; border-bottom: 0.5px solid ' +
            c.get('hairline') +
            '; vertical-align: top; }' +
            'table.matrix td.pick { width: 42%; padding-left: 10px; font-weight: bold; }' +
            '.tick { color: ' +
            c.get('accent') +
            '; font-weight: bold; }' +
            '</style></head><body>' +
            body +
            '</body></html>';
    }

    private static String headerHtml(
        Source sub,
        Map<String, Object> header,
        String formTitle,
        Map<String, String> c
    ) {
        String out = '';
        String banner = imageUrl(FinalAnswerWords.asMap(header.get('bgImage')));
        if (banner != null) {
            out +=
                '<div style="height: 110px; overflow: hidden; margin-bottom: 0;"><img src="' +
                esc(banner) +
                '" style="width: 100%;"/></div>';
        }
        out += '<div class="band">';
        String logo = imageUrl(FinalAnswerWords.asMap(header.get('logo')));
        if (logo != null) {
            out +=
                '<div class="logo"><img src="' +
                esc(logo) +
                '" style="height: 40px;"/></div>';
        } else if (String.isNotBlank((String) header.get('brandName'))) {
            out +=
                '<div class="logo" style="font-weight: bold; font-size: 11pt;">' +
                esc((String) header.get('brandName')) +
                '</div>';
        }
        out += '<h1>' + esc(formTitle) + '</h1>';
        if (String.isNotBlank((String) header.get('description'))) {
            out +=
                '<div class="desc">' +
                esc((String) header.get('description')) +
                '</div>';
        }
        List<String> meta = new List<String>{ sub.recordNumber };
        if (String.isNotBlank(sub.submittedBy)) {
            meta.add(sub.submittedBy);
        }
        String line2 = sub.submitted == null
            ? ''
            : 'Submitted ' + FinalAnswerWords.formatDateTime(sub.submitted);
        if (sub.versionNumber != null) {
            line2 +=
                (line2 == '' ? '' : ' · ') +
                'Version ' +
                FinalAnswerWords.plain(sub.versionNumber);
        }
        out +=
            '<div class="meta">' +
            esc(String.join(meta, ' · ')) +
            (line2 == '' ? '' : '<br/>' + esc(line2)) +
            '</div>';
        return out + '</div>';
    }

    private static String questionHtml(
        Map<String, Object> el,
        Map<String, List<Form_Submission_Answer__c>> byKey,
        Set<String> seen
    ) {
        String id = (String) el.get('id');
        String label = firstNonBlank((String) el.get('label'), id, '');
        Map<String, Object> cfg = FinalAnswerWords.asMap(el.get('config'));
        List<Map<String, Object>> statements = FinalAnswerWords.maps(
            cfg.get('rows')
        );

        // matrix: one line per statement, in the version's order
        Map<String, Form_Submission_Answer__c> byStatement = new Map<String, Form_Submission_Answer__c>();
        for (String key : byKey.keySet()) {
            if (key.startsWith(id + ':')) {
                seen.add(key);
                byStatement.put(
                    key.substring(id.length() + 1),
                    byKey.get(key)[0]
                );
            }
        }
        if (!statements.isEmpty() || !byStatement.isEmpty()) {
            String table = '<table class="matrix">';
            Set<String> placed = new Set<String>();
            for (Map<String, Object> r : statements) {
                String value = FinalAnswerWords.plain(r.get('value'));
                placed.add(value);
                Form_Submission_Answer__c a = byStatement.get(value);
                String word = a == null
                    ? ''
                    : FinalAnswerWords.matrixWord(el, a);
                table += matrixRow(
                    firstNonBlank((String) r.get('label'), value, ''),
                    word
                );
            }
            for (String value : byStatement.keySet()) {
                if (!placed.contains(value)) {
                    table += matrixRow(
                        value,
                        FinalAnswerWords.matrixWord(el, byStatement.get(value))
                    );
                }
            }
            return '<div class="q"><div class="label">' +
                esc(label) +
                '</div>' +
                table +
                '</table></div>';
        }

        List<Form_Submission_Answer__c> mine = byKey.get(id);
        if (mine == null || mine.isEmpty()) {
            return qa(label, new List<String>(), null); // asked, left alone
        }
        seen.add(id);
        String out = '';
        for (Form_Submission_Answer__c a : mine) {
            String rowLabel = a.Entry_Index__c == null
                ? label
                : label + ' (entry ' + (a.Entry_Index__c.intValue() + 1) + ')';
            if (el.get('type') == 'consent') {
                String statement = String.isBlank((String) cfg.get('html'))
                    ? ''
                    : ((String) cfg.get('html')).stripHtmlTags();
                Boolean agreed = a.Boolean_Value__c == true;
                out +=
                    '<div class="q"><div class="label">' +
                    esc(rowLabel) +
                    '</div><div class="answer">' +
                    (agreed ? '<span class="tick">✓</span> ' : '☐ ') +
                    esc(statement) +
                    '<br/><span class="' +
                    (agreed ? 'tick' : 'none') +
                    '">' +
                    (agreed ? 'Agreed' : 'Not agreed') +
                    '</span></div></div>';
                continue;
            }
            out += qa(rowLabel, FinalAnswerWords.storedLines(a, el), null);
        }
        return out;
    }

    private static String matrixRow(String statement, String word) {
        return '<tr><td>' +
            esc(statement) +
            '</td><td class="pick' +
            (String.isBlank(word) ? ' none' : '') +
            '">' +
            (String.isBlank(word) ? 'No answer' : esc(word)) +
            '</td></tr>';
    }

    private static String qa(String label, List<String> lines, String note) {
        String answer;
        if (lines.isEmpty()) {
            answer = '<span class="none">No answer</span>';
        } else {
            List<String> escaped = new List<String>();
            for (String l : lines) {
                escaped.add(esc(l));
            }
            answer = String.join(escaped, '<br/>');
        }
        return '<div class="q"><div class="label">' +
            esc(label) +
            '</div><div class="answer">' +
            answer +
            '</div></div>';
    }

    /** A header image: its public link when it has one (a guest-run job can
     *  read that), else the File download path; null without a File. */
    private static String imageUrl(Map<String, Object> ref) {
        Object v = ref.get('versionId') != null
            ? ref.get('versionId')
            : ref.get('contentVersionId');
        if (!(v instanceof String) || !((String) v).startsWith('068')) {
            return null;
        }
        Id versionId;
        try {
            versionId = (Id) (String) v;
        } catch (Exception e) {
            return null;
        }
        for (ContentDistribution d : [
            SELECT ContentDownloadUrl
            FROM ContentDistribution
            WHERE ContentVersionId = :versionId
            WITH SYSTEM_MODE
            LIMIT 1
        ]) {
            if (String.isNotBlank(d.ContentDownloadUrl)) {
                return d.ContentDownloadUrl;
            }
        }
        return '/sfc/servlet.shepherd/version/download/' + versionId;
    }

    /** `resolved.print` hex colors, validated; neutral ones where missing. */
    @TestVisible
    static Map<String, String> colors(Map<String, Object> spec) {
        Map<String, Object> print = FinalAnswerWords.asMap(
            FinalAnswerWords.asMap(spec.get('resolved')).get('print')
        );
        Map<String, String> out = new Map<String, String>();
        for (String key : DEFAULT_COLORS.keySet()) {
            Object v = print.get(key);
            out.put(
                key,
                v instanceof String && HEX.matcher((String) v).matches()
                    ? (String) v
                    : DEFAULT_COLORS.get(key)
            );
        }
        // no frozen colors (published before PDF copies) = a white header
        out.put(
            'headerIsPaper',
            print.isEmpty() || print.get('headerIsPaper') == true
                ? 'true'
                : 'false'
        );
        return out;
    }

    private static String esc(String s) {
        return s == null ? '' : s.escapeHtml4();
    }

    /** Text safe inside a CSS string ("…"): no quotes, backslashes or breaks. */
    private static String cssString(String s) {
        return s == null
            ? ''
            : s.replaceAll('["\\\\\\r\\n]', ' ').abbreviate(120);
    }

    private static String firstNonBlank(String a, String b, String c) {
        return String.isNotBlank(a) ? a : String.isNotBlank(b) ? b : c;
    }
}
