@IsTest
private class FinalStudioPageControllerTest {
    @IsTest
    static void lightningHostIsTheOrgDomainOrigin() {
        String host = new FinalStudioPageController().getLightningHost();
        Assert.isTrue(
            host.startsWith('https://'),
            'exit-link host must be an absolute https origin'
        );
        Assert.areEqual(Url.getOrgDomainUrl().toExternalForm(), host);
    }
}
