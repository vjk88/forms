/** Installation schedules one hourly job; it never deletes consumed attachments by age. */
public with sharing class FinalUploadCleanupScheduler implements Schedulable {
    public void execute(SchedulableContext context) {
        Database.executeBatch(new FinalUploadCleanupBatch(), 1);
    }
}
