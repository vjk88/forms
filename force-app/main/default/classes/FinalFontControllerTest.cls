@IsTest
private class FinalFontControllerTest {
    @IsTest
    static void listsDeployedFontsWithDefaults() {
        List<FinalFontController.FontDTO> fonts = FinalFontController.listFonts();
        // CMDT records deploy with metadata — the repo ships Sample_Brand.
        System.assert(fonts.size() >= 1, 'Deployed Form_Font__mdt rows listed');
        Boolean foundSample = false;
        for (FinalFontController.FontDTO f : fonts) {
            System.assert(String.isNotBlank(f.key), 'key set');
            System.assert(String.isNotBlank(f.family), 'family set');
            System.assert(
                String.isNotBlank(f.fallback),
                'fallback defaulted when blank'
            );
            if (f.key == 'Sample_Brand') {
                foundSample = true;
                System.assertEquals('Sample Brand', f.family);
                System.assertEquals('sample_brand_font', f.resource);
            }
        }
        System.assert(foundSample, 'Sample_Brand record present');
    }
}
