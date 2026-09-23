/**
 * Shared fixture for the F2 mapping tests. Contact only: in revclouddev an
 * always-true validation rule blocks every Account insert, and
 * Contact.HasOptedOutOfEmail is a phantom field. Linked records use
 * Contact.ReportsToId, a lookup from Contact to Contact.
 */
@IsTest
public class FinalMappingTestData {
    public static Id formId;
    public static Id versionId;

    public static Map<String, Object> question(
        String id,
        String inputType,
        String label
    ) {
        return new Map<String, Object>{
            'id' => id,
            'type' => 'field',
            'label' => label,
            'required' => true,
            'config' => new Map<String, Object>{ 'inputType' => inputType }
        };
    }

    public static List<Object> standardQuestions() {
        return new List<Object>{
            question('el_last', 'text', 'Your surname'),
            question('el_email', 'email', 'Work email'),
            question('el_title', 'text', 'Job title')
        };
    }

    public static Map<String, Object> answer(String elementKey) {
        return new Map<String, Object>{
            'kind' => 'answer',
            'elementKey' => elementKey
        };
    }

    public static Map<String, Object> literal(Object value) {
        return new Map<String, Object>{ 'kind' => 'literal', 'value' => value };
    }

    public static Map<String, Object> ref(String ref) {
        return new Map<String, Object>{ 'kind' => 'recordRef', 'ref' => ref };
    }

    public static Map<String, Object> field(
        String api,
        Map<String, Object> source
    ) {
        return new Map<String, Object>{ 'field' => api, 'source' => source };
    }

    /** A filter every Contact passes: LastName is required, so never blank. */
    public static Map<String, Object> anyNamedContact() {
        return new Map<String, Object>{
            'logic' => 'all',
            'rows' => new List<Object>{
                new Map<String, Object>{
                    'fieldPath' => 'LastName',
                    'operator' => 'isNotBlank'
                }
            }
        };
    }

    public static Map<String, Object> createContact(String id) {
        return new Map<String, Object>{
            'id' => id,
            'object' => 'Contact',
            'operation' => 'create',
            'fields' => new List<Object>{
                field('LastName', answer('el_last')),
                field('Email', answer('el_email'))
            }
        };
    }

    /** onMatch null = the author has not answered the match question. */
    public static Map<String, Object> findOrCreateContact(
        String id,
        String onMatch
    ) {
        Map<String, Object> match = new Map<String, Object>{
            'field' => 'Email',
            'source' => answer('el_email'),
            'filter' => anyNamedContact()
        };
        if (onMatch != null) {
            match.put('onMatch', onMatch);
        }
        return new Map<String, Object>{
            'id' => id,
            'object' => 'Contact',
            'operation' => 'findOrCreate',
            'match' => match,
            'fields' => new List<Object>{
                field('LastName', answer('el_last')),
                field('Email', answer('el_email')),
                field('Title', answer('el_title'))
            }
        };
    }

    public static Map<String, Object> spec(
        List<Object> elements,
        List<Object> actions
    ) {
        Map<String, Object> s = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'name' => 'Mapping test',
                'type' => 'freeform'
            },
            'layout' => new Map<String, Object>{ 'type' => 'scroll' },
            'settings' => new Map<String, Object>(),
            'resolved' => new Map<String, Object>{
                'tokens' => new Map<String, Object>{ 'accent' => '#000000' }
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'elements' => elements
                        }
                    }
                }
            }
        };
        if (actions != null) {
            s.put('mapping', new Map<String, Object>{ 'actions' => actions });
        }
        return s;
    }

    /** A Freeform form with one active version carrying this spec. */
    public static Id publish(Map<String, Object> spec) {
        Form__c form = new Form__c(
            Name = 'Mapping test',
            Form_Type__c = 'Freeform'
        );
        insert form;
        formId = form.Id;
        Form_Version__c v = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = JSON.serialize(spec),
            Engine_Version__c = 1
        );
        insert v;
        versionId = v.Id;
        return v.Id;
    }

    /**
     * A submission and its text answers, the way the submit path leaves
     * them. A null value means the question was skipped: no row at all.
     */
    public static Id submit(Map<String, String> textAnswers) {
        Form_Submission__c s = new Form_Submission__c(
            Form__c = formId,
            Form_Version__c = versionId,
            Submitted_Date__c = Datetime.now()
        );
        insert s;
        List<Form_Submission_Answer__c> rows = new List<Form_Submission_Answer__c>();
        for (String key : textAnswers.keySet()) {
            String value = textAnswers.get(key);
            if (value == null) {
                continue;
            }
            rows.add(
                new Form_Submission_Answer__c(
                    Form_Submission__c = s.Id,
                    Element_Key__c = key,
                    Answer_Type__c = key == 'el_email' ? 'Email' : 'Text',
                    Text_Value__c = value
                )
            );
        }
        insert rows;
        return s.Id;
    }

    public static Form_Submission__c reload(Id submissionId) {
        return [
            SELECT
                Id,
                Mapping_Status__c,
                Mapping_Message__c,
                Mapping_Attempts__c,
                Mapping_Run_At__c,
                Created_Records__c
            FROM Form_Submission__c
            WHERE Id = :submissionId
        ];
    }
}
