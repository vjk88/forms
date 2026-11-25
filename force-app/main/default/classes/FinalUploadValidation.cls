/** Pure checks over server-resolved receipts and immutable published file questions. */
public with sharing class FinalUploadValidation {
    /** Enforce type/size on every supplied receipt, independently of conditional required rules. */
    public static void file(
        Map<String, Object> entry,
        Map<String, Object> element,
        FinalUploadPolicy.Rules limits
    ) {
        if (element == null) {
            throw FinalUploadService.refuse(null);
        }
        Map<String, Object> config = FinalUploadPolicy.mapOf(
            element.get('config')
        );
        Decimal size = FinalUploadPolicy.positive(entry.get('sizeBytes'));
        Decimal maximum = FinalUploadPolicy.minLimit(
            limits.maxFileBytes,
            FinalUploadPolicy.positive(config.get('maxSizeBytes'))
        );
        maximum = FinalUploadPolicy.minLimit(
            maximum,
            FinalUploadPolicy.positive(entry.get('reservedMaxBytes'))
        );
        Set<String> accepted = FinalUploadPolicy.extensions(
            FinalUploadPolicy.stringOf(config.get('accept'))
        );
        if (size == null || (maximum != null && size > maximum)) {
            throw FinalUploadService.refuse(Label.Final_Run_UploadSize);
        }
        if (
            !accepted.isEmpty() &&
            !accepted.contains(
                FinalUploadPolicy.stringOf(entry.get('extension'))
            )
        ) {
            throw FinalUploadService.refuse(Label.Final_Run_UploadType);
        }
    }

    /** Required is checked only where the existing server validator can establish applicability. */
    public static void manifest(
        Map<String, Object> spec,
        List<Map<String, Object>> selected,
        Boolean guest
    ) {
        FinalUploadPolicy.Rules limits = FinalUploadPolicy.limits(spec, guest);
        Map<String, Map<String, Object>> elements = FinalUploadPolicy.elements(
            spec
        );
        Map<String, Integer> counts = new Map<String, Integer>();
        Decimal bytes = 0;
        for (Map<String, Object> entry : selected) {
            String id = FinalUploadPolicy.stringOf(entry.get('elementId'));
            file(entry, elements.get(id), limits);
            counts.put(id, (counts.get(id) ?? 0) + 1);
            bytes += FinalUploadPolicy.positive(entry.get('sizeBytes'));
        }
        if (
            (limits.maxFiles != null && selected.size() > limits.maxFiles) ||
            (limits.maxTotalBytes != null &&
            bytes > limits.maxTotalBytes)
        ) {
            throw FinalUploadService.refuse(Label.Final_Run_UploadSize);
        }
        for (String id : elements.keySet()) {
            Map<String, Object> element = elements.get(id);
            Map<String, Object> config = FinalUploadPolicy.mapOf(
                element.get('config')
            );
            Decimal cap = config.get('multiple') == false
                ? 1
                : FinalUploadPolicy.positive(config.get('maxFiles'));
            Integer count = counts.get(id) ?? 0;
            if (cap != null && count > cap) {
                throw FinalUploadService.refuse(Label.Final_Run_UploadCount);
            }
            if (element.get('requiredApplicable') == true && count == 0) {
                for (
                    Object ruleValue : FinalUploadPolicy.listOf(
                        element.get('validation')
                    )
                ) {
                    Map<String, Object> rule = FinalUploadPolicy.mapOf(
                        ruleValue
                    );
                    if (
                        rule.get('type') == 'required' &&
                        rule.get('when') == null
                    ) {
                        throw FinalUploadService.refuse(
                            Label.Final_Run_UploadRequired
                        );
                    }
                }
            }
        }
    }
}
