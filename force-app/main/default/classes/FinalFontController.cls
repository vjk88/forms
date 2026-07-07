/**
 * FinalFontController — lists Form_Font__mdt custom fonts for the Design
 * panel's font picker (CUSTOM_FONTS.md §5). CMDT reads carry no CRUD/FLS
 * surface; getAll() avoids SOQL limits entirely.
 */
public with sharing class FinalFontController {
    public class FontDTO {
        @AuraEnabled
        public String key;
        @AuraEnabled
        public String family;
        @AuraEnabled
        public String fallback;
        @AuraEnabled
        public String resource;
        @AuraEnabled
        public String regularPath;
        @AuraEnabled
        public String boldPath;
    }

    @AuraEnabled(cacheable=true)
    public static List<FontDTO> listFonts() {
        List<FontDTO> out = new List<FontDTO>();
        for (Form_Font__mdt font : Form_Font__mdt.getAll().values()) {
            FontDTO dto = new FontDTO();
            dto.key = font.DeveloperName;
            dto.family = font.Font_Family_Name__c;
            dto.fallback = String.isBlank(font.Fallback_Font_Stack__c)
                ? 'sans-serif'
                : font.Fallback_Font_Stack__c;
            dto.resource = font.Static_Resource_Name__c;
            dto.regularPath = font.Regular_File_Path__c;
            dto.boldPath = font.Bold_File_Path__c;
            out.add(dto);
        }
        return out;
    }
}
