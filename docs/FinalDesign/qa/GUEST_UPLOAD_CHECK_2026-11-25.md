# Anonymous upload check — 2026-11-25

Status: preflight completed; native anonymous upload not executed. No pass is claimed.

## Connection

The configured `revclouddev` alias is valid. The initial restricted execution timed out resolving the org domain. An explicit network-enabled read-only query succeeded and returned RevCloudDev, Developer Edition. No CLI reauthentication or alias change was necessary.

## Verified setup

- The TestSite network is Live and its guest identity matches the enabled TestSiteGuest proof policy.
- `FinalUploadProofController` exists in the org; the current operator has the `Final_Upload_Proof_Admin` permission set. The internal Upload Transport Proof page renders its operator controls.
- Read-only Content settings retrieval returned `enableSiteGuestUserToUploadFiles=true` and `enableLWCFileUpload=true`. These are current metadata observations; the older 2026-09-10 preference blocker is not a current test result.
- Anonymous browser navigation to the root site and the server-reported `/vforcesite` URL returned a blank main region with no native uploader or proof controls.
- Retrieved `DigitalExperienceBundle:site/TestSite1` contains an empty home content column and no `finalUploadProof` reference. The existing public test harness described by the older handoff is absent from the retrieved bundle.

## Result and next action

The connection is working. The production implementation has since been deployed for QA; use a dedicated public route containing the real `finalGuestHost` and a synthetic staged-upload form. No separate proof implementation is required. Verify native bytes, exact version, marker clearing, owner/links and final submission with small synthetic files. This original preflight did not create a grant, upload a file, publish the site or change settings/permissions.

See [the implementation handoff](GUEST_UPLOAD_IMPLEMENTATION_2026-11-25.md) for the deployed multi-file model and subsequent automated results. These results do not establish anonymous native transport. The public QA setup remains pending approval after automatic approval review rejected enabling the upload switch and publishing a public test form. Historical prototype limits are independent of the revised product limits.
