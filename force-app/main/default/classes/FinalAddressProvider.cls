/**
 * FinalAddressProvider - the plug-in point for address search.
 *
 * To use your own address service: write a class that implements this
 * interface, then pick "Your own (Apex class)" on the Settings tab and type the
 * class name.
 *
 *  - It needs a public no-argument constructor (the class is created by name).
 *  - It makes its own callouts, through its own Named Credential, so the key
 *    never reaches the browser or this package.
 *  - suggest returns at most 5 suggestions; extra ones are dropped.
 *  - details returns the picked address split into FinalAddress.Result parts.
 *  - On a bad HTTP status throw FinalAddress.failed(status) (a
 *    FinalAddress.ProviderException); Final turns it into a plain message for
 *    the respondent. Any other exception also shows as "unavailable".
 *
 * Final cleans every returned value (markup stripped, lengths capped), so the
 * provider does not need to.
 */
global interface FinalAddressProvider {
    List<FinalAddress.Suggestion> suggest(FinalAddress.Query q);
    FinalAddress.Result details(String id, String sessionToken);
}
